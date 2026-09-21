import { PALETTE, FONTS, COLOR } from './themes.js';
import { wrapRuns, runsLength, rowCells, FLAG_INVERSE, FLAG_UNDERLINE } from './text.js';

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
        // A full-screen program (the pager) can take over drawing; the scrollback stays untouched underneath.
        this.view = null;
        this.sel = null;
        this.notice = null;

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
        this.sel = null;
        this.dirty = true;
    }

    clear() {
        this.lines = [];
        this.sel = null;
        this.scrollOffset = 0;
        this.invalidate();
    }

    push(runs) {
        this.lines.push(runs);
        if (this.lines.length > this.maxLines) {
            this.lines.splice(0, this.lines.length - this.maxLines);
            this._committedRows = null;
            this.sel = null;
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

    setView(view) {
        this.view = view;
        this._viewRows = null;
        this.sel = null;
        this.dirty = true;
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
        const { rows, cursor } = this.view ? this.view.frame(this.cols, this.rows) : this.layout();

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

        ctx.font = `${this.fontSize}px "${(FONTS[this.fontKey] || FONTS.vga).family}", monospace`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        const top = this.view ? 0 : this.viewTop();
        const end = Math.min(rows.length, top + this.rows);
        this._visibleTop = top;
        this._viewRows = this.view ? rows : null;
        const sel = this._orderedSelection();

        for (let i = top; i < end; i++) {
            const span = sel && i >= sel.a.row && i <= sel.b.row ? this._selectedSpan(sel, i) : null;
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

                const scale = run.scale || 1;
                const w = run.text.length * scale * this.cellW;

                if (run.flags & FLAG_INVERSE) {
                    ctx.fillStyle = PALETTE[run.color];
                    ctx.fillRect(x, y, w, this.cellH);
                    ctx.fillStyle = '#000000';
                } else {
                    ctx.fillStyle = PALETTE[run.color];
                }

                this._drawText(run, x, y, ty, w);

                if (span) {
                    const from = Math.max(span[0], col);
                    const to = Math.min(span[1] + 1, col + run.text.length * scale);
                    if (from < to) {
                        // Selected cells swap foreground and background, same as an inverse run.
                        const inverse = run.flags & FLAG_INVERSE;
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(x + (from - col) * this.cellW, y, (to - from) * this.cellW, this.cellH);
                        ctx.clip();
                        ctx.fillStyle = inverse ? '#000000' : PALETTE[run.color];
                        ctx.fillRect(x, y, w, this.cellH);
                        ctx.fillStyle = inverse ? PALETTE[run.color] : '#000000';
                        this._drawText(run, x, y, ty, w);
                        ctx.restore();
                        ctx.fillStyle = inverse ? '#000000' : PALETTE[run.color];
                    }
                }

                if (run.flags & FLAG_UNDERLINE && run.half !== 'top') {
                    const uy = Math.round(y + this.cellH - Math.max(1, this.cellH * 0.09));
                    ctx.fillRect(x, uy, w, Math.max(1, Math.round(this.cellH * 0.055)));
                }
                col += run.text.length * scale;
            }
        }

        if (cursor && this.cursorVisible && (this.view || this.scrollOffset === 0)) {
            const cy = this.originY + (cursor.row - top) * this.cellH;
            if (cursor.row >= top && cursor.row < end) {
                ctx.fillStyle = PALETTE[COLOR.bright];
                ctx.fillRect(this.originX + cursor.col * this.cellW, cy, this.cellW, this.cellH);
            }
        }

        if (!this.view && this.scrollOffset > 0) {
            ctx.fillStyle = PALETTE[COLOR.dim];
            const label = `-- ${this.scrollOffset} more below --`;
            ctx.fillText(label, this.originX + (this.cols - label.length) * this.cellW,
                this.originY + (this.rows - 1) * this.cellH);
        }

        if (this.notice) {
            const label = ` ${this.notice} `;
            const nx = this.originX + (this.cols - label.length) * this.cellW;
            ctx.fillStyle = PALETTE[COLOR.bright];
            ctx.fillRect(nx, this.originY, label.length * this.cellW, this.cellH);
            ctx.fillStyle = '#000000';
            ctx.fillText(label, nx, this.originY + this.glyphOffsetY);
        }

        this.dirty = false;
    }

    _drawText(run, x, y, ty, w) {
        const ctx = this.ctx;
        if ((run.scale || 1) === 2) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, this.cellH);
            ctx.clip();
            ctx.translate(x, run.half === 'bottom' ? y - this.cellH : y);
            ctx.scale(2, 2);
            ctx.fillText(run.text, 0, this.glyphOffsetY);
            ctx.restore();
        } else {
            ctx.fillText(run.text, x, ty);
        }
    }

    runAt(u, v) {
        const x = u * this.cssWidth - this.originX;
        const y = v * this.cssHeight - this.originY;
        if (x < 0 || y < 0) return null;
        const col = Math.floor(x / this.cellW);
        const rowOnScreen = Math.floor(y / this.cellH);
        if (col < 0 || col >= this.cols || rowOnScreen < 0 || rowOnScreen >= this.rows) return null;

        const rows = this.view ? (this._viewRows ?? []) : this.layout().rows;
        const row = rows[(this._visibleTop ?? this.viewTop()) + rowOnScreen];
        if (!row) return null;

        let c = 0;
        for (const run of row) {
            const w = run.text.length * (run.scale || 1);
            if (col >= c && col < c + w) return run;
            c += w;
        }
        return null;
    }

    // selection

    _rows() {
        return this.view ? (this._viewRows ?? []) : this.layout().rows;
    }

    cellAt(u, v) {
        const rows = this._rows();
        if (rows.length === 0) return null;
        const x = u * this.cssWidth - this.originX;
        const y = v * this.cssHeight - this.originY;
        const over = y < 0 ? -1 : y >= this.rows * this.cellH ? 1 : 0;
        const top = this.view ? 0 : this.viewTop();
        let col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellW)));
        let row = top + Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellH)));
        if (row > rows.length - 1) { row = rows.length - 1; col = this.cols - 1; }
        return { row, col, over };
    }

    setSelection(a, b) {
        this.sel = { a: { row: a.row, col: a.col }, b: { row: b.row, col: b.col } };
        this.dirty = true;
    }

    clearSelection() {
        if (!this.sel) return;
        this.sel = null;
        this.dirty = true;
    }

    hasSelection() { return this.sel !== null; }

    _orderedSelection() {
        if (!this.sel) return null;
        const { a, b } = this.sel;
        const flip = a.row > b.row || (a.row === b.row && a.col > b.col);
        return flip ? { a: b, b: a } : { a, b };
    }

    // inclusive column range of `row` covered by the selection
    _selectedSpan(sel, row) {
        return [row === sel.a.row ? sel.a.col : 0, row === sel.b.row ? sel.b.col : this.cols - 1];
    }

    // the run of non-space cells around a cell, or null when it sits on a space
    wordAt({ row, col }) {
        const line = this._rows()[row];
        if (!line) return null;
        const cells = rowCells(line, this.cols);
        if (cells[col] === ' ') return null;
        let from = col, to = col;
        while (from > 0 && cells[from - 1] !== ' ') from--;
        while (to < this.cols - 1 && cells[to + 1] !== ' ') to++;
        return { a: { row, col: from }, b: { row, col: to } };
    }

    selectedText() {
        const sel = this._orderedSelection();
        if (!sel) return '';
        const rows = this._rows();
        const out = [];
        for (let r = sel.a.row; r <= sel.b.row; r++) {
            const line = rows[r];
            if (!line || line.some((run) => run.half === 'bottom')) continue;
            const [from, to] = this._selectedSpan(sel, r);
            out.push(rowCells(line, this.cols).slice(from, to + 1).join('').trimEnd());
        }
        return out.join('\n');
    }

    flash(message, ms = 1400) {
        this.notice = message;
        this.dirty = true;
        clearTimeout(this._noticeTimer);
        this._noticeTimer = setTimeout(() => { this.notice = null; this.dirty = true; }, ms);
    }
}
