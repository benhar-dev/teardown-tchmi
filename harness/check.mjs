#!/usr/bin/env node
// Level 1 of the acceptance list, with no browser and no TwinCAT: the
// machine definitions, the pose layer and the adapter's contract.
//
//   node harness/check.mjs                 every example
//   node harness/check.mjs ./my-machine    yours as well
//
// Run this before every pose sheet. It is seconds, it catches the mistakes
// that make a sheet meaningless (an axis with no feedback property, a pose
// that is not deterministic, a setter that accepts NaN), and unlike a
// picture it either passes or it does not.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {createAdapter} from '../kit/control-base.js';
import {applyPose, buildSkeleton, homePose, propertyMap, validateMachine} from '../kit/pose.js';
import {trace, TRACES} from './traces.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dirs = process.argv.slice(2).length
  ? process.argv.slice(2).map((d) => path.resolve(d))
  : ['robot-6r', 'conveyor', 'gantry'].map((n) => path.join(HERE, '..', 'examples', n));

let failures = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${detail && !cond ? `  (${detail})` : ''}`);
};

for (const dir of dirs) {
  const file = path.join(dir, 'machine.json');
  if (!fs.existsSync(file)) {
    console.log(`FAIL  ${dir}: no machine.json`);
    failures++;
    continue;
  }
  const machine = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\n# ${machine.name} (${path.basename(dir)})`);

  const errs = validateMachine(machine);
  ok('machine.json is valid', errs.length === 0, errs.join('; '));
  if (errs.length) continue;

  const moving = machine.joints.filter((j) => j.type !== 'fixed');
  ok('every axis has a feedback property and unit', moving.every((j) => j.feedback?.property && j.feedback?.unit));
  ok('every axis has a PLC symbol documented', moving.every((j) => j.feedback?.symbol), 'feedback.symbol missing');
  ok('property names are unique', Object.keys(propertyMap(machine)).length === moving.length);
  ok('home pose is inside every limit', moving.every((j) => homePose(machine)[j.name] >= j.min && homePose(machine)[j.name] <= j.max));

  // The pose layer is a pure function: same feedback, same transforms.
  const {root: r1, nodes: n1} = buildSkeleton(THREE, machine);
  const {root: r2, nodes: n2} = buildSkeleton(THREE, machine);
  const sample = trace(machine, 'sweep', 5)[3].feedback;
  applyPose(THREE, machine, n1, sample);
  applyPose(THREE, machine, n2, sample);
  r1.updateMatrixWorld(true);
  r2.updateMatrixWorld(true);
  const flat = (root) => {
    const out = [];
    root.traverse((o) => out.push(...o.matrixWorld.elements));
    return out;
  };
  ok('pose is deterministic', JSON.stringify(flat(r1)) === JSON.stringify(flat(r2)));

  // Re-posing from the same values after a detour returns the same matrices:
  // nothing is integrated, so nothing can drift.
  applyPose(THREE, machine, n1, trace(machine, 'sweep', 5)[0].feedback);
  applyPose(THREE, machine, n1, sample);
  r1.updateMatrixWorld(true);
  ok('pose does not drift', JSON.stringify(flat(r1)) === JSON.stringify(flat(r2)));

  // The adapter's contract, with no DOM: values that arrive before attach
  // are kept, rubbish is refused, out-of-range follows the declared policy.
  const adapter = createAdapter({machine, build: null, staleAfterMs: machine.staleAfterMs});
  const first = moving[0];
  const prop = first.feedback.property;
  ok('starts unavailable', adapter.validity === 'invalid');
  ok('accepts a good value before attach', adapter.setProperty(prop, homePose(machine)[first.name]).changed);
  ok('ignores an unchanged value', !adapter.setProperty(prop, homePose(machine)[first.name]).changed);
  ok('refuses NaN', adapter.setProperty(prop, Number.NaN).state === 'invalid');
  ok('refuses a string', adapter.setProperty(prop, '12').state === 'invalid');
  ok('value survived the bad input', adapter.values[first.name] === homePose(machine)[first.name]);
  const over = first.max + (first.max - first.min);
  const res = adapter.setProperty(prop, over);
  ok(`out of range is ${first.range ?? 'clamp'}ed, never written back`, res.state === 'clamped' || res.state === 'out-of-range');
  ok('clamped value stays inside the limits', adapter.values[first.name] <= first.max && adapter.values[first.name] >= first.min);
  ok('unknown property is refused', adapter.setProperty('NoSuchProperty', 1).state === 'unknown-property');
  ok('goes offline when told', (adapter.setConnected(false), adapter.validity === 'offline'));
  ok('comes back when told', (adapter.setConnected(true), adapter.validity === 'valid'));

  let notified = 0;
  adapter.onPropertyChanged(() => notified++);
  adapter.setProperty(prop, homePose(machine)[first.name] + (first.max - first.min) * 0.1);
  adapter.setProperty(prop, homePose(machine)[first.name] + (first.max - first.min) * 0.1);
  ok('notifies once per real change', notified === 1, `notified ${notified} times`);
  adapter.destroy();

  // Every trace must produce usable samples for this machine.
  for (const name of Object.keys(TRACES)) {
    const s = trace(machine, name, 5);
    ok(`trace ${name} produces samples`, s.length > 0 && s.every((x) => x.name && x.feedback));
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
