// A scene = song.json + timeline.json, turned into pure lookups by frame.
// Remotion (picture) and scripts/render-audio (sound) both load scenes here.

import { EditorContext, EditorState, applyDeviceEvent, initialState } from './editor';
import { hashString } from './hex';
import { Schedule, buildSchedule } from './sequencer';
import { Song, SongJson, parseSong } from './song';
import { Timeline, TimelineJson, isDeviceEvent, parseTimeline, RateEvent } from './timeline';
import { TimeRemap, buildTimeRemap } from './timeRemap';

/** Bump when the synth or the sequencer changes what a scene sounds like. */
export const AUDIO_ENGINE_VERSION = 1;

export interface SceneData {
  id: string;
  song: SongJson;
  timeline: TimelineJson;
}

export interface Scene {
  id: string;
  song: Song;
  timeline: Timeline;
  remap: TimeRemap;
  /** Editor state at a frame: song.json + every device event with frame <= f. */
  stateAt(frame: number): EditorState;
  /** Frames at which the editor state changes, ascending. */
  changeFrames: number[];
  schedule: Schedule;
  /** Changes whenever anything that affects the sound changes. */
  audioKey: string;
  /** public/ path of this scene's WAV. */
  audioFile: string;
}

const cache = new WeakMap<SceneData, Scene>();

export function loadScene(data: SceneData, ctx: Omit<EditorContext, 'fps'>): Scene {
  const hit = cache.get(data);
  if (hit) return hit;

  const song = parseSong(data.song);
  const timeline = parseTimeline(data.timeline);
  const ectx: EditorContext = { ...ctx, fps: timeline.fps };

  const frames: number[] = [];
  const states: EditorState[] = [];
  const first = initialState(song, timeline.start, ectx);
  let s = first;
  for (const e of timeline.events) {
    if (!isDeviceEvent(e)) continue;
    try {
      s = applyDeviceEvent(s, e, ectx);
    } catch (err) {
      throw new Error(`${data.id}: timeline event at frame ${e.frame}: ${(err as Error).message}`);
    }
    if (frames.length && frames[frames.length - 1] === e.frame) states[states.length - 1] = s;
    else {
      frames.push(e.frame);
      states.push(s);
    }
  }
  const stateAt = (frame: number): EditorState => {
    let lo = 0;
    let hi = frames.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid] <= frame) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found < 0 ? first : states[found];
  };

  const rateKeys = timeline.events.filter((e): e is RateEvent => e.kind === 'rate');
  const remap = buildTimeRemap(rateKeys, timeline.fps);
  const schedule = buildSchedule({ remap, durationInFrames: timeline.durationInFrames, stateAt, changeFrames: frames });

  // Only what changes the sound goes into the key: captions do not.
  const audible = timeline.events.filter((e) => isDeviceEvent(e) || e.kind === 'rate');
  const audioKey = hashString(JSON.stringify({
    v: AUDIO_ENGINE_VERSION,
    song: data.song,
    fps: timeline.fps,
    duration: timeline.durationInFrames,
    start: timeline.start,
    events: audible,
  }));

  const scene: Scene = {
    id: data.id,
    song,
    timeline,
    remap,
    stateAt,
    changeFrames: frames,
    schedule,
    audioKey,
    audioFile: `audio/${data.id}-${audioKey}.wav`,
  };
  cache.set(data, scene);
  return scene;
}
