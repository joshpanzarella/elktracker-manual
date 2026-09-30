// Tool, not a chapter: the recreation of the Song screen with the device
// photo laid over it (public/reference/song-screen.jpg). Frames 0-119
// crossfade recreation -> photo -> recreation; 120-179 show the difference.

import React from 'react';
import { staticFile, useCurrentFrame } from 'remotion';
import { TrackerScene } from '../components/TrackerScene';
import { sceneData } from '../data/scenes';

export const referenceSong = sceneData('reference-song');

export const ReferenceSong: React.FC = () => {
  const frame = useCurrentFrame();
  const src = staticFile('reference/song-screen.jpg');
  const overlay =
    frame < 120
      ? { src, opacity: 1 - Math.abs(frame / 59.5 - 1) }
      : { src, opacity: 1, blend: 'difference' as const };
  return <TrackerScene data={referenceSong} chapter="Calibration" overlay={overlay} />;
};
