import React from 'react';
import { Composition, Folder, getInputProps, getRemotionEnvironment } from 'remotion';
import { PhraseBasics, phraseBasics } from './scenes/PhraseBasics';
import { ReferenceSong, referenceSong } from './scenes/ReferenceSong';
import { ScreenGallery, screenGallery } from './scenes/ScreenGallery';
import { theme } from './theme';

const size = { width: theme.stage.width, height: theme.stage.height };

// Tools only exist in Studio, so a plain `npx remotion render` finds exactly
// one composition per chapter and needs no picker while there is one chapter.
// Render one anyway with --props='{"tools":true}'.
const inStudio = getRemotionEnvironment().isStudio || getInputProps().tools === true;

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
    {inStudio && (
      <Folder name="Tools">
        <Composition
          id="ScreenGallery"
          component={ScreenGallery}
          durationInFrames={screenGallery.timeline.durationInFrames}
          fps={screenGallery.timeline.fps}
          {...size}
        />
        <Composition
          id="ReferenceSong"
          component={ReferenceSong}
          durationInFrames={referenceSong.timeline.durationInFrames}
          fps={referenceSong.timeline.fps}
          {...size}
        />
      </Folder>
    )}
  </>
);
