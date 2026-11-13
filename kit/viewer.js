// An instance-owned machine viewer.
//
// The rule that shapes this file: a viewer draws when something it shows has
// changed, and at no other time. There is no animation loop, no clock and no
// idle tour. An HMI screen left open on a standing machine must cost nothing;
// a view that burns a core and a third of the GPU overnight is a support call
// and a hot panel.
//
// Camera interaction is the one thing a viewer owns outright: orbiting moves
// the camera and marks the view dirty. It never touches machine state, and
// machine state only ever arrives through setFeedback().

import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {applyPose, buildSkeleton, homePose, requireMachine} from './pose.js';
import {acquireRenderer} from './renderers.js';
import {createStage} from './stage.js';
import {warmUp} from './warm.js';

/** Everything that is not 'valid' draws the machine as unavailable. */
export const VALIDITY = ['valid', 'stale', 'invalid', 'offline', 'error'];

const UNAVAILABLE_TEXT = {
  stale: 'Data stale',
  invalid: 'No data',
  offline: 'PLC not connected',
  error: 'View unavailable',
};

/**
 * @param {HTMLElement} host element the viewer fills (the control's template root)
 * @param {object} machine machine.json
 * @param {(THREE, machine, nodes) => ({dispose?, update?})} build attaches geometry to the joint nodes
 * @param {object} opts theme, orbit, shadows, maxPixelRatio, onEvent
 */
export function createViewer(host, machine, build, opts = {}) {
  requireMachine(machine);
  const {
    theme = 'light',
    orbit = true,
    shadows = true,
    maxPixelRatio = 1.5,
    onEvent = () => {},
  } = opts;

  // ---- DOM: a 2D canvas the shared renderer blits into, plus one overlay
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  const ctx = canvas.getContext('2d');
  const overlay = document.createElement('div');
  overlay.setAttribute('data-machine-overlay', '');
  overlay.hidden = true;
  host.appendChild(canvas);
  host.appendChild(overlay);

  // ---- scene
  const stage = createStage({theme, shadows});
  const {root, nodes} = buildSkeleton(THREE, machine);
  stage.scene.add(root);
  const built = build ? build(THREE, machine, nodes) || {} : {};

  let feedback = {...homePose(machine)};
  let validity = 'invalid'; // nothing is trusted until the PLC says otherwise
  let poseInfo = applyPose(THREE, machine, nodes, feedback);
  built.update?.(poseInfo.values, poseInfo.states);

  const gpu = acquireRenderer((ev) => {
    if (ev === 'lost') {
      setValidity('error');
    } else {
      sized = false;
      invalidate();
    }
  });

  const viewOpts = {...(machine.view || {}), ...(opts.view || {})};
  let userMoved = false; // an operator's own view survives a resize
  stage.fit(root, viewOpts);
  let controls = null;
  if (orbit) {
    controls = new OrbitControls(stage.camera, canvas);
    controls.enableDamping = false; // damping needs a render loop; we do not have one
    controls.target.copy(stage.fit(root, viewOpts).centre);
    controls.addEventListener('start', () => {
      userMoved = true;
    });
    controls.addEventListener('change', invalidate);
    controls.update();
  }

  // ---- render on change only
  let dirty = true;
  let scheduled = 0;
  let suspended = false;
  let sized = false;
  let w = 0;
  let h = 0;
  const stats = {renders: 0, lastMs: 0, skipped: 0};

  function measure() {
    const r = host.getBoundingClientRect();
    const nw = Math.floor(r.width);
    const nh = Math.floor(r.height);
    if (nw === w && nh === h && sized) return;
    w = nw;
    h = nh;
    sized = true;
    if (w > 0 && h > 0) {
      stage.camera.aspect = w / h;
      stage.camera.updateProjectionMatrix();
      // The framing depends on the aspect, so a control that was laid out
      // at one size has to be framed again at the next one — unless the
      // operator has moved the camera themselves, which wins.
      if (!userMoved) {
        const f = stage.fit(root, viewOpts);
        controls?.target.copy(f.centre);
        controls?.update();
      }
    }
    dirty = true;
  }

  function paint() {
    scheduled = 0;
    if (suspended || !dirty) return;
    measure();
    if (w < 1 || h < 1 || gpu.isLost()) {
      stats.skipped++;
      return; // hidden host or no context: stay dirty, draw when we are back
    }
    const t0 = performance.now();
    const pr = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    if (gpu.draw(stage.scene, stage.camera, ctx, w, h, pr)) {
      dirty = false;
      stats.renders++;
      stats.lastMs = performance.now() - t0;
    }
  }

  function invalidate() {
    dirty = true;
    if (suspended || scheduled) return;
    scheduled = requestAnimationFrame(paint);
  }

  /** Draw synchronously, for a screenshot harness that must not race a frame. */
  function renderNow() {
    dirty = true;
    sized = false;
    paint();
    return stats.renders;
  }

  function showOverlay() {
    const text = validity === 'valid' ? '' : UNAVAILABLE_TEXT[validity] ?? 'Unavailable';
    overlay.textContent = text; // never innerHTML: this text can come from the PLC
    overlay.hidden = !text;
    root.visible = validity !== 'error';
    const dim = validity === 'valid' ? 1 : validity === 'stale' ? 0.45 : 0.18;
    canvas.style.opacity = String(dim);
  }

  /**
   * New feedback, keyed by joint name. Values that do not move the machine
   * cost nothing: unchanged input does not mark the view dirty.
   */
  function setFeedback(partial) {
    let changed = false;
    for (const [k, v] of Object.entries(partial || {})) {
      if (feedback[k] !== v) {
        feedback[k] = v;
        changed = true;
      }
    }
    if (!changed) return poseInfo;
    poseInfo = applyPose(THREE, machine, nodes, feedback);
    built.update?.(poseInfo.values, poseInfo.states);
    invalidate();
    onEvent('feedback', {values: poseInfo.values, states: poseInfo.states, ok: poseInfo.ok});
    return poseInfo;
  }

  function setValidity(next) {
    if (!VALIDITY.includes(next) || next === validity) return;
    validity = next;
    showOverlay();
    invalidate();
    onEvent('validity', {validity});
  }

  function setTheme() {
    // Themes differ only in light and shadow values; rebuild the stage's
    // lighting rather than the machine.
    onEvent('error', {message: 'setTheme: rebuild the viewer to change theme'});
  }

  // ---- lifecycle
  const ro = new ResizeObserver(() => {
    sized = false;
    invalidate();
  });
  ro.observe(host);

  function suspend() {
    suspended = true;
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = 0;
  }

  function resume() {
    if (!suspended) return;
    suspended = false;
    sized = false;
    invalidate();
  }

  function dispose() {
    suspend();
    ro.disconnect();
    controls?.dispose();
    built.dispose?.();
    root.traverse((o) => {
      if (o.isMesh || o.isLine || o.isPoints) {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose?.();
      }
    });
    stage.scene.remove(root);
    stage.dispose();
    gpu.release();
    canvas.remove();
    overlay.remove();
  }

  showOverlay();
  const ready = warmUp(gpu.renderer, stage.scene, stage.camera).then(() => {
    invalidate();
    onEvent('ready', {});
  });

  return {
    canvas,
    overlay,
    stage,
    nodes,
    machine,
    ready,
    stats,
    setFeedback,
    setValidity,
    setTheme,
    invalidate,
    renderNow,
    suspend,
    resume,
    dispose,
    fit: (o) => {
      userMoved = false;
      const f = stage.fit(root, {...viewOpts, ...o});
      controls?.target.copy(f.centre);
      controls?.update();
      invalidate();
      return f;
    },
    get validity() {
      return validity;
    },
    get values() {
      return {...poseInfo.values};
    },
    get states() {
      return {...poseInfo.states};
    },
  };
}
