// Playback. One schedule per scene, shared by the picture (playhead, note
// flashes, channel readouts) and the sound (scripts/render-audio).
//
// Timing (manual: Tracker Basics, Swing): 4 rows per beat; SPEED ticks per
// row; swing lengthens the first row of each pair and shortens the second.
// Rows run on one global clock and every channel advances one row per tick of
// it, each through its own song column (manual: Screens, "independent
// channel advancement").
//
// Every row and tick is placed in MUSIC time, then mapped to video frames by
// the scene's time-remap. The audio renderer converts the same frame numbers
// to samples, so a quarter-speed stretch slows rows, ticks, ARP steps, RTG
// retriggers and GLI slides together on screen and in the WAV.

import { CHORDS, FxCommand } from './fx';
import { roll8, toSigned8 } from './hex';
import { CHAIN_SLOTS, CHANNELS, InstrumentType, Song, Step, chainOf, emptyStep, phraseOf } from './song';
import { EditorState, TransportMode } from './editor';
import { TimeRemap } from './timeRemap';

export interface Session {
  index: number; // transport.session
  mode: TransportMode;
  startFrame: number;
  endFrame: number;
  songRow: number;
  chain: number;
  phrase: number;
}

/** One row played by one channel. Frames are fractional. */
export interface RowEvent {
  session: number;
  channel: number;
  /** Global row count within the session. */
  k: number;
  m0: number;
  m1: number;
  f0: number;
  f1: number;
  songRow: number | null;
  chain: number | null;
  slot: number | null;
  phrase: number;
  step: number;
  ticks: number;
  bpm: number;
  /** PRB passed (or no PRB): the row's note / OFF / FX happened. */
  fired: boolean;
  /** Note actually sounded (after chain transpose), OFF, or nothing. */
  note: number | 'OFF' | null;
  instr: number | null;
}

interface VoiceBase {
  channel: number;
  /** Music seconds (scene clock). */
  m: number;
  /** Video frame, fractional. */
  f: number;
}

export type VoiceEvent =
  | (VoiceBase & {
      kind: 'on';
      instr: number;
      type: InstrumentType;
      note: number; // semitones, PIT included
      vol: number; // 0..255
      pan: number | null; // null = instrument's PAN
      chord: number[]; // extra voices, semitones above `note`
    })
  | (VoiceBase & { kind: 'off' })
  | (VoiceBase & { kind: 'retrig' })
  | (VoiceBase & { kind: 'pitch'; note: number })
  | (VoiceBase & { kind: 'glide'; from: number; to: number; m1: number; f1: number })
  | (VoiceBase & { kind: 'vol'; vol: number })
  | (VoiceBase & { kind: 'pan'; pan: number });

export interface Schedule {
  sessions: Session[];
  /** Per channel, sorted by f0. */
  rows: RowEvent[][];
  /** Every voice event, sorted by frame. */
  voice: VoiceEvent[];
  /** BPM in effect at a frame (TPO changes it for good, like the device). */
  bpmAt(frame: number): number;
}

export interface ScheduleInput {
  remap: TimeRemap;
  durationInFrames: number;
  /** Editor state at a frame (a pure lookup). */
  stateAt(frame: number): EditorState;
  /** Frames where the editor state changes, ascending. */
  changeFrames: number[];
}

// ---------------------------------------------------------------- sessions

export function findSessions(input: ScheduleInput): Session[] {
  const out: Session[] = [];
  let open: Session | null = null;
  const check = (frame: number) => {
    const t = input.stateAt(frame).transport;
    if (open && (!t.playing || t.session !== open.index)) {
      open.endFrame = t.frame;
      out.push(open);
      open = null;
    }
    if (!open && t.playing) {
      open = {
        index: t.session, mode: t.mode, startFrame: t.frame, endFrame: input.durationInFrames,
        songRow: t.songRow, chain: t.chain, phrase: t.phrase,
      };
    }
  };
  check(0);
  for (const f of input.changeFrames) check(f);
  if (open) out.push(open);
  return out;
}

// ---------------------------------------------------------------- channels

interface Pointer {
  songRow: number | null;
  chain: number | null;
  slot: number | null;
  phrase: number;
  step: number;
  transpose: number;
}

interface Channel {
  ptr: Pointer | null; // null = silent
  idle: number; // rows to sit out before scanning forward (start on an empty/END cell)
  stopped: boolean; // reached an END block
  lastInstr: number | null;
  base: number | null; // note the voice was triggered at
  pit: number; // PIT offset
  pitch: number | null; // last pitch sent
  sounding: boolean;
  arp: boolean;
}

const EMPTY_CHAIN_ROWS = 16;
const EMPTY_STEP = emptyStep();

function chainStart(song: Song, chain: number, songRow: number | null): Pointer {
  const slot0 = chainOf(song, chain).slots[0];
  // A chain with nothing in slot 0 plays 16 empty rows (unconfirmed).
  return {
    songRow, chain, slot: 0,
    phrase: slot0.phrase ?? -1,
    step: 0,
    transpose: slot0.transpose,
  };
}

/** Next populated cell below `from` in a song column, wrapping to the top. */
function scanForward(song: Song, ch: number, from: number): { row: number; cell: number | 'END' } | null {
  const rows = song.rows.length;
  for (let i = 1; i <= rows; i++) {
    const r = (from + i) % rows;
    const cell = song.rows[r][ch];
    if (cell !== null) return { row: r, cell };
  }
  return null;
}

function initChannels(sess: Session, song: Song): Channel[] {
  const blank = (): Channel => ({
    ptr: null, idle: 0, stopped: false, lastInstr: null, base: null, pit: 0, pitch: null, sounding: false, arp: false,
  });
  const chans = Array.from({ length: CHANNELS }, blank);
  switch (sess.mode) {
    case 'SONG':
      for (let c = 0; c < CHANNELS; c++) {
        const cell = song.rows[sess.songRow][c];
        if (typeof cell === 'number') chans[c].ptr = chainStart(song, cell, sess.songRow);
        // Starting on an empty or END cell: the channel sits idle for 16 rows,
        // then scans forward as usual (manual: Song END Blocks).
        else if (song.rows.some((r) => r[c] !== null)) chans[c].idle = 16;
      }
      break;
    case 'ROW':
      for (let c = 0; c < CHANNELS; c++) {
        const cell = song.rows[sess.songRow][c];
        if (typeof cell === 'number') chans[c].ptr = chainStart(song, cell, sess.songRow);
      }
      break;
    case 'CHAIN':
      chans[0].ptr = chainStart(song, sess.chain, null);
      break;
    case 'PHRASE':
      chans[0].ptr = { songRow: null, chain: null, slot: null, phrase: sess.phrase, step: 0, transpose: 0 };
      break;
  }
  return chans;
}

const phraseLen = (song: Song, p: Pointer) => (p.phrase < 0 ? EMPTY_CHAIN_ROWS : phraseOf(song, p.phrase).len);

function advance(ch: Channel, c: number, song: Song, mode: TransportMode, hop: number | null) {
  const p = ch.ptr;
  if (!p) return;
  const len = phraseLen(song, p);
  if (hop !== null) {
    // HOP jumps inside the phrase and cancels the end-of-chain advance.
    p.step = hop % len;
    return;
  }
  p.step++;
  if (p.step < len) return;
  p.step = 0;
  if (mode === 'PHRASE') return; // isolation loops the phrase
  const slots = chainOf(song, p.chain!).slots;
  const next = p.slot! + 1;
  if (next < CHAIN_SLOTS && slots[next].phrase !== null && p.phrase >= 0) {
    p.slot = next;
    p.phrase = slots[next].phrase!;
    p.transpose = slots[next].transpose;
    return;
  }
  // Chain finished: it ends at its first empty slot.
  if (mode === 'CHAIN' || mode === 'ROW') {
    ch.ptr = chainStart(song, p.chain!, p.songRow);
    return;
  }
  const found = scanForward(song, c, p.songRow!);
  if (!found) ch.ptr = null;
  else if (found.cell === 'END') {
    ch.ptr = null;
    ch.stopped = true;
  } else ch.ptr = chainStart(song, found.cell, found.row);
}

// ---------------------------------------------------------------- build

function fxOf(step: Step, cmd: FxCommand): number | null {
  if (step.fx[0] === cmd) return step.param[0] ?? 0;
  if (step.fx[1] === cmd) return step.param[1] ?? 0;
  return null;
}

export function buildSchedule(input: ScheduleInput): Schedule {
  const { remap } = input;
  const sessions = findSessions(input);
  const rows: RowEvent[][] = Array.from({ length: CHANNELS }, () => []);
  const voice: VoiceEvent[] = [];
  const bpmChanges: { frame: number; bpm: number }[] = [];
  let tpoBpm: number | null = null; // TPO "permanently changes the project's tempo"

  for (const sess of sessions) {
    const songAt = (frame: number) => input.stateAt(Math.max(0, Math.floor(frame + 1e-9))).song;
    const startSong = songAt(sess.startFrame);
    const chans = initChannels(sess, startSong);
    let bpm: number = tpoBpm ?? startSong.project.bpm;
    let projectBpm = startSong.project.bpm;
    const mEnd = remap.musicAt(sess.endFrame);
    let t = remap.musicAt(sess.startFrame);

    for (let k = 0; t < mEnd - 1e-9; k++) {
      const f0 = remap.frameAt(t);
      const song = songAt(f0);
      const { speed, swing } = song.project;
      if (song.project.bpm !== projectBpm) {
        // BPM edited while playing: the new tempo takes over.
        projectBpm = song.project.bpm;
        bpm = projectBpm;
      }
      const base = 60 / bpm / 4;
      const dur = swing ? base * (1 + ((k % 2 === 0 ? 1 : -1) * swing) / 100) : base;
      const t1 = t + dur;
      const f1 = remap.frameAt(t1);
      const tick = (j: number) => {
        const m = t + (j * dur) / speed;
        return { m, f: remap.frameAt(m) };
      };
      let nextBpm: number = bpm;

      chans.forEach((ch, c) => {
        if (ch.idle > 0) {
          ch.idle--;
          if (ch.idle === 0) {
            const found = scanForward(song, c, sess.songRow);
            if (found && found.cell !== 'END') ch.ptr = chainStart(song, found.cell, found.row);
            else if (found) ch.stopped = true;
          }
          return;
        }
        const p = ch.ptr;
        if (!p) return;
        const step: Step = p.phrase < 0 ? EMPTY_STEP : phraseOf(song, p.phrase).steps[p.step];

        // PRB gates the whole step; two PRBs roll independently and both must pass.
        let fired = true;
        [0, 1].forEach((lane) => {
          if (step.fx[lane] !== 'PRB') return;
          const chance = step.param[lane] ?? 0;
          if (!(chance === 0xff || roll8(sess.index, c, k, lane) < chance)) fired = false;
        });

        const at0 = { channel: c, m: t, f: f0 };
        let played: number | 'OFF' | null = null;
        let hop: number | null = null;
        const instrId = step.instr ?? ch.lastInstr;
        const instrument = instrId === null ? undefined : song.instruments[instrId];
        const isDrum = instrument?.type === 'DRUM';

        if (fired) {
          const vol = fxOf(step, 'VOL');
          const pan = fxOf(step, 'PAN');
          const pit = fxOf(step, 'PIT');
          const gli = fxOf(step, 'GLI');
          const arp = gli === null ? fxOf(step, 'ARP') : null; // GLI wins over ARP
          const chd = fxOf(step, 'CHD');
          const kil = fxOf(step, 'KIL');
          const rtg = fxOf(step, 'RTG');
          hop = fxOf(step, 'HOP');
          const tpo = fxOf(step, 'TPO');
          if (tpo !== null && tpo >= 0x28) nextBpm = tpo;

          if (pit !== null) ch.pit = toSigned8(pit);
          const hasNote = typeof step.note === 'number';

          if (hasNote && instrId !== null && instrument) {
            const note = Math.max(0, Math.min(127, (step.note as number) + (isDrum ? 0 : p.transpose)));
            played = note;
            if (pit === null) ch.pit = 0;
            const target = note + ch.pit;
            if (gli !== null && gli > 0 && ch.sounding && ch.pitch !== null && !isDrum) {
              const end = tick(gli);
              voice.push({ ...at0, kind: 'glide', from: ch.pitch, to: target, m1: end.m, f1: end.f });
            } else {
              voice.push({
                ...at0, kind: 'on', instr: instrId, type: instrument.type, note: target,
                vol: vol ?? 0xff, pan,
                chord: chd !== null && !isDrum ? CHORDS[chd]?.intervals ?? [] : [],
              });
            }
            ch.lastInstr = instrId;
            ch.base = note;
            ch.pitch = target;
            ch.sounding = true;
          } else if (step.note === 'OFF') {
            played = 'OFF';
            voice.push({ ...at0, kind: 'off' });
            ch.sounding = false;
          }

          if (!hasNote || gli !== null) {
            if (vol !== null) voice.push({ ...at0, kind: 'vol', vol });
            if (pan !== null) voice.push({ ...at0, kind: 'pan', pan });
          }
          if (pit !== null && !hasNote && ch.base !== null) {
            ch.pitch = ch.base + ch.pit;
            voice.push({ ...at0, kind: 'pitch', note: ch.pitch });
          }

          if (ch.sounding && ch.base !== null && !isDrum) {
            if (arp !== null && arp > 0) {
              const x = arp >> 4;
              const y = arp & 0xf;
              const cycle = y === 0 ? [0, x] : [0, x, y];
              for (let j = 0; j < speed; j++) {
                const target = ch.base + ch.pit + cycle[j % cycle.length];
                if (target !== ch.pitch) {
                  voice.push({ channel: c, ...tick(j), kind: 'pitch', note: target });
                  ch.pitch = target;
                }
              }
              ch.arp = true;
            } else if (ch.arp) {
              // ARP is a row command: a row without it lands back on the note.
              const target = ch.base + ch.pit;
              if (target !== ch.pitch) voice.push({ ...at0, kind: 'pitch', note: target });
              ch.pitch = target;
              ch.arp = false;
            }
          }

          if (rtg !== null && ch.sounding) {
            const every = rtg === 0 ? 1 : rtg;
            if (every >= speed) {
              if (!hasNote) voice.push({ ...at0, kind: 'retrig' });
            } else {
              for (let j = hasNote ? every : 0; j < speed; j += every) {
                voice.push({ channel: c, ...tick(j), kind: 'retrig' });
              }
            }
          }
          if (kil !== null && kil < speed && ch.sounding) {
            voice.push({ channel: c, ...tick(kil), kind: 'off' });
            ch.sounding = false;
          }
        } else if (ch.arp && ch.base !== null) {
          const target = ch.base + ch.pit;
          if (target !== ch.pitch) voice.push({ ...at0, kind: 'pitch', note: target });
          ch.pitch = target;
          ch.arp = false;
        }

        rows[c].push({
          session: sess.index, channel: c, k, m0: t, m1: t1, f0, f1,
          songRow: p.songRow, chain: p.chain, slot: p.slot, phrase: p.phrase, step: p.step,
          ticks: speed, bpm, fired, note: played, instr: played === null ? null : instrId,
        });
        advance(ch, c, song, sess.mode, hop);
      });

      if (nextBpm !== bpm) {
        tpoBpm = nextBpm;
        bpmChanges.push({ frame: f1, bpm: nextBpm });
      }
      bpm = nextBpm;
      t = t1;
    }

    // Stopping releases whatever is still sounding.
    const fStop = sess.endFrame;
    const mStop = remap.musicAt(fStop);
    chans.forEach((ch, c) => {
      if (ch.sounding) voice.push({ channel: c, m: mStop, f: fStop, kind: 'off' });
    });
  }

  voice.sort((a, b) => a.f - b.f);
  return {
    sessions,
    rows,
    voice,
    bpmAt(frame: number): number {
      let bpm = input.stateAt(Math.max(0, Math.floor(frame))).song.project.bpm;
      for (const ch of bpmChanges) if (ch.frame <= frame) bpm = ch.bpm;
      return bpm;
    },
  };
}

/** The row a channel is playing at `frame`, if any (binary search). */
export function rowAt(rows: RowEvent[], frame: number): RowEvent | null {
  let lo = 0;
  let hi = rows.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].f0 <= frame) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  const r = rows[found];
  return frame < r.f1 ? r : null;
}

/** Rows that started within `window` frames before `frame` (for flashes). */
export function recentRows(rows: RowEvent[], frame: number, window: number): RowEvent[] {
  const out: RowEvent[] = [];
  let lo = 0;
  let hi = rows.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].f0 <= frame) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  for (let i = found; i >= 0 && frame - rows[i].f0 < window; i--) out.push(rows[i]);
  return out;
}
