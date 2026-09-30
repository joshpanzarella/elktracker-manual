// Editor state and the reducer that plays timeline events into it.
//
// The screen at frame f is `stateAt(f)`: the song from song.json with every
// device event whose frame <= f applied in order. Nothing accumulates between
// renders; the fold is recomputed (and cached per timeline) from the data.
//
// Button behaviour follows the manual's Controls, Navigation and Screens
// pages. Where the manual is silent the choice is marked "unconfirmed".

import { FX_COMMANDS, FxCommand } from './fx';
import { hex2, parseHex, parseIndex, parseNote } from './hex';
import {
  CHAIN_SLOTS, CHANNELS, DEFAULT_NOTE, INSTRUMENT_SLOTS, MAX_CHAIN, MAX_INSTRUMENT, MAX_PHRASE,
  PHRASE_STEPS, SONG_ROWS, Song, SongCell, chainOf, isChainUsed, isPhraseUsed, parseChainSlot,
  parseStep, phraseOf, setSongCell, updateChain, updateChainSlot, updatePhrase, updateStep,
} from './song';
import {
  Button, CellRef, DeviceEvent, PressEvent, SetEvent, StartState, VIEWS, ViewEvent, ViewName,
} from './timeline';

export type TransportMode = 'SONG' | 'ROW' | 'CHAIN' | 'PHRASE';

export interface Transport {
  playing: boolean;
  mode: TransportMode;
  /** Frame of the press that started (or stopped) playback. */
  frame: number;
  /** SONG: first row. ROW: the looped row. */
  songRow: number;
  chain: number;
  phrase: number;
  /** Counts starts. Seeds PRB rolls so picture and sound agree. */
  session: number;
}

export interface Cursor {
  row: number;
  col: number;
}

export interface EditorState {
  song: Song;
  view: ViewName;
  /** Song screen cursor; col = channel 0..7. `top` = first visible row. */
  songCursor: Cursor & { top: number };
  chain: number;
  /** Chain screen: row -1 = name, 0..F = slots; col 0 = phrase, 1 = transpose. */
  chainCursor: Cursor;
  phrase: number;
  /** Phrase screen: row -2 = name, -1 = LEN, 0..F = steps; col 0..5 = NOT IN FX1 P1 FX2 P2. */
  phraseCursor: Cursor;
  instrument: number;
  /** Character position on a name row (A+LEFT/RIGHT moves it). */
  nameCursor: number;
  last: {
    note: number;
    instr: number;
    fx: FxCommand;
    param: number;
    chain: number;
    phrase: number;
  };
  transport: Transport;
  /** Status-bar toast ("SAVED", "UNDO", ...), shown for a few seconds. */
  message: { text: string; frame: number } | null;
  /** For double-tap detection. */
  lastPress: { combo: string; frame: number; view: ViewName; row: number; col: number } | null;
}

export interface EditorContext {
  fps: number;
  /** Rows visible on the Song screen (the theme decides; scrolling needs it). */
  songVisibleRows: number;
}

export const PHRASE_COLS = ['NOT', 'IN', 'FX1', 'P1', 'FX2', 'P2'] as const;
export const CHAIN_COLS = ['PHRASE', 'TRANSPOSE'] as const;
export const PHRASE_ROW_LEN = -1;
export const PHRASE_ROW_NAME = -2;
export const CHAIN_ROW_NAME = -1;

/** Two A taps closer than this count as a double tap (unconfirmed window). */
export const DOUBLE_TAP_SECONDS = 0.3;

/** Characters a label cycles through. The manual: "no lowercase here". */
export const LABEL_CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!-_';

// ---------------------------------------------------------------- start

export function initialState(song: Song, start: StartState, ctx: EditorContext): EditorState {
  let s: EditorState = {
    song,
    view: start.view,
    songCursor: { row: start.songRow, col: start.songChannel, top: 0 },
    chain: start.chain,
    chainCursor: { row: 0, col: 0 },
    phrase: start.phrase,
    phraseCursor: { row: 0, col: 0 },
    instrument: start.instrument,
    nameCursor: 0,
    last: { note: DEFAULT_NOTE, instr: 0, fx: FX_COMMANDS[0], param: 0, chain: 0, phrase: 0 },
    transport: { playing: false, mode: 'SONG', frame: 0, songRow: 0, chain: 0, phrase: 0, session: 0 },
    message: null,
    lastPress: null,
  };
  s = scrollSong(s, ctx);
  if (start.cursor) s = applyCursor(s, start.cursor.row, start.cursor.col, ctx);
  return s;
}

// ---------------------------------------------------------------- reducer

export function applyDeviceEvent(s: EditorState, e: DeviceEvent, ctx: EditorContext): EditorState {
  switch (e.kind) {
    case 'press':
      return { ...applyPress(s, e, ctx), lastPress: pressRecord(s, e) };
    case 'cursor':
      return applyCursor(s, e.row, e.col, ctx);
    case 'set':
      return applySet(s, e);
    case 'view':
      return applyView(s, e);
  }
}

function pressRecord(s: EditorState, e: PressEvent): EditorState['lastPress'] {
  const c = cursorOf(s);
  return { combo: e.combo, frame: e.frame, view: s.view, row: c.row, col: c.col };
}

function applyPress(s: EditorState, e: PressEvent, ctx: EditorContext): EditorState {
  // X and Y default to B and A (manual: Gamepad Configuration).
  const button: Button = e.button === 'X' ? 'B' : e.button === 'Y' ? 'A' : e.button;
  const hold = e.hold === 'Y' ? 'A' : e.hold;
  const dir = button === 'UP' || button === 'DOWN' || button === 'LEFT' || button === 'RIGHT' ? button : null;

  if (hold === null) {
    if (dir) return moveCursor(s, dir, ctx);
    switch (button) {
      case 'A': return tapA(s, e, ctx);
      case 'B': return clearCell(s);
      case 'R': return dive(s);
      case 'L': return back(s);
      case 'START': return startStop(s, e.frame);
      default: return s; // L2 undo, R2 paste: not built yet
    }
  }
  if (hold === 'A' && dir) return editValue(s, dir);
  if (hold === 'SELECT') {
    switch (button) {
      case 'LEFT': return selectLeft(s);
      case 'RIGHT': return selectRight(s);
      case 'R': return quickNav(s, +1);
      case 'L': return quickNav(s, -1);
      case 'START': return isolation(s, e.frame);
      default: return s; // copy / cut / redo / duplicate: not built yet
    }
  }
  return s;
}

// ---------------------------------------------------------------- cursor

function cursorOf(s: EditorState): Cursor {
  switch (s.view) {
    case 'SONG': return s.songCursor;
    case 'CHAIN': return s.chainCursor;
    case 'PHRASE': return s.phraseCursor;
    default: return { row: 0, col: 0 };
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function scrollSong(s: EditorState, ctx: EditorContext): EditorState {
  const { row } = s.songCursor;
  let top = s.songCursor.top;
  const n = ctx.songVisibleRows;
  if (row < top) top = row;
  if (row >= top + n) top = row - n + 1;
  top = clamp(top, 0, Math.max(0, SONG_ROWS - n));
  return top === s.songCursor.top ? s : { ...s, songCursor: { ...s.songCursor, top } };
}

function moveCursor(s: EditorState, dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', ctx: EditorContext): EditorState {
  const dRow = dir === 'UP' ? -1 : dir === 'DOWN' ? 1 : 0;
  const dCol = dir === 'LEFT' ? -1 : dir === 'RIGHT' ? 1 : 0;
  switch (s.view) {
    case 'SONG': {
      const c = s.songCursor;
      return scrollSong({
        ...s,
        songCursor: { ...c, row: clamp(c.row + dRow, 0, SONG_ROWS - 1), col: clamp(c.col + dCol, 0, CHANNELS - 1) },
      }, ctx);
    }
    case 'CHAIN': {
      const c = s.chainCursor;
      const row = clamp(c.row + dRow, CHAIN_ROW_NAME, CHAIN_SLOTS - 1);
      const col = c.row < 0 ? c.col : clamp(c.col + dCol, 0, CHAIN_COLS.length - 1);
      return { ...s, chainCursor: { row, col } };
    }
    case 'PHRASE': {
      const c = s.phraseCursor;
      const row = clamp(c.row + dRow, PHRASE_ROW_NAME, PHRASE_STEPS - 1);
      const col = c.row < 0 ? c.col : clamp(c.col + dCol, 0, PHRASE_COLS.length - 1);
      return { ...s, phraseCursor: { row, col } };
    }
    default:
      return s;
  }
}

function resolveRow(view: ViewName, row: CellRef): number {
  if (typeof row === 'string') {
    const up = row.toUpperCase();
    if (view === 'PHRASE' && up === 'LEN') return PHRASE_ROW_LEN;
    if (view === 'PHRASE' && up === 'NAME') return PHRASE_ROW_NAME;
    if (view === 'CHAIN' && up === 'NAME') return CHAIN_ROW_NAME;
  }
  return parseIndex(row, `cursor row on ${view}`);
}

function resolveCol(view: ViewName, col: CellRef): number {
  if (view === 'SONG') {
    // Song columns are channels, written 1..8 as the screen numbers them.
    const n = typeof col === 'string' ? Number(col.replace(/^CH/i, '')) : col;
    if (!Number.isInteger(n) || n < 1 || n > CHANNELS) throw new Error(`Song column must be a channel 1..8, got ${col}`);
    return n - 1;
  }
  const names: readonly string[] = view === 'CHAIN' ? CHAIN_COLS : PHRASE_COLS;
  const aliases: Record<string, string> = { NOTE: 'NOT', INSTR: 'IN', INS: 'IN', PH: 'PHRASE', TSP: 'TRANSPOSE', TR: 'TRANSPOSE' };
  if (typeof col === 'number') return clamp(col, 0, names.length - 1);
  const up = col.toUpperCase();
  const i = names.indexOf(aliases[up] ?? up);
  if (i < 0) throw new Error(`Unknown ${view} column "${col}" (use ${names.join(', ')})`);
  return i;
}

function applyCursor(s: EditorState, row: CellRef | undefined, col: CellRef | undefined, ctx: EditorContext): EditorState {
  const c = cursorOf(s);
  const next = {
    row: row === undefined ? c.row : resolveRow(s.view, row),
    col: col === undefined ? c.col : resolveCol(s.view, col),
  };
  switch (s.view) {
    case 'SONG': return scrollSong({ ...s, songCursor: { ...s.songCursor, ...next } }, ctx);
    case 'CHAIN': return { ...s, chainCursor: next };
    case 'PHRASE': return { ...s, phraseCursor: next };
    default: return s;
  }
}

// ---------------------------------------------------------------- A tap

function isDoubleTap(s: EditorState, e: PressEvent, ctx: EditorContext): boolean {
  const p = s.lastPress;
  const c = cursorOf(s);
  return !!p && p.combo === 'A' && p.view === s.view && p.row === c.row && p.col === c.col &&
    e.frame - p.frame <= DOUBLE_TAP_SECONDS * ctx.fps;
}

function firstUnused(used: (id: number) => boolean, max: number): number | null {
  for (let id = 0; id <= max; id++) if (!used(id)) return id;
  return null;
}

function tapA(s: EditorState, e: PressEvent, ctx: EditorContext): EditorState {
  const double = isDoubleTap(s, e, ctx);
  switch (s.view) {
    case 'SONG': {
      const { row, col } = s.songCursor;
      const cell = s.song.rows[row][col];
      if (double && typeof cell === 'number') {
        // Second tap: first chain nobody else uses.
        const id = firstUnused((c) => isChainUsed(s.song.chains[c]) || songUsesChain(s.song, c, row, col), MAX_CHAIN);
        if (id === null) return s;
        return withMessage({ ...s, song: setSongCell(s.song, row, col, id), last: { ...s.last, chain: id } }, `CHAIN ${hex2(id)}`, e.frame);
      }
      if (typeof cell === 'number') return { ...s, last: { ...s.last, chain: cell } };
      return { ...s, song: setSongCell(s.song, row, col, s.last.chain) };
    }
    case 'CHAIN': {
      const { row, col } = s.chainCursor;
      if (row < 0 || col !== 0) return s;
      const slot = chainOf(s.song, s.chain).slots[row];
      if (double && slot.phrase !== null) {
        const id = firstUnused((p) => isPhraseUsed(s.song.phrases[p]) || chainsUsePhrase(s.song, p, s.chain, row), MAX_PHRASE);
        if (id === null) return s;
        return withMessage({
          ...s,
          song: updateChainSlot(s.song, s.chain, row, (x) => ({ ...x, phrase: id })),
          last: { ...s.last, phrase: id },
        }, `PHRASE ${hex2(id)}`, e.frame);
      }
      if (slot.phrase !== null) return { ...s, last: { ...s.last, phrase: slot.phrase } };
      return { ...s, song: updateChainSlot(s.song, s.chain, row, (x) => ({ ...x, phrase: s.last.phrase })) };
    }
    case 'PHRASE': {
      const { row, col } = s.phraseCursor;
      if (row < 0) return s;
      const step = phraseOf(s.song, s.phrase).steps[row];
      const set = (fn: (st: typeof step) => typeof step) => ({ ...s, song: updateStep(s.song, s.phrase, row, fn) });
      switch (col) {
        case 0: // NOT: insert the last note (and the last instrument if IN is empty)
          if (typeof step.note === 'number') return { ...s, last: { ...s.last, note: step.note } };
          return set((st) => ({ ...st, note: s.last.note, instr: st.instr ?? s.last.instr }));
        case 1: // IN
          if (double && step.instr !== null) {
            const id = firstUnused((i) => s.song.instruments[i] !== undefined, MAX_INSTRUMENT);
            if (id === null) return s;
            return withMessage({ ...set((st) => ({ ...st, instr: id })), last: { ...s.last, instr: id } }, `INSTRUMENT ${hex2(id)}`, e.frame);
          }
          if (step.instr !== null) return { ...s, last: { ...s.last, instr: step.instr } };
          return set((st) => ({ ...st, instr: s.last.instr }));
        case 2:
        case 4: { // FX1 / FX2
          const lane = col === 2 ? 0 : 1;
          const cur = step.fx[lane];
          if (cur) return { ...s, last: { ...s.last, fx: cur } };
          return set((st) => ({
            ...st,
            fx: lane === 0 ? [s.last.fx, st.fx[1]] : [st.fx[0], s.last.fx],
            // A new command gets a parameter of 00 (unconfirmed).
            param: lane === 0 ? [st.param[0] ?? 0, st.param[1]] : [st.param[0], st.param[1] ?? 0],
          }));
        }
        default: { // P1 / P2
          const lane = col === 3 ? 0 : 1;
          const cur = step.param[lane];
          if (cur !== null) return { ...s, last: { ...s.last, param: cur } };
          return set((st) => ({ ...st, param: lane === 0 ? [s.last.param, st.param[1]] : [st.param[0], s.last.param] }));
        }
      }
    }
    default:
      return s;
  }
}

function songUsesChain(song: Song, chain: number, exceptRow: number, exceptCol: number): boolean {
  return song.rows.some((r, ri) => r.some((c, ci) => c === chain && !(ri === exceptRow && ci === exceptCol)));
}

function chainsUsePhrase(song: Song, phrase: number, exceptChain: number, exceptSlot: number): boolean {
  return Object.entries(song.chains).some(([id, c]) =>
    c.slots.some((sl, i) => sl.phrase === phrase && !(Number(id) === exceptChain && i === exceptSlot)));
}

function withMessage(s: EditorState, text: string, frame: number): EditorState {
  return { ...s, message: { text, frame } };
}

// ---------------------------------------------------------------- A + direction

function editName(name: string, pos: number, dir: 'UP' | 'DOWN'): string {
  const chars = name.padEnd(8, ' ').split('');
  const i = LABEL_CHARSET.indexOf(chars[pos]);
  const d = dir === 'UP' ? 1 : -1;
  chars[pos] = LABEL_CHARSET[(Math.max(0, i) + d + LABEL_CHARSET.length) % LABEL_CHARSET.length];
  return chars.join('').trimEnd();
}

function editValue(s: EditorState, dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'): EditorState {
  const sign = dir === 'UP' || dir === 'RIGHT' ? 1 : -1;
  const big = dir === 'UP' || dir === 'DOWN';
  const nameEdit = (name: string, set: (n: string) => EditorState): EditorState =>
    big ? set(editName(name, s.nameCursor, dir as 'UP' | 'DOWN'))
      : { ...s, nameCursor: (s.nameCursor + sign + 8) % 8 };

  switch (s.view) {
    case 'SONG': {
      const { row, col } = s.songCursor;
      const cell = s.song.rows[row][col];
      if (cell === null) return { ...s, song: setSongCell(s.song, row, col, s.last.chain) };
      // Values run 00..7F then END ("scrolling up past 7F lands on END").
      const v = cell === 'END' ? MAX_CHAIN + 1 : cell;
      const nv = clamp(v + sign * (big ? 16 : 1), 0, MAX_CHAIN + 1);
      const next: SongCell = nv > MAX_CHAIN ? 'END' : nv;
      return {
        ...s,
        song: setSongCell(s.song, row, col, next),
        last: typeof next === 'number' ? { ...s.last, chain: next } : s.last,
      };
    }
    case 'CHAIN': {
      const { row, col } = s.chainCursor;
      if (row === CHAIN_ROW_NAME) {
        return nameEdit(chainOf(s.song, s.chain).name, (n) => ({ ...s, song: updateChain(s.song, s.chain, (c) => ({ ...c, name: n })) }));
      }
      const slot = chainOf(s.song, s.chain).slots[row];
      if (col === 0) {
        if (slot.phrase === null) return { ...s, song: updateChainSlot(s.song, s.chain, row, (x) => ({ ...x, phrase: s.last.phrase })) };
        const p = clamp(slot.phrase + sign * (big ? 16 : 1), 0, MAX_PHRASE);
        return { ...s, song: updateChainSlot(s.song, s.chain, row, (x) => ({ ...x, phrase: p })), last: { ...s.last, phrase: p } };
      }
      // Transpose: A+LEFT/RIGHT by 1, A+UP/DOWN by 12 (manual).
      const t = clamp(slot.transpose + sign * (big ? 12 : 1), -48, 48);
      return { ...s, song: updateChainSlot(s.song, s.chain, row, (x) => ({ ...x, transpose: t })) };
    }
    case 'PHRASE': {
      const { row, col } = s.phraseCursor;
      if (row === PHRASE_ROW_NAME) {
        return nameEdit(phraseOf(s.song, s.phrase).name, (n) => ({ ...s, song: updatePhrase(s.song, s.phrase, (p) => ({ ...p, name: n })) }));
      }
      if (row === PHRASE_ROW_LEN) {
        // LEN: every direction steps by 1.
        return { ...s, song: updatePhrase(s.song, s.phrase, (p) => ({ ...p, len: clamp(p.len + sign, 1, PHRASE_STEPS) })) };
      }
      const step = phraseOf(s.song, s.phrase).steps[row];
      const set = (fn: (st: typeof step) => typeof step, last: Partial<EditorState['last']> = {}) =>
        ({ ...s, song: updateStep(s.song, s.phrase, row, fn), last: { ...s.last, ...last } });
      switch (col) {
        case 0: {
          if (typeof step.note !== 'number') return set((st) => ({ ...st, note: s.last.note, instr: st.instr ?? s.last.instr }));
          // Semitone on LEFT/RIGHT, octave on UP/DOWN. (Scale snapping: not built.)
          const n = clamp(step.note + sign * (big ? 12 : 1), 0, 127);
          return set((st) => ({ ...st, note: n }), { note: n });
        }
        case 1: {
          if (step.instr === null) return set((st) => ({ ...st, instr: s.last.instr }));
          const i = clamp(step.instr + sign * (big ? 16 : 1), 0, INSTRUMENT_SLOTS - 1);
          return set((st) => ({ ...st, instr: i }), { instr: i });
        }
        case 2:
        case 4: {
          const lane = col === 2 ? 0 : 1;
          const cur = step.fx[lane];
          if (!cur) {
            return set((st) => ({
              ...st,
              fx: lane === 0 ? [s.last.fx, st.fx[1]] : [st.fx[0], s.last.fx],
              param: lane === 0 ? [st.param[0] ?? 0, st.param[1]] : [st.param[0], st.param[1] ?? 0],
            }));
          }
          // Commands cycle one at a time in every direction (unconfirmed).
          const i = FX_COMMANDS.indexOf(cur);
          const nextCmd = FX_COMMANDS[(i + sign + FX_COMMANDS.length) % FX_COMMANDS.length];
          return set((st) => ({ ...st, fx: lane === 0 ? [nextCmd, st.fx[1]] : [st.fx[0], nextCmd] }), { fx: nextCmd });
        }
        default: {
          const lane = col === 3 ? 0 : 1;
          const cur = step.param[lane];
          if (cur === null) return set((st) => ({ ...st, param: lane === 0 ? [s.last.param, st.param[1]] : [st.param[0], s.last.param] }));
          const v = clamp(cur + sign * (big ? 16 : 1), 0, 255);
          return set((st) => ({ ...st, param: lane === 0 ? [v, st.param[1]] : [st.param[0], v] }), { param: v });
        }
      }
    }
    default:
      return s;
  }
}

// ---------------------------------------------------------------- B

function clearCell(s: EditorState): EditorState {
  switch (s.view) {
    case 'SONG': {
      const { row, col } = s.songCursor;
      const cell = s.song.rows[row][col];
      // B on an empty cell places END; B on END (or a chain) empties it.
      return { ...s, song: setSongCell(s.song, row, col, cell === null ? 'END' : null) };
    }
    case 'CHAIN': {
      const { row, col } = s.chainCursor;
      if (row === CHAIN_ROW_NAME) return { ...s, song: updateChain(s.song, s.chain, (c) => ({ ...c, name: '' })) };
      return {
        ...s,
        song: updateChainSlot(s.song, s.chain, row, (x) => (col === 0 ? { ...x, phrase: null } : { ...x, transpose: 0 })),
      };
    }
    case 'PHRASE': {
      const { row, col } = s.phraseCursor;
      if (row === PHRASE_ROW_NAME) return { ...s, song: updatePhrase(s.song, s.phrase, (p) => ({ ...p, name: '' })) };
      if (row === PHRASE_ROW_LEN) return { ...s, song: updatePhrase(s.song, s.phrase, (p) => ({ ...p, len: PHRASE_STEPS })) };
      return {
        ...s,
        song: updateStep(s.song, s.phrase, row, (st) => {
          switch (col) {
            case 0: return { ...st, note: st.note === null ? 'OFF' : null }; // B on --- inserts OFF
            case 1: return { ...st, instr: null };
            case 2: return { ...st, fx: [null, st.fx[1]] };
            case 3: return { ...st, param: [null, st.param[1]] };
            case 4: return { ...st, fx: [st.fx[0], null] };
            default: return { ...st, param: [st.param[0], null] };
          }
        }),
      };
    }
    default:
      return s;
  }
}

// ---------------------------------------------------------------- dive / back

function diveTarget(s: EditorState): EditorState | null {
  switch (s.view) {
    case 'SONG': {
      const { row, col } = s.songCursor;
      const cell = s.song.rows[row][col];
      if (typeof cell !== 'number') return null; // empty or END: nothing to open
      return {
        ...s,
        view: 'CHAIN',
        chain: cell,
        chainCursor: cell === s.chain ? s.chainCursor : { row: 0, col: 0 },
      };
    }
    case 'CHAIN': {
      const { row } = s.chainCursor;
      if (row < 0) return null;
      const p = chainOf(s.song, s.chain).slots[row].phrase;
      if (p === null) return null;
      return { ...s, view: 'PHRASE', phrase: p, phraseCursor: p === s.phrase ? s.phraseCursor : { row: 0, col: 0 } };
    }
    case 'PHRASE': {
      const { row } = s.phraseCursor;
      const instr = row >= 0 ? phraseOf(s.song, s.phrase).steps[row].instr : null;
      // Empty IN opens the instrument last open (manual: Navigation).
      return { ...s, view: 'INSTRUMENT', instrument: instr ?? s.instrument };
    }
    default:
      return null;
  }
}

function dive(s: EditorState): EditorState {
  return diveTarget(s) ?? s;
}

function back(s: EditorState): EditorState {
  switch (s.view) {
    case 'PHRASE': return { ...s, view: 'CHAIN' };
    case 'CHAIN': return { ...s, view: 'SONG' };
    case 'INSTRUMENT': return { ...s, view: 'PHRASE' };
    case 'TRACK':
    case 'MIXER':
    case 'PROJECT':
    case 'SETTINGS': return { ...s, view: 'SONG' };
    default: return s;
  }
}

function cycleScreen(s: EditorState, d: number): EditorState {
  const i = VIEWS.indexOf(s.view);
  return { ...s, view: VIEWS[(i + d + VIEWS.length) % VIEWS.length] };
}

function selectLeft(s: EditorState): EditorState {
  if (s.view === 'CHAIN' || s.view === 'PHRASE' || s.view === 'INSTRUMENT') return back(s);
  return cycleScreen(s, -1);
}

function selectRight(s: EditorState): EditorState {
  if (s.view === 'SONG' || s.view === 'CHAIN' || s.view === 'PHRASE') return diveTarget(s) ?? cycleScreen(s, +1);
  return cycleScreen(s, +1);
}

function quickNav(s: EditorState, d: number): EditorState {
  switch (s.view) {
    case 'CHAIN': {
      // Next / previous chain in the same song column.
      const { col } = s.songCursor;
      for (let r = s.songCursor.row + d; r >= 0 && r < SONG_ROWS; r += d) {
        const cell = s.song.rows[r][col];
        if (typeof cell === 'number') return { ...s, chain: cell, songCursor: { ...s.songCursor, row: r }, chainCursor: { row: 0, col: 0 } };
      }
      return s;
    }
    case 'PHRASE': {
      // Next / previous phrase slot in the current chain.
      const slots = chainOf(s.song, s.chain).slots;
      for (let r = s.chainCursor.row + d; r >= 0 && r < CHAIN_SLOTS; r += d) {
        const p = slots[r].phrase;
        if (p !== null) return { ...s, phrase: p, chainCursor: { ...s.chainCursor, row: r }, phraseCursor: { row: 0, col: 0 } };
      }
      return s;
    }
    case 'INSTRUMENT': {
      for (let i = s.instrument + d; i >= 0 && i < INSTRUMENT_SLOTS; i += d) {
        if (s.song.instruments[i]) return { ...s, instrument: i };
      }
      return s;
    }
    default:
      return s;
  }
}

// ---------------------------------------------------------------- transport

function startStop(s: EditorState, frame: number): EditorState {
  if (s.transport.playing) return { ...s, transport: { ...s.transport, playing: false, frame } };
  // Start plays the song: from the cursor row on the Song screen, from row 00 elsewhere.
  return {
    ...s,
    transport: {
      playing: true,
      mode: 'SONG',
      frame,
      songRow: s.view === 'SONG' ? s.songCursor.row : 0,
      chain: s.chain,
      phrase: s.phrase,
      session: s.transport.session + 1,
    },
  };
}

function isolation(s: EditorState, frame: number): EditorState {
  // While playing, Select+Start is PANIC on every screen.
  if (s.transport.playing) return { ...s, transport: { ...s.transport, playing: false, frame } };
  const mode: TransportMode | null =
    s.view === 'SONG' ? 'ROW' : s.view === 'CHAIN' ? 'CHAIN' : s.view === 'PHRASE' ? 'PHRASE' : null;
  if (!mode) return s; // other screens: PANIC with nothing playing
  return {
    ...s,
    transport: {
      playing: true,
      mode,
      frame,
      songRow: s.songCursor.row,
      chain: s.chain,
      phrase: s.phrase,
      session: s.transport.session + 1,
    },
  };
}

// ---------------------------------------------------------------- direct edits

function applySet(s: EditorState, e: SetEvent): EditorState {
  const t = e.target;
  const where = `set at frame ${e.frame}`;
  const text = String(e.value);
  if (t.phrase !== undefined) {
    const id = parseIndex(t.phrase, `${where} phrase`);
    const row = parseIndex(t.step ?? 0, `${where} step`);
    if (t.col === undefined) return { ...s, song: updateStep(s.song, id, row, () => parseStep(text, where)) };
    const col = resolveCol('PHRASE', t.col);
    return {
      ...s,
      song: updateStep(s.song, id, row, (st) => {
        switch (col) {
          case 0: return { ...st, note: text === '---' ? null : text.toUpperCase() === 'OFF' ? 'OFF' : parseNote(text, where) };
          case 1: return { ...st, instr: text === '--' ? null : parseHex(text, where) };
          case 2:
          case 4: {
            const cmd = parseStep(`--- -- ${text}`, where).fx[0];
            return { ...st, fx: col === 2 ? [cmd, st.fx[1]] : [st.fx[0], cmd] };
          }
          default: {
            const v = text === '--' ? null : parseHex(text, where);
            return { ...st, param: col === 3 ? [v, st.param[1]] : [st.param[0], v] };
          }
        }
      }),
    };
  }
  if (t.chain !== undefined) {
    const id = parseIndex(t.chain, `${where} chain`);
    const slot = parseIndex(t.slot ?? 0, `${where} slot`);
    return { ...s, song: updateChainSlot(s.song, id, slot, () => parseChainSlot(text, where)) };
  }
  if (t.songRow !== undefined) {
    const row = parseIndex(t.songRow, `${where} songRow`);
    const ch = (t.channel ?? 1) - 1;
    const v: SongCell = text === '--' ? null : text.toUpperCase() === 'EN' ? 'END' : parseHex(text, where);
    return { ...s, song: setSongCell(s.song, row, ch, v) };
  }
  if (t.project !== undefined) {
    const key = t.project as keyof Song['project'];
    return { ...s, song: { ...s.song, project: { ...s.song.project, [key]: e.value } } };
  }
  throw new Error(`${where}: set needs phrase, chain, songRow or project`);
}

function applyView(s: EditorState, e: ViewEvent): EditorState {
  return {
    ...s,
    view: e.view,
    chain: e.chain ?? s.chain,
    phrase: e.phrase ?? s.phrase,
    instrument: e.instrument ?? s.instrument,
  };
}
