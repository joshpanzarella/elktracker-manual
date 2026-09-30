// Renders every scene's WAV into public/audio, named by the scene's audio
// key (a hash of everything that affects the sound). Old WAVs for the same
// scene are removed. Synchronous on purpose: remotion.config.ts calls it
// before Studio or a render starts.

import fs from 'node:fs';
import path from 'node:path';
import { SCENES } from '../../src/data/scenes';
import { loadScene } from '../../src/engine/scene';
import { theme } from '../../src/theme';
import { renderSceneAudio } from './synth';
import { encodeWav } from './wav';

export interface RenderOptions {
  publicDir: string;
  only?: string[];
  force?: boolean;
  log?: (msg: string) => void;
}

export function renderScenes({ publicDir, only, force, log = console.log }: RenderOptions): string[] {
  const outDir = path.join(publicDir, 'audio');
  fs.mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  for (const data of SCENES) {
    if (only && only.length && !only.includes(data.id)) continue;
    const scene = loadScene(data, { songVisibleRows: theme.views.song.visibleRows });
    const file = path.join(publicDir, scene.audioFile);
    for (const old of fs.readdirSync(outDir)) {
      if (old.startsWith(`${data.id}-`) && old.endsWith('.wav') && path.join(outDir, old) !== file) {
        fs.unlinkSync(path.join(outDir, old));
      }
    }
    if (fs.existsSync(file) && !force) {
      log(`audio: ${data.id} is up to date (${scene.audioFile})`);
      continue;
    }
    const t0 = Date.now();
    const audio = renderSceneAudio(scene);
    fs.writeFileSync(file, encodeWav(audio.left, audio.right, audio.sampleRate));
    log(`audio: ${data.id} -> public/${scene.audioFile} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    written.push(file);
  }
  return written;
}
