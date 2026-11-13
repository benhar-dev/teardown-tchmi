// Placeholder geometry for the belt conveyor.
//
// The pattern worth copying here is the belt. Nothing about a conveyor is a
// rigid body that slides: one encoder distance places every product, modulo
// the pitch, so the view is right at any speed, survives a jump in the
// counter and never drifts, because there is no local integration to drift.
// Geometry is attached to `frame`, and `update()` reads the belt distance.

import {box, cyl, palette, products} from '../../kit/parts.js';

export function build(THREE, machine, nodes, opts = {}) {
  const mat = palette(opts.theme);
  const {length: L, width: W, beltTop, pitch, products: count} = machine.layout;

  // Belt surface and side rails
  nodes.frame.add(box(mat.dark, L, 24, W, [0, beltTop, 0]));
  nodes.frame.add(box(mat.metal, L, 90, 50, [0, beltTop - 70, W / 2 + 25]));
  nodes.frame.add(box(mat.metal, L, 90, 50, [0, beltTop - 70, -W / 2 - 25]));

  // End rollers and legs
  for (const x of [-L / 2 + 60, L / 2 - 60]) nodes.frame.add(cyl(mat.metal, 70, W, [x, beltTop - 50, 0], 'z'));
  for (const x of [-L / 2 + 200, 0, L / 2 - 200]) {
    for (const z of [-W / 2, W / 2]) {
      nodes.frame.add(box(mat.body, 70, beltTop - 120, 70, [x, (beltTop - 120) / 2, z]));
    }
  }

  // Products: one instanced mesh, one draw call however many are on the belt
  const prodH = 160;
  const flow = products(mat.accent, count, [220, prodH, 200]);
  nodes.frame.add(flow.mesh);

  // Blade stopper: attached to its own joint node, so the pose layer moves it
  nodes.stopper.add(box(mat.body, 40, 180, W * 0.8, [0, 20, 0]));

  return {
    update(values) {
      const d = values.belt ?? 0;
      for (let i = 0; i < count; i++) {
        const x = (((i * pitch + d) % L) + L) % L;
        flow.place(i, x - L / 2, beltTop + prodH / 2 + 12, 0);
      }
      flow.commit();
    },
    dispose() {
      for (const m of Object.values(mat)) m?.dispose?.();
    },
  };
}
