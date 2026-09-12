# Terminal Site Template

The content-less template for my personal website, available at [layer10.love](https://layer10.love).
The pre-rendered text is drawn into a buffer and rendered in a multi-stage WebGL2 pipeline.

## Usage

To run the site locally:

```bash
python3 -m http.server 8000 # then visit http://localhost:8000
```

Or deploy it however you want, I'm not your mother.

append `?fast` to the URL to skip the boot sequence while you are editing the site.

Edit the following files to your liking:

- `js/content.js`: your name, the boot messages, the pages, and the virtual filesystem that `ls` / `cat` walk around
- `index.html` - the `<title>`, the description meta, and the `<noscript>` block (which is what search engines and visitors with NoScript read)
- `js/themes.js` - if you want to change which theme is the default, or add/remove stuff from the list

You can use the following markup in any line:

```
<b>bright</b>  <d>dim</d>  <inv>inverse</inv>
<y>yellow</y> <g>green</g> <c>cyan</c> <r>red</r> <m>magenta</m> <u>blue</u>
<a href="https://example.com">a clickable link</a>
```

Colors only appear on the chroma profiles (default themes: `dos`, `neon`, `deepblue`, `flat`).
In monochrome themes, colors are displayed as a series of brightness steps instead.

## How it works:

| File             |                                                            |
| ---------------- | ---------------------------------------------------------- |
| `js/shaders.js`  | the GLSL, ported from cool-retro-term                      |
| `js/crt.js`      | the render pipeline and the profile → uniform derivations  |
| `js/gl.js`       | small WebGL2 helpers (programs, render targets, ping-pong) |
| `js/screen.js`   | the text grid                                              |
| `js/text.js`     | markup parsing and line wrapping                           |
| `js/terminal.js` | everything pertaining to the 'shell'                       |
| `js/commands.js` | what each command does                                     |
| `js/themes.js`   | display profiles and the cell palette                      |

The page renders above CSS resolution on purpose.
The scanline mask fades itself out below 2x sampling to avoid moiré,
so under-sampling would silently remove the effect entirely.

## Accessibility

Terminal output is mirrored into an `aria-live` region and the canvas is `aria-hidden`.
the keyboard input is a real `<input>`, so IME, paste and mobile keyboards work.
Users who have `prefers-reduced-motion` on do not see flicker, jitter, static, the sweep line or the boot animation.
The `flat` theme turns the 'glass' effect off entirely.
Visitors without WebGL2 or JS will see plain text.

## Credits and Licensing

**The shaders are a port of [cool-retro-term](https://github.com/Swordfish90/cool-retro-term)
by Filippo Scognamiglio, which is GPLv3.** `js/shaders.js` and the derivations in
`js/crt.js` are derivative work, so this project is licensed **GPLv3** as a
whole (see `LICENSE`).

Fonts, all bundled under `assets/fonts` with their licenses:

- **PxPlus IBM VGA8 / VGA 8x16** - [The Ultimate Oldschool PC Font Pack](https://int10h.org/oldschool-pc-fonts/),
  CC BY-SA 4.0. Attribution required, share-alike.
- **PetMe64** - Commodore 64 character ROM, free license (see `PetMe-License.txt`).
- **PrintChar21** - Apple 2 character ROM, free license (see `Apple2-License.txt`).
- **AtariClassic** - Atari 400/800 character ROM.
