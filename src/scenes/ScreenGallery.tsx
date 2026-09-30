// Not a manual chapter: every screen built so far, one after another, on the
// phrase-basics song. Scrub it in Studio while tweaking src/theme.ts.

import React from 'react';
import { TrackerScene } from '../components/TrackerScene';
import { sceneData } from '../data/scenes';

export const screenGallery = sceneData('screen-gallery');

export const ScreenGallery: React.FC = () => <TrackerScene data={screenGallery} chapter="Screen gallery" />;
