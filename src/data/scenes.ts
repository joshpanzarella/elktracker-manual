// Every scene's data, by id. Remotion (picture) and scripts/render-audio
// (sound) both read this list, so they always work from the same files.

import { SceneData } from '../engine/scene';
import { SongJson } from '../engine/song';
import { TimelineJson } from '../engine/timeline';
import phraseBasicsSong from './phrase-basics/song.json';
import phraseBasicsTimeline from './phrase-basics/timeline.json';
import screenGalleryTimeline from './screen-gallery/timeline.json';
import referenceSongSong from './reference-song/song.json';
import referenceSongTimeline from './reference-song/timeline.json';

export const SCENES: SceneData[] = [
  { id: 'phrase-basics', song: phraseBasicsSong as SongJson, timeline: phraseBasicsTimeline as TimelineJson },
  // Not a chapter: every built screen, for tweaking theme.ts by eye.
  { id: 'screen-gallery', song: phraseBasicsSong as SongJson, timeline: screenGalleryTimeline as TimelineJson },
  // Not a chapter: exactly what public/reference/song-screen.jpg shows.
  { id: 'reference-song', song: referenceSongSong as SongJson, timeline: referenceSongTimeline as TimelineJson },
];

export const sceneData = (id: string): SceneData => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`No scene "${id}" in src/data/scenes.ts`);
  return s;
};
