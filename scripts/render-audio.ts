// npm run audio              render every scene's WAV (skips up-to-date ones)
// npm run audio -- --force   re-render even if up to date
// npm run audio -- phrase-basics      only that scene
// npm run audio:watch        re-render whenever scene data or engine code changes

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { renderScenes } from './audio/renderScenes';

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

if (!watch) {
  try {
    renderScenes({ publicDir: path.join(root, 'public'), only, force });
  } catch (err) {
    console.error(`audio: ${(err as Error).message}`);
    process.exit(1);
  }
} else {
  // Each run is a fresh process, so edited modules and JSON are re-read.
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let again = false;
  const run = () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    const child = spawn(process.execPath, [...process.execArgv, __filename, ...only], { cwd: root, stdio: 'inherit' });
    child.on('exit', () => {
      running = false;
      if (again) {
        again = false;
        run();
      }
    });
  };
  const dirs = ['src/data', 'src/engine', 'scripts/audio'].map((d) => path.join(root, d));
  for (const d of dirs) {
    fs.watch(d, { recursive: true }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 150);
    });
  }
  console.log('audio: watching src/data, src/engine, scripts/audio');
  run();
}
