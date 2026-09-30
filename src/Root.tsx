import React from 'react';
import { Composition } from 'remotion';
import { PhraseBasics, phraseBasics } from './scenes/PhraseBasics';
import { theme } from './theme';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="PhraseBasics"
      component={PhraseBasics}
      durationInFrames={phraseBasics.timeline.durationInFrames}
      fps={phraseBasics.timeline.fps}
      width={theme.stage.width}
      height={theme.stage.height}
    />
  </>
);
