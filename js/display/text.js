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
    let buf = '';

    const flush = () => {
        if (!buf) return;
        runs.push({ text: buf, color: colorStack[colorStack.length - 1], flags, link });
        buf = '';
    };

    const re = /<(\/?)(a|inv|hr|[bdygcrmukw])(?:\s+href="([^"]*)")?>/g;
    let last = 0, m;
    while ((m = re.exec(str)) !== null) {
        const [full, closing, tag, href] = m;
        if (tag === 'a' && !closing && href === undefined) continue; // not our tag
        buf += str.slice(last, m.index);
        last = m.index + full.length;
        flush();

        if (tag === 'hr') {
            if (!closing) runs.push({ text: '', color: colorStack[colorStack.length - 1], flags, link: null, rule: true });
            continue;
        }

        if (closing) {
            if (tag === 'a') { link = null; flags &= ~FLAG_UNDERLINE; }
            else if (tag === 'inv') flags &= ~FLAG_INVERSE;
            else if (colorStack.length > 1) colorStack.pop();
        } else {
            if (tag === 'a') { link = href; flags |= FLAG_UNDERLINE; }
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
