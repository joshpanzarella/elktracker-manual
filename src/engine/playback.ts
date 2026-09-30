// What playback looks like at one frame: the row each channel is on, the
// notes that just fired (for flashes), the last note per channel (for the
// Song screen's readout). Pure lookups into the scene's schedule.

import { TransportMode } from './editor';
import { Scene } from './scene';
import { RowEvent, recentRows, rowAt } from './sequencer';
import { CHANNELS } from './song';

export interface ChannelNow {
  row: RowEvent | null;
  /** Most recent row that sounded a note, at or before the frame. */
  lastNote: RowEvent | null;
}

export interface PlaybackNow {
  playing: boolean;
  mode: TransportMode;
  bpm: number;
  channels: ChannelNow[];
  /** Rows whose note fired less than `flashFrames` ago, newest first. */
  flashes: RowEvent[];
}

function lastNoteRow(rows: RowEvent[], frame: number): RowEvent | null {
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
  for (let i = found; i >= 0 && found - i < 256; i--) {
    if (typeof rows[i].note === 'number') return rows[i];
  }
  return null;
}

export function playbackAt(scene: Scene, frame: number, flashFrames: number): PlaybackNow {
  const t = scene.stateAt(frame).transport;
  const channels: ChannelNow[] = [];
  const flashes: RowEvent[] = [];
  for (let c = 0; c < CHANNELS; c++) {
    const rows = scene.schedule.rows[c];
    channels.push({ row: t.playing ? rowAt(rows, frame) : null, lastNote: lastNoteRow(rows, frame) });
    for (const r of recentRows(rows, frame, flashFrames)) {
      if (r.fired && typeof r.note === 'number') flashes.push(r);
    }
  }
  flashes.sort((a, b) => b.f0 - a.f0);
  return { playing: t.playing, mode: t.mode, bpm: scene.schedule.bpmAt(frame), channels, flashes };
}
