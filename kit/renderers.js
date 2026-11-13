// One WebGL context per HMI client, shared by every viewer on the screen.
//
// Why not one context per control: a browser gives a page somewhere between 8
// and 16 WebGL contexts and silently kills the oldest past that. A line
// overview with a dozen station widgets would start losing views at random,
// which is the worst possible failure for a machine screen. One context is
// also one place to recover from a lost context, and one set of compiled
// programs for every control that shares materials.
//
// The cost is a copy: each viewer renders into the shared canvas and blits
// the result into its own 2D canvas. On a panel PC that copy is cheap next to
// the draw, and it is only paid when a control actually redraws, which with
// render-on-change is when feedback moves.

import * as THREE from 'three';

let shared = null;

function create() {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const state = {canvas, renderer, users: new Set(), listeners: new Set(), lost: false};

  canvas.addEventListener('webglcontextlost', (e) => {
    // Without preventDefault the context never comes back.
    e.preventDefault();
    state.lost = true;
    for (const cb of state.listeners) cb('lost');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    state.lost = false;
    for (const cb of state.listeners) cb('restored');
  });
  return state;
}

/**
 * Take a reference to the shared renderer.
 *
 * @param {(event: 'lost'|'restored') => void} [onContext] told when the GPU
 *   context goes away and when it comes back. A viewer shows its unavailable
 *   state on 'lost' and redraws on 'restored'.
 * @returns {{renderer, isLost: () => boolean, draw: Function, release: Function}}
 */
export function acquireRenderer(onContext) {
  if (!shared) shared = create();
  const token = {};
  shared.users.add(token);
  if (onContext) shared.listeners.add(onContext);

  return {
    get renderer() {
      return shared.renderer;
    },
    isLost: () => shared.lost,

    /**
     * Render `scene` at this size and copy it into `target2d`.
     * @param {CanvasRenderingContext2D} target2d the viewer's own canvas
     */
    draw(scene, camera, target2d, w, h, pixelRatio) {
      if (!shared || shared.lost || w < 1 || h < 1) return false;
      const r = shared.renderer;
      r.setPixelRatio(pixelRatio);
      r.setSize(w, h, false);
      r.render(scene, camera);
      const px = Math.max(1, Math.round(w * pixelRatio));
      const py = Math.max(1, Math.round(h * pixelRatio));
      if (target2d.canvas.width !== px || target2d.canvas.height !== py) {
        target2d.canvas.width = px;
        target2d.canvas.height = py;
      }
      target2d.clearRect(0, 0, px, py);
      target2d.drawImage(shared.canvas, 0, 0, px, py, 0, 0, px, py);
      return true;
    },

    release() {
      if (!shared) return;
      shared.users.delete(token);
      if (onContext) shared.listeners.delete(onContext);
      // The last viewer on the screen takes the context down with it, so a
      // view that is closed for the night leaves no GPU memory behind.
      if (!shared.users.size) {
        shared.renderer.dispose();
        shared.renderer.forceContextLoss?.();
        shared = null;
      }
    },
  };
}

/** Viewers currently holding the shared renderer. For diagnostics and tests. */
export const rendererUsers = () => (shared ? shared.users.size : 0);
