// The one clock. Video frames map to MUSIC time (seconds of playback at the
// song's own tempo) through a playback rate that the timeline can change:
// rate 0.25 = quarter speed, 1 = full tempo. A rate change can be instant or
// ramp linearly over some frames. Picture (playhead) and sound (WAV) both
// place every row and tick through this one map, so they cannot drift.

export interface RateKey {
  frame: number;
  rate: number;
  /** Frames to ramp from the current rate to `rate`. 0 = instant. */
  ramp: number;
}

export interface TimeRemap {
  readonly fps: number;
  /** Music seconds elapsed at (fractional) video frame `frame`. */
  musicAt(frame: number): number;
  /** Earliest (fractional) video frame at which music time `music` is reached. */
  frameAt(music: number): number;
  /** Playback rate at `frame`. */
  rateAt(frame: number): number;
}

interface Point {
  frame: number;
  rate: number;
}

interface Segment {
  f0: number;
  f1: number; // Infinity for the last one
  r0: number;
  r1: number;
  m0: number; // music seconds at f0
}

function rateOnPoints(points: Point[], frame: number): number {
  const last = points[points.length - 1];
  if (frame >= last.frame) return last.rate;
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i];
    const b = points[i + 1];
    if (frame >= a.frame) {
      if (b.frame === a.frame) return b.rate;
      return a.rate + ((b.rate - a.rate) * (frame - a.frame)) / (b.frame - a.frame);
    }
  }
  return points[0].rate;
}

export function buildTimeRemap(keys: RateKey[], fps: number, initialRate = 1): TimeRemap {
  const points: Point[] = [{ frame: 0, rate: initialRate }];
  const sorted = keys.slice().sort((a, b) => a.frame - b.frame);
  for (const k of sorted) {
    if (!(k.rate >= 0)) throw new Error(`rate at frame ${k.frame} must be >= 0, got ${k.rate}`);
    if (!(k.ramp >= 0)) throw new Error(`ramp at frame ${k.frame} must be >= 0, got ${k.ramp}`);
    const f = Math.max(0, k.frame);
    const current = rateOnPoints(points, f);
    // A new key interrupts any ramp still in progress.
    while (points.length > 1 && points[points.length - 1].frame > f) points.pop();
    const last = points[points.length - 1];
    if (last.frame !== f || last.rate !== current) points.push({ frame: f, rate: current });
    points.push({ frame: f + k.ramp, rate: k.rate });
  }

  const segments: Segment[] = [];
  let m = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const f1 = b ? b.frame : Infinity;
    if (b && f1 === a.frame) continue; // instant jump: no area
    const r1 = b ? b.rate : a.rate;
    segments.push({ f0: a.frame, f1, r0: a.rate, r1, m0: m });
    if (b) m += ((f1 - a.frame) * (a.rate + r1)) / 2 / fps;
  }

  const area = (s: Segment, frame: number): number => {
    const d = frame - s.f0;
    if (s.f1 === Infinity || s.r0 === s.r1) return (d * s.r0) / fps;
    return (d * s.r0 + ((s.r1 - s.r0) * d * d) / (2 * (s.f1 - s.f0))) / fps;
  };

  const segmentAtFrame = (frame: number): Segment => {
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid].f0 <= frame) lo = mid;
      else hi = mid - 1;
    }
    return segments[lo];
  };

  return {
    fps,
    musicAt(frame: number): number {
      if (frame <= 0) return (frame * initialRate) / fps;
      const s = segmentAtFrame(frame);
      return s.m0 + area(s, frame);
    },
    rateAt(frame: number): number {
      return rateOnPoints(points, Math.max(0, frame));
    },
    frameAt(music: number): number {
      if (music <= 0) return initialRate > 0 ? (music * fps) / initialRate : 0;
      // First segment whose END is at or after `music`. A stretch at rate 0
      // adds no music time, so the earliest frame wins there.
      let lo = 0;
      let hi = segments.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const mEnd = mid + 1 < segments.length ? segments[mid + 1].m0 : Infinity;
        if (mEnd >= music) hi = mid;
        else lo = mid + 1;
      }
      const s = segments[lo];
      const c = (music - s.m0) * fps; // frame-rate units
      if (c === 0) return s.f0;
      const L = s.f1 - s.f0;
      const a = s.f1 === Infinity ? 0 : (s.r1 - s.r0) / (2 * L);
      const b = s.r0;
      if (Math.abs(a) < 1e-12) return b > 0 ? s.f0 + c / b : Infinity;
      const disc = b * b + 4 * a * c;
      // 2c / (b + sqrt(disc)) is the stable form of the quadratic root.
      return s.f0 + (2 * c) / (b + Math.sqrt(Math.max(0, disc)));
    },
  };
}
