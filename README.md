# teardown-tchmi

An AI coding-agent skill that turns a machine into a **native TwinCAT HMI control**: a 3D view of the real mechanism, posed from the PLC's actual axis feedback, packaged as a NuGet you can install in HMI Engineering.

Robots, conveyors, gantries, presses — anything with axes. You bring the axis list and the CAD; the agent builds the contract, the viewer, the control and the package, and reviews the result as sheets of poses.

This is TwinCAT HMI only. There is no standalone page, no recorded film, no sound and no auto tour: if the machine is not moving, the picture is not moving.

## Install

**Claude Code:**

```bash
npx skills add benhar-dev/teardown-tchmi -g -a claude-code
```

**OpenAI Codex:**

```bash
npx skills add benhar-dev/teardown-tchmi -g -a codex
```

Then, once, in the installed skill folder (for example `~/.claude/skills/teardown-tchmi`):

```
npm install && npx playwright install chromium
```

Node 20 or newer. Chromium is only used for pose sheets on your development machine — a generated control is a bundled `.js` file in a package and needs nothing but the HMI client.

## Use

Ask in plain words:

> Build me an HMI control for our 6-axis robot. Axis feedback is in `MAIN.fbRobot.aAxis[1..6].fActPos`.

> Make an HMI view of the infeed conveyor driven by the encoder distance, with the blade stopper.

> Here is the STEP file for our gantry. Turn it into a TwinCAT HMI control bound to the X, Y and Z actual positions.

Or drive the examples first:

```
node harness/check.mjs                                    # contracts and adapter
node build.mjs harness                                    # the review page
node harness/sheet.mjs robot-6r --trace axes --cols 3     # a sheet of poses
node harness/sheet.mjs gantry --trace states              # no data, stale, offline, out of range, NaN
```

Open `teardown-out/harness/index.html?machine=robot-6r` to drive the axes with sliders.

## What is inside

| | |
|---|---|
| `SKILL.md` | What the agent reads: the contract, the rules, the review loop. |
| `references/twincat-hmi.md` | Framework metadata, properties, lifecycle, packaging, acceptance levels. |
| `references/cad-pipeline.md` | STEP to glTF, decimation budgets, and extracting joint frames from CAD. |
| `references/review-loop.md` | What to run, what to look at, what to report. |
| `kit/` | Pose layer, stage, shared renderer, viewer, control adapter, placeholder parts. |
| `harness/` | Headless checks, feedback traces, the review page, pose sheets, a framework double. |
| `examples/` | A 6-axis robot, a conveyor with product tracking, a three-axis gantry. |
| `build.mjs`, `scaffold.mjs` | Bundle a control; write a package skeleton into your project. |

Machine-specific controls and packages are generated in **your** project. This repository teaches the workflow; it does not ship a control library.

## Credits

Derived from [elvarofficial/teardown](https://github.com/elvarofficial/teardown) (MIT), built on [whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion) (MIT). The standalone film and sound pipeline from those projects has been removed.

MIT licence.
