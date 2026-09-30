// Everything visual lives here. Components read it; none of them hardcode a
// position, size, colour or font. Tweak by eye against the device and the
// whole manual follows.
//
// Units: the device screen is 640 x 480 px. Text sits on a character grid
// (cells); some parts of the real UI sit at pixel positions off that grid,
// and those are named `x` / `y` / `px`. Stage positions (captions, callouts,
// HUD) are in 1920 x 1080 video px.
//
// MEASURED from a photo of the Song screen on an RG40XXV (perspective-
// corrected to 640 x 480, docs/reference.md): the grid, the font, the Song
// screen, the status bar, the cursor and every colour. Phone cameras crush
// dark blues and clip bright yellows, so colours are the photo's hues with
// the brightness corrected by eye: compare them with the device.
// GUESSED (no photo yet): the Phrase and Chain screens.

export const theme = {
  screen: {
    width: 640,
    height: 480,
    /** Integer scale of the screen inside the 1920 x 1080 stage. */
    scale: 2,
  },

  /** 52 x 20 cells of 12 x 24 px, starting 8 px in and 4 px down (measured). */
  grid: {
    cols: 52,
    rows: 20,
    cellW: 12,
    cellH: 24,
    /** px offset of cell (0,0) from the screen's top-left. */
    originX: 8,
    originY: 4,
  },

  font: {
    /** 'bitmap' = the device's 5x7 font (src/font/elk5x7.ts); 'ttf' = VT323. */
    kind: 'bitmap' as 'bitmap' | 'ttf',
    bitmap: {
      /** Device px per font pixel. */
      scale: 2,
      /** px from the cell's top-left to the glyph's top-left (measured: 0, 4). */
      offsetX: 0,
      offsetY: 4,
    },
    // The placeholder: VT323 draws one design pixel per px at 25 px (10 x 14).
    family: 'VT323',
    file: 'fonts/VT323-Regular.ttf',
    sizePx: 25,
    scaleX: 1,
    offsetX: 1,
    baseline: 18,
    binarize: true,
    binarizeThreshold: 96,
  },

  colors: {
    bg: '#050e36', // photo: #020b30
    text: '#f2f6ff', // values (chain numbers, notes)
    dim: '#8fa3ec', // labels, row numbers, empty cells
    faint: '#34458f', // steps beyond LEN
    accent: '#ffdc5e', // title, status bar text, cursor (camera-clipped)
    line: '#4b6cf7', // divider, scope boxes, separator
    band: '#0e2468', // beat stripes and the status bar (photo: #0b2060)
    cursor: '#ffdc5e',
    playheadBg: '#1a3a9a', // guessed: not seen playing yet
    playheadMarker: '#ffdc5e',
    flash: '#c8d4ff', // guessed
    statusText: '#ffdc5e',
    toastBg: '#ffdc5e',
    toastText: '#050e36',
    scope: '#8fd0ff', // guessed: waveform line
    playDot: '#ffdc5e', // guessed
    unsavedDot: '#ffdc5e', // guessed
    batteryFill: '#c7ecfe',
    batteryFill2: '#9ccff0',
    batteryEmpty: '#050e36',
  },

  /** Pixel icons, 1 char = 1 device px. '#' draws in the colour given; other
   *  letters use the named colour (o = line, f/g = batteryFill/2, e = batteryEmpty). */
  sprites: {
    // Measured: a filled 10 x 10 square.
    stop: ['##########', '##########', '##########', '##########', '##########', '##########', '##########', '##########', '##########', '##########'],
    play: ['##........', '####......', '######....', '########..', '##########', '##########', '########..', '######....', '####......', '##........'],
    loop: ['..######..', '.#......#.', '#........#', '#.........', '#.........', '#......###', '#.......#.', '.#......#.', '..######..', '..........'],
    dot: ['####', '####', '####', '####'],
    marker: ['#....', '###..', '#####', '###..', '#....'],
    // Measured: 24 x 14 body, 2 px outline, striped fill, a dark empty slot,
    // and a 4 x 6 nub. o = line, f/g = the two fill shades, e = empty.
    battery: [
      'oooooooooooooooooooooooo....',
      'oooooooooooooooooooooooo....',
      'oofgfgfgfgfgfgfgfgoeeeoo....',
      'oofgfgfgfgfgfgfgfgoeeeoo....',
      'oofgfgfgfgfgfgfgfgoeeeoooooo',
      'oofgfgfgfgfgfgfgfgoeeeoooooo',
      'oofgfgfgfgfgfgfgfgoeeeoooooo',
      'oofgfgfgfgfgfgfgfgoeeeoooooo',
      'oofgfgfgfgfgfgfgfgoeeeoooooo',
      'oofgfgfgfgfgfgfgfgoeeeoooooo',
      'oofgfgfgfgfgfgfgfgoeeeoo....',
      'oofgfgfgfgfgfgfgfgoeeeoo....',
      'oooooooooooooooooooooooo....',
      'oooooooooooooooooooooooo....',
    ],
  },

  cursor: {
    /** 'box' outlines the field (measured); 'fill' paints it; 'underline' draws a bar. */
    style: 'box' as 'fill' | 'box' | 'underline',
    thickness: 2,
    /** px beyond the text on each side, and px in from the row's top/bottom. */
    padX: 4,
    insetY: 2,
  },

  playhead: {
    /** Tint the playing row across its columns (guessed). */
    tintRow: true,
    /** Draw the marker sprite left of the row number (guessed). */
    marker: true,
  },

  flash: {
    /** Video frames a triggered note stays lit, fading out. */
    frames: 8,
    /** 'cell' lights the note cell; 'row' lights the whole row. */
    target: 'cell' as 'cell' | 'row',
  },

  /** Every 4th row. Measured on the Song screen: from the screen edge to the divider. */
  stripe: { x0: 0, x1: 330 },

  /** The bottom bar, in px (measured on the Song screen). */
  statusBar: {
    bandY: 458,
    bandH: 22,
    /** Top of the glyphs. */
    textY: 460,
    screenName: { x: 8 },
    bpm: { x: 92, label: 'BPM:' },
    /** Transport icon: this many px after the BPM text, 10 px square, at y. */
    transport: { gap: 8, y: 462 },
    /** Context hint (not on the Song screen, position guessed). */
    hint: { x: 224, maxChars: 30 },
    battery: { x: 602, y: 462 },
    /** Toast box, right-aligned above the bar (guessed). */
    toast: { right: 632, y: 430 },
    /** Seconds a toast stays ("clear themselves after about 3 seconds"). */
    toastSeconds: 3,
  },

  views: {
    song: {
      // All measured.
      title: { col: 0, row: 0 }, // project name
      topRight: { col: 51, row: 0 }, // chain label under the cursor, right-aligned (guessed)
      headings: { row: 1, show: true, prefix: 'C' }, // C1..C8
      firstRow: 2,
      visibleRows: 16,
      gutter: { col: 0 }, // song rows 00..7F
      firstChannelCol: 3,
      channelPitch: 3,
      divider: { x: 332, w: 2, y0: 28, y1: 457 },
      /** CH / IN / NOTE, right-aligned in px: header on row 1, channels on rows 2-9. */
      table: { x: [520, 552, 584], headerRow: 1, firstRow: 2, labels: ['CH', 'IN', 'NOTE'] },
      separator: { x0: 332, x1: 640, y: 251, h: 2 },
      scopes: {
        x: 336, y: 255, cols: 3, rows: 3, w: 100, h: 66, gap: 2, border: 2,
        /** The line across each box, px from its top. */
        split: 42,
        /** Label glyph offset from the box's top-left. */
        label: { dx: 4, dy: 4 },
        labels: ['1', '2', '3', '4', '5', '6', '7', '8', 'M'],
      },
    },
    phrase: {
      // Guessed, in the Song screen's style.
      title: { col: 0, row: 0 }, // "PHRASE 00" then the name
      nameCol: 10,
      topRight: { col: 51, row: 0 }, // instrument name, right-aligned
      len: { col: 26, row: 1 }, // "LEN 10"
      headings: { row: 1, show: true, labels: { NOT: 'NOT', IN: 'IN', FX1: 'FX1', P1: 'P1', FX2: 'FX2', P2: 'P2' } },
      firstRow: 2,
      gutter: { col: 0 }, // steps 00..0F
      columns: {
        NOT: { col: 3, w: 3 },
        IN: { col: 7, w: 2 },
        FX1: { col: 10, w: 3 },
        P1: { col: 14, w: 2 },
        FX2: { col: 17, w: 3 },
        P2: { col: 21, w: 2 },
      },
    },
    chain: {
      // Guessed, in the Song screen's style.
      title: { col: 0, row: 0 },
      nameCol: 9,
      topRight: { col: 51, row: 0 }, // phrase label under the cursor
      headings: { row: 1, show: true, labels: { PHRASE: 'PH', TRANSPOSE: 'TR' } },
      firstRow: 2,
      gutter: { col: 0 }, // slots 0..F
      columns: {
        PHRASE: { col: 3, w: 2 },
        TRANSPOSE: { col: 6, w: 2 },
      },
      /** 'hex' shows a signed byte (F4 = -12); 'signed' shows -12. */
      transposeFormat: 'hex' as 'hex' | 'signed',
    },
    placeholder: {
      title: { col: 0, row: 0 },
      message: { col: 0, row: 2 },
    },
  },

  stage: {
    width: 1920,
    height: 1080,
    background: '#0b0c12',
    /** Top-left of the screen (at its integer scale) on the stage. */
    screenX: 48,
    screenY: 60,
    bezel: { width: 10, radius: 14, color: '#050507', shadow: '0 18px 60px rgba(0,0,0,0.55)' },
    /** The margin column to the right of the screen. */
    panel: { x: 1384, y: 60, w: 488, h: 960 },
    chapter: { y: 0, size: 22, color: '#8a8fa8', letterSpacing: 4 },
    caption: {
      y: 70,
      titleSize: 24,
      titleColor: '#ffdc5e',
      textSize: 42,
      lineHeight: 1.22,
      textColor: '#eef0f8',
      fadeFrames: 10,
      slidePx: 14,
    },
    callout: {
      color: '#ffdc5e',
      lineWidth: 3,
      padPx: 6, // around the target, in stage px
      /** Labels stay below this (px from the panel top) to clear the caption. */
      zoneTop: 400,
      labelSize: 30,
      textSize: 24,
      labelColor: '#050e36',
      textColor: '#eef0f8',
      drawFrames: 12,
      fadeFrames: 8,
    },
    hud: {
      y: 840,
      keySize: 30,
      keyColor: '#eef0f8',
      keyBg: '#1a1f36',
      keyBorder: '#3f4a78',
      activeBg: '#ffdc5e',
      activeText: '#050e36',
      holdFrames: 18,
      fadeFrames: 10,
    },
    camera: {
      /** Stage px left around a focused region. */
      padPx: 60,
      maxZoom: 4,
    },
    uiFont: { family: 'SUSE', file: 'fonts/SUSE-Variable.ttf' },
    monoFont: { family: 'SUSE Mono', file: 'fonts/SUSEMono-Variable.ttf' },
  },
};

export type Theme = typeof theme;
