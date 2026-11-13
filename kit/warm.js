// Shader warm-up before a viewer's first visible frame.
//
// three.js links a program the first time something draws with it, and the
// frame waits on every one in turn. On a panel PC that is a visible freeze the
// first time an operator opens the view. compileAsync starts them all at once
// (KHR_parallel_shader_compile where the driver has it) and nothing blocks.
//
// There is no post-processing in an HMI viewer, so this is the whole story:
// compile the scene against the target it will draw into.

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @returns {Promise<void>} resolves when every program in the scene is linked
 */
export function warmUp(renderer, scene, camera) {
  if (!renderer || typeof renderer.compileAsync !== 'function') return Promise.resolve();
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(null);
  let wait;
  try {
    wait = renderer.compileAsync(scene, camera);
  } catch (e) {
    wait = Promise.resolve();
  }
  renderer.setRenderTarget(prev);
  return Promise.resolve(wait).catch(() => {});
}
