import React from 'react';
import { Composition, Folder } from 'remotion';
import { PhraseBasics, phraseBasics } from './scenes/PhraseBasics';
import { ScreenGallery, screenGallery } from './scenes/ScreenGallery';
import { theme } from './theme';

const size = { width: theme.stage.width, height: theme.stage.height };

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Chapters">
      <Composition
        id="PhraseBasics"
        component={PhraseBasics}
        durationInFrames={phraseBasics.timeline.durationInFrames}
        fps={phraseBasics.timeline.fps}
        {...size}
      />
    </Folder>
    <Folder name="Tools">
      <Composition
        id="ScreenGallery"
        component={ScreenGallery}
        durationInFrames={screenGallery.timeline.durationInFrames}
        fps={screenGallery.timeline.fps}
        {...size}
      />
    </Folder>
  </>
);
