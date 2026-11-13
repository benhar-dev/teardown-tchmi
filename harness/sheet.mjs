#!/usr/bin/env node
// Pose sheets: the review loop's eyes.
//
//   node harness/sheet.mjs robot-6r --trace axes --cols 3
//   node harness/sheet.mjs conveyor --trace cycle --n 6 --out teardown-out/sheets/belt.png
//   node harness/sheet.mjs gantry --trace states --theme dark
//
// You cannot watch a machine screen from here, but you can read one tile per
// pose. Every tile is one feedback sample fed through the control's own
// property setters, labelled with the values that produced it. Build the
// harness first: node build.mjs harness
//
// The printed table is not decoration: it is the part a review can check
// without looking at pixels. A tile whose validity is not what the trace
// asked for is a bug, however good the picture looks.

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CHROMIUM, CHROMIUM_ARGS, OUT, SHEETS, playwright} from '../paths.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 ? d : argv[i + 1];
};
const machine = argv[0];
if (!machine || machine.startsWith('--')) {
  console.error('usage: node harness/sheet.mjs <machine> [--trace sweep|axes|cycle|states] [--n 9] [--cols 3] [--theme light|dark] [--size 1600x1200] [--out f.png]');
  process.exit(1);
}

const page_ = path.join(OUT, 'harness', 'index.html');
if (!fs.existsSync(page_)) {
  console.error(`missing ${page_}; run: node build.mjs harness`);
  process.exit(1);
}

const which = opt('trace', 'sweep');
const [W, H] = opt('size', '1600x1200').split('x').map(Number);
const out = path.resolve(opt('out', path.join(SHEETS, `${machine}-${which}.png`)));
fs.mkdirSync(path.dirname(out), {recursive: true});

const params = new URLSearchParams({
  machine,
  mode: 'sheet',
  trace: which,
  n: opt('n', '9'),
  cols: opt('cols', '3'),
  theme: opt('theme', 'light'),
  shadows: opt('shadows', '1'),
});

const {chromium} = playwright();
const browser = await chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
page.on('pageerror', (e) => console.error('[page error]', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));

await page.goto(`${pathToFileURL(page_).href}?${params}`);
await page.waitForFunction(() => window.__SHEET_READY === true, null, {timeout: 60000});

const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
const stats = await page.evaluate(() => window.__SHEET_STATS || []);
await page.screenshot({path: out, fullPage: true});
await browser.close();

console.log(`gpu: ${gpu}`);
console.log(['pose', 'validity', 'renders', 'ms'].join('\t'));
for (const s of stats) console.log([s.name, s.validity, s.renders, s.ms].join('\t'));
console.log(`→ ${out}`);
