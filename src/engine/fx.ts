// Phrase FX commands, from the manual's "Phrase FX Commands" page.
// The ORDER here is the order A+LEFT/RIGHT cycles through on an FX column.
// The manual lists the commands but not the device's cycle order: this is
// the manual's table order until checked on the device.

export const FX_COMMANDS = [
  'VOL', 'PIT', 'KIL', 'HOP', 'TPO', 'RTG', 'PAN', 'SDA', 'SDB', 'OFS',
  'REV', 'SLC', 'ARP', 'PRB', 'GLI', 'MO1', 'MO2', 'MO3', 'MO4', 'CHD',
] as const;

export type FxCommand = (typeof FX_COMMANDS)[number];

export const isFxCommand = (s: string): s is FxCommand =>
  (FX_COMMANDS as readonly string[]).includes(s);

/** Full names shown in the status-bar hint when an FX column is selected.
 *  The device's exact wording is unconfirmed. */
export const FX_NAMES: Record<FxCommand, string> = {
  VOL: 'VOLUME',
  PIT: 'PITCH',
  KIL: 'KILL',
  HOP: 'HOP',
  TPO: 'TEMPO',
  RTG: 'RETRIGGER',
  PAN: 'PAN',
  SDA: 'SEND A',
  SDB: 'SEND B',
  OFS: 'OFFSET',
  REV: 'REVERSE',
  SLC: 'SLICE',
  ARP: 'ARPEGGIO',
  PRB: 'PROBABILITY',
  GLI: 'GLIDE',
  MO1: 'MOD 1',
  MO2: 'MOD 2',
  MO3: 'MOD 3',
  MO4: 'MOD 4',
  CHD: 'CHORD',
};

/** CHD parameter -> semitone intervals above the root (manual's chord table). */
export const CHORDS: Record<number, { name: string; intervals: number[] }> = {
  0x01: { name: 'MAJ', intervals: [4, 7] },
  0x02: { name: 'MIN', intervals: [3, 7] },
  0x03: { name: '5TH', intervals: [7] },
  0x04: { name: 'MAJ7', intervals: [4, 7, 11] },
  0x05: { name: 'MIN7', intervals: [3, 7, 10] },
  0x06: { name: 'DOM7', intervals: [4, 7, 10] },
  0x07: { name: 'SUS2', intervals: [2, 7] },
  0x08: { name: 'SUS4', intervals: [5, 7] },
  0x09: { name: 'AUG', intervals: [4, 8] },
  0x0a: { name: 'DIM', intervals: [3, 6] },
  0x0b: { name: 'DIM7', intervals: [3, 6, 9] },
  0x0c: { name: 'MMAJ7', intervals: [3, 7, 11] },
  0x0d: { name: 'MAJ6', intervals: [4, 7, 9] },
  0x0e: { name: 'MIN6', intervals: [3, 7, 9] },
  0x0f: { name: 'ADD9', intervals: [4, 7, 14] },
  0x10: { name: 'MADD9', intervals: [3, 7, 14] },
};
