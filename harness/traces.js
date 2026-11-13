// Feedback traces: the scripted inputs a machine view is reviewed against.
//
// A trace is a plain function of the machine definition, with no DOM and no
// three.js, so the same samples drive the harness page, the pose sheets and
// any unit test. Everything a reviewer needs to see is a named sample here,
// including the states nobody remembers to try: both ends of every axis,
// a value outside the declared range, a non-finite value, and a PLC that has
// stopped answering.

import {homePose} from '../kit/pose.js';

const moving = (machine) => machine.joints.filter((j) => j.type === 'revolute' || j.type === 'prismatic');
const lerp = (a, b, k) => a + (b - a) * k;
const round = (v) => Math.round(v * 100) / 100;

const label = (machine, feedback) =>
  moving(machine)
    .map((j) => `${j.name} ${round(feedback[j.name])}${j.feedback.unit === 'deg' ? '°' : ''}`)
    .join('  ');

/** Every axis from min to max together: the whole envelope in one sheet. */
function sweep(machine, n = 9) {
  const axes = moving(machine);
  return Array.from({length: n}, (_, i) => {
    const k = n === 1 ? 0 : i / (n - 1);
    const feedback = {};
    for (const j of axes) feedback[j.name] = lerp(j.min, j.max, k);
    return {name: `sweep ${Math.round(k * 100)}%`, feedback, label: label(machine, feedback), validity: 'valid'};
  });
}

/** One axis at a time: min, home, max, with everything else at home. */
function axes(machine) {
  const home = homePose(machine);
  const out = [];
  for (const j of moving(machine)) {
    for (const [tag, v] of [['min', j.min], ['home', home[j.name]], ['max', j.max]]) {
      const feedback = {...home, [j.name]: v};
      out.push({name: `${j.name} ${tag}`, feedback, label: label(machine, feedback), validity: 'valid'});
    }
  }
  return out;
}

/** A plausible motion, for a machine whose axes move together. */
function cycle(machine, n = 9) {
  const axesList = moving(machine);
  return Array.from({length: n}, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    const feedback = {};
    axesList.forEach((j, k) => {
      const phase = (t + k / Math.max(1, axesList.length)) * Math.PI * 2;
      const span = j.max - j.min;
      const mid = j.min + span / 2;
      // A long-travel axis (a belt counter) runs forward instead of swinging.
      feedback[j.name] = span > 10000 ? j.min + span * 0.0002 * i : mid + Math.sin(phase) * span * 0.42;
    });
    return {name: `cycle ${i + 1}/${n}`, feedback, label: label(machine, feedback), validity: 'valid'};
  });
}

/**
 * The states a machine view is wrong about until someone checks: no data
 * yet, stale data, a disconnected PLC, a value outside the declared range
 * and a non-finite value.
 */
function states(machine) {
  const home = homePose(machine);
  const first = moving(machine)[0];
  const over = {...home, [first.name]: first.max + (first.max - first.min) * 0.25};
  const nan = {...home, [first.name]: Number.NaN};
  return [
    {name: 'no data yet', feedback: {}, label: 'nothing bound', validity: 'invalid'},
    {name: 'valid', feedback: home, label: label(machine, home), validity: 'valid'},
    {name: 'stale', feedback: home, label: 'last value held', validity: 'stale'},
    {name: 'PLC offline', feedback: home, label: 'connection lost', validity: 'offline'},
    {name: `${first.name} over range`, feedback: over, label: `${first.name} ${round(over[first.name])} > ${first.max}`, validity: 'valid'},
    {name: `${first.name} not a number`, feedback: nan, label: 'NaN rejected', validity: 'valid'},
  ];
}

export const TRACES = {sweep, axes, cycle, states};

/** @returns {{name, feedback, label, validity}[]} */
export function trace(machine, which = 'sweep', n = 9) {
  const fn = TRACES[which];
  if (!fn) throw new Error(`unknown trace "${which}": ${Object.keys(TRACES).join(', ')}`);
  return fn(machine, n);
}
