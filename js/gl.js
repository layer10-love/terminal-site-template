export function createProgram(gl, vertSrc, fragSrc, defines = {}) {
    const inject = (src) => {
        const nl = src.indexOf('\n');
        const version = src.slice(0, nl + 1);
        const body = src.slice(nl + 1);
        const defs = Object.entries(defines)
            .map(([k, v]) => `#define ${k} ${v}`)
            .join('\n');
        return defs ? version + defs + '\n' + body : src;
    };

    const compile = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(sh);
            console.error(log, src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
            throw new Error('Shader compile failed: ' + log);
        }
        return sh;
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, inject(vertSrc)));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, inject(fragSrc)));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('Program link failed: ' + gl.getProgramInfoLog(prog));
    }

    const uniforms = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, '');
        uniforms[name] = gl.getUniformLocation(prog, name);
    }
    return { prog, uniforms };
}

export function createQuad(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
}

export function createTexture(gl, { filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE } = {}) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return tex;
}

export class Target {
    constructor(gl, { filter } = {}) {
        this.gl = gl;
        this.tex = createTexture(gl, { filter: filter ?? gl.LINEAR });
        this.fbo = gl.createFramebuffer();
        this.width = 0;
        this.height = 0;
    }

    resize(width, height) {
        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));
        if (width === this.width && height === this.height) return;
        const gl = this.gl;
        this.width = width;
        this.height = height;
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    bind() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.width, this.height);
    }

    clear(r = 0, g = 0, b = 0, a = 1) {
        const gl = this.gl;
        this.bind();
        gl.clearColor(r, g, b, a);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }
}

export class PingPong {
    constructor(gl, opts) {
        this.a = new Target(gl, opts);
        this.b = new Target(gl, opts);
    }
    resize(w, h) { this.a.resize(w, h); this.b.resize(w, h); }
    swap() { const t = this.a; this.a = this.b; this.b = t; }
    get front() { return this.a; }
    get back() { return this.b; }
}
