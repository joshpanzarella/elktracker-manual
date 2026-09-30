// Manual chapter: Phrase basics (Milestone 1).
// Data: src/data/phrase-basics/song.json + timeline.json.

import React from 'react';
import { TrackerScene } from '../components/TrackerScene';
import { sceneData } from '../data/scenes';

export const phraseBasics = sceneData('phrase-basics');

export const PhraseBasics: React.FC = () => <TrackerScene data={phraseBasics} chapter="Phrase basics" />;
