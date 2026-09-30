import React from 'react';
import { AbsoluteFill, Composition } from 'remotion';

const Placeholder: React.FC = () => (
  <AbsoluteFill style={{ background: '#101014', color: '#e8e8f0', fontSize: 64, justifyContent: 'center', alignItems: 'center' }}>
    ElkTracker visual manual
  </AbsoluteFill>
);

export const RemotionRoot: React.FC = () => (
  <Composition id="Placeholder" component={Placeholder} durationInFrames={30} fps={30} width={1920} height={1080} />
);
