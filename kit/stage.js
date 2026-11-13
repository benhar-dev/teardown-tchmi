// The studio a machine is drawn in: lights, shadow ground, camera framing.
//
// Deliberately plain. There is no GTAO, no bloom and no tone-mapped film
// look here: those cost the most of anything in the frame, and on a panel in
// factory light they mostly eat contrast. A machine screen wants flat, even
// light, a readable shadow under the machine and honest colour.
//
// The canvas is transparent, so the control sits on the HMI's own background
// and follows the project's theme instead of painting its own.

import * as THREE from 'three';

export const THEMES = {
  light: {key: 0xffffff, fill: 0xdfe4ea, ground: 0xb8c0c8, shadow: 0.22, ambient: 0.55},
  dark: {key: 0xf2f4f8, fill: 0x30363d, ground: 0x0b0d10, shadow: 0.42, ambient: 0.32},
};

/**
 * @param {object} opts
 * @param {'light'|'dark'} opts.theme
 * @param {number} opts.fov
 * @param {boolean} opts.shadows  false on the weakest panels: saves a pass
 * @param {number} opts.shadowSize shadow map edge, 1024 unless you measured
 */
export function createStage(opts = {}) {
  const {theme = 'light', fov = 35, shadows = true, shadowSize = 1024} = opts;
  const t = THEMES[theme] ?? THEMES.light;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 10, 100000); // millimetres

  const ambient = new THREE.HemisphereLight(t.key, t.ground, t.ambient);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(t.key, 1.5);
  key.position.set(1200, 2200, 1600);
  key.castShadow = shadows;
  if (shadows) {
    key.shadow.mapSize.set(shadowSize, shadowSize);
    key.shadow.bias = -0.0015;
    key.shadow.normalBias = 2;
  }
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight(t.key, 0.45);
  fill.position.set(-1600, 900, -1200);
  scene.add(fill);

  // The ground takes the shadow and nothing else, so the HMI's own background
  // shows through the control.
  const groundGeo = new THREE.PlaneGeometry(1, 1);
  const groundMat = new THREE.ShadowMaterial({opacity: t.shadow});
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = shadows;
  ground.visible = shadows;
  scene.add(ground);

  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();
  const centre = new THREE.Vector3();

  /**
   * Frame `object` in the view: ground under it, lights and shadow camera
   * sized to it, camera on a 3/4 view at `azimuth`/`elevation` degrees.
   * Call it once the machine is built and again if its extents change.
   */
  function fit(object, {margin = 1.25, azimuth = 35, elevation = 22} = {}) {
    box.setFromObject(object);
    if (box.isEmpty()) return {radius: 1000, centre: centre.set(0, 0, 0)};
    box.getBoundingSphere(sphere);
    const r = Math.max(sphere.radius, 1);
    centre.copy(sphere.center);

    ground.position.set(centre.x, box.min.y, centre.z);
    ground.scale.setScalar(r * 12);

    const a = (azimuth * Math.PI) / 180;
    const e = (elevation * Math.PI) / 180;
    // Fit the sphere in both directions: a wide tile and a tall one need
    // different distances, and using the vertical field of view alone leaves
    // a tall machine a speck in a landscape control.
    const fovY = (camera.fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * Math.max(camera.aspect || 1, 0.01));
    const dist = margin * Math.max(r / Math.sin(fovY / 2), r / Math.sin(fovX / 2));
    camera.position.set(
      centre.x + dist * Math.cos(e) * Math.sin(a),
      centre.y + dist * Math.sin(e),
      centre.z + dist * Math.cos(e) * Math.cos(a),
    );
    camera.near = Math.max(dist - r * 4, 1);
    camera.far = dist + r * 8;
    camera.lookAt(centre);
    camera.updateProjectionMatrix();

    key.position.set(centre.x + r * 1.6, box.min.y + r * 3, centre.z + r * 2);
    key.target.position.copy(centre);
    key.target.updateMatrixWorld();
    if (shadows) {
      const s = key.shadow.camera;
      s.left = -r * 1.8;
      s.right = r * 1.8;
      s.top = r * 1.8;
      s.bottom = -r * 1.8;
      s.near = 1;
      s.far = r * 8;
      s.updateProjectionMatrix();
    }
    fill.position.set(centre.x - r * 2, centre.y + r, centre.z - r * 1.5);
    return {radius: r, centre: centre.clone()};
  }

  function dispose() {
    groundGeo.dispose();
    groundMat.dispose();
    scene.remove(ground, key, key.target, fill, ambient);
  }

  return {scene, camera, ground, lights: {ambient, key, fill}, fit, dispose, theme: t};
}
