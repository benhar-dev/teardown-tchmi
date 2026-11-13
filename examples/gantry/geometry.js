// Placeholder geometry for the three-axis gantry.
//
// Two patterns worth copying: the mast, which is stretched between the
// trolley and the vertical axis rather than being a rigid body (scale, not a
// second axis), and the jaws, which are mirrored from one opening value.

import {box, palette} from '../../kit/parts.js';

export function build(THREE, machine, nodes, opts = {}) {
  const mat = palette(opts.theme);
  const {span, depth, height, mastBase} = machine.layout;

  // Frame: two rails on four legs
  for (const z of [-depth / 2, depth / 2]) {
    nodes.frame.add(box(mat.metal, span + 300, 120, 120, [0, height, z]));
    for (const x of [-span / 2, span / 2]) {
      nodes.frame.add(box(mat.body, 150, height, 150, [x, height / 2, z]));
      nodes.frame.add(box(mat.dark, 260, 40, 260, [x, 20, z]));
    }
  }

  // Bridge, trolley and head
  nodes.gx.add(box(mat.body, 240, 150, depth + 120, [0, 0, 0]));
  nodes.gz.add(box(mat.metal, 260, 180, 260, [0, -40, 0]));
  nodes.gy.add(box(mat.dark, 300, 120, 220, [0, -60, 0]));

  // The mast hangs from the trolley and follows the vertical axis by scale.
  const mast = box(mat.metal, 120, 1, 120, [0, 0, 0]);
  nodes.gz.add(mast);

  // Jaws: both mirrored from one opening value, so neither is attached to the
  // grip node itself.
  const jawL = box(mat.accent, 40, 180, 170, [0, -180, 0]);
  const jawR = box(mat.accent, 40, 180, 170, [0, -180, 0]);
  nodes.gy.add(jawL);
  nodes.gy.add(jawR);

  return {
    update(values) {
      const len = mastBase + (values.gy ?? 0);
      mast.scale.y = len;
      mast.position.y = -120 - len / 2;
      const half = 30 + (values.grip ?? 0) / 2;
      jawL.position.x = -half;
      jawR.position.x = half;
    },
    dispose() {
      for (const m of Object.values(mat)) m?.dispose?.();
    },
  };
}
