import { parseMarkup, wrapRuns } from '../display/text.js';
import { COLOR } from '../display/themes.js';

/* The parts of markdown the blog understands:
 *l
 *   # heading      doube-size, like a VT100 double-height line: twice as wide, top half and bottom half on two rows
 *   - item         bullet list (also * and +), indent with spaces to nest
 *   1. item        numbered list, numbers are shown as written
 *   ---            a rule across the whole row (also *** and ___)
 *
 *  Every line takes the standard markup: <b> <d> <inv>, <g> <y> <c> <r> <m> <u>, <a href="..."> */

const HEADING = /^#\s+(.*)$/;
const RULE = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const BULLET = /^( *)[-*+]\s+(.*)$/;
const NUMBERED = /^( *)(\d+[.)])\s+(.*)$/;

const prefixed = (prefix, text) => {
    const runs = parseMarkup(text);
    return { runs: [{ text: prefix, color: COLOR.normal, flags: 0, link: null }, ...runs], hang: prefix.length };
};

// Parse one  into runs plus how to lay them out: `hang` for list items, `double` for headings, `rule` for rules.
export function parseLine(line, { ascii = false } = {}) {
    let m;
    if (RULE.test(line)) return { runs: [{ text: '', color: COLOR.dim, flags: 0, link: null, rule: true }], rule: true };
    if ((m = HEADING.exec(line))) return { runs: parseMarkup(m[1], COLOR.bright), double: true };
    if ((m = BULLET.exec(line))) return prefixed(`${m[1]}${ascii ? '-' : '•'} `, m[2]);
    if ((m = NUMBERED.exec(line))) return prefixed(`${m[1]}${m[2]} `, m[3]);
    return { runs: parseMarkup(line) };
}

// Lay one line out into screen rows `width` cells wide.
export function renderLine(line, width, opts) {
    const parsed = parseLine(line, opts);
    if (parsed.rule) return [parsed.runs];
    if (!parsed.double) return wrapRuns(parsed.runs, width, parsed.hang);

    const rows = [];
    for (const row of wrapRuns(parsed.runs, Math.floor(width / 2))) {
        rows.push(row.map((r) => ({ ...r, scale: 2, half: 'top' })));
        rows.push(row.map((r) => ({ ...r, scale: 2, half: 'bottom' })));
    }
    return rows;
}

export const plainText = (line) => parseLine(line).runs.map((r) => r.text).join('');
