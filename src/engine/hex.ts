// Hex bytes, signed bytes and note names, written the way ElkTracker shows them.

export const hex1 = (n: number): string => (n & 0xf).toString(16).toUpperCase();

export const hex2 = (n: number): string =>
  (n & 0xff).toString(16).toUpperCase().padStart(2, '0');

/** Parse "00".."FF" (one or two hex digits). */
export function parseHex(text: string, where: string): number {
  if (!/^[0-9A-Fa-f]{1,2}$/.test(text)) {
    throw new Error(`${where}: expected a hex byte like "0C", got "${text}"`);
  }
  return parseInt(text, 16);
}

/** Accept a hex string ("0C") or a plain number (12). */
export function parseIndex(value: string | number, where: string): number {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error(`${where}: expected an integer, got ${value}`);
    return value;
  }
  return parseHex(value, where);
}

/** Signed byte as used by PIT and MOD-on-PITCH: 80 = -128, FF = -1, 01 = +1. */
export const toSigned8 = (n: number): number => (n & 0x80 ? (n & 0xff) - 256 : n & 0xff);

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/** MIDI note -> "C-4" (C-4 = MIDI 60, octaves start at -1). */
export function noteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  // Octave -1 does not fit three characters; the device's spelling is unknown.
  return name + (octave < 0 ? '-' : String(octave));
}

/** "C-4" / "A#3" / "G-9" -> MIDI note. */
export function parseNote(text: string, where: string): number {
  const m = /^([A-Ga-g])([-#])(-?\d)$/.exec(text);
  if (!m) throw new Error(`${where}: expected a note like "C-4" or "A#3", got "${text}"`);
  const letter = m[1].toUpperCase();
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter] as number;
  const sharp = m[2] === '#' ? 1 : 0;
  const midi = (Number(m[3]) + 1) * 12 + base + sharp;
  if (midi < 0 || midi > 127) throw new Error(`${where}: note "${text}" is outside C-1..G9`);
  return midi;
}

/** Small, stable string hash (cyrb53). Same result in Node and the browser. */
export function hashString(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Deterministic 0..255 roll from integers (used by PRB so picture and sound agree). */
export function roll8(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) & 0xff;
}
