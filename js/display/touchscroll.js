const TOUCH_SLOP = 10;
const FLING_MIN = 0.3; // px/ms, below this a release just stops
const FLING_DECAY = 0.004; // per ms, exponential
const SAMPLE_MS = 80;

// Finger scrolling for the canvas. #crt has touch-action: none, so the browser does not scroll it for us
export function bindTouchScroll(app) {
    const { canvas, screen } = app;
    let drag = null;
    let fling = null;
    let swallowClick = false;
    let carry = 0;

    const scrollPx = (dy) => {
        carry += -dy / screen.cellH;
        const whole = Math.trunc(carry);
        if (whole) {
            carry -= whole;
            app.scrollLines(whole);
        }
    };

    const stopFling = () => {
        if (fling) cancelAnimationFrame(fling.raf);
        fling = null;
    };

    const startFling = (velocity) => {
        let last = performance.now();
        fling = { velocity };
        const step = (now) => {
            const dt = now - last;
            last = now;
            fling.velocity *= Math.exp(-FLING_DECAY * dt);
            if (Math.abs(fling.velocity) < FLING_MIN / 4) { fling = null; return; }
            scrollPx(fling.velocity * dt);
            fling.raf = requestAnimationFrame(step);
        };
        fling.raf = requestAnimationFrame(step);
    };

    canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch' || !e.isPrimary) return;
        stopFling();
        carry = 0;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, scrolling: false, samples: [] };
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        if (!drag.scrolling) {
            if (screen.hasSelection()) { drag = null; return; }
            if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) <= TOUCH_SLOP) return;
            drag.scrolling = true;
        }
        scrollPx(e.clientY - drag.y);
        drag.y = e.clientY;
        const now = performance.now();
        drag.samples.push({ t: now, y: e.clientY });
        while (drag.samples.length > 2 && now - drag.samples[0].t > SAMPLE_MS) drag.samples.shift();
    });

    const release = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const { scrolling, samples } = drag;
        drag = null;
        if (!scrolling) return;
        // the click that may follow should not focus the input or open the link the finger lifted on
        swallowClick = true;
        setTimeout(() => { swallowClick = false; }, 50);
        if (e.type === 'pointercancel' || app.reducedMotion || samples.length < 2) return;
        const first = samples[0];
        const lastSample = samples[samples.length - 1];
        const dt = performance.now() - first.t;
        if (dt <= 0 || performance.now() - lastSample.t > SAMPLE_MS) return;
        const velocity = (lastSample.y - first.y) / dt;
        if (Math.abs(velocity) >= FLING_MIN) startFling(velocity);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    return {
        consumeClick() {
            const swallowed = swallowClick;
            swallowClick = false;
            return swallowed;
        },
    };
}
