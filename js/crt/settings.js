import { THEMES, THEME_ORDER, RASTER } from '../display/themes.js';

const CONTROLS = [
    { group: 'Tube' },
    { key: 'screenCurvature', label: 'Curvature' },
    { key: 'frameSize', label: 'Edge padding' },

    { group: 'Picture' },
    { key: 'brightness', label: 'Brightness' },
    { key: 'contrast', label: 'Contrast' },
    { key: 'bloom', label: 'Bloom' },
    { key: 'chromaColor', label: 'Chroma' },
    { key: 'saturationColor', label: 'Saturation' },

    { group: 'Artefacts' },
    { key: 'burnIn', label: 'Burn-in' },
    { key: 'staticNoise', label: 'Static' },
    { key: 'jitter', label: 'Jitter' },
    { key: 'flickering', label: 'Flicker' },
    { key: 'glowingLine', label: 'Sweep line' },
    { key: 'horizontalSync', label: 'H-sync' },
    { key: 'rgbShift', label: 'RGB shift' },
];

const RASTER_LABELS = [
    [RASTER.none, 'None'],
    [RASTER.scanlines, 'Scanlines'],
    [RASTER.pixels, 'Pixels'],
    [RASTER.subpixels, 'Subpixels'],
];

function setRange(input, value) {
    input.value = String(value);
    input.setAttribute('value', input.value);
}

export class SettingsPanel {
    constructor(app) {
        this.app = app;
        this.el = document.createElement('aside');
        this.el.id = 'panel';
        this.el.hidden = true;
        this.el.setAttribute('aria-label', 'Display settings');
        document.body.appendChild(this.el);
        this.build();
    }

    build() {
        const app = this.app;
        const head = document.createElement('header');
        head.innerHTML = '<span>DISPLAY ADJUST</span>';
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '×';
        close.title = 'Close (Esc)';
        close.addEventListener('click', () => app.toggleSettings(false));
        head.appendChild(close);
        this.el.appendChild(head);

        const body = document.createElement('div');
        body.className = 'panel-body';
        this.el.appendChild(body);

        // picker
        const tubeRow = document.createElement('label');
        tubeRow.className = 'row select-row';
        tubeRow.innerHTML = '<span>Tube</span>';
        this.tubeSelect = document.createElement('select');
        this.tubeSelect.autocomplete = 'off';
        for (const key of THEME_ORDER) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = THEMES[key].name;
            this.tubeSelect.appendChild(opt);
        }
        this.tubeSelect.addEventListener('change', () => {
            if (this.replayed()) return;
            app.setTheme(this.tubeSelect.value);
        });
        tubeRow.appendChild(this.tubeSelect);
        body.appendChild(tubeRow);

        // Shadow mask mode
        const maskRow = document.createElement('label');
        maskRow.className = 'row select-row';
        maskRow.innerHTML = '<span>Shadow mask</span>';
        this.maskSelect = document.createElement('select');
        this.maskSelect.autocomplete = 'off';
        for (const [value, label] of RASTER_LABELS) {
            const opt = document.createElement('option');
            opt.value = String(value);
            opt.textContent = label;
            this.maskSelect.appendChild(opt);
        }
        this.maskSelect.addEventListener('change', () => {
            if (this.replayed()) return;
            app.profile.rasterization = Number(this.maskSelect.value);
            app.applyProfile();
        });
        maskRow.appendChild(this.maskSelect);
        body.appendChild(maskRow);

        // Pixel size
        const sizeRow = document.createElement('label');
        sizeRow.className = 'row';
        sizeRow.innerHTML = '<span>Pixel size</span>';
        this.sizeInput = document.createElement('input');
        Object.assign(this.sizeInput, { type: 'range', min: '1', max: '4', step: '0.5', autocomplete: 'off' });
        this.sizeInput.addEventListener('input', () => {
            if (this.replayed()) return;
            app.pixelScaleOverride = Number(this.sizeInput.value);
            app.layout();
        });
        sizeRow.appendChild(this.sizeInput);
        body.appendChild(sizeRow);

        this.inputs = {};
        for (const control of CONTROLS) {
            if (control.group) {
                const h = document.createElement('h2');
                h.textContent = control.group;
                body.appendChild(h);
                continue;
            }
            const row = document.createElement('label');
            row.className = 'row';
            row.innerHTML = `<span>${control.label}</span>`;
            const input = document.createElement('input');
            Object.assign(input, { type: 'range', min: '0', max: '1', step: '0.01', autocomplete: 'off' });
            input.addEventListener('input', () => {
                if (this.replayed()) return;
                app.profile[control.key] = Number(input.value);
                app.applyProfile();
            });
            row.appendChild(input);
            body.appendChild(row);
            this.inputs[control.key] = input;
        }

        const footer = document.createElement('footer');
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.textContent = 'Reset tube';
        reset.addEventListener('click', () => app.setTheme(app.themeKey, { reset: true }));
        footer.appendChild(reset);
        this.el.appendChild(footer);
        this.sync();
    }

    // The panel is hidden until the visitor opens it, so a control cannot be
    // touched while it is. Anything arriving then is the browser replaying form
    // state it saved for a reopened tab: put our own values back and ignore it.
    replayed() {
        if (!this.el.hidden) return false;
        this.sync();
        return true;
    }

    sync() {
        const p = this.app.profile;
        this.tubeSelect.value = this.app.themeKey;
        this.maskSelect.value = String(p.rasterization);
        setRange(this.sizeInput, this.app.pixelScale);
        for (const [key, input] of Object.entries(this.inputs)) {
            setRange(input, p[key] ?? 0);
        }
    }

    setOpen(open) {
        this.el.hidden = !open;
        if (open) this.sync();
    }
}
