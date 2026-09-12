import { QUAD_VERT, BURN_IN_FRAG, DYNAMIC_FRAG, BLUR_FRAG, STATIC_FRAG } from './shaders.js';
import { createProgram, createQuad, createTexture, Target, PingPong } from './gl.js';

const lint = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
};

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const mixRgb = (a, b, t) => [lint(a[0], b[0], t), lint(a[1], b[1], t), lint(a[2], b[2], t)];

const NOISE_SIZE = 512;

function makeNoise() {
    const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
    let s = 0x2f6e2b1 >>> 0;
    for (let i = 0; i < data.length; i++) {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        data[i] = s & 255;
    }
    return data;
}

export class CRT {
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: false,
            powerPreference: 'low-power',
        });
        if (!gl) throw new Error('WebGL2 unavailable');
        this.gl = gl;

        this.quad = createQuad(gl);
        this.programs = new Map();

        this.blurProg = createProgram(gl, QUAD_VERT, BLUR_FRAG);
        this.burnInProg = createProgram(gl, QUAD_VERT, BURN_IN_FRAG);

        this.dynamicTarget = new Target(gl);
        this.bloomA = new Target(gl);
        this.bloomB = new Target(gl);
        this.burnIn = new PingPong(gl);

        // The text buffer, uploaded from a 2D canvas whenever the screen changes.
        this.textTex = createTexture(gl, { filter: gl.LINEAR });

        this.noiseData = makeNoise();
        this.noiseTex = createTexture(gl, { filter: gl.LINEAR, wrap: gl.REPEAT });
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, NOISE_SIZE, NOISE_SIZE, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, this.noiseData);

        this.width = 1; this.height = 1; this.dpr = 1; this.pixelScale = 2;
        this.virtualResolution = [720, 400];
        this.profile = null;
        this.derived = null;
        this.lastBurnIn = null; // time of the last phosphor decay step
        this.textChanged = false;
        this.motion = 1; // scaled down when the visitor prefers reduced motion
    }

    /** @param cssW,cssH viewport in CSS px; pixelScale = CSS px per CRT pixel. */
    resize(cssW, cssH, dpr, pixelScale) {
        this.cssWidth = cssW;
        this.cssHeight = cssH;
        this.dpr = dpr;
        this.pixelScale = pixelScale;
        this.width = Math.floor(cssW * dpr);
        this.height = Math.floor(cssH * dpr);

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.virtualResolution = [
            Math.max(1, Math.round(cssW / pixelScale)),
            Math.max(1, Math.round(cssH / pixelScale)),
        ];

        this.dynamicTarget.resize(this.width, this.height);
        this.burnIn.resize(this.width * 0.5, this.height * 0.5);
        this.bloomA.resize(this.width * 0.5, this.height * 0.5);
        this.bloomB.resize(this.width * 0.5, this.height * 0.5);
        this.burnIn.a.clear(0, 0, 0, 0);
        this.burnIn.b.clear(0, 0, 0, 0);
        this.bloomA.clear(0, 0, 0, 0);
        this.bloomB.clear(0, 0, 0, 0);
        this.lastBurnIn = null;
        this.textChanged = false;

        if (this.profile) this.setProfile(this.profile);
    }

    setProfile(p) {
        this.profile = p;
        const m = this.motion;

        const base = hexToRgb(p.fontColor);
        const bg = hexToRgb(p.backgroundColor);
        const saturated = mixRgb(base, [1, 1, 1], p.saturationColor * 0.5);
        const contrastMix = 0.7 + p.contrast * 0.3;

        const screenDensity = Math.min(
            this.width / this.virtualResolution[0],
            this.height / this.virtualResolution[1]
        );

        const fadeTime = lint(0.16, 1.6, p.burnIn);

        this.derived = {
            fontColor: mixRgb(bg, saturated, contrastMix),
            backgroundColor: mixRgb(saturated, bg, contrastMix),

            screenCurvature: p.screenCurvature * 0.6,
            frameSize: p.frameSize * 0.05,

            glowingLine: p.glowingLine * 0.2 * m,
            horizontalSync: p.horizontalSync * m,
            horizontalSyncStrength: lint(0.05, 0.35, p.horizontalSync),
            flickering: p.flickering * m,
            jitter: p.jitter * m,
            staticNoise: p.staticNoise * m,

            chromaColor: p.chromaColor,
            burnIn: p.burnIn,
            burnInTime: 1 / fadeTime,
            bloom: p.bloom * 2.5,
            brightness: lint(0.5, 1.5, p.brightness),
            rgbShift: p.rgbShift * (4.0 / Math.max(1, this.width)),
            rasterization: p.rasterization,
            rasterIntensity: smoothstep(2.0, 4.0, screenDensity),

            // One noise texel per CRT pixel keeps the grain on the phosphor grid.
            scaleNoiseSize: [
                this.cssWidth / (NOISE_SIZE * this.pixelScale),
                this.cssHeight / (NOISE_SIZE * this.pixelScale),
            ],
        };
    }

    setMotionScale(scale) {
        this.motion = scale;
        if (this.profile) this.setProfile(this.profile);
    }

    dynamicProgram() {
        const d = this.derived;
        const key = `r${d.rasterization}b${d.burnIn > 0 ? 1 : 0}c${d.chromaColor > 0 ? 1 : 0}`;
        let prog = this.programs.get(key);
        if (!prog) {
            prog = createProgram(this.gl, QUAD_VERT, DYNAMIC_FRAG, {
                RASTER_MODE: d.rasterization,
                BURN_IN: d.burnIn > 0 ? 1 : 0,
                CHROMA: d.chromaColor > 0 ? 1 : 0,
            });
            this.programs.set(key, prog);
        }
        return prog;
    }

    staticProgram() {
        const d = this.derived;
        const key = `s${d.rgbShift > 0 ? 1 : 0}${d.bloom > 0 ? 1 : 0}${d.screenCurvature > 0 || d.frameSize > 0 ? 1 : 0}`;
        let prog = this.programs.get(key);
        if (!prog) {
            prog = createProgram(this.gl, QUAD_VERT, STATIC_FRAG, {
                RGB_SHIFT: d.rgbShift > 0 ? 1 : 0,
                BLOOM: d.bloom > 0 ? 1 : 0,
                CURVATURE: (d.screenCurvature > 0 || d.frameSize > 0) ? 1 : 0,
            });
            this.programs.set(key, prog);
        }
        return prog;
    }

    uploadText(canvas) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.textTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        this.textChanged = true;
    }

    sampleNoise(u, v) {
        const x = Math.floor(u * NOISE_SIZE) & (NOISE_SIZE - 1);
        const y = Math.floor(v * NOISE_SIZE) & (NOISE_SIZE - 1);
        const i = (y * NOISE_SIZE + x) * 4;
        const d = this.noiseData;
        return [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, d[i + 3] / 255];
    }

    bindTex(unit, tex, loc) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(loc, unit);
    }

    draw() {
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    }

    render(time) {
        const gl = this.gl;
        const d = this.derived;
        if (!d) return;

        gl.bindVertexArray(this.quad);
        gl.disable(gl.BLEND);

        // 1st pass: burn-in accumulation
        if (d.burnIn > 0) {
            const decay = this.lastBurnIn === null
                ? 1 : Math.max(0, time - this.lastBurnIn) * d.burnInTime;
            // A step the 8-bit buffer cannot represent would be rounded away, so
            // let the decay collect until it can actually move a texel. New text
            // still gets folded in at once, whatever the fade owes.
            if (this.textChanged || decay >= 1.5 / 255) {
                const { prog, uniforms: u } = this.burnInProg;
                this.burnIn.back.bind();
                gl.useProgram(prog);
                this.bindTex(0, this.textTex, u.uSource);
                this.bindTex(1, this.burnIn.front.tex, u.uBurnIn);
                gl.uniform1f(u.uDecay, decay);
                this.draw();
                this.burnIn.swap();
                this.lastBurnIn = time;
            }
        }
        this.textChanged = false;

        // 2nd pass: dynamic
        {
            // The original computes these in the vertex shader; same noise, same maths.
            const n = this.sampleNoise(time / 2.048 % 1, time / 1048.576 % 1);
            const vBrightness = 1.0 + (n[1] - 0.5) * d.flickering;
            const randval = d.horizontalSyncStrength - n[0];
            const distortionScale = (randval > 0 ? 1 : 0) * randval * d.horizontalSyncStrength * d.horizontalSync;
            const distortionFreq = lint(4.0, 40.0, n[1]);

            const { prog, uniforms: u } = this.dynamicProgram();
            this.dynamicTarget.bind();
            gl.useProgram(prog);
            this.bindTex(0, this.noiseTex, u.uNoise);
            this.bindTex(1, this.textTex, u.uScreen);
            this.bindTex(2, this.burnIn.front.tex, u.uBurnIn);

            gl.uniform1f(u.uTime, time);
            gl.uniform3fv(u.uFontColor, d.fontColor);
            gl.uniform3fv(u.uBackgroundColor, d.backgroundColor);
            gl.uniform2fv(u.uVirtualResolution, this.virtualResolution);
            gl.uniform1f(u.uRasterIntensity, d.rasterIntensity);
            gl.uniform1f(u.uStaticNoise, d.staticNoise);
            gl.uniform1f(u.uScreenCurvature, d.screenCurvature);
            gl.uniform1f(u.uGlowingLine, d.glowingLine);
            gl.uniform1f(u.uChromaColor, d.chromaColor);
            gl.uniform2f(u.uJitterDisplacement, 0.007 * d.jitter, 0.002 * d.jitter);
            gl.uniform1f(u.uJitter, d.jitter);
            gl.uniform2fv(u.uScaleNoiseSize, d.scaleNoiseSize);
            gl.uniform1f(u.uFrameSize, d.frameSize);
            gl.uniform1f(u.uBloom, d.bloom);
            gl.uniform1f(u.uBrightness, vBrightness);
            gl.uniform1f(u.uDistortionScale, distortionScale);
            gl.uniform1f(u.uDistortionFreq, distortionFreq);
            this.draw();
        }

        // 3rd pass: bloom
        if (d.bloom > 0) {
            const { prog, uniforms: u } = this.blurProg;
            gl.useProgram(prog);
            for (let pass = 0; pass < 2; pass++) {
                this.bloomA.bind();
                this.bindTex(0, pass === 0 ? this.dynamicTarget.tex : this.bloomB.tex, u.uSource);
                gl.uniform2f(u.uDirection, 1 / this.bloomA.width, 0);
                this.draw();

                this.bloomB.bind();
                this.bindTex(0, this.bloomA.tex, u.uSource);
                gl.uniform2f(u.uDirection, 0, 1 / this.bloomB.height);
                this.draw();
            }
        }

        // 4rd pass: static
        {
            const { prog, uniforms: u } = this.staticProgram();
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, this.width, this.height);
            gl.useProgram(prog);
            this.bindTex(0, this.dynamicTarget.tex, u.uSource);
            this.bindTex(1, this.bloomB.tex, u.uBloom);
            gl.uniform1f(u.uScreenCurvature, d.screenCurvature);
            gl.uniform1f(u.uRgbShift, d.rgbShift);
            gl.uniform1f(u.uFrameSize, d.frameSize);
            gl.uniform1f(u.uScreenBrightness, d.brightness);
            gl.uniform1f(u.uBloomStrength, d.bloom);
            this.draw();
        }

        gl.bindVertexArray(null);
    }

    screenToTexture(cssX, cssY) {
        const d = this.derived;
        const u = cssX / this.cssWidth;
        const v = cssY / this.cssHeight;
        if (!d) return [u, v];
        const px = u * (1 + d.frameSize * 2) - d.frameSize;
        const py = v * (1 + d.frameSize * 2) - d.frameSize;
        const ccx = px - 0.5, ccy = py - 0.5;
        const dist = (ccx * ccx + ccy * ccy) * d.screenCurvature;
        return [px + ccx * (1 + dist) * dist, py + ccy * (1 + dist) * dist];
    }
}
