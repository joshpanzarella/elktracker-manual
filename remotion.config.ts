// Remotion CLI configuration. Runs in Node before `remotion studio` and
// `remotion render`. See https://www.remotion.dev/docs/config
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// Containers and CI without access to Remotion's Chrome download can point
// at a local Chrome / headless shell instead.
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
}
