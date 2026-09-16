import { parseMarkup, runsLength } from '../display/text.js';
import { COLOR } from '../display/themes.js';
import { SITE, BOOT, GREETING } from '../content/content.js';
import { buildCommands, lookup, resolvePath } from './commands.js';
import { banner } from '../display/banner.js';
import { BLOG_ROUTE, isBlogPath } from '../blog/route.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Terminal {
    constructor(screen, app) {
        this.screen = screen;
        this.app = app;
        this.cwd = '/';
        this.history = [];
        this.historyIndex = 0;
        this.busy = false;
        this.skipRequested = false;
        this.pager = null;
        this.commands = buildCommands({ term: this, app });

        this.input = this.createInput();
        this.bindKeys();
    }

    createInput() {
        const el = document.createElement('input');
        el.type = 'text';
        el.id = 'kbd';
        el.autocomplete = 'off';
        el.autocapitalize = 'off';
        el.spellcheck = false;
        el.setAttribute('aria-label', 'Terminal input');
        document.body.appendChild(el);
        el.addEventListener('input', () => this.refreshPrompt());
        el.addEventListener('select', () => this.refreshPrompt());
        el.addEventListener('click', () => this.refreshPrompt());
        return el;
    }

    focus() {
        this.input.focus({ preventScroll: true });
    }

    promptRuns() {
        return parseMarkup(`<g>${SITE.user}</g><d>@</d><g>${SITE.host}</g><d>:</d><c>${this.cwd}</c><d>$</d> `);
    }

    refreshPrompt() {
        if (this.pager) { this.pager.refresh(); return; }
        if (this.busy) { this.screen.setActive(null, 0); return; }
        const prompt = this.promptRuns();
        const typed = this.input.value;
        const runs = [...prompt];
        if (typed) runs.push({ text: typed, color: COLOR.bright, flags: 0, link: null });
        this.screen.setActive(runs, runsLength(prompt) + (this.input.selectionStart ?? typed.length));
        this.screen.scrollToBottom();
    }

    // full-screen programs: the pager gets the screen and every keystroke until it closes itself
    openPager(pager) {
        this.pager = pager;
        this.screen.setView(pager);
    }

    closePager() {
        this.pager = null;
        this.screen.setView(null);
        this.refreshPrompt();
    }

    // Follows the address bar: /blog opens the post list, /blog/<post> opens that post, anything else is the console.
    async route() {
        const path = location.pathname.replace(/\/+$/, '');
        if (this.pager) this.closePager();
        if (!isBlogPath(path)) return;

        let name = path.slice(BLOG_ROUTE.length + 1);
        try { name = decodeURIComponent(name); } catch { /* malformed escape: look it up as typed */ }
        const out = this.commands.blog ? this.commands.blog.run(name ? [name] : []) : [];
        if (this.pager) return;

        // no such post: don't leave an address that claims otherwise
        history.replaceState(null, '', '/');
        await this.typeLines(out);
        this.refreshPrompt();
    }

    printLine(markup) {
        const runs = parseMarkup(markup ?? '');
        this.screen.push(runs);
        this.announce(runs.map((r) => r.text).join(''));
    }

    announce(text) {
        const sr = document.getElementById('sr');
        if (!sr) return;
        const line = document.createElement('div');
        line.textContent = text;
        sr.appendChild(line);
        while (sr.childElementCount > 60) sr.removeChild(sr.firstChild);
    }

    async typeLines(lines, delay = 0) {
        for (const line of lines) {
            this.printLine(line);
            if (delay > 0 && !this.skipRequested) await sleep(delay);
        }
    }

    async submit() {
        const raw = this.input.value;
        const prompt = this.promptRuns();
        this.screen.push([...prompt, { text: raw, color: COLOR.bright, flags: 0, link: null }]);
        this.input.value = '';
        this.screen.setActive(null, 0);

        const line = raw.trim();
        if (line) {
            this.history.push(line);
            if (this.history.length > 200) this.history.shift();
        }
        this.historyIndex = this.history.length;

        if (line) await this.run(line);
        this.refreshPrompt();
    }

    async run(line) {
        const [name, ...args] = line.split(/\s+/);
        const cmd = this.commands[name.toLowerCase()];

        this.busy = true;
        this.screen.setActive(null, 0);
        try {
            if (!cmd) {
                await this.typeLines([
                    `<r>${name}: command not found</r>`,
                    '<d>Type <b>help</b> for the list.</d>',
                ]);
            } else {
                const out = await cmd.run(args);
                if (out && out.length) await this.typeLines(out, this.app.reducedMotion ? 0 : 8);
            }
        } catch (err) {
            console.error(err);
            await this.typeLines([`<r>${name}: ${err.message}</r>`]);
        } finally {
            this.busy = false;
            this.skipRequested = false;
        }
    }

    complete() {
        const value = this.input.value;
        const parts = value.split(/\s+/);
        const isCommand = parts.length === 1;
        const word = parts[parts.length - 1];

        let pool;
        if (isCommand) {
            pool = Object.keys(this.commands);
        } else {
            const cmd = this.commands[parts[0].toLowerCase()];
            pool = cmd?.complete ? cmd.complete() : [];
        }

        const matches = pool.filter((c) => c.startsWith(word));
        if (matches.length === 0) return;

        if (matches.length === 1) {
            parts[parts.length - 1] = matches[0];
            this.input.value = parts.join(' ') + (matches[0].endsWith('/') ? '' : ' ');
        } else {
            let prefix = matches[0];
            for (const m of matches) {
                while (!m.startsWith(prefix)) prefix = prefix.slice(0, -1);
            }
            parts[parts.length - 1] = prefix;
            this.input.value = parts.join(' ');
            this.screen.push([...this.promptRuns(), { text: value, color: COLOR.bright, flags: 0, link: null }]);
            this.printLine('  ' + matches.map((m) => `<b>${m}</b>`).join('   '));
        }
        this.refreshPrompt();
    }

    recallHistory(delta) {
        if (this.history.length === 0) return;
        this.historyIndex = Math.min(this.history.length, Math.max(0, this.historyIndex + delta));
        this.input.value = this.history[this.historyIndex] ?? '';
        this.input.setSelectionRange(this.input.value.length, this.input.value.length);
        this.refreshPrompt();
    }

    bindKeys() {
        this.input.addEventListener('keydown', (e) => {
            if (this.pager) { this.pager.onKey(e); return; }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!this.busy) this.submit();
                else this.skipRequested = true;
                return;
            }
            if (this.busy) { this.skipRequested = true; }

            switch (e.key) {
                case 'ArrowUp': e.preventDefault(); this.recallHistory(-1); break;
                case 'ArrowDown': e.preventDefault(); this.recallHistory(1); break;
                case 'Tab': e.preventDefault(); this.complete(); break;
                case 'PageUp': e.preventDefault(); this.screen.scrollBy(this.screen.rows - 2); break;
                case 'PageDown': e.preventDefault(); this.screen.scrollBy(-(this.screen.rows - 2)); break;
                case 'Escape': this.app.toggleSettings(false); break;
                case 'l': case 'L':
                    if (e.ctrlKey) { e.preventDefault(); this.screen.clear(); this.refreshPrompt(); }
                    break;
                case 'c': case 'C':
                    if (e.ctrlKey && !window.getSelection().toString()) {
                        e.preventDefault();
                        this.screen.push([...this.promptRuns(),
                            { text: this.input.value + '^C', color: COLOR.bright, flags: 0, link: null }]);
                        this.input.value = '';
                        this.refreshPrompt();
                    }
                    break;
                case 'u': case 'U':
                    if (e.ctrlKey) { e.preventDefault(); this.input.value = ''; this.refreshPrompt(); }
                    break;
                default: break;
            }
            requestAnimationFrame(() => this.refreshPrompt());
        });
    }

    async boot({ skipBoot = false } = {}) {
        this.busy = true;
        this.screen.clear();

        if (!skipBoot && !this.app.reducedMotion) {
            for (const step of BOOT) {
                if (this.skipRequested) break;
                if (step.t === '<memcount>') {
                    await this.memoryCount();
                    continue;
                }
                this.printLine(step.t);
                if (step.p) await sleep(step.p);
            }
            if (!this.skipRequested) await sleep(180);
            this.screen.clear();
        }

        for (const row of banner(SITE.banner, this.app.blockChar())) {
            this.printLine(`<b>${row}</b>`);
        }
        this.printLine('');
        this.printLine(`<d>${SITE.tagline}</d>`);
        this.printLine('');
        await this.typeLines(GREETING, this.app.reducedMotion ? 0 : 60);

        this.busy = false;
        this.skipRequested = false;
        this.refreshPrompt();
    }

    async memoryCount() {
        const total = 640;
        this.printLine('');
        for (let kb = 0; kb <= total; kb += 64) {
            this.screen.replaceLast(parseMarkup(`  <b>${String(kb).padStart(5)}</b> KB OK`));
            if (this.skipRequested) break;
            await sleep(28);
        }
        this.screen.replaceLast(parseMarkup(`  <b>${total}</b> KB OK                    <g>[ OK ]</g>`));
    }
}
