const LONG_PRESS_MS = 450;
const TOUCH_SLOP = 10;
const SCROLL_TICK_MS = 60;
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

async function writeClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch { /* no clipboard permission or an insecure context: try the old way */ }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ok stays false */ }
    area.remove();
    return ok;
}

export function bindSelection(app) {
    const { canvas, screen } = app;
    let drag = null;
    let swallowClick = false;

    const cellUnder = (e) => {
        const [u, v] = app.crt.screenToTexture(e.clientX, e.clientY);
        return screen.cellAt(u, v);
    };

    // on touch, focusing the input would raise the keyboard over what was just selected
    const copySelection = async ({ focus = true } = {}) => {
        const text = screen.selectedText();
        if (!text.trim()) return;
        const ok = await writeClipboard(text);
        if (focus) app.terminal.focus();
        screen.flash(ok ? `copied ${text.length} chars` : 'copy failed');
    };

    const stopDrag = () => {
        if (!drag) return;
        clearTimeout(drag.pressTimer);
        clearInterval(drag.scrollTimer);
        drag = null;
    };

    const extendTo = (cell) => {
        if (!drag.moved && cell.row === drag.anchor.row && cell.col === drag.anchor.col) return;
        drag.moved = true;
        screen.setSelection(drag.anchor, cell);
    };

    const autoScroll = () => {
        if (!drag?.active || screen.view) return;
        const cell = cellUnder(drag.last);
        if (!cell?.over) return;
        screen.scrollBy(-cell.over);
        const top = screen.viewTop();
        extendTo(cell.over < 0
            ? { row: top, col: 0 }
            : { row: Math.min(top + screen.rows - 1, screen.totalRows - 1), col: screen.cols - 1 });
    };

    canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !e.isPrimary) return;
        const cell = cellUnder(e);
        if (!cell) return;
        stopDrag();
        screen.clearSelection();

        const touch = e.pointerType === 'touch';
        drag = { id: e.pointerId, anchor: cell, last: e, x: e.clientX, y: e.clientY, touch, active: !touch, moved: false };

        if (touch) {
            drag.pressTimer = setTimeout(() => {
                const word = screen.wordAt(cell) ?? { a: cell, b: cell };
                drag.active = drag.moved = true;
                drag.anchor = word.a;
                drag.scrollTimer = setInterval(autoScroll, SCROLL_TICK_MS);
                screen.setSelection(word.a, word.b);
                navigator.vibrate?.(10);
            }, LONG_PRESS_MS);
        } else {
            canvas.setPointerCapture(e.pointerId);
            drag.scrollTimer = setInterval(autoScroll, SCROLL_TICK_MS);
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag.last = e;
        if (!drag.active) {
            // if the touch moves before the long press lands: thats a scroll or a swipe, not a selection
            if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > TOUCH_SLOP) stopDrag();
            return;
        }
        const cell = cellUnder(e);
        if (cell) extendTo(cell);
    });

    const release = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const selected = drag.active && drag.moved;
        const touch = drag.touch;
        stopDrag();
        if (e.type === 'pointercancel') { screen.clearSelection(); return; }
        if (!selected) return;
        // the click that follows a drag should not focus the input or open the link the drag ended on
        swallowClick = true;
        setTimeout(() => { swallowClick = false; }, 50);
        if (!touch) app.terminal.focus();
        copySelection({ focus: !touch });
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    canvas.addEventListener('dblclick', (e) => {
        const cell = cellUnder(e);
        const word = cell && screen.wordAt(cell);
        if (!word) return;
        screen.setSelection(word.a, word.b);
        copySelection();
    });

    // a long press would otherwise raise the browsers context menu over the selection
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // the pagers rows change as it scrolls, so a selection in it would end up on the wrong text
    canvas.addEventListener('wheel', () => { if (screen.view) screen.clearSelection(); }, { passive: true });

    document.addEventListener('keydown', (e) => {
        if (!screen.hasSelection()) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            e.stopPropagation();
            copySelection();
            return;
        }
        if (!MODIFIER_KEYS.has(e.key)) screen.clearSelection();
    }, true);

    return {
        consumeClick() {
            const swallowed = swallowClick;
            swallowClick = false;
            return swallowed;
        },
    };
}
