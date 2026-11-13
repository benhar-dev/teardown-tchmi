# From CAD to a machine an HMI can pose

CAD gives you geometry. It does not give you joints, and joints are what a machine view is made of. Most of the work below is recovering the kinematic structure that the solid model never recorded.

Placeholder primitives exist so none of this blocks the control: wire the axes up to `kit/parts.js` boxes and cylinders first, get the contract and the bindings accepted, and swap in real meshes when they arrive. Attaching a loaded mesh to the same joint node changes nothing else.

## 1. Get a mesh format out of CAD

STEP and IGES are b-rep: a browser cannot read them and should not try. Convert on a workstation, once, as a human step with a checkpoint — never at runtime, and never inside a control.

| Source | Route |
|---|---|
| Robot vendors (KUKA, ABB, FANUC, UR, Stäubli) | Download their CAD, usually **one file per link**. This is the best case: the split you need is already made. |
| STEP / IGES assembly | FreeCAD (import, then Mesh workbench → tessellate, export glTF or STL per part) or Blender with a STEP importer. CAD Assistant exports glTF directly. |
| SolidWorks / Inventor / NX | Export glTF or STL per component directly, with a tessellation tolerance around 0.1 mm. |
| Nothing but a drawing | Build from `kit/parts.js` primitives against the GA dimensions, and say in the documentation that the geometry is schematic. |

Export **one file per moving link**, not one file for the whole machine. A single welded mesh cannot be posed.

## 2. Decimate to a panel budget

A raw tessellation is routinely two to five million triangles. An industrial panel will not survive it.

| Budget | Target |
|---|---|
| Triangles, whole machine | ≤ 150 000, and ≤ 40 000 per link |
| Draw calls | one per link; merge fasteners and small parts into the link they sit on |
| Materials | ≤ 8 for the machine |
| Textures | ≤ 1024², and only if a texture says something a flat colour cannot |
| Package payload | ≤ 8 MB of geometry; if you are past that, you are drawing detail nobody can see |

How to get there, in Blender:

1. Delete what is inside: fasteners, internal gearing, cable chains, anything behind a cover that never opens in the view.
2. Decimate (Collapse) per link, starting at 0.1, and compare the silhouette against the original at the view distance. Silhouette is what reads on a panel; interior detail is not.
3. Weld by distance, recalculate normals outward, shade smooth with an angle around 30°.
4. Apply transforms, then **set each link's origin to its joint centre** (see below).
5. Export glTF binary (`.glb`), Y up, metres off, millimetres on — or scale on import.

## 3. Recover the joint frames

This is the part that decides whether the view is right.

For each moving link, in CAD:

1. Find the **axis of motion**: the bore centreline for a revolute, the rail direction for a prismatic.
2. Note a **point on that axis** — the bearing centre, the rail zero — in the parent link's coordinate system. That is `origin` in `machine.json`.
3. Note the **direction** as a unit vector in the parent's frame. That is `axis`. Positive rotation follows the right-hand rule about it; if the machine counts the other way, set `"invert": true` rather than negating the vector, so the drawing and the file still agree.
4. Note the **zero**: what value the PLC reports when the link is at the modelled position. That is `feedback.offset`, and it is where most first-attempt views are wrong.
5. Note the **limits** from the machine data sheet, not from the model.

Then set each exported mesh's origin to the same point, so attaching it to the joint node needs no fudge offset:

```js
nodes.a3.add(mesh);           // mesh origin is on the joint axis: nothing else to do
```

If a mesh arrives in machine coordinates instead, subtract the joint's world origin once at load and record that you did.

### Prove the frames before trusting them

- Pose the machine to a position you can photograph on the real machine, and compare them side by side.
- Pose each axis to both limits on a sheet (`--trace axes`). Self-collision at a limit means a wrong origin or a wrong sign, every time.
- Check one dimension by hand: a 600 mm arm on screen must measure 600 mm between its joint centres.
- Drive one axis on the real machine and watch which way the view goes. Signs are 50/50 and documentation is often wrong.

## 4. Load it in the control

```js
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export function build(THREE, machine, nodes, opts) {
  const loader = new GLTFLoader();
  const url = opts.assets + 'arm-link3.glb';   // a file beside the control in the package
  let disposed = false;
  loader.load(url, (gltf) => {
    if (disposed) return;                      // a detached control must not be revived by a late load
    nodes.a3.add(gltf.scene);
    opts.invalidate?.();                       // one redraw, because something changed
  });
  return {dispose() { disposed = true; }};
}
```

- Ship `.glb` files **beside** the control inside the package and reference them relatively. No CDN, no absolute URL, no import map.
- Do not use DRACO or Meshopt unless you bundle the decoder as a local file: their decoders are fetched at runtime by default, which fails in an HMI client.
- A late-arriving asset must not revive a destroyed instance, and abandoned assets must be disposed.
- Until a mesh loads, the placeholder geometry is what the operator sees. Make sure that is acceptable.

## 5. When 3D is the wrong answer

For a line overview, a P&ID or a photo-backed station view, a 2.5D overlay — a photograph or diagram with SVG elements transformed by PLC values — reads better, costs almost nothing on a panel and works on hardware with no usable GPU. The same `machine.json` contract applies: axes, units, limits, symbols and validity do not change because the renderer did.

The kit does not ship a 2.5D viewer yet. Build it as plain SVG in the control's template, bind it through the same adapter, and keep every rule from SKILL.md: PLC values are data not markup, draw on change, unavailable by default.
