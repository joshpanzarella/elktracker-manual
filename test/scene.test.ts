// The shipped scenes: every frame's screen must depend on the frame alone,
// so Studio can jump anywhere. Rendered here in order and shuffled.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cameraAt } from '../src/components/camera';
import { SCENES } from '../src/data/scenes';
import { playbackAt } from '../src/engine/playback';
import { loadScene } from '../src/engine/scene';
import { CameraEvent } from '../src/engine/timeline';
import { resolveTarget } from '../src/screen/anchors';
import { renderScreen } from '../src/screen/views';
import { theme } from '../src/theme';

for (const data of SCENES) {
  const scene = loadScene(data, { songVisibleRows: theme.views.song.visibleRows });
  const cams = scene.timeline.events.filter((e): e is CameraEvent => e.kind === 'camera');
  const snapshot = (frame: number) => {
    const state = scene.stateAt(frame);
    const play = playbackAt(scene, frame, theme.flash.frames);
    const grid = renderScreen({ state, frame, fps: scene.timeline.fps, play, theme, savedSong: scene.song });
    return JSON.stringify({ cells: grid.cells, under: grid.under, over: grid.over, cam: cameraAt(cams, frame, theme) });
  };

  test(`${data.id}: every frame renders the same in any order`, () => {
    const frames = Array.from({ length: scene.timeline.durationInFrames }, (_, i) => i);
    const inOrder = frames.map(snapshot);
    const shuffled = frames.slice().sort(() => Math.random() - 0.5);
    for (const f of shuffled) assert.equal(snapshot(f), inOrder[f], `frame ${f} differs when reached out of order`);
  });

  test(`${data.id}: every callout and camera target resolves`, () => {
    for (const e of scene.timeline.events) {
      if (e.kind === 'callout' || (e.kind === 'camera' && e.target !== 'screen')) {
        assert.doesNotThrow(() => resolveTarget(e.target, theme), `frame ${e.frame}`);
      }
    }
  });

  test(`${data.id}: the audio key ignores captions but not notes`, () => {
    const caption = { ...data, timeline: { ...data.timeline, events: [...data.timeline.events, { frame: 1, caption: 'x' }] } };
    const note = { ...data, timeline: { ...data.timeline, events: [...data.timeline.events, { frame: 1, press: 'A' }] } };
    const ctx = { songVisibleRows: theme.views.song.visibleRows };
    assert.equal(loadScene(caption, ctx).audioKey, scene.audioKey);
    assert.notEqual(loadScene(note, ctx).audioKey, scene.audioKey);
  });
}
