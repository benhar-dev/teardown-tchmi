---
name: teardown-tchmi
description: Generate native TwinCAT HMI controls that show a machine in 3D, posed from PLC actual feedback - robots, conveyors, gantries, presses, any mechanism with axes. Builds the machine contract, the viewer, the control adapter and an installable NuGet package, and reviews the result as pose sheets. Use for PLC-driven machine graphics, HMI machine views, 3D visualisation of TwinCAT axes, and turning CAD into an HMI control.
---

# Teardown for TwinCAT HMI

One machine, one control. The PLC says where the axes are; the control shows the machine standing exactly there, and shows nothing it cannot prove.

This skill produces **native TwinCAT HMI controls and the NuGet packages that install them**, and nothing else. There is no standalone page, no film, no sound and no auto tour. If a machine is not moving, the picture is not moving.

`SKILL_DIR` below is the folder this file lives in. Builds, sheets and scaffolded packages go to `./teardown-out` of the folder you run from.

## First run

```
cd "$SKILL_DIR" && npm install && npx playwright install chromium
```

Node 20 or newer. Chromium is only for pose sheets; nothing at runtime needs it. There is no ffmpeg and no Python dependency.

## The order of work

Work in this order. Each step is checkable before the next one costs anything.

1. **The contract** — `machine.json`: axes, units, limits, PLC symbols, validity. Nothing is drawn until this is agreed.
2. **Geometry** — placeholder primitives now, decimated CAD when it arrives. Both hang off the same joint nodes.
3. **The control** — scaffold the package, bind the properties, raise the events.
4. **The review** — `check.mjs`, then pose sheets, then Engineering, then a live PLC. Report which of those you actually did.

## machine.json is the one source

Everything is generated from this file: the Object3D hierarchy, the control's bindable properties, the feedback traces the harness drives, and the documentation. Nothing about the machine's structure is written twice, so nothing can drift.

```json
{
  "name": "Robot6R",
  "units": {"length": "mm", "angle": "deg"},
  "staleAfterMs": 2000,
  "joints": [
    {"name": "base", "type": "fixed", "parent": null, "origin": [0, 0, 0]},
    {"name": "a1", "type": "revolute", "parent": "base", "origin": [0, 180, 0], "axis": [0, 1, 0],
     "min": -170, "max": 170, "home": 0, "range": "clamp",
     "feedback": {"property": "Axis1Position", "symbol": "ADS.PLC1.MAIN.fbRobot.aAxis[1].fActPos",
                  "unit": "deg", "scale": 1, "offset": 0, "description": "Actual position of axis 1"}}
  ]
}
```

- **Lengths are millimetres, angles are degrees.** CAD and PLC axis data arrive that way; the kit never converts behind your back.
- `type` is `revolute`, `prismatic` or `fixed`. A machine with one axis has one joint; a six-axis robot has six.
- `origin` is relative to the parent joint, in the parent's frame. This is the part CAD does not give you — see [references/cad-pipeline.md](references/cad-pipeline.md).
- `min`/`max` are the real limits, and `range` says what happens outside them: `clamp` (default), `reject` or `pass`.
- `feedback.symbol` is the PLC symbol the property is expected to bind to. Discover it; do not invent it.
- Geometry attaches only to joints that physically move. A conveyor's belt distance and a gripper's opening drive `update()` instead — see the conveyor and gantry examples.

Check it before you build anything: `node harness/check.mjs ./my-machine`.

## The three examples

Copy the closest one.

| | The machine | What drives it | Worth stealing |
|---|---|---|---|
| `examples/robot-6r` | A 6-axis articulated arm. | Six actual axis positions, degrees. | A parent chain of revolutes; limit markers that appear only on the limit. |
| `examples/conveyor` | A belt section with product tracking and a blade stopper. | One encoder distance, millimetres. | Products placed modulo the pitch from one distance: right at any speed, survives a counter jump, cannot drift. |
| `examples/gantry` | A three-axis pick-and-place with a gripper. | Three positions and a jaw opening. | A mast stretched by scale between trolley and axis; two jaws mirrored from one value. |

```
node harness/check.mjs                          # the contracts and the adapter
node build.mjs harness                          # the review page
node harness/sheet.mjs robot-6r --trace axes    # read the result
```

## How a control is built

| Piece | Job |
|---|---|
| `machine.json` | The contract. Axes, units, limits, symbols, validity. |
| `geometry.js` | `build(THREE, machine, nodes)` attaches meshes to joint nodes and returns `{update(values, states), dispose()}`. |
| `kit/pose.js` | machine.json → skeleton, and feedback → pose. Deterministic, no clock, no state. |
| `kit/viewer.js` | One instance's scene, camera, canvas and lifecycle. Draws on change only. |
| `kit/control-base.js` | The adapter: conversion, range policy, change detection, validity, events. Imports no TcHmi, so it is testable anywhere. |
| `scaffold.mjs` | Writes the package: Description.json, Template.html, Style.css, Control.js, Manifest.json, .nuspec. |

The generated control is a thin shell: framework setters call `adapter.setProperty`, adapter events become `TcHmi.EventProvider.raise`. Machine logic never sits in the shell.

## Rules that decide whether it works

1. **The PLC is the only source of actual state.** Never advance a pose from wall time, an animation loop, a setpoint or an operator gesture. If feedback stops, the machine stops. A view that keeps moving when the PLC has gone quiet is lying to an operator standing in front of a machine.
2. **Unavailable is the default.** A control shows "no data" until something valid arrives, and says so plainly when data is stale, out of range or the PLC is not answering. A numeric binding alone proves nothing about connection quality: bind a real validity or watchdog signal as well. A toggling test bit is not a watchdog.
3. **Real numbers, one source.** Limits, units, scale and offset live in `machine.json` and nowhere else. Check one by hand against the machine.
4. **Draw on change.** Feedback arrives at the subscription rate, usually 100–500 ms. An idle screen must cost nothing. There is no `requestAnimationFrame` loop in a control.
5. **Commands are separate from feedback.** If the user asks for buttons, define separate request properties and events with deliberately configured HMI write actions, and move the pose only when acknowledged feedback moves. A feedback-only viewer needs no ADS client and writes no symbols.
6. **Colour means something.** Accent is the selected or active part; amber and red are warning and fault; grey is unavailable. Nothing animates for delight. Motion means the machine moved.
7. **Start from the real machine.** A photo, a GA drawing, the CAD, the axis list from the PLC. Machines invented from a sentence come out generic, and an operator spots it instantly.

## Rendering on a panel PC

The target is an industrial panel with an integrated GPU, running for months without a reload, often several controls on one screen.

- **One WebGL context per client.** `kit/renderers.js` shares a single renderer across every viewer and blits into each control's own canvas. A browser gives a page 8–16 contexts before it starts killing the oldest; a line overview would lose views at random without this.
- **No post-processing.** No GTAO, no bloom, no tone-mapped film look. They cost the most of anything in the frame and in factory light they mostly eat contrast.
- **Cap the pixel ratio** (1.5 by default). A 4K panel at full ratio quadruples the cost for no readable gain.
- **Handle context loss.** `webglcontextlost` must be prevented and recovered from with a visible unavailable state. On a kiosk browser running for months this will happen.
- **Warm the shaders** once at attach (`kit/warm.js`), so the first visible frame is not a freeze.
- **Budget the geometry.** Raw CAD tessellation is millions of triangles and will not survive an Elkhart Lake panel. See [references/cad-pipeline.md](references/cad-pipeline.md).
- **Touch targets at least 38 px**, no hover-only affordances, and states readable without colour.

## Security rules

- **PLC data is data, never markup.** Whoever can write a string symbol — a recipe name, an operator message, alarm text — would otherwise be writing the HMI's DOM. Build the DOM with `textContent` and `createElement`. If a template string is unavoidable, every interpolated value goes through `escHtml` from `kit/util.js`. There is no `innerHTML` in this kit and there should be none in a generated control.
- **Reject before you draw.** Non-finite values never reach three.js. Out-of-range values follow the declared policy and are never written back to the PLC as a correction.
- **No CDN, no import map, no runtime module resolution.** Everything is bundled into the package, with third-party licences preserved.
- **Never package credentials**, server settings or a customer's PLC project.

## The review loop

You cannot watch a machine screen from here, but you can read one tile per pose.

1. `node harness/check.mjs ./my-machine` — the contract and the adapter. Seconds, and it either passes or it does not.
2. `node build.mjs harness --machine ./my-machine` then `node harness/sheet.mjs my-machine --trace axes --cols 3`.
3. Read every tile against the checklist in [references/review-loop.md](references/review-loop.md), and read the printed table: a tile whose validity is not what the trace asked for is a bug however good the picture looks.
4. `--trace states` is not optional. No data, stale, offline, out of range and NaN are the states that reach an operator on a bad day.
5. Fix, rebuild, go back to 1. Stop when a full pass finds nothing.

Never report a control as done without reading sheets of the current build.

## Delivering into TwinCAT HMI

[references/twincat-hmi.md](references/twincat-hmi.md) is the detail: framework metadata, property schemas, lifecycle, packaging and the acceptance levels. Read it before generating a control.

Generate the machine, the control and the package **in the user's output project**, never into this skill's installation. This repository teaches the workflow; it is not a control library.

Be exact about what was tested. A pose sheet is not Engineering, the framework double in `harness/double.js` is not the framework, and neither is a live PLC.

## Credits

Derived from [elvarofficial/teardown](https://github.com/elvarofficial/teardown) (MIT), itself built on [whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion) (MIT). The standalone film and sound pipeline from those projects has been removed; `references/jansen-linkage.js` is kept as a worked example of closed-form linkage maths.
