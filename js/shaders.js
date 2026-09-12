/*
 * GLSL ES 3.00 port of the cool-retro-term CRT pipeline.
 * https://github.com/Swordfish90/cool-retro-term (GPLv3)
 */

export const QUAD_VERT = `#version 300 es
in vec2 aPos;
out vec2 vTex;
void main() {
    vTex = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/* ------------------------------------------------------------------ *
 * Stage 1 - burn in
 * ------------------------------------------------------------------ */
export const BURN_IN_FRAG = `#version 300 es
precision highp float;

in vec2 vTex;
out vec4 fragColor;

uniform sampler2D uSource;     // raw text buffer
uniform sampler2D uBurnIn;     // previous accumulation
uniform float uDecay;          // elapsed seconds since the last step / fade time

// One 8-bit step; below this the phosphor is level with the live text and the
// pixel is treated as unchanged, so stable glyphs never register as a ghost.
const float EPSILON = 1.5 / 255.0;

float rgb2grey(vec3 v) { return dot(v, vec3(0.21, 0.72, 0.04)); }

void main() {
    vec3 txtColor = texture(uSource, vTex).rgb;
    vec3 accColor = texture(uBurnIn, vTex).rgb;

    // Fade the phosphor by real elapsed time, then re-light it from the live
    // text. A pixel the text still covers is pinned back to full every step and
    // so leaves no trail; only pixels the text has vacated stay above it.
    vec3 color = max(accColor - vec3(clamp(uDecay, 0.0, 1.0)), txtColor);

    float freshMask = step(rgb2grey(color) - EPSILON, rgb2grey(txtColor));

    fragColor = vec4(color, freshMask);
}
`;

/* ------------------------------------------------------------------ *
 * Stage 2 - dynamic pass
 * ------------------------------------------------------------------ */
export const DYNAMIC_FRAG = `#version 300 es
precision highp float;

in vec2 vTex;
out vec4 fragColor;

uniform sampler2D uNoise;
uniform sampler2D uScreen;
uniform sampler2D uBurnIn;

uniform float uTime;
uniform vec3  uFontColor;
uniform vec3  uBackgroundColor;
uniform vec2  uVirtualResolution;
uniform float uRasterIntensity;
uniform float uStaticNoise;
uniform float uScreenCurvature;
uniform float uGlowingLine;
uniform float uChromaColor;
uniform vec2  uJitterDisplacement;
uniform float uJitter;
uniform vec2  uScaleNoiseSize;
uniform float uFrameSize;
uniform float uBloom;
uniform float uBrightness;
uniform float uDistortionScale;
uniform float uDistortionFreq;

float rgb2grey(vec3 v) { return dot(v, vec3(0.21, 0.72, 0.04)); }

vec2 distortCoordinates(vec2 coords) {
    vec2 paddedCoords = coords * (vec2(1.0) + uFrameSize * 2.0) - uFrameSize;
    vec2 cc = paddedCoords - vec2(0.5);
    float dist = dot(cc, cc) * uScreenCurvature;
    return paddedCoords + cc * (1.0 + dist) * dist;
}

vec3 applyRasterization(vec2 screenCoords, vec3 texel, vec2 virtualRes, float intensity) {
#if RASTER_MODE == 0 || RASTER_MODE == 4
    return texel;
#else
    if (intensity <= 0.0) return texel;

    const float INTENSITY = 0.30;
    const float BRIGHTBOOST = 0.30;

#if RASTER_MODE == 1
    vec3 pixelHigh = ((1.0 + BRIGHTBOOST) - (0.2 * texel)) * texel;
    vec3 pixelLow  = ((1.0 - INTENSITY) + (0.1 * texel)) * texel;
    vec2 coords = fract(screenCoords * virtualRes) * 2.0 - vec2(1.0);
    float mask = 1.0 - abs(coords.y);
    return mix(texel, mix(pixelLow, pixelHigh, mask), intensity);
#elif RASTER_MODE == 2
    vec3 pixelHigh = ((1.0 + BRIGHTBOOST) - (0.2 * texel)) * texel;
    vec3 pixelLow  = ((1.0 - INTENSITY) + (0.1 * texel)) * texel;
    vec2 coords = fract(screenCoords * virtualRes) * 2.0 - vec2(1.0);
    coords = coords * coords;
    float mask = 1.0 - coords.x - coords.y;
    return mix(texel, mix(pixelLow, pixelHigh, mask), intensity);
#else
    const float SUBPIXELS = 3.0;
    vec3 offsets = vec3(3.141592654) * vec3(0.5, 0.5 - 2.0 / 3.0, 0.5 - 4.0 / 3.0);
    vec2 omega = vec2(3.141592654) * vec2(2.0) * virtualRes;
    vec2 angle = screenCoords * omega;
    vec3 xfactors = (SUBPIXELS + sin(angle.x + offsets)) / (SUBPIXELS + 1.0);

    vec3 result = texel * xfactors;
    vec3 pixelHigh = ((1.0 + BRIGHTBOOST) - (0.2 * result)) * result;
    vec3 pixelLow  = ((1.0 - INTENSITY) + (0.1 * result)) * result;
    vec2 coords = fract(screenCoords * virtualRes) * 2.0 - vec2(1.0);
    float mask = 1.0 - abs(coords.y);
    return mix(texel, mix(pixelLow, pixelHigh, mask), intensity);
#endif
#endif
}

float randomPass(vec2 coords) {
    return fract(smoothstep(-120.0, 0.0, coords.y - (uVirtualResolution.y + 120.0) * fract(uTime * 0.15)));
}

vec3 convertWithChroma(vec3 inColor) {
#if CHROMA == 1
    float grey = rgb2grey(inColor);
    float denom = max(grey, 0.0001);
    vec3 foregroundColor = mix(uFontColor, inColor * uFontColor / denom, uChromaColor);
    return mix(uBackgroundColor, foregroundColor, grey);
#else
    return mix(uBackgroundColor, uFontColor, rgb2grey(inColor));
#endif
}

void main() {
    vec2 cc = vec2(0.5) - vTex;
    float distance = length(cc);

    vec2 staticCoords = distortCoordinates(vTex);
    vec2 coords = vTex;

    float dst = sin((coords.y + uTime) * uDistortionFreq);
    coords.x += dst * uDistortionScale;

    vec4 noiseTexel = texture(uNoise, uScaleNoiseSize * coords + vec2(fract(uTime / 0.051), fract(uTime / 0.237)));

    vec2 txt_coords = coords + (noiseTexel.ba - vec2(0.5)) * uJitterDisplacement * uJitter;

    float color = 0.0001;
    color += noiseTexel.a * uStaticNoise * (1.0 - distance * 1.3);
    color += randomPass(coords * uVirtualResolution) * uGlowingLine;

    vec3 txt_color = texture(uScreen, txt_coords).rgb;
    float bloomScale = 1.0 + max(uBloom, 0.0);
    txt_color *= bloomScale;

#if BURN_IN == 1
    // The accumulation buffer already carries the fade, so no extrapolation here.
    vec4 txt_blur = texture(uBurnIn, staticCoords);
    vec3 burnInColor = 0.65 * txt_blur.rgb * (1.0 - txt_blur.a);
    txt_color = max(txt_color, burnInColor);
#endif

    txt_color += vec3(color);
    txt_color = applyRasterization(staticCoords, txt_color, uVirtualResolution, uRasterIntensity);

    vec3 finalColor = convertWithChroma(txt_color);
    finalColor *= uBrightness;

    fragColor = vec4(finalColor, 1.0);
}
`;

/* ------------------------------------------------------------------ *
 * Stage 3 - bloom
 * ------------------------------------------------------------------ */
export const BLUR_FRAG = `#version 300 es
precision highp float;

in vec2 vTex;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uDirection; 

void main() {
    // 9-tap gaussian to 5 bilinear samples.
    const float o1 = 1.3846153846;
    const float o2 = 3.2307692308;
    vec4 sum = texture(uSource, vTex) * 0.2270270270;
    sum += texture(uSource, vTex + uDirection * o1) * 0.3162162162;
    sum += texture(uSource, vTex - uDirection * o1) * 0.3162162162;
    sum += texture(uSource, vTex + uDirection * o2) * 0.0702702703;
    sum += texture(uSource, vTex - uDirection * o2) * 0.0702702703;
    fragColor = sum;
}
`;

/* ------------------------------------------------------------------ *
 * Stage 4 - static pass
 * ------------------------------------------------------------------ */
export const STATIC_FRAG = `#version 300 es
precision highp float;

in vec2 vTex;
out vec4 fragColor;

uniform sampler2D uSource;
uniform sampler2D uBloom;

uniform float uScreenCurvature;
uniform float uRgbShift;
uniform float uFrameSize;
uniform float uScreenBrightness;
uniform float uBloomStrength;

float rand2(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }

vec2 distortCoordinates(vec2 coords) {
    vec2 paddedCoords = coords * (vec2(1.0) + uFrameSize * 2.0) - uFrameSize;
    vec2 cc = paddedCoords - vec2(0.5);
    float dist = dot(cc, cc) * uScreenCurvature;
    return paddedCoords + cc * (1.0 + dist) * dist;
}

void main() {
    vec2 txt_coords = vTex;
#if CURVATURE == 1
    txt_coords = distortCoordinates(vTex);
#endif

    vec3 txt_color = texture(uSource, txt_coords).rgb;

#if RGB_SHIFT == 1
    vec2 displacement = vec2(uRgbShift, 0.0);
    vec3 rightColor = texture(uSource, txt_coords + displacement).rgb;
    vec3 leftColor  = texture(uSource, txt_coords - displacement).rgb;
    txt_color.r = leftColor.r * 0.10 + rightColor.r * 0.30 + txt_color.r * 0.60;
    txt_color.g = leftColor.g * 0.20 + rightColor.g * 0.20 + txt_color.g * 0.60;
    txt_color.b = leftColor.b * 0.30 + rightColor.b * 0.10 + txt_color.b * 0.60;
#endif

    vec3 finalColor = txt_color;

    vec4 bloomFullColor = texture(uBloom, txt_coords);
    vec3 bloomColor = bloomFullColor.rgb;
    float bloomAlpha = bloomFullColor.a;

#if BLOOM == 1
    finalColor += clamp(bloomColor * uBloomStrength * bloomAlpha, 0.0, 0.5);
    finalColor /= 1.0 + max(uBloomStrength, 0.0);
#endif

    finalColor *= uScreenBrightness;

    float noise = rand2(vTex) - 0.5;
    finalColor = clamp(finalColor + vec3(noise * 0.025), 0.0, 1.0);

    fragColor = vec4(finalColor, 1.0);
}
`;
