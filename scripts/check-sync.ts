// npm run check-sync [scene-id] [-- --wav path/to/audio.wav]
//
// Listens to the rendered audio and checks it against the schedule the
// picture is drawn from. Three measurements, each reported by playback rate
// so quarter speed and full tempo are both covered:
//
//  attacks  notes that start out of quiet: where the level actually rises
//  drums    pad hits: where the transient (first difference) jumps
//  pitch    legato notes and ARP steps: the pitch heard just before and just
//           after the scheduled moment must be the old and the new note, so
//           a change that came early or late by more than ~2 ms fails
//
// --wav checks another file against the scene (e.g. audio pulled back out
// of the rendered MP4), so the muxed result can be verified too.
// Exits 1 on any failure.

import fs from 'node:fs';
import path from 'node:path';
import { SCENES } from '../src/data/scenes';
import { loadScene } from '../src/engine/scene';
import { VoiceEvent } from '../src/engine/sequencer';
import { theme } from '../src/theme';
import { decodeWav } from './audio/wav';

const ATTACK_TOLERANCE_MS = 3;
const PITCH_TOLERANCE = 0.03;

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const wavArg = argv.includes('--wav') ? argv[argv.indexOf('--wav') + 1] : null;
const only = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--wav');
let failed = false;

type On = Extract<VoiceEvent, { kind: 'on' }>;

for (const data of SCENES) {
  if (only.length && !only.includes(data.id)) continue;
  const scene = loadScene(data, { songVisibleRows: theme.views.song.visibleRows });
  const file = wavArg ? path.resolve(wavArg) : path.join(root, 'public', scene.audioFile);
  if (!fs.existsSync(file)) {
    console.error(`${data.id}: ${file} is missing. Run npm run audio first.`);
    failed = true;
    continue;
  }
  const wav = decodeWav(fs.readFileSync(file));
  const sr = wav.sampleRate;
  const fps = scene.timeline.fps;
  const mono = wav.left.map((x, i) => (x + wav.right[i]) / 2);
  const rateKey = (f: number) => {
    const r = scene.remap.rateAt(f);
    return r === 1 ? 'full tempo' : `${+r.toFixed(3)}x`;
  };
  const results = new Map<string, { n: number; bad: number; worst: number }>();
  const note = (kind: string, f: number, ok: boolean, errMs = 0) => {
    const key = `${kind.padEnd(8)} ${rateKey(f)}`;
    const r = results.get(key) ?? { n: 0, bad: 0, worst: 0 };
    r.n++;
    if (!ok) r.bad++;
    r.worst = Math.max(r.worst, Math.abs(errMs));
    results.set(key, r);
  };

  const rms = (t0: number, t1: number, sig: ArrayLike<number> = mono) => {
    const a = Math.max(0, Math.round(t0 * sr));
    const b = Math.min(sig.length, Math.round(t1 * sr));
    let e = 0;
    for (let i = a; i < b; i++) e += sig[i] * sig[i];
    return Math.sqrt(e / Math.max(1, b - a));
  };
  const diff = mono.map((x, i) => (i ? x - mono[i - 1] : 0));

  const voice = scene.schedule.voice;
  const ons = voice.filter((v): v is On => v.kind === 'on');
  const drumTimes = ons.filter((o) => o.type === 'DRUM').map((o) => o.f / fps);
  const nearDrum = (t0: number, t1: number) => drumTimes.some((d) => d > t0 - 0.12 && d < t1);

  // Onset: the 0.25 ms step with the biggest rise within +-`span` s of t.
  const onset = (t: number, sig: ArrayLike<number>, span = 0.015) => {
    let best = -Infinity;
    let bestT = t;
    for (let dt = -span; dt <= span; dt += 0.00025) {
      const rise = rms(t + dt, t + dt + 0.0015, sig) - rms(t + dt - 0.0015, t + dt, sig);
      if (rise > best) {
        best = rise;
        bestT = t + dt;
      }
    }
    return bestT;
  };
  // Wide-window drum errors: their median shows a whole-track shift (such as
  // AAC encoder priming) that the +-15 ms per-hit search would only see as misses.
  const wide: number[] = [];

  const pitchOf = (t0: number, t1: number) => detectPitch(mono, Math.round(t0 * sr), Math.round((t1 - t0) * sr), sr);
  const isNote = (hz: number, midi: number) => {
    const want = 440 * 2 ** ((midi - 69) / 12);
    // The lead's sub oscillator sits an octave down: either reading is the note.
    return [want, want / 2].some((w) => Math.abs(hz / w - 1) < PITCH_TOLERANCE);
  };

  // Last pitch each channel was set to, walking the schedule in order.
  const current: Array<number | null> = Array(8).fill(null);
  for (const v of voice) {
    const t = v.f / fps;
    if (v.kind === 'on' && v.type === 'DRUM') {
      const got = onset(t, diff);
      const err = (got - t) * 1000;
      note('drums', v.f, Math.abs(err) <= ATTACK_TOLERANCE_MS, err);
      wide.push((onset(t, diff, 0.06) - t) * 1000);
      continue;
    }
    if (v.kind === 'on') {
      const before = rms(t - 0.012, t - 0.002);
      const after = rms(t + 0.002, t + 0.012);
      const prev = current[v.channel];
      current[v.channel] = v.note;
      if (before < 0.3 * after) {
        if (nearDrum(t - 0.016, t + 0.016)) continue; // the drum check covers this moment
        const got = onset(t, mono);
        const err = (got - t) * 1000;
        note('attacks', v.f, Math.abs(err) <= ATTACK_TOLERANCE_MS, err);
        if (Math.abs(err) > ATTACK_TOLERANCE_MS) console.log(`  late/early attack at ${t.toFixed(3)} s (frame ${v.f.toFixed(2)}): ${err.toFixed(2)} ms`);
      } else if (prev !== null && prev !== v.note && !nearDrum(t - 0.016, t + 0.016)) {
        const ok = isNote(pitchOf(t - 0.016, t - 0.002), prev) && isNote(pitchOf(t + 0.002, t + 0.016), v.note);
        note('pitch', v.f, ok);
        if (!ok) console.log(`  wrong pitch around ${t.toFixed(3)} s: want ${prev} -> ${v.note}`);
      }
      continue;
    }
    if (v.kind === 'pitch') {
      const prev = current[v.channel];
      current[v.channel] = v.note;
      const next = voice.find((w) => w.channel === v.channel && w.f > v.f);
      const span = next ? (next.f - v.f) / fps : 0.1;
      const last = voice.filter((w) => w.channel === v.channel && w.f < v.f).pop();
      const lead = last ? (v.f - last.f) / fps : 0.1;
      const w = Math.min(0.016, span - 0.002, lead - 0.002);
      if (w < 0.008 || prev === null || nearDrum(t - w, t + w)) continue; // too short, or masked by a drum
      const ok = isNote(pitchOf(t - w, t - 0.002), prev) && isNote(pitchOf(t + 0.002, t + w), v.note);
      note('pitch', v.f, ok);
      if (!ok) console.log(`  wrong pitch around ${t.toFixed(3)} s: want ${prev} -> ${v.note}`);
    }
  }

  console.log(`\n${data.id}  (${path.relative(root, file)})`);
  if (wide.length) {
    const median = wide.slice().sort((a, b) => a - b)[Math.floor(wide.length / 2)];
    const ok = Math.abs(median) <= ATTACK_TOLERANCE_MS;
    if (!ok) failed = true;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} whole track            ${median >= 0 ? 'late' : 'early'} by ${Math.abs(median).toFixed(2)} ms (median over ${wide.length} drum hits)`);
  }
  for (const [key, r] of [...results].sort()) {
    const ok = r.bad === 0;
    if (!ok) failed = true;
    const worst = key.startsWith('pitch') ? '' : `, worst ${r.worst.toFixed(2)} ms`;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(22)} ${r.n - r.bad}/${r.n} on time${worst}`);
  }
  const lag = Math.max(...ons.map((o) => ((Math.ceil(o.f - 1e-9) - o.f) / fps) * 1000));
  console.log(`  info the picture shows each row from the next whole frame: at most ${lag.toFixed(1)} ms after the sound (a frame is ${(1000 / fps).toFixed(1)} ms)`);
}

function detectPitch(x: Float32Array, start: number, len: number, sr: number): number {
  // Normalised autocorrelation; the first peak within 10% of the best, 50..1200 Hz.
  const minLag = Math.floor(sr / 1200);
  const maxLag = Math.min(Math.floor(sr / 50), len - 8);
  const corr: number[] = [];
  let top = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i + lag < len; i++) {
      const a = x[start + i];
      const b = x[start + i + lag];
      c += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    corr[lag] = c / Math.sqrt(e1 * e2 + 1e-12);
    top = Math.max(top, corr[lag]);
  }
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] > 0.9 * top && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
      const a = corr[lag - 1];
      const b = corr[lag];
      const c = corr[lag + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c));
      return sr / (lag + (Number.isFinite(shift) ? shift : 0));
    }
  }
  return 0;
}

if (failed) {
  console.error('\ncheck-sync: FAILED');
  process.exit(1);
}
console.log('\ncheck-sync: picture and sound agree');
