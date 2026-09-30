// The screens, as pure functions: (editor state, playback, frame, theme) ->
// a cell grid plus pixel primitives. Layout comes from theme.ts; nothing here
// knows a position.

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

const colX = (t: Theme, col: number) => t.grid.originX + col * t.grid.cellW;
const rowY = (t: Theme, row: number) => t.grid.originY + row * t.grid.cellH;

/** Place a sprite centred in a cell (or in the given px box). */
function spriteAt(g: CellGrid, rows: readonly string[], x: number, y: number, color: string, palette?: Record<string, string>) {
  g.over.push({ kind: 'sprite', rows, x: Math.round(x), y: Math.round(y), color, palette });
}

function spriteInCell(g: CellGrid, t: Theme, rows: readonly string[], col: number, row: number, color: string) {
  spriteAt(g, rows, colX(t, col) + (t.grid.cellW - rows[0].length) / 2, rowY(t, row) + (t.grid.cellH - rows.length) / 2, color);
}

function flashLevel(m: ScreenModel, f0: number): number {
  return Math.max(0, 1 - (m.frame - f0) / m.theme.flash.frames);
}

/** The cursor around `w` characters starting at (col, row). */
function cursorAt(g: CellGrid, t: Theme, col: number, row: number, w: number) {
  const C = t.cursor;
  const x = colX(t, col);
  const y = rowY(t, row);
  switch (C.style) {
    case 'box':
      g.over.push({
        kind: 'frame', color: t.colors.cursor, t: C.thickness,
        x: x - C.padX, y: y + C.insetY, w: w * t.grid.cellW + 2 * C.padX, h: t.grid.cellH - 2 * C.insetY,
      });
      break;
    case 'fill':
      g.under.push({ kind: 'rect', color: t.colors.cursor, x: x - C.padX, y: y + C.insetY, w: w * t.grid.cellW + 2 * C.padX, h: t.grid.cellH - 2 * C.insetY });
      g.recolor(col, row, w, t.colors.bg);
      break;
    case 'underline':
      g.over.push({ kind: 'rect', color: t.colors.cursor, x, y: y + t.grid.cellH - C.insetY - C.thickness, w: w * t.grid.cellW, h: C.thickness });
      break;
  }
}

/** Beat stripe: a band behind the whole row, every 4th row. */
function stripe(g: CellGrid, t: Theme, row: number) {
  g.under.push({ kind: 'rect', color: t.colors.band, x: t.stripe.x0, y: rowY(t, row), w: t.stripe.x1 - t.stripe.x0, h: t.grid.cellH });
}

/** The playing row: a band like the beat stripe (guessed), plus a marker. */
function playheadRow(g: CellGrid, t: Theme, row: number) {
  if (t.playhead.tintRow) {
    g.under.push({ kind: 'rect', color: t.colors.playheadBg, x: t.stripe.x0, y: rowY(t, row), w: t.stripe.x1 - t.stripe.x0, h: t.grid.cellH });
  }
  if (t.playhead.marker) {
    const m = t.sprites.marker;
    spriteAt(g, m, (t.grid.originX - m[0].length) / 2, rowY(t, row) + (t.grid.cellH - m.length) / 2, t.colors.playheadMarker);
  }
}

function noteFlash(g: CellGrid, m: ScreenModel, col: number, row: number, w: number, f0: number) {
  const t = m.theme;
  const k = flashLevel(m, f0);
  if (k <= 0) return;
  g.under.push({ kind: 'rect', color: mix(t.colors.flash, t.colors.bg, k), x: colX(t, col) - 2, y: rowY(t, row) + 2, w: w * t.grid.cellW + 2, h: t.grid.cellH - 4 });
  if (k > 0.5) g.recolor(col, row, w, t.colors.bg);
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
  g.text(L.title.col + 7, L.title.row, hex2(s.phrase), c.accent);
  g.text(L.nameCol, L.title.row, phrase.name.padEnd(8, ' '), c.text);
  if (cur.row === PHRASE_ROW_NAME) cursorAt(g, t, L.nameCol, L.title.row, 8);

  if (cur.row >= 0 && cur.col === 1) {
    const instr = phrase.steps[cur.row].instr;
    const ins = instr === null ? undefined : s.song.instruments[instr];
    if (ins?.name) g.textRight(L.topRight.col, L.topRight.row, ins.name, c.text);
  }

  g.text(L.len.col, L.len.row, 'LEN', c.dim);
  g.text(L.len.col + 4, L.len.row, hex2(phrase.len), c.text);
  if (cur.row === PHRASE_ROW_LEN) cursorAt(g, t, L.len.col + 4, L.len.row, 2);

  const cols = PHRASE_COLS.map((name) => L.columns[name]);
  if (L.headings.show) PHRASE_COLS.forEach((name, i) => g.text(cols[i].col, L.headings.row, L.headings.labels[name], c.dim));

  const playing = m.play.channels.filter((ch) => ch.row && ch.row.phrase === s.phrase);
  for (let i = 0; i < PHRASE_STEPS; i++) {
    const row = L.firstRow + i;
    if (i % 4 === 0) stripe(g, t, row);
    if (playing.some((ch) => ch.row!.step === i)) playheadRow(g, t, row);
    g.text(L.gutter.col, row, hex2(i), i < phrase.len ? c.dim : c.faint);
    stepCells(phrase.steps[i]).forEach((text, k) => g.text(cols[k].col, row, text, EMPTY.has(text) ? c.dim : c.text));
  }

  for (const r of m.play.flashes) {
    if (r.phrase !== s.phrase) continue;
    const row = L.firstRow + r.step;
    if (t.flash.target === 'row') noteFlash(g, m, cols[0].col, row, cols[5].col + cols[5].w - cols[0].col, r.f0);
    else noteFlash(g, m, cols[0].col, row, cols[0].w, r.f0);
  }

  if (cur.row >= 0) cursorAt(g, t, cols[cur.col].col, L.firstRow + cur.row, cols[cur.col].w);
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
  g.text(L.title.col + 6, L.title.row, hex2(s.chain), c.accent);
  g.text(L.nameCol, L.title.row, chain.name.padEnd(8, ' '), c.text);
  if (cur.row === CHAIN_ROW_NAME) cursorAt(g, t, L.nameCol, L.title.row, 8);

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
  const playing = m.play.channels.filter((ch) => ch.row && ch.row.chain === s.chain);

  chain.slots.forEach((slot, i) => {
    const row = L.firstRow + i;
    if (i % 4 === 0) stripe(g, t, row);
    if (playing.some((ch) => ch.row!.slot === i)) playheadRow(g, t, row);
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
    noteFlash(g, m, cols[0].col, L.firstRow + r.slot, cols[0].w, r.f0);
  }

  if (cur.row >= 0) cursorAt(g, t, cols[cur.col].col, L.firstRow + cur.row, cols[cur.col].w);
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
  if (L.headings.show) for (let ch = 0; ch < CHANNELS; ch++) g.text(chCol(ch), L.headings.row, `${L.headings.prefix}${ch + 1}`, c.dim);

  for (let i = 0; i < L.visibleRows; i++) {
    const r = cur.top + i;
    if (r >= s.song.rows.length) break;
    const row = L.firstRow + i;
    if (r % 4 === 0) stripe(g, t, row);
    g.text(L.gutter.col, row, hex2(r), c.dim);
    for (let ch = 0; ch < CHANNELS; ch++) {
      const cell = s.song.rows[r][ch];
      const text = cell === null ? '--' : cell === 'END' ? 'EN' : hex2(cell);
      g.text(chCol(ch), row, text, cell === null ? c.dim : c.text);
      const now = m.play.channels[ch].row;
      if (now && now.songRow === r) {
        const d = t.sprites.dot;
        spriteAt(g, d, colX(t, chCol(ch)) - t.grid.cellW / 2 - d[0].length / 2, rowY(t, row) + t.font.bitmap.offsetY + 7 - d.length / 2, c.playDot);
      }
    }
  }
  if (cur.row >= cur.top && cur.row < cur.top + L.visibleRows) cursorAt(g, t, chCol(cur.col), L.firstRow + cur.row - cur.top, 2);

  // Divider between the grid and the right panel.
  const D = L.divider;
  g.under.push({ kind: 'rect', color: c.line, x: D.x, y: D.y0, w: D.w, h: D.y1 - D.y0 });

  // Live CH / IN / NOTE readout, in px columns (right-aligned on the device).
  const tb = L.table;
  const tx = (k: number, row: number, text: string, color: string) => g.over.push({ kind: 'text', x: tb.x[k], y: rowY(t, row), text, color });
  tb.labels.forEach((label, k) => tx(k, tb.headerRow, label, c.dim));
  for (let ch = 0; ch < CHANNELS; ch++) {
    const row = tb.firstRow + ch;
    const last = m.play.playing ? m.play.channels[ch].lastNote : null;
    const age = last ? (m.frame - last.f0) / m.fps : Infinity;
    const fg = mix(c.text, c.dim, Math.max(0, 1 - age / 1.5));
    tx(0, row, String(ch + 1), c.dim);
    tx(1, row, last?.instr != null ? hex2(last.instr) : '--', last ? fg : c.dim);
    tx(2, row, last && typeof last.note === 'number' ? noteName(last.note) : '---', last ? fg : c.dim);
  }

  // Separator, then the 3 x 3 scope grid (channels 1-8 and the master, M).
  const sp = L.separator;
  g.under.push({ kind: 'rect', color: c.line, x: sp.x0, y: sp.y, w: sp.x1 - sp.x0, h: sp.h });
  const sc = L.scopes;
  for (let i = 0; i < sc.cols * sc.rows; i++) {
    const x = sc.x + (i % sc.cols) * (sc.w + sc.gap);
    const y = sc.y + Math.floor(i / sc.cols) * (sc.h + sc.gap);
    g.over.push({ kind: 'frame', color: c.line, x, y, w: sc.w, h: sc.h, t: sc.border });
    g.over.push({ kind: 'rect', color: c.line, x, y: y + sc.split, w: sc.w, h: sc.border });
    g.over.push({ kind: 'text', x: x + sc.label.dx - t.font.bitmap.offsetX, y: y + sc.label.dy - t.font.bitmap.offsetY, text: sc.labels[i], color: c.dim });
    // Waveform while a channel sounds (placeholder shape: a decaying wave).
    const chans = i < CHANNELS ? [i] : Array.from({ length: CHANNELS }, (_, k) => k);
    const amp = m.play.playing
      ? Math.min(1, chans.reduce((a, k) => {
          const last = m.play.channels[k].lastNote;
          return a + (last ? Math.max(0, 1 - (m.frame - last.f0) / m.fps / 0.6) : 0);
        }, 0))
      : 0;
    if (amp > 0) {
      const top = y + sc.border + 4;
      const h = sc.split - sc.border - 8;
      const pts: Array<[number, number]> = [];
      for (let px = x + sc.border + 2; px <= x + sc.w - sc.border - 3; px += 2) {
        const ph = (px - x) / 7 + m.frame * 0.9 + i;
        pts.push([px, top + h / 2 + Math.sin(ph) * (h / 2) * amp]);
      }
      g.over.push({ kind: 'line', points: pts, color: c.scope });
    }
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
  const W = t.grid.cellW;
  const textY = S.textY - t.font.bitmap.offsetY;
  const text = (x: number, s: string, color: string) => g.over.push({ kind: 'text', x, y: textY, text: s, color });

  g.under.push({ kind: 'rect', color: c.band, x: 0, y: S.bandY, w: t.screen.width, h: S.bandH });
  text(S.screenName.x, m.state.view, c.statusText);
  const bpm = `${S.bpm.label}${Math.round(m.play.bpm)}`;
  // BPM sits at its measured x unless a long screen name needs the room.
  const bpmX = Math.max(S.bpm.x, S.screenName.x + (m.state.view.length + 1) * W);
  text(bpmX, bpm, c.statusText);
  const iconX = bpmX + bpm.length * W + S.transport.gap;
  spriteAt(g, m.play.playing ? t.sprites.play : t.sprites.stop, iconX, S.transport.y, c.statusText);
  if (m.play.playing) {
    const lx = iconX + t.sprites.stop[0].length + 4;
    if (m.play.mode === 'CHAIN') text(lx, 'C', c.statusText);
    if (m.play.mode === 'PHRASE') text(lx, 'P', c.statusText);
    if (m.play.mode === 'ROW') spriteAt(g, t.sprites.loop, lx, S.transport.y, c.statusText);
  }
  const hint = hintText(m).slice(0, S.hint.maxChars);
  if (hint) text(S.hint.x, hint, c.dim);
  spriteAt(g, t.sprites.battery, S.battery.x, S.battery.y, c.line, { o: c.line, f: c.batteryFill, g: c.batteryFill2, e: c.batteryEmpty });

  const msg = m.state.message;
  if (msg && m.frame - msg.frame < S.toastSeconds * m.fps) {
    const w = (msg.text.length + 2) * W;
    const x = S.toast.right - w;
    g.over.push({ kind: 'rect', color: c.toastBg, x, y: S.toast.y, w, h: t.grid.cellH });
    g.over.push({ kind: 'text', x: x + W, y: S.toast.y, text: msg.text, color: c.toastText });
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
