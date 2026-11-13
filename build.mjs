#!/usr/bin/env node
// Bundles a machine, a generated control, or the review harness.
//
//   node build.mjs examples/robot-6r              → teardown-out/dist/Robot6R.js
//   node build.mjs out/MyControl/MyControl.js --out out/MyControl/MyControl.js
//   node build.mjs harness                        → teardown-out/harness/index.html
//   node build.mjs harness --machine ./my-machine   adds your machine to the harness
//
// three.js and every kit module are bundled in: a control in an HMI package
// must not reach for a CDN, an import map or a module resolved at runtime.
// The harness is written as one self-contained HTML file so it opens from
// file:// with no server and no module CORS problems.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEPS, DIST, OUT, ROOT_DIR, fromDeps} from './paths.mjs';

const esbuild = fromDeps('esbuild');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 ? d : argv[i + 1];
};
const all = (k) => argv.flatMap((a, i) => (a === `--${k}` ? [argv[i + 1]] : []));

const target = argv[0];
if (!target) {
  console.error('usage: node build.mjs <machine-dir|entry.js|harness> [--out file] [--format iife|esm] [--global Name]');
  process.exit(1);
}

const common = {
  bundle: true,
  nodePaths: [DEPS],
  minify: !process.env.TEARDOWN_DEBUG,
  target: 'es2019',
  legalComments: 'none',
  logLevel: 'warning',
  loader: {'.json': 'json'},
};

async function buildHarness() {
  const dirs = all('machine').map((d) => path.resolve(d));
  const defaults = ['robot-6r', 'conveyor', 'gantry'].map((n) => path.join(HERE, 'examples', n));
  const machines = [...defaults, ...dirs];

  // A virtual module listing every machine the harness can show.
  const virtualMachines = {
    name: 'machines',
    setup(b) {
      b.onResolve({filter: /^virtual:machines$/}, (a) => ({path: a.path, namespace: 'virtual'}));
      b.onLoad({filter: /.*/, namespace: 'virtual'}, () => ({
        resolveDir: HERE,
        contents:
          machines.map((d, i) => `import m${i} from ${JSON.stringify(d.split(path.sep).join('/') + '/index.js')};`).join('\n') +
          `\nexport default {${machines.map((d, i) => `${JSON.stringify(path.basename(d))}: m${i}`).join(', ')}};\n`,
      }));
    },
  };

  const res = await esbuild.build({
    ...common,
    plugins: [virtualMachines],
    entryPoints: [path.join(HERE, 'harness', 'app.js')],
    format: 'esm',
    write: false,
  });
  const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  const shell = fs.readFileSync(path.join(HERE, 'harness', 'index.html'), 'utf8');
  const html = shell.replace('/*BUNDLE*/', () => js);
  const dir = path.join(OUT, 'harness');
  fs.mkdirSync(dir, {recursive: true});
  const out = path.join(dir, 'index.html');
  fs.writeFileSync(out, html);
  console.log(`${out}  ${(html.length / 1024).toFixed(0)} KB  (machines: ${machines.map((d) => path.basename(d)).join(', ')})`);
}

async function buildEntry() {
  const asDir = path.resolve(target);
  const isDir = fs.existsSync(asDir) && fs.statSync(asDir).isDirectory();
  const entry = isDir ? path.join(asDir, 'index.js') : asDir;
  if (!fs.existsSync(entry)) {
    console.error(`no entry at ${entry}`);
    process.exit(1);
  }
  let name = path.basename(isDir ? asDir : entry).replace(/\.js$/, '');
  if (isDir) {
    const def = path.join(asDir, 'machine.json');
    if (fs.existsSync(def)) name = JSON.parse(fs.readFileSync(def, 'utf8')).name || name;
  }
  const format = opt('format', 'iife');
  const out = path.resolve(opt('out', path.join(DIST, `${name}.js`)));
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const t0 = Date.now();
  await esbuild.build({
    ...common,
    entryPoints: [entry],
    format,
    ...(format === 'iife' ? {globalName: opt('global', `Machine_${name}`)} : {}),
    outfile: out,
  });
  const kb = fs.statSync(out).size / 1024;
  console.log(`${out}  ${kb.toFixed(0)} KB  ${Date.now() - t0} ms`);
  if (kb > 1500) console.log('  note: over 1.5 MB. Check that three.js addons you do not use are not being pulled in.');
}

if (target === 'harness') await buildHarness();
else await buildEntry();
