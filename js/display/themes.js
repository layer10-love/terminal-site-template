export const RASTER = {
    none: 0,
    scanlines: 1,
    pixels: 2,
    subpixels: 3,
    modern: 4,
};

export const FONTS = {
    vga: { family: 'PxPlus IBM VGA8', cell: [8, 16], lineGap: 0 },
    vga16: { family: 'PxPlus IBM VGA 8x16', cell: [8, 16], lineGap: 0 },
    c64: { family: 'PetMe64', cell: [8, 8], lineGap: 0.25 },
    apple2: { family: 'PrintChar21', cell: [7, 8], lineGap: 0.25 },
    atari: { family: 'AtariClassic', cell: [8, 8], lineGap: 0.25 },
};

const profile = (name, overrides) => ({
    name,
    font: 'vga',
    backgroundColor: '#000000',
    fontColor: '#ff8100',
    bloom: 0.45,
    brightness: 0.5,
    burnIn: 0.25,
    chromaColor: 0.2,
    contrast: 0.93,
    flickering: 0.1,
    glowingLine: 0.12,
    horizontalSync: 0.08,
    jitter: 0.18,
    rasterization: RASTER.scanlines,
    rgbShift: 0,
    saturationColor: 0.2,
    screenCurvature: 0.2,
    staticNoise: 0.04,
    frameSize: 0,
    sizeScale: 1,
    ...overrides,
});

export const THEMES = {
    amber: profile('Default Amber', {
        fontColor: '#ff8100',
        font: 'vga',
        screenCurvature: 0.25,
    }),

    green: profile('Monochrome Green', {
        fontColor: '#0ccc68',
        chromaColor: 0.0,
        saturationColor: 0.0,
        bloom: 0.4,
        screenCurvature: 0.3,
    }),

    dos: profile('IBM VGA', {
        fontColor: '#c0c0c0',
        chromaColor: 1.0,
        saturationColor: 0,
        contrast: 1.0,
        brightness: 0.62,
        bloom: 0.22,
        burnIn: 0.1,
        glowingLine: 0.1,
        horizontalSync: 0.0,
        jitter: 0.0,
        staticNoise: 0.02,
        rgbShift: 0.1,
        screenCurvature: 0.3,
    }),

    c64: profile('Commodore 64', {
        backgroundColor: '#35357f',
        fontColor: '#a9a7ff',
        font: 'c64',
        bloom: 0.4,
        brightness: 0.6,
        burnIn: 0.1,
        chromaColor: 0.0,
        contrast: 0.88,
        glowingLine: 0.1,
        horizontalSync: 0.0,
        jitter: 0.0,
        saturationColor: 0,
        screenCurvature: 0.5,
        staticNoise: 0.1,
    }),

    apple2: profile('Apple ][', {
        backgroundColor: '#001100',
        fontColor: '#4dff6b',
        font: 'apple2',
        bloom: 0.3,
        chromaColor: 0,
        flickering: 0.18,
        glowingLine: 0.28,
        horizontalSync: 0.18,
        saturationColor: 0,
        screenCurvature: 0.5,
        staticNoise: 0.07,
    }),

    pet: profile('Commodore PET', {
        fontColor: '#ffffff',
        font: 'c64',
        bloom: 0.4,
        burnIn: 0.4,
        chromaColor: 0,
        flickering: 0.2,
        glowingLine: 0.3,
        horizontalSync: 0.2,
        jitter: 0.15,
        saturationColor: 0,
        screenCurvature: 0.7,
        staticNoise: 0.08,
    }),

    deepblue: profile('Deep Blue', {
        fontColor: '#7fb4ff',
        bloom: 0.6,
        chromaColor: 1.0,
        screenCurvature: 0.4,
    }),

    neon: profile('Neon Cyan', {
        backgroundColor: '#001018',
        fontColor: '#52f7ff',
        bloom: 0.6,
        brightness: 0.6,
        burnIn: 0.1,
        chromaColor: 1,
        contrast: 0.95,
        screenCurvature: 0.3,
    }),

    flat: profile('Flat (no CRT)', {
        fontColor: '#3cff7a',
        bloom: 0.15,
        burnIn: 0,
        chromaColor: 1,
        flickering: 0,
        glowingLine: 0,
        horizontalSync: 0,
        jitter: 0,
        rasterization: RASTER.modern,
        saturationColor: 0,
        screenCurvature: 0,
        staticNoise: 0,
        frameSize: 0,
    }),
};

export const THEME_ORDER = ['amber', 'green', 'dos', 'c64', 'apple2', 'pet', 'deepblue', 'neon', 'flat'];

export const PALETTE = [
    '#555555', // 0 black
    '#5a7dff', // 1 blue
    '#3cd76b', // 2 green
    '#3cd7d7', // 3 cyan
    '#ff5555', // 4 red
    '#c86bff', // 5 magenta
    '#d7a53c', // 6 brown/yellow-dark
    '#c0c0c0', // 7 light grey
    '#7a7a7a', // 8 dark grey
    '#8fa8ff', // 9 bright blue
    '#6bff8f', // 10 bright green
    '#6bffff', // 11 bright cyan
    '#ff8f8f', // 12 bright red
    '#e59bff', // 13 bright magenta
    '#ffe66b', // 14 bright yellow
    '#ffffff', // 15 white
];

export const COLOR = {
    dim: 8, normal: 7, bright: 15,
    blue: 9, green: 10, cyan: 11, red: 12, magenta: 13, yellow: 14,
    darkblue: 1, darkgreen: 2, darkcyan: 3, darkred: 4, darkmagenta: 5, brown: 6, black: 0,
};
