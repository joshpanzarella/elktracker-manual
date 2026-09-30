// Remotion CLI configuration. Runs in Node before `remotion studio` and
// `remotion render`. See https://www.remotion.dev/docs/config
import path from 'node:path';
import { Config } from '@remotion/cli/config';
import { renderScenes } from './scripts/audio/renderScenes';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// Containers and CI without access to Remotion's Chrome download can point
// at a local Chrome / headless shell instead.
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
}

// Scene audio is rendered from the same song + timeline data as the picture.
// Bring it up to date before Studio or a render starts, so a plain
// `npx remotion render` can never pair new picture with old sound.
// (Up-to-date scenes are skipped. SKIP_AUDIO=1 skips this entirely.)
if (!process.env.SKIP_AUDIO) {
  renderScenes({ publicDir: path.join(process.cwd(), 'public') });
}
