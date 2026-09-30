// timeline.json: everything that happens, at the frame it happens.
//
// Device input (what a person does on the handheld):
//   { "frame": 40, "press": "A" }                 tap A
//   { "frame": 50, "press": "A+RIGHT" }           hold A, press RIGHT
//   { "frame": 60, "press": "DOWN", "repeat": 4, "every": 3 }
// Direct edits (escape hatches when button-by-button is not the point):
//   { "frame": 0, "cursor": { "row": 3, "col": "FX1" } }
//   { "frame": 0, "set": { "phrase": "00", "step": "03", "col": "NOT" }, "value": "D#4" }
//   { "frame": 0, "view": "CHAIN", "chain": "00" }
// Presentation (what the video adds on top):
//   { "frame": 0, "caption": "Text", "title": "Optional", "until": 90 }
//   { "frame": 200, "callout": "phrase.col.NOT", "label": "NOT", "text": "...", "until": 260 }
//   { "frame": 180, "camera": "phrase.steps", "zoom": 2, "ease": 20 }
//   { "frame": 500, "rate": 0.25, "ramp": 0 }   playback speed (the time-remap)

import { parseIndex } from './hex';

export const VIEWS = [
  'SONG', 'CHAIN', 'PHRASE', 'INSTRUMENT', 'TRACK', 'MIXER', 'PROJECT', 'SETTINGS',
] as const;
export type ViewName = (typeof VIEWS)[number];

export const BUTTONS = [
  'A', 'B', 'X', 'Y', 'L', 'R', 'L2', 'R2', 'SELECT', 'START', 'UP', 'DOWN', 'LEFT', 'RIGHT',
] as const;
export type Button = (typeof BUTTONS)[number];

const BUTTON_ALIASES: Record<string, Button> = {
  L1: 'L', R1: 'R', SEL: 'SELECT', '↑': 'UP', '↓': 'DOWN', '←': 'LEFT', '→': 'RIGHT',
};

/** A place on the screen: a named anchor, a list of anchors (the box around
 *  them all), cells, or device pixels. */
export type TargetSpec =
  | string
  | string[]
  | { col: number; row: number; w?: number; h?: number }
  | { x: number; y: number; w: number; h: number };

export type CellRef = string | number;

interface Base {
  frame: number;
  /** Position in timeline.json, to keep file order among same-frame events. */
  seq: number;
}

export interface PressEvent extends Base {
  kind: 'press';
  hold: Button | null;
  button: Button;
  /** "A+RIGHT" style, canonical. */
  combo: string;
}
export interface CursorEvent extends Base {
  kind: 'cursor';
  row?: CellRef;
  col?: CellRef;
}
export interface SetEvent extends Base {
  kind: 'set';
  target: {
    phrase?: CellRef; step?: CellRef; col?: CellRef;
    chain?: CellRef; slot?: CellRef;
    songRow?: CellRef; channel?: number;
    project?: string;
  };
  value: string | number;
}
export interface ViewEvent extends Base {
  kind: 'view';
  view: ViewName;
  chain?: number;
  phrase?: number;
  instrument?: number;
}
export interface CaptionEvent extends Base {
  kind: 'caption';
  text: string;
  title?: string;
  until: number | null;
}
export interface CalloutEvent extends Base {
  kind: 'callout';
  target: TargetSpec;
  label: string;
  text?: string;
  until: number | null;
  side?: 'left' | 'right' | 'top' | 'bottom';
}
export interface CameraEvent extends Base {
  kind: 'camera';
  target: TargetSpec; // "screen" = the whole screen
  zoom?: number;
  ease: number;
}
export interface RateEvent extends Base {
  kind: 'rate';
  rate: number;
  ramp: number;
}

export type DeviceEvent = PressEvent | CursorEvent | SetEvent | ViewEvent;
export type TimelineEvent = DeviceEvent | CaptionEvent | CalloutEvent | CameraEvent | RateEvent;

export interface StartState {
  view: ViewName;
  chain: number;
  phrase: number;
  instrument: number;
  songRow: number;
  songChannel: number;
  cursor?: { row?: CellRef; col?: CellRef };
}

export interface Timeline {
  fps: number;
  durationInFrames: number;
  /** Frames to fade in from black at the start / out at the end (picture and sound). */
  fadeIn: number;
  fadeOut: number;
  start: StartState;
  events: TimelineEvent[]; // sorted by frame, then file order
}

export interface TimelineJson {
  fps: number;
  durationInFrames: number;
  fadeIn?: number;
  fadeOut?: number;
  start?: {
    view?: string;
    chain?: CellRef;
    phrase?: CellRef;
    instrument?: CellRef;
    songRow?: CellRef;
    songChannel?: number;
    cursor?: { row?: CellRef; col?: CellRef };
  };
  events: Array<Record<string, unknown>>;
}

export function parseButton(name: string, where: string): Button {
  const up = name.trim().toUpperCase();
  const b = BUTTON_ALIASES[up] ?? up;
  if (!(BUTTONS as readonly string[]).includes(b)) {
    throw new Error(`${where}: unknown button "${name}" (use ${BUTTONS.join(', ')})`);
  }
  return b as Button;
}

export function parseView(name: string, where: string): ViewName {
  const v = name.trim().toUpperCase();
  if (!(VIEWS as readonly string[]).includes(v)) throw new Error(`${where}: unknown view "${name}" (use ${VIEWS.join(', ')})`);
  return v as ViewName;
}

function parsePress(combo: string, where: string): { hold: Button | null; button: Button; combo: string } {
  const parts = combo.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    const button = parseButton(parts[0], where);
    return { hold: null, button, combo: button };
  }
  if (parts.length === 2) {
    const hold = parseButton(parts[0], where);
    const button = parseButton(parts[1], where);
    return { hold, button, combo: `${hold}+${button}` };
  }
  throw new Error(`${where}: a press is one button or HOLD+BUTTON, got "${combo}"`);
}

const num = (v: unknown, where: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${where}: expected a number, got ${JSON.stringify(v)}`);
  return v;
};

const optUntil = (e: Record<string, unknown>, where: string): number | null =>
  e.until === undefined ? null : num(e.until, `${where} until`);

export function parseTimeline(json: TimelineJson): Timeline {
  const fps = num(json.fps, 'timeline fps');
  const durationInFrames = num(json.durationInFrames, 'timeline durationInFrames');
  const s = json.start ?? {};
  const start: StartState = {
    view: parseView(s.view ?? 'SONG', 'start.view'),
    chain: s.chain === undefined ? 0 : parseIndex(s.chain, 'start.chain'),
    phrase: s.phrase === undefined ? 0 : parseIndex(s.phrase, 'start.phrase'),
    instrument: s.instrument === undefined ? 0 : parseIndex(s.instrument, 'start.instrument'),
    songRow: s.songRow === undefined ? 0 : parseIndex(s.songRow, 'start.songRow'),
    // Channels are numbered 1..8, as the Song screen shows them (C1..C8).
    songChannel: s.songChannel === undefined ? 0 : s.songChannel - 1,
    cursor: s.cursor,
  };

  const events: TimelineEvent[] = [];
  let seq = 0;
  json.events.forEach((e, i) => {
    const where = `timeline event #${i} (frame ${String(e.frame)})`;
    const frame = num(e.frame, `${where} frame`);
    if (frame < 0) throw new Error(`${where}: frame must be >= 0`);
    const repeat = e.repeat === undefined ? 1 : num(e.repeat, `${where} repeat`);
    const every = e.every === undefined ? 0 : num(e.every, `${where} every`);
    if (repeat > 1 && !(every > 0)) throw new Error(`${where}: "repeat" needs "every" (frames between repeats)`);
    for (let r = 0; r < repeat; r++) {
      const f = frame + r * every;
      const base = { frame: f, seq: seq++ };
      if (typeof e.press === 'string') {
        events.push({ kind: 'press', ...base, ...parsePress(e.press, where) });
      } else if (e.cursor !== undefined) {
        const c = e.cursor as { row?: CellRef; col?: CellRef };
        events.push({ kind: 'cursor', ...base, row: c.row, col: c.col });
      } else if (e.set !== undefined) {
        if (e.value === undefined) throw new Error(`${where}: "set" needs a "value"`);
        events.push({ kind: 'set', ...base, target: e.set as SetEvent['target'], value: e.value as string | number });
      } else if (typeof e.view === 'string') {
        events.push({
          kind: 'view', ...base,
          view: parseView(e.view, where),
          chain: e.chain === undefined ? undefined : parseIndex(e.chain as CellRef, `${where} chain`),
          phrase: e.phrase === undefined ? undefined : parseIndex(e.phrase as CellRef, `${where} phrase`),
          instrument: e.instrument === undefined ? undefined : parseIndex(e.instrument as CellRef, `${where} instrument`),
        });
      } else if (typeof e.caption === 'string') {
        events.push({
          kind: 'caption', ...base, text: e.caption,
          title: typeof e.title === 'string' ? e.title : undefined,
          until: optUntil(e, where),
        });
      } else if (e.callout !== undefined) {
        events.push({
          kind: 'callout', ...base,
          target: e.callout as TargetSpec,
          label: typeof e.label === 'string' ? e.label : '',
          text: typeof e.text === 'string' ? e.text : undefined,
          until: optUntil(e, where),
          side: e.side as CalloutEvent['side'],
        });
      } else if (e.camera !== undefined) {
        events.push({
          kind: 'camera', ...base,
          target: e.camera as TargetSpec,
          zoom: e.zoom === undefined ? undefined : num(e.zoom, `${where} zoom`),
          ease: e.ease === undefined ? 0 : num(e.ease, `${where} ease`),
        });
      } else if (e.rate !== undefined) {
        events.push({
          kind: 'rate', ...base,
          rate: num(e.rate, `${where} rate`),
          ramp: e.ramp === undefined ? 0 : num(e.ramp, `${where} ramp`),
        });
      } else {
        throw new Error(`${where}: needs one of press, cursor, set, view, caption, callout, camera, rate`);
      }
    }
  });
  events.sort((a, b) => a.frame - b.frame || a.seq - b.seq);
  const fadeIn = json.fadeIn === undefined ? 0 : num(json.fadeIn, 'timeline fadeIn');
  const fadeOut = json.fadeOut === undefined ? 0 : num(json.fadeOut, 'timeline fadeOut');
  return { fps, durationInFrames, fadeIn, fadeOut, start, events };
}

export const isDeviceEvent = (e: TimelineEvent): e is DeviceEvent =>
  e.kind === 'press' || e.kind === 'cursor' || e.kind === 'set' || e.kind === 'view';
