// The project model: SONG -> CHAIN -> PHRASE -> INSTRUMENT, as the manual's
// "Tracker Basics" page describes it, plus the parser for song.json.

import { FxCommand, isFxCommand } from './fx';
import { hex2, noteName, parseHex, parseNote } from './hex';

export const SONG_ROWS = 128;
export const CHANNELS = 8;
export const CHAIN_SLOTS = 16;
export const PHRASE_STEPS = 16;
export const INSTRUMENT_SLOTS = 64;
export const MAX_CHAIN = 0x7f;
export const MAX_PHRASE = 0xfe;
export const MAX_INSTRUMENT = INSTRUMENT_SLOTS - 1;
export const DEFAULT_NOTE = 60; // C-4, "the editor's starting note"

/** TYPE cycles in this order (Sampler first, Sub next, MIDI last: manual). */
export const INSTRUMENT_TYPES = [
  'SAMPLER', 'SUB', 'WAVETABLE', 'MACRO', 'MULTI', 'RESO', 'CHIP', 'DRUM', 'MIDI',
] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];

export type NoteValue = number | 'OFF' | null;

/** One phrase row: NOT, IN, FX1, P1, FX2, P2. Every column is its own cell. */
export interface Step {
  note: NoteValue;
  instr: number | null;
  fx: [FxCommand | null, FxCommand | null];
  param: [number | null, number | null];
}

export interface Phrase {
  name: string;
  len: number; // 1..16
  steps: Step[]; // always 16
}

export interface ChainSlot {
  phrase: number | null;
  transpose: number; // semitones, -48..48
}

export interface Chain {
  name: string;
  slots: ChainSlot[]; // always 16
}

export type SongCell = number | 'END' | null;

export interface Project {
  name: string;
  bpm: number; // 40..300
  speed: number; // ticks per row, 1..16
  swing: number; // 0 = OFF, 1..49 (%)
  root: string;
  scale: string;
}

export interface Instrument {
  name: string;
  type: InstrumentType;
  /** Everything else from song.json, as written. Engines read what they need. */
  params: Record<string, unknown>;
}

export interface Song {
  project: Project;
  rows: SongCell[][]; // 128 x 8
  chains: Record<number, Chain>;
  phrases: Record<number, Phrase>;
  instruments: Record<number, Instrument>;
}

export const emptyStep = (): Step => ({
  note: null,
  instr: null,
  fx: [null, null],
  param: [null, null],
});

export const emptyPhrase = (): Phrase => ({
  name: '',
  len: PHRASE_STEPS,
  steps: Array.from({ length: PHRASE_STEPS }, emptyStep),
});

export const emptyChain = (): Chain => ({
  name: '',
  slots: Array.from({ length: CHAIN_SLOTS }, () => ({ phrase: null, transpose: 0 })),
});

export const phraseOf = (song: Song, id: number): Phrase => song.phrases[id] ?? EMPTY_PHRASE;
export const chainOf = (song: Song, id: number): Chain => song.chains[id] ?? EMPTY_CHAIN;
const EMPTY_PHRASE = emptyPhrase();
const EMPTY_CHAIN = emptyChain();

export const isStepEmpty = (s: Step): boolean =>
  s.note === null && s.instr === null && !s.fx[0] && !s.fx[1] &&
  s.param[0] === null && s.param[1] === null;

export const isPhraseUsed = (p: Phrase | undefined): boolean =>
  !!p && (p.name !== '' || p.len !== PHRASE_STEPS || p.steps.some((s) => !isStepEmpty(s)));

export const isChainUsed = (c: Chain | undefined): boolean =>
  !!c && (c.name !== '' || c.slots.some((s) => s.phrase !== null));

// ---------------------------------------------------------------- updates
// Every update returns a new Song and shares everything it did not touch.

export function updatePhrase(song: Song, id: number, fn: (p: Phrase) => Phrase): Song {
  return { ...song, phrases: { ...song.phrases, [id]: fn(song.phrases[id] ?? emptyPhrase()) } };
}

export function updateStep(song: Song, phraseId: number, row: number, fn: (s: Step) => Step): Song {
  return updatePhrase(song, phraseId, (p) => {
    const steps = p.steps.slice();
    steps[row] = fn(steps[row]);
    return { ...p, steps };
  });
}

export function updateChain(song: Song, id: number, fn: (c: Chain) => Chain): Song {
  return { ...song, chains: { ...song.chains, [id]: fn(song.chains[id] ?? emptyChain()) } };
}

export function updateChainSlot(
  song: Song, chainId: number, slot: number, fn: (s: ChainSlot) => ChainSlot,
): Song {
  return updateChain(song, chainId, (c) => {
    const slots = c.slots.slice();
    slots[slot] = fn(slots[slot]);
    return { ...c, slots };
  });
}

export function setSongCell(song: Song, row: number, ch: number, value: SongCell): Song {
  const rows = song.rows.slice();
  const r = rows[row].slice();
  r[ch] = value;
  rows[row] = r;
  return { ...song, rows };
}

// ---------------------------------------------------------------- text forms
// song.json writes steps and slots the way the screen shows them.

export function stepToText(s: Step): string {
  const note = s.note === null ? '---' : s.note === 'OFF' ? 'OFF' : noteName(s.note);
  const instr = s.instr === null ? '--' : hex2(s.instr);
  const fx = (i: 0 | 1) => `${s.fx[i] ?? '---'} ${s.param[i] === null ? '--' : hex2(s.param[i]!)}`;
  return `${note} ${instr} ${fx(0)} ${fx(1)}`;
}

export function parseStep(text: string, where: string): Step {
  const t = text.trim() === '' ? [] : text.trim().split(/\s+/);
  if (t.length > 6) throw new Error(`${where}: a step has at most 6 columns (NOT IN FX1 P1 FX2 P2), got "${text}"`);
  const at = (i: number, empty: string) => t[i] ?? empty;
  const noteTok = at(0, '---');
  const note: NoteValue =
    noteTok === '---' ? null : noteTok.toUpperCase() === 'OFF' ? 'OFF' : parseNote(noteTok, `${where} NOT`);
  const instrTok = at(1, '--');
  const instr = instrTok === '--' ? null : parseHex(instrTok, `${where} IN`);
  if (instr !== null && instr > MAX_INSTRUMENT) throw new Error(`${where} IN: instrument ${instrTok} is past ${hex2(MAX_INSTRUMENT)}`);
  const fxAt = (i: number, col: string): FxCommand | null => {
    const tok = at(i, '---').toUpperCase();
    if (tok === '---') return null;
    if (!isFxCommand(tok)) throw new Error(`${where} ${col}: unknown FX command "${tok}"`);
    return tok;
  };
  const paramAt = (i: number, col: string) => {
    const tok = at(i, '--');
    return tok === '--' ? null : parseHex(tok, `${where} ${col}`);
  };
  return {
    note,
    instr,
    fx: [fxAt(2, 'FX1'), fxAt(4, 'FX2')],
    param: [paramAt(3, 'P1'), paramAt(5, 'P2')],
  };
}

export function parseChainSlot(text: string, where: string): ChainSlot {
  const t = text.trim().split(/\s+/);
  if (t[0] === '--' || t[0] === '') return { phrase: null, transpose: 0 };
  const phrase = parseHex(t[0], `${where} phrase`);
  if (phrase > MAX_PHRASE) throw new Error(`${where}: phrase ${t[0]} is past ${hex2(MAX_PHRASE)}`);
  let transpose = 0;
  if (t[1] !== undefined) {
    if (!/^[+-]?\d+$/.test(t[1])) throw new Error(`${where}: transpose is signed decimal semitones like "+5", got "${t[1]}"`);
    transpose = Number(t[1]);
    if (transpose < -48 || transpose > 48) throw new Error(`${where}: transpose ${transpose} is outside -48..48`);
  }
  return { phrase, transpose };
}

function parseSongCell(tok: string, where: string): SongCell {
  if (tok === '--') return null;
  if (tok.toUpperCase() === 'EN') return 'END';
  const v = parseHex(tok, where);
  if (v > MAX_CHAIN) throw new Error(`${where}: chain ${tok} is past ${hex2(MAX_CHAIN)}`);
  return v;
}

// ---------------------------------------------------------------- song.json

export interface SongJson {
  project?: Partial<Project>;
  /** Song rows by hex row number: "00": "00 01 -- -- -- -- -- --". */
  song?: Record<string, string>;
  chains?: Record<string, { name?: string; slots?: string[] }>;
  phrases?: Record<string, { name?: string; len?: number; steps?: string[] }>;
  instruments?: Record<string, { name?: string; type: string } & Record<string, unknown>>;
}

const checkName = (name: string | undefined, where: string): string => {
  const n = (name ?? '').toUpperCase();
  if (n.length > 8) throw new Error(`${where}: names are at most 8 characters, got "${name}"`);
  return n;
};

export function parseSong(json: SongJson): Song {
  const p = json.project ?? {};
  const project: Project = {
    name: p.name ?? 'UNTITLED',
    bpm: p.bpm ?? 120,
    speed: p.speed ?? 16,
    swing: p.swing ?? 0,
    root: p.root ?? 'C',
    scale: p.scale ?? 'OFF',
  };
  if (project.bpm < 40 || project.bpm > 300) throw new Error(`project.bpm must be 40..300, got ${project.bpm}`);
  if (project.speed < 1 || project.speed > 16) throw new Error(`project.speed must be 1..16, got ${project.speed}`);
  if (project.swing < 0 || project.swing > 49) throw new Error(`project.swing must be 0 (OFF) or 1..49, got ${project.swing}`);

  const rows: SongCell[][] = Array.from({ length: SONG_ROWS }, () => Array(CHANNELS).fill(null));
  for (const [rowKey, line] of Object.entries(json.song ?? {})) {
    const row = parseHex(rowKey, `song row "${rowKey}"`);
    if (row >= SONG_ROWS) throw new Error(`song row ${rowKey} is past 7F`);
    const toks = line.trim().split(/\s+/);
    if (toks.length > CHANNELS) throw new Error(`song row ${rowKey}: 8 channels at most`);
    toks.forEach((tok, ch) => (rows[row][ch] = parseSongCell(tok, `song row ${rowKey} ch ${ch + 1}`)));
  }

  const chains: Record<number, Chain> = {};
  for (const [key, c] of Object.entries(json.chains ?? {})) {
    const id = parseHex(key, `chain "${key}"`);
    const chain = emptyChain();
    chain.name = checkName(c.name, `chain ${key} name`);
    (c.slots ?? []).forEach((s, i) => {
      if (i >= CHAIN_SLOTS) throw new Error(`chain ${key}: 16 slots at most`);
      chain.slots[i] = parseChainSlot(s, `chain ${key} slot ${i.toString(16).toUpperCase()}`);
    });
    chains[id] = chain;
  }

  const phrases: Record<number, Phrase> = {};
  for (const [key, ph] of Object.entries(json.phrases ?? {})) {
    const id = parseHex(key, `phrase "${key}"`);
    const phrase = emptyPhrase();
    phrase.name = checkName(ph.name, `phrase ${key} name`);
    phrase.len = ph.len ?? PHRASE_STEPS;
    if (phrase.len < 1 || phrase.len > PHRASE_STEPS) throw new Error(`phrase ${key}: len must be 1..16`);
    (ph.steps ?? []).forEach((s, i) => {
      if (i >= PHRASE_STEPS) throw new Error(`phrase ${key}: 16 steps at most`);
      phrase.steps[i] = parseStep(s, `phrase ${key} step ${hex2(i)}`);
    });
    phrases[id] = phrase;
  }

  const instruments: Record<number, Instrument> = {};
  for (const [key, ins] of Object.entries(json.instruments ?? {})) {
    const id = parseHex(key, `instrument "${key}"`);
    if (id > MAX_INSTRUMENT) throw new Error(`instrument ${key} is past ${hex2(MAX_INSTRUMENT)}`);
    const type = String(ins.type).toUpperCase();
    if (!(INSTRUMENT_TYPES as readonly string[]).includes(type)) {
      throw new Error(`instrument ${key}: TYPE must be one of ${INSTRUMENT_TYPES.join(', ')}`);
    }
    const { name, type: _type, ...params } = ins;
    instruments[id] = { name: checkName(name, `instrument ${key} name`), type: type as InstrumentType, params };
  }

  return { project, rows, chains, phrases, instruments };
}
