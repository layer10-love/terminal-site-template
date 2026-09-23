import { COLOR } from './themes.js';

export const FLAG_INVERSE = 1;
export const FLAG_UNDERLINE = 2;

const TAGS = {
    b: COLOR.bright, d: COLOR.dim, y: COLOR.yellow, g: COLOR.green,
    c: COLOR.cyan, r: COLOR.red, m: COLOR.magenta, u: COLOR.blue,
    k: COLOR.black, w: COLOR.normal,
};

export function parseMarkup(str, baseColor = COLOR.normal) {
    const runs = [];
    const colorStack = [baseColor];
    let flags = 0;
    let link = null;
    // a <cmd> runs its own text when tapped, or the run="..." it was given
    let command = null;
    let cmdStart = 0;
    let buf = '';

    const flush = () => {
        if (!buf) return;
        runs.push({ text: buf, color: colorStack[colorStack.length - 1], flags, link, command });
        buf = '';
    };

    const re = /<(\/?)(a|cmd|inv|hr|[bdygcrmukw])(?:\s+(href|run)="([^"]*)")?>/g;
    let last = 0, m;
    while ((m = re.exec(str)) !== null) {
        const [full, closing, tag, attr, value] = m;
        // not our tag
        if (!closing && ((tag === 'a') !== (attr === 'href') || (attr === 'run' && tag !== 'cmd'))) continue;
        buf += str.slice(last, m.index);
        last = m.index + full.length;
        flush();

        if (tag === 'hr') {
            if (!closing) runs.push({ text: '', color: colorStack[colorStack.length - 1], flags, link: null, rule: true });
            continue;
        }

        if (closing) {
            if (tag === 'a') { link = null; flags &= ~FLAG_UNDERLINE; }
            else if (tag === 'cmd') {
                if (command === '') {
                    const own = runs.slice(cmdStart);
                    const text = own.map((r) => r.text).join('').trim();
                    for (const r of own) r.command = text;
                }
                command = null;
                flags &= ~FLAG_UNDERLINE;
            } else if (tag === 'inv') flags &= ~FLAG_INVERSE;
            else if (colorStack.length > 1) colorStack.pop();
        } else {
            if (tag === 'a') { link = value; flags |= FLAG_UNDERLINE; }
            else if (tag === 'cmd') { command = value ?? ''; cmdStart = runs.length; flags |= FLAG_UNDERLINE; }
            else if (tag === 'inv') flags |= FLAG_INVERSE;
            else colorStack.push(TAGS[tag]);
        }
    }
    buf += str.slice(last);
    flush();
    return runs;
}

export function runsLength(runs) {
    let n = 0;
    for (const r of runs) n += r.text.length;
    return n;
}

/* Continuation rows are indented like the first row's leading spaces, or by `hang` cells when it is given
 * (list items hang past their bullet). */
export function wrapRuns(runs, cols, hang) {
    if (cols < 1) return [[]];
    const rows = [];
    let row = [];
    let used = 0;

    const firstText = runs.length ? runs[0].text : '';
    const indent = Math.min(cols - 8, hang ?? (firstText.match(/^ */) || [''])[0].length);
    const pad = indent > 0 ? ' '.repeat(indent) : '';

    const pushRow = () => {
        rows.push(row);
        row = pad ? [{ text: pad, color: 7, flags: 0, link: null }] : [];
        used = pad.length;
    };

    for (const run of runs) {
        if (run.rule || run.text.length === 0) { row.push(run); continue; }

        let text = run.text;
        while (text.length > 0) {
            const space = cols - used;
            if (space <= 0) { pushRow(); continue; }
            if (text.length <= space) {
                row.push({ ...run, text });
                used += text.length;
                break;
            }
            // Prefer to break at the last space that fits; a space at 0 breaks right before this run.
            let cut = text.lastIndexOf(' ', space);
            if (cut < 0 || (cut === 0 && used <= pad.length)) cut = space;
            if (cut > 0) row.push({ ...run, text: text.slice(0, cut) });
            text = text.slice(cut).replace(/^ /, '');
            pushRow();
        }
    }
    rows.push(row);
    return rows;
}

export function rowCells(runs, cols) {
    const cells = new Array(cols).fill(' ');
    let col = 0;
    for (const run of runs) {
        if (run.rule) break;
        const scale = run.scale || 1;
        for (let i = 0; i < run.text.length; i++) {
            const c = col + i * scale;
            if (c >= cols) break;
            cells[c] = run.half === 'bottom' ? '' : run.text[i];
            if (scale === 2 && c + 1 < cols) cells[c + 1] = '';
        }
        col += run.text.length * scale;
    }
    return cells;
}
