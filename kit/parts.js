// Placeholder geometry, in millimetres.
//
// Every example machine is built from these primitives, and every one of
// them is meant to be deleted. They exist so a control can be wired to the
// PLC, reviewed and accepted while the real CAD is still being exported and
// decimated: swap a part for a loaded mesh, attach it to the same joint node,
// and nothing else in the control changes. See references/cad-pipeline.md.

import * as THREE from 'three';

export const PALETTES = {
  light: {body: 0xdfe3e8, metal: 0x9aa4ae, dark: 0x3b434c, accent: 0xf07818, soft: 0xeef1f4},
  dark: {body: 0x6b7480, metal: 0x4a525c, dark: 0x1d2228, accent: 0xff9a3c, soft: 0x8b949e},
};

/** Shared materials for one machine. The viewer disposes them with the mesh tree. */
export function palette(theme = 'light') {
  const c = PALETTES[theme] ?? PALETTES.light;
  const mk = (color, roughness, metalness) => new THREE.MeshStandardMaterial({color, roughness, metalness});
  return {
    body: mk(c.body, 0.55, 0.1),
    metal: mk(c.metal, 0.4, 0.75),
    dark: mk(c.dark, 0.6, 0.3),
    accent: mk(c.accent, 0.45, 0.1),
    soft: mk(c.soft, 0.8, 0.0),
    colors: c,
  };
}

const shade = (mesh) => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

export function box(material, w, h, d, pos = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(pos[0], pos[1], pos[2]);
  return shade(m);
}

/** Cylinder along `axis` ('x' | 'y' | 'z'), centred on `pos`. */
export function cyl(material, r, h, pos = [0, 0, 0], axis = 'y', seg = 28) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(pos[0], pos[1], pos[2]);
  return shade(m);
}

/** A straight member between two points: the usual robot link or frame rail. */
export function link(material, from, to, w = 120, d = 120) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const len = dir.length() || 1;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), material);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return shade(m);
}

/** A flat plate, useful for bases, flanges and gripper jaws. */
export function plate(material, w, d, t = 20, pos = [0, 0, 0]) {
  return box(material, w, t, d, pos);
}

/**
 * Instanced products on a conveyor, placed by `update`. One draw call however
 * many boxes are on the belt.
 */
export function products(material, count, size = [220, 160, 180]) {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  return {
    mesh,
    /** place(i, x, y, z) for each instance, then commit() */
    place(i, x, y, z) {
      m4.makeTranslation(x, y, z);
      mesh.setMatrixAt(i, m4);
    },
    commit() {
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
