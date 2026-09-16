import { SITE, FS, PAGES, CRT_LOGO, CRT_LOGO_ASCII } from '../content/content.js';
import { THEMES, THEME_ORDER } from '../display/themes.js';
import { banner } from '../display/banner.js';
import { BLOG } from '../content/blog.js';
import { Pager } from '../blog/pager.js';

// virtual filesystem navigation

export function resolvePath(cwd, path) {
    const parts = (path.startsWith('/') ? path : cwd + '/' + path).split('/');
    const stack = [];
    for (const part of parts) {
        if (part === '' || part === '.') continue;
        if (part === '..') stack.pop();
        else stack.push(part);
    }
    return '/' + stack.join('/');
}

export function lookup(path) {
    let node = FS;
    for (const part of path.split('/')) {
        if (!part) continue;
        if (node.type !== 'dir' || !node.children[part]) return null;
        node = node.children[part];
    }
    return node;
}

function listing(node) {
    return Object.entries(node.children)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, child]) => ({ name, isDir: child.type === 'dir' }));
}

// commands

export function buildCommands(ctx) {
    const { term, app } = ctx;

    const cmds = {
        help: { help: 'list commands', run: () => PAGES.help },

        about: { help: 'who I am', run: () => PAGES.about },
        projects: { help: 'things I have made', run: () => PAGES.projects },
        skills: { help: 'what I work in', run: () => PAGES.skills },
        contact: { help: 'how to reach me', run: () => PAGES.contact },
        colophon: { help: 'how this screen is built', run: () => PAGES.colophon },

        clear: {
            help: 'wipe the screen',
            run: () => { term.screen.clear(); return []; },
        },

        banner: {
            help: 'print the masthead',
            run: () => ['', ...banner(SITE.banner, app.blockChar()).map((l) => `<b>${l}</b>`), ''],
        },

        theme: {
            help: 'change the tube',
            complete: () => THEME_ORDER,
            run: (args) => {
                if (!args[0]) {
                    const out = ['', '<b>TUBES</b>', ''];
                    for (const key of THEME_ORDER) {
                        const mark = key === app.themeKey ? '<g>*</g>' : ' ';
                        out.push(`  ${mark} <b>${key.padEnd(10)}</b><d>${THEMES[key].name}</d>`);
                    }
                    out.push('', '<d>Usage: theme <name></d>', '');
                    return out;
                }
                const key = args[0].toLowerCase();
                if (!THEMES[key]) return [`<r>theme: no such tube: ${args[0]}</r>`, '<d>Run `theme` to list them.</d>'];
                app.setTheme(key);
                return [`<d>Warming up ${THEMES[key].name}...</d>`];
            },
        },

        ...(SITE.settingsPanel !== false ? {
            crt: {
                help: 'open the effects panel',
                run: () => { app.toggleSettings(true); return ['<d>Effects panel open. Esc to close.</d>']; },
            },
        } : {}),

        ...(BLOG.length ? {
            blog: {
                help: 'read the blog',
                complete: () => BLOG.map((p) => p.title),
                run: (args) => {
                    let start = 0;
                    if (args[0]) {
                        start = BLOG.findIndex((p) => p.title === args[0]);
                        if (start < 0) return [`<r>blog: no such post: ${args[0]}</r>`, '<d>Run `blog` to browse them.</d>'];
                    }
                    // naming a post goes straight to reading it; otherwise start in the post list
                    term.openPager(new Pager(term, BLOG, { start, sidebar: !args[0] }));
                    return [];
                },
            },
        } : {}),

        pwd: { help: 'print working directory', run: () => [term.cwd] },

        ls: {
            help: 'list directory',
            complete: () => dirEntries(term.cwd),
            run: (args) => {
                const path = resolvePath(term.cwd, args[0] || '.');
                const node = lookup(path);
                if (!node) return [`<r>ls: ${args[0]}: no such file or directory</r>`];
                if (node.type === 'file') return [args[0]];
                const out = [''];
                for (const e of listing(node)) {
                    out.push(e.isDir ? `  <b>${e.name}/</b>` : `  ${e.name}`);
                }
                out.push('');
                return out;
            },
        },

        cd: {
            help: 'change directory',
            complete: () => dirEntries(term.cwd).filter((n) => n.endsWith('/')),
            run: (args) => {
                const path = resolvePath(term.cwd, args[0] || '/');
                const node = lookup(path);
                if (!node) return [`<r>cd: ${args[0]}: no such file or directory</r>`];
                if (node.type !== 'dir') return [`<r>cd: ${args[0]}: not a directory</r>`];
                term.cwd = path;
                return [];
            },
        },

        cat: {
            help: 'print a file',
            complete: () => dirEntries(term.cwd).filter((n) => !n.endsWith('/')),
            run: (args) => {
                if (!args[0]) return ['<r>cat: missing operand</r>'];
                const path = resolvePath(term.cwd, args[0]);
                const node = lookup(path);
                if (!node) return [`<r>cat: ${args[0]}: no such file or directory</r>`];
                if (node.type === 'dir') return [`<r>cat: ${args[0]}: is a directory</r>`];
                return node.lines;
            },
        },

        tree: {
            help: 'the whole filesystem at once',
            run: () => {
                const out = ['', '<b>/</b>'];
                const walk = (node, prefix) => {
                    const entries = listing(node).filter((e) => !e.name.startsWith('.'));
                    entries.forEach((e, i) => {
                        const last = i === entries.length - 1;
                        const child = node.children[e.name];
                        out.push(`${prefix}${last ? '`-- ' : '|-- '}${e.isDir ? `<b>${e.name}/</b>` : e.name}`);
                        if (e.isDir) walk(child, prefix + (last ? '    ' : '|   '));
                    });
                };
                walk(FS, '');
                out.push('');
                return out;
            },
        },

        echo: { help: 'say it back', run: (args) => [args.join(' ')] },

        date: {
            help: 'current date and time',
            run: () => [new Date().toString()],
        },

        whoami: { help: 'you', run: () => [`<d>${SITE.user}</d>`] },

        uname: {
            help: 'system name',
            run: () => [`${SITE.rom} ${SITE.machine} (webgl2)`],
        },

        neofetch: {
            help: 'system info',
            run: () => {
                const t = THEMES[app.themeKey];
                const info = [
                    [SITE.user, `@${SITE.host}`],
                    null,
                    ['OS', SITE.rom],
                    ['Host', SITE.machine],
                    ['Display', `${app.crt.virtualResolution[0]}x${app.crt.virtualResolution[1]} phosphor`],
                    ['Terminal', `${term.screen.cols}x${term.screen.rows}`],
                    ['Tube', t.name],
                    ['Uptime', `${Math.floor(performance.now() / 1000)}s`],
                ];
                const logo = app.plainAscii() ? CRT_LOGO_ASCII : CRT_LOGO;
                const gutter = 22;
                const out = [''];
                for (let i = 0; i < Math.max(logo.length, info.length); i++) {
                    const art = (logo[i] || '').padEnd(gutter);
                    const row = info[i];
                    let right = '';
                    if (row === null) right = '<d>' + '\u2500'.repeat(17) + '</d>';
                    else if (row) right = `<b>${row[0]}</b>${row[0] === SITE.user ? '' : ' '.repeat(Math.max(1, 10 - row[0].length))}${row[1]}`;
                    out.push(`  <c>${art}</c>${right}`);
                }
                out.push('');
                return out;
            },
        },

        history: {
            help: 'what you have typed',
            run: () => ['', ...term.history.map((h, i) => `  <d>${String(i + 1).padStart(3)}</d>  ${h}`), ''],
        },

        sudo: { help: null, run: () => ['<r>user is not in the sudoers file.</r>', '<d>This incident will be reported.</d>'] },
        exit: { help: null, run: () => ['<d>Please don\'t leave me...</d>'] },
        reboot: { help: null, run: async () => { await app.reboot(); return []; } },
    };

    function dirEntries(cwd) {
        const node = lookup(cwd);
        if (!node || node.type !== 'dir') return [];
        return listing(node).map((e) => (e.isDir ? e.name + '/' : e.name));
    }

    return cmds;
}
