// npm run dev: Remotion Studio plus the audio watcher, so editing a scene's
// song.json / timeline.json (or the engine) re-renders its WAV at once.

import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const children = [
  spawn(npx, ['tsx', 'scripts/render-audio.ts', '--watch'], { cwd: root, stdio: 'inherit' }),
  spawn(npx, ['remotion', 'studio'], { cwd: root, stdio: 'inherit', env: { ...process.env, SKIP_AUDIO: '1' } }),
];
const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) c.on('exit', stop);
