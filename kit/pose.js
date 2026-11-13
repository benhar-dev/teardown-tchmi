// The pose layer: machine.json in, a posed skeleton out.
//
// machine.json is the one source. The same file produces the Object3D
// hierarchy here, the control's bindable properties in scaffold.mjs, the
// feedback traces the harness drives, and the documented contract. Nothing
// about a machine's structure is written twice.
//
// Units: lengths are millimetres, angles are degrees. CAD and PLC axis data
// arrive that way, so the kit never converts behind your back.
//
// This module is deterministic and holds no state: the same feedback always
// produces the same pose. It never reads a clock, so nothing here can advance
// a machine that the PLC says is standing still.

import {clamp, finite, rad} from './util.js';

export const JOINT_TYPES = ['revolute', 'prismatic', 'fixed'];

/** Policies for a feedback value outside [min, max]. */
export const RANGE_POLICIES = ['clamp', 'reject', 'pass'];

const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/**
 * Check a machine definition before anything is built from it.
 * @returns {string[]} problems, empty when the definition is usable
 */
export function validateMachine(def) {
  const errs = [];
  if (!def || typeof def !== 'object') return ['machine definition is not an object'];
  if (!def.name) errs.push('name is required');
  if (!Array.isArray(def.joints) || !def.joints.length) return [...errs, 'joints must be a non-empty array'];

  const seen = new Set();
  for (const [i, j] of def.joints.entries()) {
    const at = `joints[${i}]${j && j.name ? ` (${j.name})` : ''}`;
    if (!j || typeof j !== 'object') {
      errs.push(`${at}: not an object`);
      continue;
    }
    if (!j.name) errs.push(`${at}: name is required`);
    else if (seen.has(j.name)) errs.push(`${at}: duplicate name`);
    else seen.add(j.name);

    if (!JOINT_TYPES.includes(j.type)) errs.push(`${at}: type must be one of ${JOINT_TYPES.join(', ')}`);
    if (!isVec3(j.origin)) errs.push(`${at}: origin must be [x, y, z] in mm`);
    if (j.type !== 'fixed') {
      if (!isVec3(j.axis)) errs.push(`${at}: axis must be [x, y, z]`);
      else if (Math.hypot(...j.axis) < 1e-9) errs.push(`${at}: axis has zero length`);
      if (typeof j.min !== 'number' || typeof j.max !== 'number') errs.push(`${at}: min and max are required`);
      else if (j.min > j.max) errs.push(`${at}: min is greater than max`);
      if (j.home !== undefined && typeof j.home !== 'number') errs.push(`${at}: home must be a number`);
      if (j.range && !RANGE_POLICIES.includes(j.range)) {
        errs.push(`${at}: range must be one of ${RANGE_POLICIES.join(', ')}`);
      }
      const fb = j.feedback;
      if (!fb || typeof fb !== 'object') errs.push(`${at}: feedback is required (property, unit)`);
      else {
        if (!fb.property) errs.push(`${at}: feedback.property is required`);
        if (!fb.unit) errs.push(`${at}: feedback.unit is required`);
        if (fb.scale !== undefined && typeof fb.scale !== 'number') errs.push(`${at}: feedback.scale must be a number`);
        if (fb.offset !== undefined && typeof fb.offset !== 'number') errs.push(`${at}: feedback.offset must be a number`);
      }
    }
  }

  // parents must exist and must not form a cycle
  const byName = new Map(def.joints.filter((j) => j && j.name).map((j) => [j.name, j]));
  for (const j of def.joints) {
    if (!j || !j.name || j.parent == null) continue;
    if (!byName.has(j.parent)) {
      errs.push(`joints (${j.name}): parent "${j.parent}" does not exist`);
      continue;
    }
    const walked = new Set([j.name]);
    let p = j.parent;
    while (p != null) {
      if (walked.has(p)) {
        errs.push(`joints (${j.name}): parent chain is a cycle`);
        break;
      }
      walked.add(p);
      p = byName.get(p)?.parent ?? null;
    }
  }
  return errs;
}

/** Throwing wrapper, for callers that cannot continue without a valid machine. */
export function requireMachine(def) {
  const errs = validateMachine(def);
  if (errs.length) throw new Error(`invalid machine "${def?.name ?? '?'}":\n  ${errs.join('\n  ')}`);
  return def;
}

/** Root-first order, so a parent is always posed before its children. */
export function jointOrder(def) {
  const byName = new Map(def.joints.map((j) => [j.name, j]));
  const depth = (j) => {
    let d = 0;
    let p = j.parent;
    while (p != null && byName.has(p)) {
      d++;
      p = byName.get(p).parent;
    }
    return d;
  };
  return [...def.joints].sort((a, b) => depth(a) - depth(b) || def.joints.indexOf(a) - def.joints.indexOf(b));
}

/**
 * Build the Object3D hierarchy the machine's geometry hangs from.
 *
 * Every joint becomes one node named after it. Geometry builders attach their
 * meshes to `nodes[name]`; the pose layer only ever touches the nodes, so a
 * mesh swapped for real CAD keeps working with no change here.
 *
 * @returns {{root: Object3D, nodes: Record<string, Object3D>}}
 */
export function buildSkeleton(THREE, def) {
  requireMachine(def);
  const root = new THREE.Group();
  root.name = def.name;
  const nodes = {};
  for (const j of jointOrder(def)) {
    const node = new THREE.Group();
    node.name = j.name;
    node.userData.joint = j;
    nodes[j.name] = node;
    (j.parent != null ? nodes[j.parent] : root).add(node);
  }
  return {root, nodes};
}

/** The home pose: every axis at `home`, else 0 clamped into its limits. */
export function homePose(def) {
  const out = {};
  for (const j of def.joints) {
    if (j.type === 'fixed') continue;
    out[j.name] = typeof j.home === 'number' ? j.home : clamp(0, j.min, j.max);
  }
  return out;
}

/** {propertyName: jointName} — the map the control adapter is generated from. */
export function propertyMap(def) {
  const out = {};
  for (const j of def.joints) if (j.type !== 'fixed' && j.feedback?.property) out[j.feedback.property] = j.name;
  return out;
}

/**
 * Convert one raw PLC value into joint units: scale, offset, then the range
 * policy. Returns the value to use plus what had to be done to it, so a
 * caller can show an out-of-range or invalid state instead of a wrong pose.
 */
export function acceptValue(joint, raw) {
  const v = finite(raw);
  if (v === null) return {value: null, state: 'invalid'};
  const scaled = v * (joint.feedback?.scale ?? 1) + (joint.feedback?.offset ?? 0);
  if (scaled < joint.min || scaled > joint.max) {
    const policy = joint.range ?? 'clamp';
    if (policy === 'reject') return {value: null, state: 'out-of-range', raw: scaled};
    if (policy === 'clamp') return {value: clamp(scaled, joint.min, joint.max), state: 'clamped', raw: scaled};
  }
  return {value: scaled, state: 'ok'};
}

/**
 * Pose the skeleton from accepted feedback, keyed by joint name.
 *
 * Nothing is written back anywhere: this reads feedback and sets transforms.
 * A joint missing from `feedback` keeps its home value, so a partially bound
 * control still draws a sane machine instead of collapsing to the origin.
 *
 * @returns {{values: Record<string, number>, states: Record<string, string>, ok: boolean}}
 */
export function applyPose(THREE, def, nodes, feedback = {}) {
  const home = homePose(def);
  const values = {};
  const states = {};
  const axis = new THREE.Vector3();

  for (const j of def.joints) {
    const node = nodes[j.name];
    if (!node) continue;
    node.position.set(j.origin[0], j.origin[1], j.origin[2]);
    node.quaternion.identity();
    if (j.type === 'fixed') continue;

    const has = Object.prototype.hasOwnProperty.call(feedback, j.name);
    const {value, state} = has ? acceptValue(j, feedback[j.name]) : {value: home[j.name], state: 'home'};
    const v = value === null ? home[j.name] : value;
    values[j.name] = v;
    states[j.name] = state;

    axis.set(j.axis[0], j.axis[1], j.axis[2]).normalize();
    if (j.invert) axis.negate();
    if (j.type === 'revolute') node.quaternion.setFromAxisAngle(axis, rad(v));
    else node.position.addScaledVector(axis, v);
  }

  const ok = Object.values(states).every((s) => s === 'ok' || s === 'home');
  return {values, states, ok};
}
