import { PALETTE, FONTS, COLOR } from './themes.js';
import { wrapRuns, runsLength, FLAG_INVERSE, FLAG_UNDERLINE } from './text.js';

export class Screen {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: false });

        this.lines = [];
        this.activeLine = null;
        this.cursorIndex = 0;
        this.cursorVisible = true;
        this.scrollOffset = 0;
        this.maxLines = 4000;

        this.cols = 80;
        this.rows = 25;
        this.dirty = true;
        this._committedRows = null;
        this._wrapCache = null;
    }

    setMetrics({ cssWidth, cssHeight, dpr, pixelScale, fontKey, curvature }) {
        const font = FONTS[fontKey] || FONTS.vga;
        this.fontKey = fontKey;
        this.dpr = dpr;
        this.cssWidth = cssWidth;
        this.cssHeight = cssHeight;

        const ctx = this.ctx;
        ctx.font = `100px "${font.family}", monospace`;
        const advance100 = ctx.measureText('MMMMMMMMMM').width / 10;

        const cellW = font.cell[0] * pixelScale;
        const glyphH = font.cell[1] * pixelScale;
        // Keep the cell an exact number of CRT pixels so glyph tops stay on the scanline grid even once leading is added.
        const cellH = pixelScale * Math.round(font.cell[1] * (1 + (font.lineGap || 0)));
        this.fontSize = advance100 > 0 ? (cellW * 100) / advance100 : glyphH;
        this.cellW = cellW;
        this.cellH = cellH;
        this.glyphOffsetY = Math.round((cellH - glyphH) / 2 / pixelScale) * pixelScale;
        this.pixelScale = pixelScale;

        const inset = 0.018 + curvature * 0.19;
        this.marginX = Math.max(14, cssWidth * inset);
        this.marginY = Math.max(12, cssHeight * inset);

        this.cols = Math.max(20, Math.floor((cssWidth - this.marginX * 2) / cellW));
        this.rows = Math.max(8, Math.floor((cssHeight - this.marginY * 2) / cellH));

        this.originX = (cssWidth - this.cols * cellW) / 2;
        this.originY = (cssHeight - this.rows * cellH) / 2;

        this.canvas.width = Math.floor(cssWidth * dpr);
        this.canvas.height = Math.floor(cssHeight * dpr);

        this._committedRows = null;
        this._wrapCache = null;
        this.dirty = true;
    }

    clear() {
        this.lines = [];
        this.scrollOffset = 0;
        this.invalidate();
    }

    push(runs) {
        this.lines.push(runs);
        if (this.lines.length > this.maxLines) {
            this.lines.splice(0, this.lines.length - this.maxLines);
            this._committedRows = null;
        } else if (this._committedRows) {
            for (const r of wrapRuns(runs, this.cols)) this._committedRows.push(r);
        }
        this.scrollOffset = 0;
        this._wrapCache = null;
        this.dirty = true;
    }

    replaceLast(runs) {
        if (this.lines.length === 0) this.lines.push(runs);
        else this.lines[this.lines.length - 1] = runs;
        this.invalidate();
    }

    setActive(runs, cursorIndex) {
        this.activeLine = runs;
        this.cursorIndex = cursorIndex;
        this.invalidate();
    }

    invalidate() {
        this._committedRows = null;
        this._wrapCache = null;
        this.dirty = true;
    }

    layout() {
        if (this._wrapCache) return this._wrapCache;
        if (!this._committedRows) {
            this._committedRows = [];
            for (const line of this.lines) {
                for (const r of wrapRuns(line, this.cols)) this._committedRows.push(r);
            }
        }
        const rows = this._committedRows.slice();

        let cursor = null;
        if (this.activeLine) {
            const wrapped = wrapRuns(this.activeLine, this.cols);
            let remaining = this.cursorIndex;
            for (let i = 0; i < wrapped.length; i++) {
                const len = runsLength(wrapped[i]);
                if (remaining <= len && (i === wrapped.length - 1 || remaining < len)) {
                    cursor = { row: rows.length + i, col: remaining };
                    break;
                }
                remaining -= len;
            }
            if (!cursor) cursor = { row: rows.length + wrapped.length - 1, col: this.cols - 1 };
            for (const r of wrapped) rows.push(r);
        }

        this._wrapCache = { rows, cursor };
        return this._wrapCache;
    }

    get totalRows() { return this.layout().rows.length; }

    scrollBy(deltaRows) {
        const max = Math.max(0, this.totalRows - this.rows);
        const next = Math.min(max, Math.max(0, this.scrollOffset + deltaRows));
        if (next !== this.scrollOffset) { this.scrollOffset = next; this.dirty = true; }
    }

    scrollToBottom() {
        if (this.scrollOffset !== 0) { this.scrollOffset = 0; this.dirty = true; }
    }

    viewTop() {
        const { rows } = this.layout();
        return Math.max(0, rows.length - this.rows - this.scrollOffset);
    }

    render() {
        const ctx = this.ctx;
        const { rows, cursor } = this.layout();

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

        ctx.font = `${this.fontSize}px "${(FONTS[this.fontKey] || FONTS.vga).family}", monospace`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        const top = this.viewTop();
        const end = Math.min(rows.length, top + this.rows);
        this._visibleTop = top;

        for (let i = top; i < end; i++) {
            const y = this.originY + (i - top) * this.cellH;
            const ty = y + this.glyphOffsetY;
            let col = 0;
            for (const run of rows[i]) {
                const x = this.originX + col * this.cellW;

                if (run.rule) {
                    ctx.fillStyle = PALETTE[run.color];
                    const t = this.pixelScale;
                    const ry = Math.round((y + this.cellH / 2) / t) * t;
                    ctx.fillRect(x, ry, (this.cols - col) * this.cellW, t);
                    continue;
                }

                const w = run.text.length * this.cellW;

                if (run.flags & FLAG_INVERSE) {
                    ctx.fillStyle = PALETTE[run.color];
                    ctx.fillRect(x, y, w, this.cellH);
                    ctx.fillStyle = '#000000';
                } else {
                    ctx.fillStyle = PALETTE[run.color];
                }
                ctx.fillText(run.text, x, ty);

                if (run.flags & FLAG_UNDERLINE) {
                    const uy = Math.round(y + this.cellH - Math.max(1, this.cellH * 0.09));
                    ctx.fillRect(x, uy, w, Math.max(1, Math.round(this.cellH * 0.055)));
                }
                col += run.text.length;
            }
        }

        if (cursor && this.cursorVisible && this.scrollOffset === 0) {
            const cy = this.originY + (cursor.row - top) * this.cellH;
            if (cursor.row >= top && cursor.row < end) {
                ctx.fillStyle = PALETTE[COLOR.bright];
                ctx.fillRect(this.originX + cursor.col * this.cellW, cy, this.cellW, this.cellH);
            }
        }

        if (this.scrollOffset > 0) {
            ctx.fillStyle = PALETTE[COLOR.dim];
            const label = `-- ${this.scrollOffset} more below --`;
            ctx.fillText(label, this.originX + (this.cols - label.length) * this.cellW,
                this.originY + (this.rows - 1) * this.cellH);
        }

        this.dirty = false;
    }

    runAt(u, v) {
        const x = u * this.cssWidth - this.originX;
        const y = v * this.cssHeight - this.originY;
        if (x < 0 || y < 0) return null;
        const col = Math.floor(x / this.cellW);
        const rowOnScreen = Math.floor(y / this.cellH);
        if (col < 0 || col >= this.cols || rowOnScreen < 0 || rowOnScreen >= this.rows) return null;

        const { rows } = this.layout();
        const row = rows[(this._visibleTop ?? this.viewTop()) + rowOnScreen];
        if (!row) return null;

        let c = 0;
        for (const run of row) {
            if (col >= c && col < c + run.text.length) return run;
            c += run.text.length;
        }
        return null;
    }
}
