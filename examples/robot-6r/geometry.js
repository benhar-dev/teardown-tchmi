// Placeholder geometry for the 6-axis arm.
//
// Each part is attached to the joint node it belongs to, in that node's own
// frame, so the pose layer never has to know what the parts are. Replacing
// these primitives with decimated CAD means attaching a loaded mesh to the
// same node with the same origin: nothing else in the control changes.

import {box, cyl, link, palette, plate} from '../../kit/parts.js';

export function build(THREE, machine, nodes, opts = {}) {
  const mat = palette(opts.theme);
  const warn = new THREE.MeshStandardMaterial({color: 0xd8341c, roughness: 0.4, emissive: 0x3b0a04});

  // Pedestal and base casting
  nodes.base.add(cyl(mat.dark, 250, 60, [0, 30, 0]));
  nodes.base.add(cyl(mat.body, 200, 130, [0, 115, 0]));

  // A1 carousel
  nodes.a1.add(cyl(mat.body, 185, 300, [0, 150, 0]));
  nodes.a1.add(box(mat.dark, 300, 90, 300, [0, 300, 0]));

  // A2 shoulder and upper arm
  nodes.a2.add(cyl(mat.metal, 115, 260, [0, 0, 0], 'x'));
  nodes.a2.add(link(mat.body, [0, 60, 0], [0, 660, 0], 200, 175));

  // A3 elbow and forearm
  nodes.a3.add(cyl(mat.metal, 95, 215, [0, 0, 0], 'x'));
  nodes.a3.add(link(mat.body, [0, 50, 0], [0, 530, 0], 165, 145));

  // A4 wrist roll
  nodes.a4.add(cyl(mat.metal, 80, 190, [0, 85, 0]));

  // A5 wrist pitch
  nodes.a5.add(cyl(mat.metal, 70, 160, [0, 0, 0], 'x'));
  nodes.a5.add(link(mat.body, [0, 40, 0], [0, 140, 0], 120, 120));

  // A6 flange, with a two-finger tool so the wrist orientation reads at a glance
  nodes.a6.add(cyl(mat.dark, 72, 26, [0, 13, 0]));
  nodes.a6.add(plate(mat.metal, 150, 110, 18, [0, 35, 0]));
  nodes.a6.add(box(mat.metal, 26, 110, 80, [-55, 95, 0]));
  nodes.a6.add(box(mat.metal, 26, 110, 80, [55, 95, 0]));
  const tcp = cyl(mat.accent, 16, 40, [0, 160, 0]);
  nodes.a6.add(tcp);

  // One limit marker per moving axis. Colour means something here: it appears
  // only when an axis is sitting on the limit the contract declares.
  const markers = {};
  for (const j of machine.joints) {
    if (j.type !== 'revolute' && j.type !== 'prismatic') continue;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(135, 14, 8, 24), warn);
    ring.visible = false;
    if (Math.abs(j.axis[1]) > 0.5) ring.rotation.x = Math.PI / 2;
    else ring.rotation.y = Math.PI / 2;
    nodes[j.name].add(ring);
    markers[j.name] = ring;
  }

  return {
    update(values, states) {
      for (const j of machine.joints) {
        const ring = markers[j.name];
        if (!ring) continue;
        const v = values[j.name];
        const atLimit = v !== undefined && (Math.abs(v - j.min) < 0.5 || Math.abs(j.max - v) < 0.5);
        ring.visible = atLimit || states[j.name] === 'clamped' || states[j.name] === 'out-of-range';
      }
    },
    dispose() {
      warn.dispose();
      for (const m of Object.values(mat)) m?.dispose?.();
    },
  };
}
