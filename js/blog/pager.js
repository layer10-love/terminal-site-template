import { wrapRuns, FLAG_INVERSE } from '../display/text.js';
import { COLOR } from '../display/themes.js';
import { renderLine, plainText } from './markdown.js';
import { BLOG_ROUTE, isBlogPath } from './route.js';

/* A pager that takes over the whole screen while it is open:
 *
 *    POSTS      │ the post, wrapped to whatever width is left
 *    blog-1.md  │ ...
 *    blog-2.md  │ ~
 *   ────────────┴─────────────────────────────────────────────────
 *   :command line                 [tab] posts  [exit] leave  top
 *
 * While the post list is open, up/down pick a post and enter closes the list to read it.
 * While it is closed, up/down scroll. PgUp/PgDn pagescroll. `exit` goes back to the shell.
 * Posts are fetched relative to the page and rendered with the markdown subset in markdown.js. */

const cache = new Map();

const run = (text, color = COLOR.normal, extra = {}) => ({ text, color, flags: 0, link: null, ...extra });
const cell = (text, width) => text.slice(0, width).padEnd(width);

function navigate(post) {
    const path = `${BLOG_ROUTE}/${encodeURIComponent(post.title)}`;
    if (location.pathname === path) return;
    // entering the blog is a history step, flipping between posts is not
    history[isBlogPath(location.pathname) ? 'replaceState' : 'pushState'](null, '', path);
}

export class Pager {
    constructor(term, posts, { start = 0, sidebar = true } = {}) {
        this.term = term;
        this.posts = posts;
        this.sidebar = sidebar;
        this.selected = -1;
        this.state = 'loading'; // loading | ready | error
        this.error = null;
        this.lines = [];
        this.wrapped = null;
        this.top = 0;
        this.message = null;
        this.load(start);
    }

    refresh() {
        this.term.screen.dirty = true;
    }

    async load(index) {
        const post = this.posts[index];
        this.selected = index;
        this.top = 0;
        this.wrapped = null;
        navigate(post);

        let text = cache.get(post.src);
        if (text === undefined) {
            this.state = 'loading';
            this.refresh();
            try {
                const res = await fetch(post.src);
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
                text = await res.text();
                cache.set(post.src, text);
            } catch (err) {
                if (this.selected === index) {
                    this.state = 'error';
                    this.error = err.message;
                    this.refresh();
                }
                return;
            }
            if (this.selected !== index) return;
        }

        this.lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((l) => l.replace(/\t/g, '    '));
        this.wrapped = null;
        this.state = 'ready';
        this.term.announce(post.title);
        for (const line of this.lines) this.term.announce(plainText(line));
        this.refresh();
    }

    select(index) {
        if (index >= 0 && index < this.posts.length && index !== this.selected) this.load(index);
    }

    open(index) {
        this.select(index);
        this.toggleSidebar(false);
    }

    toggleSidebar(open = !this.sidebar) {
        this.sidebar = open;
        this.refresh();
    }

    close() {
        history.pushState(null, '', '/');
        this.term.closePager();
    }

    // layout
    geometry(cols, rows) {
        const bodyH = rows - 2;
        const sideW = this.sidebar ? Math.min(24, Math.floor(cols * 0.4)) : 0;
        // sidebar, separator, one column of gap
        const textW = this.sidebar ? cols - sideW - 2 : cols;
        return { bodyH, sideW, textW };
    }

    wrap(width) {
        const ascii = this.term.app.plainAscii();
        if (this.wrapped?.width === width && this.wrapped.ascii === ascii) return this.wrapped;
        const rows = [];
        const src = [];
        this.lines.forEach((line, i) => {
            for (const row of renderLine(line, width, { ascii })) {
                rows.push(row);
                src.push(i);
            }
        });
        const anchor = this.wrapped?.src[this.top];
        this.top = anchor === undefined ? 0 : src.indexOf(anchor);
        this.wrapped = { width, ascii, rows, src };
        return this.wrapped;
    }

    scroll(delta) {
        if (this.state !== 'ready') return;
        const { bodyH, textW } = this.geometry(this.term.screen.cols, this.term.screen.rows);
        const max = Math.max(0, this.wrap(textW).rows.length - bodyH);
        const next = Math.min(max, Math.max(0, this.top + delta));
        if (next !== this.top) { this.top = next; this.refresh(); }
    }

    page() {
        return Math.max(1, this.geometry(this.term.screen.cols, this.term.screen.rows).bodyH - 1);
    }

    // rendering: Screen calls this every time it redraws while the pager is its view
    frame(cols, rows) {
        const { bodyH, sideW, textW } = this.geometry(cols, rows);
        const text = this.textRows(textW, bodyH);
        const side = this.sidebar ? this.sidebarRows(sideW, bodyH) : null;
        // fonts without CP437 line drawing (Apple 2, Atari) get plain ASCII
        const ascii = this.term.app.plainAscii();
        const bar = run(ascii ? '|' : '│', COLOR.dim);
        const rule = ascii ? '-' : '─';

        const out = text.map((row, i) => (side ? [...side[i], bar, run(' '), ...row] : row));
        out.push(side && !ascii
            ? [run(rule.repeat(sideW), COLOR.dim), run('┴', COLOR.dim), run(rule.repeat(cols - sideW - 1), COLOR.dim)]
            : [run(rule.repeat(cols), COLOR.dim)]);
        const line = this.commandLine(cols, bodyH);
        out.push(line.runs);
        const cursor = this.term.input.value ? { row: rows - 1, col: line.cursor } : null;
        return { rows: out, cursor };
    }

    textRows(width, height) {
        let rows;
        if (this.state === 'ready') {
            const all = this.wrap(width).rows;
            this.top = Math.min(this.top, Math.max(0, all.length - height));
            rows = all.slice(this.top, this.top + height);
        } else if (this.state === 'loading') {
            rows = [[run('loading...', COLOR.dim)]];
        } else {
            const msg = `could not load ${this.posts[this.selected].src}: ${this.error}`;
            rows = wrapRuns([run(msg, COLOR.red)], width);
        }
        while (rows.length < height) rows.push([run('~', COLOR.dim)]);
        return rows.slice(0, height);
    }

    sidebarRows(width, height) {
        const rows = [[run(cell(' POSTS', width), COLOR.yellow)], [run(cell('', width))]];
        const listH = height - rows.length;
        const first = Math.max(0, Math.min(this.selected - Math.floor(listH / 2), this.posts.length - listH));
        for (let i = first; i < Math.min(this.posts.length, first + listH); i++) {
            const entry = run(cell(` ${this.posts[i].title}`, width), COLOR.normal, { action: () => this.open(i) });
            if (i === this.selected) { entry.color = COLOR.bright; entry.flags = FLAG_INVERSE; }
            rows.push([entry]);
        }
        while (rows.length < height) rows.push([run(cell('', width))]);
        return rows.slice(0, height);
    }

    position(bodyH) {
        if (this.state !== 'ready') return '';
        const total = this.wrapped.rows.length;
        if (total <= bodyH) return 'all';
        if (this.top === 0) return 'top';
        const bottom = this.top + bodyH;
        return bottom >= total ? 'end' : `${Math.floor((bottom / total) * 100)}%`;
    }

    commandLine(cols, bodyH) {
        const { value, selectionStart } = this.term.input;
        const typed = value.slice(0, cols - 1);
        const left = [run(':'), run(typed, COLOR.bright)];
        const leftLen = 1 + typed.length;

        const segments = this.message
            ? [run(this.message, COLOR.red)]
            : [
                run(this.sidebar ? '[tab] hide posts' : '[tab] posts', COLOR.dim, { action: () => this.toggleSidebar() }),
                run('[exit] leave', COLOR.dim, { action: () => this.close() }),
                run(this.position(bodyH), COLOR.dim),
                run(this.state === 'ready' ? this.posts[this.selected].title : ''),
            ].filter((seg) => seg.text);

        const shown = [];
        let width = leftLen + 1;
        for (const seg of segments) {
            const need = seg.text.length + (shown.length ? 2 : 0);
            if (width + need > cols) break;
            width += need;
            shown.push(seg);
        }
        const right = shown.reverse().flatMap((seg, i) => (i ? [run('  '), seg] : [seg]));
        const rightLen = right.reduce((n, r) => n + r.text.length, 0);

        return {
            runs: [...left, run(' '.repeat(Math.max(0, cols - leftLen - rightLen))), ...right],
            cursor: Math.min(cols - 1, 1 + (selectionStart ?? value.length)),
        };
    }

    onKey(e) {
        this.message = null;
        switch (e.key) {
            case 'Enter': e.preventDefault(); this.submit(); return;
            case 'Tab': e.preventDefault(); this.toggleSidebar(); return;
            case 'Escape': this.toggleSidebar(false); return;
            case 'ArrowUp':
                e.preventDefault();
                if (this.sidebar) this.select(this.selected - 1); else this.scroll(-1);
                return;
            case 'ArrowDown':
                e.preventDefault();
                if (this.sidebar) this.select(this.selected + 1); else this.scroll(1);
                return;
            case 'PageUp': e.preventDefault(); this.scroll(-this.page()); return;
            case 'PageDown': e.preventDefault(); this.scroll(this.page()); return;
            case 'u': case 'U':
                if (e.ctrlKey) { e.preventDefault(); this.term.input.value = ''; }
                break;
            default: break;
        }
        // let the input apply the keystroke before redrawing the command line
        requestAnimationFrame(() => this.refresh());
    }

    submit() {
        const input = this.term.input;
        const cmd = input.value.trim();
        input.value = '';
        if (!cmd) {
            if (this.sidebar) this.toggleSidebar(false);
            else this.scroll(1);
        } else if (['exit', 'quit', 'q'].includes(cmd.toLowerCase())) {
            this.close();
            return;
        } else {
            this.message = `${cmd}: unknown command, type exit to leave`;
        }
        this.refresh();
    }
}
