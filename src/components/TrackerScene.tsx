// One manual chapter: the device screen, the margin column (chapter title,
// captions, button HUD), callouts and the scene's audio. Every part is a
// pure function of the frame and the scene's data.

import React, { useMemo } from 'react';
import { AbsoluteFill, Html5Audio, getInputProps, getRemotionEnvironment, getStaticFiles, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { playbackAt } from '../engine/playback';
import { SceneData, loadScene } from '../engine/scene';
import { CalloutEvent, CameraEvent, CaptionEvent, PressEvent } from '../engine/timeline';
import { renderScreen } from '../screen/views';
import { theme } from '../theme';
import { ButtonHud } from './ButtonHud';
import { Callouts } from './Callouts';
import { Captions } from './Captions';
import { cameraAt } from './camera';
import { TrackerScreen } from './TrackerScreen';

const SceneAudio: React.FC<{ file: string }> = ({ file }) => {
  // `--props='{"noAudio":true}'` renders silent previews and stills.
  if (getInputProps().noAudio) return null;
  const env = getRemotionEnvironment();
  const exists = getStaticFiles().some((f) => f.name === file);
  if (!exists) {
    const msg = `Audio for this scene is out of date or missing (${file}). Run \`npm run audio\`, or use \`npm run dev\`, which re-renders it on every data change.`;
    if (env.isRendering) throw new Error(msg);
    return (
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 20px', background: '#b3261e', color: 'white', fontSize: 22, fontFamily: 'sans-serif' }}>
        {msg}
      </div>
    );
  }
  return <Html5Audio src={staticFile(file)} />;
};

export const TrackerScene: React.FC<{ data: SceneData; chapter: string }> = ({ data, chapter }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const scene = loadScene(data, { songVisibleRows: theme.views.song.visibleRows });

  const parts = useMemo(() => {
    const ev = scene.timeline.events;
    return {
      captions: ev.filter((e): e is CaptionEvent => e.kind === 'caption'),
      callouts: ev.filter((e): e is CalloutEvent => e.kind === 'callout'),
      cameras: ev.filter((e): e is CameraEvent => e.kind === 'camera'),
      presses: ev.filter((e): e is PressEvent => e.kind === 'press'),
    };
  }, [scene]);

  const state = scene.stateAt(frame);
  const play = playbackAt(scene, frame, theme.flash.frames);
  const grid = renderScreen({ state, frame, fps, play, theme, savedSong: scene.song });
  const camera = cameraAt(parts.cameras, frame, theme);
  const P = theme.stage.panel;
  const Ch = theme.stage.chapter;

  return (
    <AbsoluteFill style={{ background: theme.stage.background }}>
      <TrackerScreen grid={grid} camera={camera} theme={theme} />
      <div
        style={{
          position: 'absolute',
          left: P.x,
          top: P.y + Ch.y,
          fontFamily: `"${theme.stage.monoFont.family}", monospace`,
          fontSize: Ch.size,
          letterSpacing: Ch.letterSpacing,
          color: Ch.color,
          textTransform: 'uppercase',
        }}
      >
        {chapter}
      </div>
      <Captions captions={parts.captions} frame={frame} end={durationInFrames} theme={theme} />
      <ButtonHud presses={parts.presses} frame={frame} theme={theme} />
      <Callouts callouts={parts.callouts} frame={frame} fps={fps} camera={camera} theme={theme} />
      <SceneAudio file={scene.audioFile} />
    </AbsoluteFill>
  );
};
