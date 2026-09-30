// postinstall: work around a broken Remotion release.
//
// @remotion/cli 4.0.531 was published with an EMPTY dist/render-queue/queue.js,
// so `remotion studio` fails on every page load ("getRenderQueue is not a
// function"). We still want 4.0.531: it fixes AAC priming, which made every
// MP4's audio 42.67 ms late in 4.0.530 (scripts/check-sync caught it).
//
// If that file is empty, this writes a stand-in with the same four exports:
// Studio works; its built-in render queue is disabled (use `npx remotion
// render`). The script does nothing once Remotion ships a real file, so it is
// safe to leave in place and to delete after upgrading.

const fs = require('node:fs');
const path = require('node:path');

let file;
try {
  file = path.join(path.dirname(require.resolve('@remotion/cli/package.json')), 'dist', 'render-queue', 'queue.js');
} catch {
  process.exit(0); // @remotion/cli not installed (yet)
}
if (!fs.existsSync(file) || fs.statSync(file).size > 0) process.exit(0);

fs.writeFileSync(
  file,
  `"use strict";
// Written by elktracker-manual/scripts/patch-remotion.cjs: this release shipped
// this file empty. Studio's render queue is disabled; use \`npx remotion render\`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelJob = exports.removeJob = exports.addJob = exports.getRenderQueue = void 0;
exports.getRenderQueue = () => [];
exports.addJob = () => {
  throw new Error('Rendering from Studio is disabled (broken @remotion/cli release). Run \`npx remotion render\` instead.');
};
exports.removeJob = () => undefined;
exports.cancelJob = () => undefined;
`,
);
console.log('patch-remotion: @remotion/cli shipped an empty render-queue/queue.js; wrote a stand-in (Studio works, in-Studio render queue off).');
