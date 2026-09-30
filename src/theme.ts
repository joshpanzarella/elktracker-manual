// Everything visual lives here. Components read it; none of them hardcode a
// position, size, colour or font. Tweak by eye against the device and the
// whole manual follows.
//
// Units: the device screen is 640 x 480 px, laid out as a character grid.
// Screen positions below are in grid cells (col, row) unless named `px`.
// Stage positions (captions, callouts, HUD) are in 1920 x 1080 video px.
//
// PLACEHOLDERS. The grid (40 x 30 cells of 16 x 16 px) is measured off the
// device mockup on elktracker.io; the manual's credits name a public-domain
// 8x8 bitmap font by Daniel Hepper, which drawn at 2x gives exactly that
// cell. Colours are sampled from the same mockup (a sample-editor screen).
// Every screen layout below is a guess from the manual's descriptions.

export const theme = {
  screen: {
    width: 640,
    height: 480,
    /** Integer scale of the screen inside the 1920 x 1080 stage. */
    scale: 2,
  },

  grid: {
    cols: 40,
    rows: 30,
    cellW: 16,
    cellH: 16,
    /** px offset of cell (0,0) from the screen's top-left. */
    originX: 0,
    originY: 0,
  },

  font: {
    family: 'VT323',
    file: 'fonts/VT323-Regular.ttf',
    /** VT323 draws one design pixel per px at 25 px: glyphs 10 x 14. */
    sizePx: 25,
    /** Horizontal stretch to fill the cell (1 = VT323's own width). */
    scaleX: 1.5,
    /** px from the cell's left edge / top edge to the glyph's origin / baseline. */
    offsetX: 0.5,
    baseline: 15,
    /** Snap anti-aliased edges to hard pixels, like a bitmap font. */
    binarize: true,
    /** Alpha (0-255) at or above which an edge pixel is kept. */
    binarizeThreshold: 96,
  },

  /** Sampled from elktracker.io/mockup.png. The device has five themes
   *  (NIGHT, FOREST, AMBER, ICE, NEON = default): match one by eye here. */
  colors: {
    bg: '#19191f',
    text: '#d0d0d8', // values
    dim: '#5c5c6c', // labels, empty cells (---), dimmed gutter
    faint: '#34343f', // empty cells beyond LEN, grid dots
    accent: '#e0a868', // titles, status messages
    cursorBg: '#424865',
    cursorText: '#f0f0f8',
    beatStripe: '#202029', // every 4th row
    playheadBg: '#2f3346',
    playheadMarker: '#e0a868',
    flash: '#f0d8b0', // note that just triggered
    statusBg: '#19191f',
    statusText: '#5c5c6c',
    toastBg: '#e0a868',
    toastText: '#19191f',
    scope: '#80a890',
    scopeBox: '#24232c',
    playDot: '#e0a868',
    unsavedDot: '#e0a868',
  },

  /** Pixel icons, 1 char = 1 device px ('#' = on). */
  sprites: {
    play: ['#.....', '###...', '#####.', '######', '#####.', '###...', '#.....'],
    stop: ['######', '######', '######', '######', '######', '######'],
    loop: ['.####..', '#....#.', '#......', '#...###', '#....#.', '.####..'],
    dot: ['####', '####', '####', '####'],
    marker: ['#....', '###..', '#####', '###..', '#....'],
    battery: [
      '############..',
      '#..........#..',
      '#.########.###',
      '#.########.###',
      '#.########.###',
      '#..........#..',
      '############..',
    ],
  },

  cursor: {
    /** 'fill' paints the cell; 'box' outlines it; 'underline' draws a bar. */
    style: 'fill' as 'fill' | 'box' | 'underline',
  },

  playhead: {
    /** Tint the playing row across its columns. */
    tintRow: true,
    /** Draw the marker sprite left of the row number. */
    marker: true,
  },

  flash: {
    /** Video frames a triggered note stays lit, fading out. */
    frames: 8,
    /** 'cell' lights the note cell; 'row' lights the whole row. */
    target: 'cell' as 'cell' | 'row',
  },

  statusBar: {
    row: 29,
    /** Columns of each part. */
    screenName: 1,
    bpm: 10,
    transport: 14, // icon position (cell); the isolation label follows it
    hint: 17,
    hintWidth: 18,
    battery: 37,
    /** Toast box: right-aligned to this column, on this row. */
    toastRow: 27,
    toastRight: 39,
    /** Seconds a toast stays ("clear themselves after about 3 seconds"). */
    toastSeconds: 3,
  },

  views: {
    phrase: {
      title: { col: 1, row: 1 }, // "PHRASE 00" then the name
      nameCol: 11, // name field (8 chars), the row above LEN
      topRight: { col: 38, row: 1 }, // instrument name, right-aligned
      len: { col: 1, row: 3 }, // "LEN 10"
      /** Column headings above the steps (the device may not have them). */
      headings: { row: 5, show: true, labels: { NOT: 'NOT', IN: 'IN', FX1: 'FX1', P1: 'P1', FX2: 'FX2', P2: 'P2' } },
      firstRow: 6, // step 00
      gutter: { col: 1 }, // step numbers "00".."0F"
      columns: {
        NOT: { col: 4, w: 3 },
        IN: { col: 8, w: 2 },
        FX1: { col: 11, w: 3 },
        P1: { col: 15, w: 2 },
        FX2: { col: 18, w: 3 },
        P2: { col: 22, w: 2 },
      },
      /** Last column the row tint / stripe covers. */
      rowEnd: 24,
    },
    chain: {
      title: { col: 1, row: 1 },
      nameCol: 10,
      topRight: { col: 38, row: 1 }, // phrase label under the cursor
      headings: { row: 5, show: true, labels: { PHRASE: 'PH', TRANSPOSE: 'TR' } },
      firstRow: 6,
      gutter: { col: 1 }, // slot numbers "0".."F"
      columns: {
        PHRASE: { col: 4, w: 2 },
        TRANSPOSE: { col: 7, w: 2 },
      },
      /** 'hex' shows a signed byte (F4 = -12); 'signed' shows -12. */
      transposeFormat: 'hex' as 'hex' | 'signed',
      rowEnd: 9,
    },
    song: {
      title: { col: 1, row: 1 }, // project name, unsaved dot after it
      topRight: { col: 38, row: 1 }, // chain label under the cursor
      headings: { row: 3, show: true }, // channel numbers 1..8
      firstRow: 4,
      visibleRows: 16,
      gutter: { col: 1 }, // song row numbers "00".."7F"
      firstChannelCol: 5,
      channelPitch: 3, // cells from one channel column to the next
      rowEnd: 27,
      table: { col: 29, row: 3, labels: ['CH', 'IN', 'NOTE'] }, // live readout, one row per channel
      scopes: { col: 29, row: 13, cols: 3, rows: 3, cellCols: 3, cellRows: 4 }, // 3x3 grid
    },
    placeholder: {
      title: { col: 1, row: 1 },
      message: { col: 1, row: 4 },
    },
  },

  stage: {
    width: 1920,
    height: 1080,
    background: '#0c0c10',
    /** Top-left of the screen (at its integer scale) on the stage. */
    screenX: 48,
    screenY: 60,
    bezel: { width: 10, radius: 14, color: '#050507', shadow: '0 18px 60px rgba(0,0,0,0.55)' },
    /** The margin column to the right of the screen. */
    panel: { x: 1384, y: 60, w: 488, h: 960 },
    chapter: { y: 0, size: 22, color: '#8a8a99', letterSpacing: 4 },
    caption: {
      y: 70,
      titleSize: 24,
      titleColor: '#e0a868',
      textSize: 42,
      lineHeight: 1.22,
      textColor: '#ecebf2',
      fadeFrames: 10,
      slidePx: 14,
    },
    callout: {
      color: '#e0a868',
      lineWidth: 3,
      padPx: 6, // around the target, in stage px
      labelSize: 30,
      textSize: 22,
      labelColor: '#19191f',
      textColor: '#ecebf2',
      drawFrames: 12,
      fadeFrames: 8,
    },
    hud: {
      y: 840,
      keySize: 30,
      keyColor: '#ecebf2',
      keyBg: '#26262f',
      keyBorder: '#4a4a58',
      activeBg: '#e0a868',
      activeText: '#19191f',
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
