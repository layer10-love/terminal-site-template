import { CRT } from './crt.js';
import { Screen } from './screen.js';
import { Terminal } from './terminal.js';
import { SettingsPanel } from './settings.js';
import { THEMES, FONTS } from './themes.js';
import { FLAG_UNDERLINE } from './text.js';

const STORAGE_KEY = 'crt.profile.v1';

class App {
    constructor(canvas) {
        this.canvas = canvas;
        this.screen = new Screen();
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.themeKey = 'amber';
        this.profile = { ...THEMES.amber };
        this.pixelScaleOverride = null;
        this.pixelScale = 2;

        this.crt = new CRT(canvas);
        this.crt.setMotionScale(this.reducedMotion ? 0 : 1);

        this.terminal = new Terminal(this.screen, this);
        this.panel = new SettingsPanel(this);

        this.restore();
        this.bindEvents();
    }

    // True for fonts whose ROM predates CP437 line-drawing characters
    plainAscii() {
        return this.profile.font === 'apple2' || this.profile.font === 'atari';
    }

    blockChar() {
        // The Apple 2 font has no solid block
        return this.profile.font === 'apple2' ? '#' : '█';
    }

    choosePixelScale(cssW) {
        if (this.pixelScaleOverride) return this.pixelScaleOverride;
        const nativeW = (FONTS[this.profile.font] || FONTS.vga).cell[0];
        const targetCols = cssW < 700 ? 42 : cssW < 1100 ? 64 : 80;
        const scale = (cssW * 0.9) / (targetCols * nativeW);
        return Math.min(4, Math.max(1, Math.round(scale * 2) / 2));
    }

    layout() {
        const cssW = window.innerWidth;
        const cssH = window.innerHeight;

        let renderScale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
        const budget = 5.5e6;
        while (cssW * cssH * renderScale * renderScale > budget && renderScale > 1) {
            renderScale -= 0.25;
        }

        this.pixelScale = this.choosePixelScale(cssW);

        this.screen.setMetrics({
            cssWidth: cssW,
            cssHeight: cssH,
            dpr: renderScale,
            pixelScale: this.pixelScale,
            fontKey: this.profile.font,
            curvature: this.profile.screenCurvature,
        });

        this.crt.resize(cssW, cssH, renderScale, this.pixelScale);
        this.applyProfile();
        this.terminal.refreshPrompt();
    }

    // theming

    setTheme(key, { reset = false } = {}) {
        if (!THEMES[key]) return;
        const fontChanged = THEMES[key].font !== this.profile.font;
        this.themeKey = key;
        this.profile = { ...THEMES[key] };
        this.pixelScaleOverride = reset ? null : this.pixelScaleOverride;
        if (fontChanged || reset) this.layout();
        else {
            this.screen.setMetrics({
                cssWidth: window.innerWidth,
                cssHeight: window.innerHeight,
                dpr: this.crt.dpr,
                pixelScale: this.pixelScale,
                fontKey: this.profile.font,
                curvature: this.profile.screenCurvature,
            });
            this.applyProfile();
        }
        this.panel.sync();
        this.persist();
    }

    applyProfile() {
        this.crt.setProfile(this.profile);
        document.body.style.setProperty('--phosphor', this.profile.fontColor);
        this.screen.dirty = true;
        this.persist();
    }

    persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                themeKey: this.themeKey,
                profile: this.profile,
                pixelScaleOverride: this.pixelScaleOverride,
            }));
        } catch { /* private browsing */ }
    }

    restore() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (saved?.profile && THEMES[saved.themeKey]) {
                this.themeKey = saved.themeKey;
                this.profile = { ...THEMES[saved.themeKey], ...saved.profile };
                this.pixelScaleOverride = saved.pixelScaleOverride ?? null;
            }
        } catch {}
    }

    toggleSettings(open) {
        const next = open ?? this.panel.el.hidden;
        this.panel.setOpen(next);
        if (!next) this.terminal.focus();
    }

    async reboot() {
        await this.terminal.boot();
    }

    // input

    bindEvents() {
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.layout(), 120);
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.screen.scrollBy(Math.sign(e.deltaY) * -3);
        }, { passive: false });

        // we just send the cursor through the same barrel distort as the text
        const runUnder = (e) => {
            const [u, v] = this.crt.screenToTexture(e.clientX, e.clientY);
            return this.screen.runAt(u, v);
        };

        this.canvas.addEventListener('mousemove', (e) => {
            const run = runUnder(e);
            this.canvas.style.cursor = run?.link ? 'pointer' : 'default';
        });

        this.canvas.addEventListener('click', (e) => {
            const run = runUnder(e);
            if (run?.link) {
                window.open(run.link, run.link.startsWith('mailto:') ? '_self' : '_blank', 'noopener');
                return;
            }
            this.terminal.focus();
        });

        document.addEventListener('keydown', (e) => {
            const inPanel = e.target instanceof Node && this.panel.el.contains(e.target);
            if (e.target !== this.terminal.input && !inPanel && !e.metaKey && !e.altKey) {
                this.terminal.focus();
            }
        });

        document.addEventListener('visibilitychange', () => {
            this.running = !document.hidden;
            if (this.running) this.loop(performance.now());
        });
    }

    // main loop

    start() {
        this.running = true;
        this.startTime = performance.now();
        this.lastBlink = 0;
        requestAnimationFrame((t) => this.loop(t));
    }

    loop(now) {
        if (!this.running) return;
        requestAnimationFrame((t) => this.loop(t));

        // cursor blink
        if (now - this.lastBlink > 290) {
            this.lastBlink = now;
            this.screen.cursorVisible = !this.screen.cursorVisible;
            this.screen.dirty = true;
        }

        if (this.screen.dirty) {
            this.screen.render();
            this.crt.uploadText(this.screen.canvas);
        }

        this.crt.render((now - this.startTime) / 1000);
    }
}

// startup

async function loadFonts() {
    const families = [...new Set(Object.values(FONTS).map((f) => f.family))];
    await Promise.all(families.map((family) =>
        document.fonts.load(`32px "${family}"`).catch(() => { })
    ));
    await document.fonts.ready;
}

function fallback(message) {
    document.body.classList.add('no-webgl');
    const pre = document.createElement('pre');
    pre.id = 'fallback';
    pre.textContent = message;
    document.body.appendChild(pre);
}

async function main() {
    await loadFonts();

    const canvas = document.getElementById('crt');
    let app;
    try {
        app = new App(canvas);
    } catch (err) {
        console.error(err);
        fallback('This screen needs WebGL2, and your browser did not offer it.');
        return;
    }

    window.app = app;
    app.layout();
    app.start();

    const skipBoot = new URLSearchParams(location.search).has('fast')
        || sessionStorage.getItem('booted') === '1';
    try { sessionStorage.setItem('booted', '1'); } catch {}

    document.getElementById('loading')?.remove();
    app.terminal.focus();
    await app.terminal.boot({ skipBoot });
}

main();
