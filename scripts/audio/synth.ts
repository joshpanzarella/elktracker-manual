// Placeholder sound engine: simple voices standing in for ElkTracker's, until
// the real device is recorded. What matters here is WHEN things happen, and
// that comes from the scene's schedule, which the picture uses too.
//
// Tonal voices (SUB; other engines fall back to it): three oscillators,
// ADSR, resonant low-pass. One voice per channel plus chord voices (CHD).
// DRUM: eight pads of synthesized drums from a shared pool of 16 voices.
// Envelopes run in real time; triggers, ARP steps, retriggers and glides
// arrive at the frames the time-remap gives them, so a quarter-speed stretch
// slows the sequencer, not the sound.

import { Instrument } from '../../src/engine/song';
import { Scene } from '../../src/engine/scene';
import { VoiceEvent } from '../../src/engine/sequencer';
import { CHANNELS } from '../../src/engine/song';

const BLOCK = 32;
const VOICE_GAIN = 0.28;

const hexParam = (v: unknown, fallback: number): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^[0-9a-f]{1,2}$/i.test(v)) return parseInt(v, 16);
  return fallback;
};
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);

/** Hex 00..FF -> 0..4 s, finer at the short end. */
const envSeconds = (x: number) => 4 * (x / 255) ** 2;
/** Hex level -> gain, roughly perceptual. */
const level = (x: number) => (x / 255) ** 2;

function panGains(pan: number): [number, number] {
  // Equal power; 00 = hard left, 80 = centre, FF = hard right.
  const p = pan <= 0x80 ? (pan / 0x80) * 0.5 : 0.5 + ((pan - 0x80) / 0x7f) * 0.5;
  const a = (p * Math.PI) / 2;
  return [Math.cos(a), Math.sin(a)];
}

const mtof = (note: number) => 440 * 2 ** ((note - 69) / 12);

// ---------------------------------------------------------------- tonal voice

type Wave = 'SAW' | 'SQR' | 'TRI' | 'SIN' | 'NSE' | 'OFF';

interface ToneParams {
  gain: number;
  pan: number;
  cutoffHz: number | null; // null = filter bypassed
  q: number;
  a: number;
  d: number;
  s: number;
  r: number;
  semi: number;
  fine: number;
  osc: Array<{ wave: Wave; ratio: number; level: number }>;
}

function toneParams(ins: Instrument): ToneParams {
  const p = ins.params;
  const env = (p.env ?? {}) as Record<string, unknown>;
  const cutoff = hexParam(p.cutoff, 0xff);
  const res = hexParam(p.res, 0);
  const oscJson = Array.isArray(p.osc) ? (p.osc as Array<Record<string, unknown>>) : [];
  const fallbackWave: Wave = ins.type === 'CHIP' ? 'SQR' : 'SAW';
  const osc = (oscJson.length ? oscJson : [{ wave: fallbackWave }]).map((o) => ({
    wave: String(o.wave ?? 'SAW').toUpperCase() as Wave,
    ratio: 2 ** (num(o.semi, 0) / 12 + num(o.fine, 0) / 1200),
    level: level(hexParam(o.level, 0xff)),
  })).filter((o) => o.wave !== 'OFF');
  return {
    gain: level(hexParam(p.volume, 0xc0)),
    pan: hexParam(p.pan, 0x80),
    cutoffHz: cutoff === 0xff && res === 0 ? null : 20 * 700 ** (cutoff / 255),
    q: 0.5 + (res / 255) * 9.5,
    a: Math.max(0.002, envSeconds(hexParam(env.a, 0))),
    d: Math.max(0.005, envSeconds(hexParam(env.d, 0x40))),
    s: hexParam(env.s, 0xc0) / 255,
    r: Math.max(0.006, envSeconds(hexParam(env.r, 0x20))),
    semi: num(p.semi, 0),
    fine: num(p.fine, 0),
    osc,
  };
}

function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

let noiseSeed = 0x12345678;
function noise(): number {
  noiseSeed ^= noiseSeed << 13;
  noiseSeed ^= noiseSeed >>> 17;
  noiseSeed ^= noiseSeed << 5;
  return ((noiseSeed >>> 0) / 4294967296) * 2 - 1;
}

class ToneVoice {
  note = 60;
  vol = 1;
  panOverride: number | null = null;
  glide: { from: number; to: number; m0: number; m1: number } | null = null;
  private phases: number[];
  private env = 0;
  private stage: 'A' | 'D' | 'S' | 'R' | 'OFF' = 'A';
  private attackFrom = 0;
  private attackPos = 0;
  private ic1 = 0;
  private ic2 = 0;
  private fastRelease = false;

  constructor(private p: ToneParams, private sr: number) {
    this.phases = p.osc.map(() => 0);
  }

  get done() {
    return this.stage === 'OFF';
  }

  trigger() {
    this.attackFrom = this.env;
    this.attackPos = 0;
    this.stage = 'A';
    this.fastRelease = false;
  }

  release(fast = false) {
    if (this.stage === 'OFF') return;
    this.stage = 'R';
    this.fastRelease = fast;
  }

  render(L: Float32Array, R: Float32Array, a: number, b: number, noteNow: number) {
    const p = this.p;
    const sr = this.sr;
    const freq = mtof(noteNow + p.semi + p.fine / 100);
    const [gl, gr] = panGains(this.panOverride ?? p.pan);
    const amp = VOICE_GAIN * p.gain * this.vol;
    let g = 0, k = 0, a1 = 0, a2 = 0, a3 = 0;
    const filtered = p.cutoffHz !== null;
    if (filtered) {
      g = Math.tan((Math.PI * Math.min(p.cutoffHz!, sr * 0.45)) / sr);
      k = 1 / p.q;
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
    const aRate = 1 / (p.a * sr);
    const dCoef = Math.exp(-1 / ((p.d / 4) * sr));
    const rCoef = Math.exp(-1 / (((this.fastRelease ? 0.004 : p.r) / 4) * sr));
    for (let i = a; i < b; i++) {
      // Envelope
      switch (this.stage) {
        case 'A':
          this.attackPos += aRate;
          this.env = this.attackFrom + (1 - this.attackFrom) * Math.min(1, this.attackPos);
          if (this.attackPos >= 1) this.stage = 'D';
          break;
        case 'D':
          this.env = p.s + (this.env - p.s) * dCoef;
          if (Math.abs(this.env - p.s) < 1e-4) this.stage = 'S';
          break;
        case 'S':
          this.env = p.s;
          break;
        case 'R':
          this.env *= rCoef;
          if (this.env < 1e-4) {
            this.env = 0;
            this.stage = 'OFF';
          }
          break;
        case 'OFF':
          return;
      }
      // Oscillators
      let x = 0;
      for (let o = 0; o < p.osc.length; o++) {
        const osc = p.osc[o];
        const dt = (freq * osc.ratio) / sr;
        let ph = this.phases[o] + dt;
        if (ph >= 1) ph -= 1;
        this.phases[o] = ph;
        let v = 0;
        switch (osc.wave) {
          case 'SAW': v = 2 * ph - 1 - polyBlep(ph, dt); break;
          case 'SQR': v = (ph < 0.5 ? 1 : -1) + polyBlep(ph, dt) - polyBlep((ph + 0.5) % 1, dt); break;
          case 'TRI': v = 4 * Math.abs(ph - 0.5) - 1; break;
          case 'SIN': v = Math.sin(2 * Math.PI * ph); break;
          case 'NSE': v = noise(); break;
        }
        x += v * osc.level;
      }
      if (filtered) {
        const v3 = x - this.ic2;
        const v1 = a1 * this.ic1 + a2 * v3;
        const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
        this.ic1 = 2 * v1 - this.ic1;
        this.ic2 = 2 * v2 - this.ic2;
        x = v2;
      }
      const out = x * this.env * amp;
      L[i] += out * gl;
      R[i] += out * gr;
    }
  }
}

// ---------------------------------------------------------------- drums

type DrumKind = 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'tom' | 'rim';
const DRUMS: DrumKind[] = ['kick', 'snare', 'clap', 'hat', 'openhat', 'tom', 'rim'];

class DrumVoice {
  private t = 0;
  private phase = 0;
  private hp = 0;
  private lastNoise = 0;
  private bp1 = 0;
  private bp2 = 0;
  private fade = 1;
  private fading = false;
  vol = 1;
  done = false;

  constructor(readonly kind: DrumKind, readonly channel: number, readonly choke: number, private gain: number, private pan: number, private sr: number) {}

  release() {
    this.fading = true;
  }

  render(L: Float32Array, R: Float32Array, a: number, b: number) {
    const sr = this.sr;
    const [gl, gr] = panGains(this.pan);
    for (let i = a; i < b; i++) {
      const t = this.t / sr;
      let x = 0;
      switch (this.kind) {
        case 'kick': {
          const f = 48 + 110 * Math.exp(-t / 0.035);
          this.phase += f / sr;
          x = Math.sin(2 * Math.PI * this.phase) * Math.exp(-t / 0.28) * 1.1;
          if (t < 0.003) x += noise() * 0.4 * (1 - t / 0.003);
          break;
        }
        case 'snare': {
          const n = noise();
          this.hp = n - this.lastNoise;
          this.lastNoise = n;
          this.phase += 188 / sr;
          x = this.hp * 0.55 * Math.exp(-t / 0.13) + Math.sin(2 * Math.PI * this.phase) * 0.6 * Math.exp(-t / 0.05);
          break;
        }
        case 'clap': {
          // Three quick bursts 10 ms apart, then the tail.
          const burst = t < 0.03 ? Math.exp(-(t % 0.01) / 0.003) : Math.exp(-(t - 0.03) / 0.12);
          const n = noise();
          this.bp1 += 0.35 * (n - this.bp1);
          this.bp2 += 0.35 * (this.bp1 - this.bp2);
          x = (this.bp1 - this.bp2) * 2.2 * burst;
          break;
        }
        case 'hat':
        case 'openhat': {
          const n = noise();
          this.hp = n - this.lastNoise;
          this.lastNoise = n;
          x = this.hp * 0.32 * Math.exp(-t / (this.kind === 'hat' ? 0.035 : 0.28));
          break;
        }
        case 'tom': {
          const f = 105 + 70 * Math.exp(-t / 0.06);
          this.phase += f / sr;
          x = Math.sin(2 * Math.PI * this.phase) * Math.exp(-t / 0.22) * 0.8;
          break;
        }
        case 'rim': {
          this.phase += 820 / sr;
          x = (Math.sin(2 * Math.PI * this.phase) + 0.5 * Math.sin(2 * Math.PI * this.phase * 2.07)) * Math.exp(-t / 0.018) * 0.6;
          break;
        }
      }
      if (this.fading) {
        this.fade *= 0.995;
        if (this.fade < 1e-3) {
          this.done = true;
          return;
        }
      }
      const out = x * VOICE_GAIN * this.gain * this.vol * this.fade;
      L[i] += out * gl;
      R[i] += out * gr;
      this.t++;
      if (t > 1.5) {
        this.done = true;
        return;
      }
    }
  }
}

function padKind(ins: Instrument, pad: number): { kind: DrumKind; choke: number } | null {
  const pads = Array.isArray(ins.params.pads) ? (ins.params.pads as Array<Record<string, unknown>>) : [];
  const p = pads[pad];
  if (!p) return null;
  const sample = String(p.sample ?? '');
  const m = /^synth:(\w+)$/.exec(sample);
  if (!m || !DRUMS.includes(m[1] as DrumKind)) return null; // WAV pads: not built yet
  return { kind: m[1] as DrumKind, choke: num(p.choke, 0) };
}

// ---------------------------------------------------------------- render

interface ChannelVoices {
  main: ToneVoice | null;
  chord: ToneVoice[];
  chordIntervals: number[];
  /** Chord voices sit on the note that was triggered: ARP moves only the
   *  main voice, GLI moves both (manual: Phrase FX, CHD). */
  chordBase: number;
  chordGlide: { from: number; to: number; m0: number; m1: number } | null;
  dying: ToneVoice[];
  lastPad: number | null;
  lastDrumInstr: number | null;
}

export interface RenderedAudio {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}

export function renderSceneAudio(scene: Scene, sampleRate = 48000): RenderedAudio {
  const { fps, durationInFrames } = scene.timeline;
  const n = Math.ceil((durationInFrames / fps) * sampleRate);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  noiseSeed = 0x12345678; // same noise every render
  const song = scene.song;
  const chans: ChannelVoices[] = Array.from({ length: CHANNELS }, () => ({
    main: null, chord: [], chordIntervals: [], chordBase: 60, chordGlide: null, dying: [], lastPad: null, lastDrumInstr: null,
  }));
  let drums: DrumVoice[] = [];
  const toneCache = new WeakMap<Instrument, ToneParams>();
  const instrumentAt = (id: number, frame: number) => scene.stateAt(Math.floor(frame)).song.instruments[id] ?? song.instruments[id];
  const tone = (ins: Instrument) => {
    if (!toneCache.has(ins)) toneCache.set(ins, toneParams(ins));
    return toneCache.get(ins)!;
  };
  const sampleOf = (f: number) => Math.max(0, Math.min(n, Math.round((f / fps) * sampleRate)));
  const musicAtSample = (s: number) => scene.remap.musicAt((s / sampleRate) * fps);

  const glidePitch = (g: { from: number; to: number; m0: number; m1: number }, s: number): { pitch: number; done: boolean } => {
    const m = musicAtSample(s);
    const k = g.m1 > g.m0 ? Math.max(0, Math.min(1, (m - g.m0) / (g.m1 - g.m0))) : 1;
    return { pitch: g.from + (g.to - g.from) * k, done: k >= 1 };
  };

  const renderRange = (a: number, b: number) => {
    if (b <= a) return;
    for (const ch of chans) {
      if (ch.main) {
        let pitch = ch.main.note;
        if (ch.main.glide) {
          const g = glidePitch(ch.main.glide, a);
          pitch = g.pitch;
          if (g.done) ch.main.glide = null;
        }
        ch.main.render(L, R, a, b, pitch);
        let base = ch.chordBase;
        if (ch.chordGlide) {
          const g = glidePitch(ch.chordGlide, a);
          base = g.pitch;
          if (g.done) ch.chordGlide = null;
        }
        ch.chord.forEach((v, i) => v.render(L, R, a, b, base + ch.chordIntervals[i]));
      }
      ch.dying.forEach((v) => v.render(L, R, a, b, v.note));
      ch.dying = ch.dying.filter((v) => !v.done);
      if (ch.main?.done) ch.main = null;
    }
    drums.forEach((d) => d.render(L, R, a, b));
    drums = drums.filter((d) => !d.done);
  };

  const apply = (e: VoiceEvent) => {
    const ch = chans[e.channel];
    switch (e.kind) {
      case 'on': {
        const ins = instrumentAt(e.instr, e.f);
        if (!ins || ins.type === 'MIDI') return;
        if (ins.type === 'DRUM') {
          const pad = Math.round(e.note) - 60; // C-4..G-4 = pads 0..7
          if (pad < 0 || pad > 7) return;
          const kind = padKind(ins, pad);
          ch.lastPad = pad;
          ch.lastDrumInstr = e.instr;
          if (!kind) return;
          if (kind.choke > 0) drums.filter((d) => d.choke === kind.choke).forEach((d) => d.release());
          if (drums.length >= 16) drums.shift()!.release();
          const vol = level(hexParam(ins.params.volume, 0xff));
          drums.push(new DrumVoice(kind.kind, e.channel, kind.choke, vol * level(e.vol), e.pan ?? hexParam(ins.params.pan, 0x80), sampleRate));
          return;
        }
        // One voice per channel: the old one gets out of the way quickly.
        if (ch.main) {
          ch.main.release(true);
          ch.dying.push(ch.main);
        }
        ch.chord.forEach((v) => {
          v.release(true);
          ch.dying.push(v);
        });
        const params = tone(ins);
        const v = new ToneVoice(params, sampleRate);
        v.note = e.note;
        v.vol = level(e.vol);
        v.panOverride = e.pan;
        v.trigger();
        ch.main = v;
        ch.chordBase = e.note;
        ch.chordGlide = null;
        ch.chordIntervals = e.chord.slice();
        ch.chord = e.chord.map((iv) => {
          const c = new ToneVoice(params, sampleRate);
          c.note = e.note + iv;
          c.vol = v.vol * 0.8;
          c.panOverride = e.pan;
          c.trigger();
          return c;
        });
        return;
      }
      case 'off':
        ch.main?.release();
        ch.chord.forEach((v) => v.release());
        drums.filter((d) => d.channel === e.channel).forEach((d) => d.release());
        return;
      case 'retrig':
        if (ch.main) {
          ch.main.trigger();
          ch.chord.forEach((v) => v.trigger());
        } else if (ch.lastPad !== null && ch.lastDrumInstr !== null) {
          apply({ ...e, kind: 'on', instr: ch.lastDrumInstr, type: 'DRUM', note: 60 + ch.lastPad, vol: 0xff, pan: null, chord: [] });
        }
        return;
      case 'pitch':
        if (ch.main) {
          ch.main.glide = null;
          ch.main.note = e.note;
        }
        return;
      case 'glide':
        if (ch.main) {
          ch.main.glide = { from: e.from, to: e.to, m0: e.m, m1: e.m1 };
          ch.main.note = e.to;
          ch.chordGlide = { from: ch.chordBase, to: e.to, m0: e.m, m1: e.m1 };
          ch.chordBase = e.to;
        }
        return;
      case 'vol':
        if (ch.main) ch.main.vol = level(e.vol);
        drums.filter((d) => d.channel === e.channel).forEach((d) => (d.vol = level(e.vol)));
        return;
      case 'pan':
        if (ch.main) ch.main.panOverride = e.pan;
        return;
    }
  };

  const events = scene.schedule.voice;
  let ei = 0;
  for (let s = 0; s < n; s += BLOCK) {
    const end = Math.min(n, s + BLOCK);
    let pos = s;
    while (ei < events.length && sampleOf(events[ei].f) < end) {
      const at = Math.max(pos, sampleOf(events[ei].f));
      renderRange(pos, at);
      apply(events[ei]);
      pos = at;
      ei++;
    }
    renderRange(pos, end);
  }

  // The scene's fade-out, in step with the picture's.
  const fadeSamples = Math.round((scene.timeline.fadeOut / fps) * sampleRate);
  for (let i = Math.max(0, n - fadeSamples); i < n; i++) {
    const g = (n - i) / fadeSamples;
    L[i] *= g;
    R[i] *= g;
  }

  // Master limiter: soft knee above 0.7 so stacked voices never clip.
  for (const buf of [L, R]) {
    for (let i = 0; i < n; i++) {
      const x = buf[i];
      const ax = Math.abs(x);
      if (ax > 0.7) buf[i] = Math.sign(x) * (0.7 + 0.3 * Math.tanh((ax - 0.7) / 0.3));
    }
  }
  return { sampleRate, left: L, right: R };
}
