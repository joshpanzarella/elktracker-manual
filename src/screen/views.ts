// The screens, as pure functions: (editor state, playback, frame, theme) ->
// a cell grid. Layout comes from theme.views; nothing here knows a position.

import { CHAIN_ROW_NAME, EditorState, PHRASE_COLS, PHRASE_ROW_LEN, PHRASE_ROW_NAME } from '../engine/editor';
import { FX_NAMES } from '../engine/fx';
import { hex1, hex2, noteName } from '../engine/hex';
import { PlaybackNow } from '../engine/playback';
import { CHANNELS, PHRASE_STEPS, Song, Step, chainOf, phraseOf } from '../engine/song';
import { Theme } from '../theme';
import { CellGrid, mix } from './grid';

export interface ScreenModel {
  state: EditorState;
  frame: number;
  fps: number;
  play: PlaybackNow;
  theme: Theme;
  /** The song as loaded: any edit since shows the unsaved dot. */
  savedSong: Song;
}

const px = (t: Theme, col: number) => t.grid.originX + col * t.grid.cellW;
const py = (t: Theme, row: number) => t.grid.originY + row * t.grid.cellH;

/** Place a sprite centred in a cell. */
function spriteInCell(g: CellGrid, t: Theme, rows: readonly string[], col: number, row: number, color: string, layer: 'under' | 'over' = 'over') {
  const w = rows[0].length;
  const h = rows.length;
  g[layer].push({
    kind: 'sprite', rows, color,
    x: Math.round(px(t, col) + (t.grid.cellW - w) / 2),
    y: Math.round(py(t, row) + (t.grid.cellH - h) / 2),
  });
}

function flashLevel(m: ScreenModel, f0: number): number {
  const age = m.frame - f0;
  return Math.max(0, 1 - age / m.theme.flash.frames);
}

function cursorCell(g: CellGrid, t: Theme, col: number, row: number, w: number) {
  const c = t.colors;
  switch (t.cursor.style) {
    case 'fill':
      g.recolor(col, row, w, c.cursorText, c.cursorBg);
      break;
    case 'box':
      g.over.push({ kind: 'frame', x: px(t, col) - 1, y: py(t, row) - 1, w: w * t.grid.cellW + 2, h: t.grid.cellH + 2, color: c.cursorBg });
      break;
    case 'underline':
      g.over.push({ kind: 'rect', x: px(t, col), y: py(t, row) + t.grid.cellH - 2, w: w * t.grid.cellW, h: 2, color: c.cursorBg });
      break;
  }
}

// ---------------------------------------------------------------- phrase

function stepCells(s: Step): string[] {
  return [
    s.note === null ? '---' : s.note === 'OFF' ? 'OFF' : noteName(s.note),
    s.instr === null ? '--' : hex2(s.instr),
    s.fx[0] ?? '---',
    s.param[0] === null ? '--' : hex2(s.param[0]),
    s.fx[1] ?? '---',
    s.param[1] === null ? '--' : hex2(s.param[1]),
  ];
}

const EMPTY = new Set(['---', '--']);

function phraseView(g: CellGrid, m: ScreenModel) {
  const t = m.theme;
  const c = t.colors;
  const L = t.views.phrase;
  const s = m.state;
  const phrase = phraseOf(s.song, s.phrase);
  const cur = s.phraseCursor;

  g.text(L.title.col, L.title.row, 'PHRASE', c.accent);
  g.text(L.title.col + 7, L.title.row, hex2(s.phrase), c.text);
  g.text(L.nameCol, L.title.row, phrase.name.padEnd(8, ' '), c.text);
  if (cur.row === PHRASE_ROW_NAME) cursorCell(g, t, L.nameCol, L.title.row, 8);

  if (cur.row >= 0 && cur.col === 1) {
    const instr = phraseOf(s.song, s.phrase).steps[cur.row].instr;
    const ins = instr === null ? undefined : s.song.instruments[instr];
    if (ins?.name) g.textRight(L.topRight.col, L.topRight.row, ins.name, c.text);
  }

  g.text(L.len.col, L.len.row, 'LEN', c.dim);
  g.text(L.len.col + 4, L.len.row, hex2(phrase.len), c.text);
  if (cur.row === PHRASE_ROW_LEN) cursorCell(g, t, L.len.col + 4, L.len.row, 2);

  const cols = PHRASE_COLS.map((name) => L.columns[name]);
  if (L.headings.show) {
    PHRASE_COLS.forEach((name, i) => g.text(cols[i].col, L.headings.row, L.headings.labels[name], c.dim));
  }

  const rowStart = L.gutter.col;
  const rowW = L.rowEnd - rowStart + 1;
  const playing = m.play.channels.filter((ch) => ch.row && ch.row.phrase === s.phrase);

  for (let i = 0; i < PHRASE_STEPS; i++) {
    const row = L.firstRow + i;
    if (i % 4 === 0) g.fill(rowStart, row, rowW, 1, c.beatStripe);
    const isPlaying = playing.some((ch) => ch.row!.step === i);
    if (isPlaying && t.playhead.tintRow) g.fill(rowStart, row, rowW, 1, c.playheadBg);
    if (isPlaying && t.playhead.marker) spriteInCell(g, t, t.sprites.marker, rowStart - 1, row, c.playheadMarker);

    g.text(L.gutter.col, row, hex2(i), i < phrase.len ? c.dim : c.faint);
    stepCells(phrase.steps[i]).forEach((text, k) => {
      g.text(cols[k].col, row, text, EMPTY.has(text) ? c.dim : c.text);
    });
  }

  for (const r of m.play.flashes) {
    if (r.phrase !== s.phrase) continue;
    const row = L.firstRow + r.step;
    const k = flashLevel(m, r.f0);
    const under = g.cell(cols[0].col, row)?.bg ?? c.bg;
    if (t.flash.target === 'row') g.fill(rowStart, row, rowW, 1, mix(c.flash, under, k));
    else g.fill(cols[0].col, row, cols[0].w, 1, mix(c.flash, under, k));
    if (k > 0.5) g.recolor(cols[0].col, row, cols[0].w, c.bg);
  }

  if (cur.row >= 0) cursorCell(g, t, cols[cur.col].col, L.firstRow + cur.row, cols[cur.col].w);
}

// ---------------------------------------------------------------- chain

function transposeText(t: Theme, v: number): string {
  if (t.views.chain.transposeFormat === 'signed') return (v > 0 ? '+' : v < 0 ? '-' : ' ') + String(Math.abs(v)).padStart(2, '0');
  return hex2(v & 0xff);
}

function chainView(g: CellGrid, m: ScreenModel) {
  const t = m.theme;
  const c = t.colors;
  const L = t.views.chain;
  const s = m.state;
  const chain = chainOf(s.song, s.chain);
  const cur = s.chainCursor;

  g.text(L.title.col, L.title.row, 'CHAIN', c.accent);
  g.text(L.title.col + 6, L.title.row, hex2(s.chain), c.text);
  g.text(L.nameCol, L.title.row, chain.name.padEnd(8, ' '), c.text);
  if (cur.row === CHAIN_ROW_NAME) cursorCell(g, t, L.nameCol, L.title.row, 8);

  if (cur.row >= 0) {
    const p = chain.slots[cur.row].phrase;
    const label = p === null ? '' : phraseOf(s.song, p).name;
    if (label) g.textRight(L.topRight.col, L.topRight.row, label, c.text);
  }

  const cols = [L.columns.PHRASE, L.columns.TRANSPOSE];
  if (L.headings.show) {
    g.text(cols[0].col, L.headings.row, L.headings.labels.PHRASE, c.dim);
    g.text(cols[1].col, L.headings.row, L.headings.labels.TRANSPOSE, c.dim);
  }
  const rowStart = L.gutter.col;
  const rowW = L.rowEnd - rowStart + 1;
  const playing = m.play.channels.filter((ch) => ch.row && ch.row.chain === s.chain);

  chain.slots.forEach((slot, i) => {
    const row = L.firstRow + i;
    if (i % 4 === 0) g.fill(rowStart, row, rowW, 1, c.beatStripe);
    const isPlaying = playing.some((ch) => ch.row!.slot === i);
    if (isPlaying && t.playhead.tintRow) g.fill(rowStart, row, rowW, 1, c.playheadBg);
    if (isPlaying && t.playhead.marker) spriteInCell(g, t, t.sprites.marker, rowStart - 1, row, c.playheadMarker);
    g.text(L.gutter.col, row, hex1(i), c.dim);
    if (slot.phrase === null) {
      g.text(cols[0].col, row, '--', c.dim);
      g.text(cols[1].col, row, '--', c.dim);
    } else {
      g.text(cols[0].col, row, hex2(slot.phrase), c.text);
      g.text(cols[1].col, row, transposeText(t, slot.transpose), slot.transpose === 0 ? c.dim : c.text);
    }
  });

  for (const r of m.play.flashes) {
    if (r.chain !== s.chain || r.slot === null) continue;
    const row = L.firstRow + r.slot;
    const under = g.cell(cols[0].col, row)?.bg ?? c.bg;
    g.fill(cols[0].col, row, cols[0].w, 1, mix(c.flash, under, flashLevel(m, r.f0) * 0.6));
  }

  if (cur.row >= 0) cursorCell(g, t, cols[cur.col].col, L.firstRow + cur.row, cols[cur.col].w);
}

// ---------------------------------------------------------------- song

function songView(g: CellGrid, m: ScreenModel) {
  const t = m.theme;
  const c = t.colors;
  const L = t.views.song;
  const s = m.state;
  const cur = s.songCursor;

  const name = s.song.project.name;
  g.text(L.title.col, L.title.row, name, c.accent);
  if (s.song !== m.savedSong) spriteInCell(g, t, t.sprites.dot, L.title.col + name.length + 1, L.title.row, c.unsavedDot);
  const hover = s.song.rows[cur.row][cur.col];
  if (typeof hover === 'number') {
    const label = chainOf(s.song, hover).name;
    if (label) g.textRight(L.topRight.col, L.topRight.row, label, c.text);
  }

  const chCol = (ch: number) => L.firstChannelCol + ch * L.channelPitch;
  if (L.headings.show) for (let ch = 0; ch < CHANNELS; ch++) g.text(chCol(ch), L.headings.row, String(ch + 1).padStart(2, ' '), c.dim);

  const rowStart = L.gutter.col;
  const rowW = chCol(CHANNELS - 1) + 2 - rowStart;
  for (let i = 0; i < L.visibleRows; i++) {
    const r = cur.top + i;
    if (r >= s.song.rows.length) break;
    const row = L.firstRow + i;
    if (r % 4 === 0) g.fill(rowStart, row, rowW, 1, c.beatStripe);
    g.text(L.gutter.col, row, hex2(r), c.dim);
    for (let ch = 0; ch < CHANNELS; ch++) {
      const cell = s.song.rows[r][ch];
      const text = cell === null ? '--' : cell === 'END' ? 'EN' : hex2(cell);
      g.text(chCol(ch), row, text, cell === null ? c.dim : c.text);
      const now = m.play.channels[ch].row;
      if (now && now.songRow === r) spriteInCell(g, t, t.sprites.dot, chCol(ch) - 1, row, c.playDot);
    }
  }
  if (cur.row >= cur.top && cur.row < cur.top + L.visibleRows) {
    cursorCell(g, t, chCol(cur.col), L.firstRow + cur.row - cur.top, 2);
  }

  // Live CH / IN / NOTE readout; brightness fades with time since the note.
  const tb = L.table;
  g.text(tb.col, tb.row, tb.labels[0], c.dim);
  g.text(tb.col + 3, tb.row, tb.labels[1], c.dim);
  g.text(tb.col + 6, tb.row, tb.labels[2], c.dim);
  for (let ch = 0; ch < CHANNELS; ch++) {
    const row = tb.row + 1 + ch;
    const last = m.play.channels[ch].lastNote;
    const age = last ? (m.frame - last.f0) / m.fps : Infinity;
    const level = Math.max(0, 1 - age / 1.5);
    const fg = mix(c.text, c.dim, level);
    g.text(tb.col, row, String(ch + 1).padStart(2, ' '), c.dim);
    g.text(tb.col + 3, row, last?.instr != null ? hex2(last.instr) : '--', last ? fg : c.dim);
    g.text(tb.col + 6, row, last && typeof last.note === 'number' ? noteName(last.note) : '---', last ? fg : c.dim);
    if (level > 0) g.fill(tb.col, row, 9, 1, mix(c.playheadBg, c.bg, level));
  }

  // 3 x 3 scope grid (channels 1-8 and master): boxes until audio feeds them.
  const sc = L.scopes;
  for (let i = 0; i < sc.cols * sc.rows; i++) {
    const x = px(t, sc.col + (i % sc.cols) * sc.cellCols);
    const y = py(t, sc.row + Math.floor(i / sc.cols) * sc.cellRows);
    const w = sc.cellCols * t.grid.cellW - 4;
    const h = sc.cellRows * t.grid.cellH - 4;
    g.under.push({ kind: 'rect', x, y, w, h, color: c.scopeBox });
    g.over.push({ kind: 'line', points: [[x + 2, y + h / 2], [x + w - 2, y + h / 2]], color: c.scope });
  }
}

// ---------------------------------------------------------------- others

function placeholderView(g: CellGrid, m: ScreenModel) {
  const t = m.theme;
  const L = t.views.placeholder;
  g.text(L.title.col, L.title.row, m.state.view, t.colors.accent);
  g.text(L.message.col, L.message.row, 'NOT BUILT YET', t.colors.dim);
}

// ---------------------------------------------------------------- status bar

function hintText(m: ScreenModel): string {
  const s = m.state;
  if (s.view === 'PHRASE' && s.phraseCursor.row >= 0) {
    const col = s.phraseCursor.col;
    if (col === 2 || col === 4) {
      const cmd = phraseOf(s.song, s.phrase).steps[s.phraseCursor.row].fx[col === 2 ? 0 : 1];
      if (cmd) return FX_NAMES[cmd];
    }
  }
  return '';
}

function statusBar(g: CellGrid, m: ScreenModel) {
  const t = m.theme;
  const c = t.colors;
  const S = t.statusBar;
  g.fill(0, S.row, t.grid.cols, 1, c.statusBg);
  g.text(S.screenName, S.row, m.state.view, c.statusText);
  g.text(S.bpm, S.row, String(Math.round(m.play.bpm)).padStart(3, ' '), c.statusText);
  spriteInCell(g, t, m.play.playing ? t.sprites.play : t.sprites.stop, S.transport, S.row, m.play.playing ? c.accent : c.statusText);
  if (m.play.playing) {
    if (m.play.mode === 'CHAIN') g.text(S.transport + 1, S.row, 'C', c.accent);
    if (m.play.mode === 'PHRASE') g.text(S.transport + 1, S.row, 'P', c.accent);
    if (m.play.mode === 'ROW') spriteInCell(g, t, t.sprites.loop, S.transport + 1, S.row, c.accent);
  }
  g.text(S.hint, S.row, hintText(m).slice(0, S.hintWidth), c.statusText);
  spriteInCell(g, t, t.sprites.battery, S.battery, S.row, c.statusText);

  const msg = m.state.message;
  if (msg && m.frame - msg.frame < S.toastSeconds * m.fps) {
    const text = ` ${msg.text} `;
    g.text(S.toastRight - text.length + 1, S.toastRow, text, c.toastText, c.toastBg);
  }
}

export function renderScreen(m: ScreenModel): CellGrid {
  const g = new CellGrid(m.theme.grid.cols, m.theme.grid.rows);
  switch (m.state.view) {
    case 'PHRASE': phraseView(g, m); break;
    case 'CHAIN': chainView(g, m); break;
    case 'SONG': songView(g, m); break;
    default: placeholderView(g, m);
  }
  statusBar(g, m);
  return g;
}
