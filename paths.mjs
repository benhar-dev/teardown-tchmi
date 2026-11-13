// Paths and browser flags for the build and the review harness. Everything
// resolves from this folder, so the skill runs wherever it is installed.
// Override any of them with an environment variable.
//
// The runtime needs none of this: a generated control is a bundled .js file
// in a NuGet package. These are development-machine tools only.

import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// esbuild, three and playwright: `npm install` in this folder puts them here.
export const DEPS = process.env.TEARDOWN_DEPS || path.join(ROOT, 'node_modules');

// Unset: playwright uses the Chromium that `npx playwright install chromium`
// downloaded. Only the pose-sheet harness needs it.
export const CHROMIUM = process.env.CHROMIUM || undefined;

// Real GPU WebGL instead of a software rasteriser, so a sheet shows what a
// panel will show. On Windows, d3d11 keeps ANGLE off an integrated GPU when a
// discrete one exists.
export const CHROMIUM_ARGS = [
  ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
  '--force_high_performance_gpu',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--enable-webgl',
  '--hide-scrollbars',
];

// Builds, sheets and scaffolded packages land in ./teardown-out of the folder
// you run from.
export const OUT = path.resolve(process.env.TEARDOWN_OUT || 'teardown-out');
export const DIST = path.join(OUT, 'dist');
export const SHEETS = path.join(OUT, 'sheets');

export const ROOT_DIR = ROOT;
export const fromDeps = (id) => createRequire(path.join(DEPS, 'x.js'))(id);
export const playwright = () => fromDeps('playwright');
