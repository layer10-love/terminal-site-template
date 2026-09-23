/*  Markup available in any line:
 *    <b>bright</b>  <d>dim</d>  <inv>inverse</inv>
 *    <g>green</g> <y>yellow</y> <c>cyan</c> <r>red</r> <m>magenta</m> <u>blue</u>
 *    <a href="https://example.com">clickable link</a> */

export const SITE = {
    owner: 'Your Name',
    user: 'user',
    banner: 'user',
    host: 'computer',
    tagline: 'one line about what you do',
    machine: 'uname',
    rom: 'loonix',
    year: 1987,

    // Set to false to disable the `crt` command (the effects-sliders panel) in production deployments.
    settingsPanel: true,
};

/* boot sequence
 * `p` is a pause in ms after the line. I found that keeping it under 2.5s is best aesthetics wise.
 * visitors can skip it with any key */
export const BOOT = [
    { t: `<d>${SITE.rom}  (C) ${SITE.year} ${SITE.owner.toUpperCase()}</d>`, p: 140 },
    { t: '<d>All rights reserved.</d>', p: 260 },
    { t: '', p: 0 },
    { t: 'Testing extended memory...', p: 90 },
    { t: '<memcount>', p: 340 },
    { t: '', p: 0 },
    { t: 'Detecting devices...', p: 160 },
    { t: '[  <g>OK</g>  ]  hda: <b>TM-A13SU</b>, 13in color CRT', p: 110 },
    { t: '[  <g>OK</g>  ]  kbd: 101-key, buckling spring', p: 110 },
    { t: '[  <g>OK</g>  ]  net: carrier detected', p: 220 },
    { t: '', p: 0 },
    { t: '<d>Starting shell...</d>', p: 320 },
    { t: '', p: 0 },
];

export const CRT_LOGO = [
    '┌───────────────────┐',
    '│    ▄███▄ ▄███▄    │',
    '│   ▐███████████▌   │',
    '│    ▀█████████▀    │',
    '│      ▀█████▀      │',
    '│        ▀█▀        │',
    '└───────────────────┘',
];

// Fonts without CP437 line-drawing (Apple 2, Atari) get a plain-ASCII tube.
export const CRT_LOGO_ASCII = [
    '+------------------+ ',
    '|   ,d88b.d88b,    | ',
    '|   88888888888    | ',
    '|   `Y8888888Y\'    | ',
    '|     `Y888Y\'      | ',
    '|       `Y\'        | ',
    '+--------+---------+ ',
];

// what visitors see first
export const GREETING = [
    '<d>Type <b><cmd>help</cmd></b> for a list of commands, or <b><cmd>about</cmd></b> to start.</d>',
    '<d>Try <b><cmd>theme</cmd></b> to change the tube.</d>',
    '',
];

const file = (lines) => ({ type: 'file', lines });
const dir = (children) => ({ type: 'dir', children });

/* Each of these 'pages' is both a file in the virtual filesystem and a command:
 * `about` and `cat about.txt` print the same thing */

const ABOUT = [
    '',
    '<y>ABOUT</y>',
    '<d><hr></d>',
    '',
    'Lorem ipsum dolor sit amet, consetetur sadipscing elitr,',
    'sed diam nonumy eirmod tempor invidunt ut labore',
    '',
    'et dolore magna aliquyam erat, sed diam voluptua.',
    'At vero eos et accusam et justo duo dolores et ea rebum.',
    '',
];

const PROJECTS = [
    '',
    '<y>PROJECTS</y>',
    '<d><hr></d>',
    '',
    '<b>PROJECT ONE</b> <d>· 2025</d>',
    '  Lorem ipsum dolor sit amet.',
    '  <c><a href="https://example.com">example.com</a></c>',
    '',
    '<b>PROJECT TWO</b> <d>· 2024</d>',
    '  Lorem ipsum dolor sit amet.',
    '  <c><a href="https://example.com">example.com</a></c>',
    '',
    '<b>PROJECT THREE</b> <d>· 2023</d>',
    '  Lorem ipsum dolor sit amet.',
    '',
    '<d>`cat projects/<name>.txt` for the long version.</d>',
    '',
];

const SKILLS = [
    '',
    '<y>STACK</y>',
    '<d><hr></d>',
    '',
    '  <g>Daily</g>          TODO, TODO, TODO',
    '  <g>Comfortable</g>    TODO, TODO',
    '  <g>Curious about</g>  TODO',
    '',
];

const CONTACT = [
    '',
    '<y>CONTACT</y>',
    '<d><hr></d>',
    '',
    '  <g>mail</g>    <c><a href="mailto:you@example.com">you@example.com</a></c>',
    '  <g>github</g>  <c><a href="https://github.com/">github.com/you</a></c>',
    '  <g>else</g>    TODO',
    '',
    '<d>Links are clickable. Yes, through the curvature.</d>',
    '',
];

const COLOPHON = [
    '',
    '<y>COLOPHON</y>',
    '<d><hr></d>',
    '',
    'The shader maths is ported from <b>cool-retro-term</b> (GPLv3) by Filippo',
    'Scognamiglio to a WebGL2 pipeline.',
    '<c><a href="https://github.com/Swordfish90/cool-retro-term">github.com/Swordfish90/cool-retro-term</a></c>',
    '',
    'Typefaces:',
    '  <b>PxPlus IBM VGA8</b>  The Ultimate Oldschool PC Font Pack (CC BY-SA 4.0)',
    '  <b>PetMe64</b>          Commodore 64 character ROM',
    '  <b>PrintChar21</b>      Apple ][ character ROM',
    '',
    'Website:',
    'The source code for this website is available at:',
    '<c><a href="https://github.com/layer10-love/terminal-site-template">github.com/layer10-love/terminal-site-template</a></c>',
];

const HELP = [
    '',
    '<y>COMMANDS</y>',
    '<d><hr></d>',
    '',
    '  <b><cmd>about</cmd></b>       who I am',
    '  <b><cmd>projects</cmd></b>    things I have made',
    '  <b><cmd>skills</cmd></b>      what I work in',
    '  <b><cmd>contact</cmd></b>     how to reach me',
    '  <b><cmd>colophon</cmd></b>    licensing and sources',
    '  <b><cmd>blog</cmd></b>        read the blog',
    '',
    '  <b><cmd>theme</cmd></b> [name]  change the theme of the screen. <d>theme</d> alone lists them',
    ...(SITE.settingsPanel !== false ? ['  <b><cmd>crt</cmd></b>         open the effects panel'] : []),
    '  <b><cmd>ls</cmd> / cd / cat / <cmd>pwd</cmd> / <cmd>tree</cmd></b>   poke around the filesystem',
    '  <b><cmd>neofetch</cmd></b>    system info',
    '  <b><cmd>clear</cmd></b>       clear the terminal',
    '',
];

/* --- virtual filesystem ---------------------------------------------- */
export const FS = dir({
    'about.txt': file(ABOUT),
    'projects': dir({
        'README': file([
            '',
            'One file per project. Delete these and write your own.',
            '',
        ]),
        'project-one.txt': file([
            '',
            '<b>PROJECT ONE</b>',
            '<d><hr></d>',
            '',
            'TODO: the long version. What problem, what approach, what',
            'you would do differently.',
            '',
        ]),
        'project-two.txt': file([
            '',
            '<b>PROJECT TWO</b>',
            '<d><hr></d>',
            '',
            'TODO.',
            '',
        ]),
    }),
    'skills.txt': file(SKILLS),
    'contact.txt': file(CONTACT),
    'colophon.txt': file(COLOPHON),
    '.profile': file([
        '',
        '<d># you found it!</d>',
        'export TUBE=amber',
        'export SCANLINES=1',
        '',
    ]),
});

// mirrors the filesystem so the commands work
export const PAGES = {
    about: ABOUT,
    projects: PROJECTS,
    skills: SKILLS,
    contact: CONTACT,
    colophon: COLOPHON,
    help: HELP,
};
