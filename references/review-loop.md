# The review loop

You cannot stand in front of the panel from here. You can read a sheet of poses, and you can read a table of states. Do both, every time, before reporting anything as working.

## Five levels, and they are not interchangeable

Say which of these you actually did. Each one proves something the one before it cannot.

| Level | Command | Proves |
|---|---|---|
| 1 Contract | `node harness/check.mjs ./my-machine` | machine.json is valid, the pose is deterministic and drift-free, the adapter refuses rubbish, notifies once per change and starts unavailable. |
| 2 Pose sheet | `node harness/sheet.mjs my-machine --trace axes` | The machine looks right across its whole envelope, and the unavailable states look like something an operator can act on. |
| 3 Framework double | a control instantiated against `harness/double.js` | Registration, lifecycle, property notifications and semantic events are wired. **Not** the framework. |
| 4 Engineering | install the package in a test HMI project | Restore, toolbox registration, schema validation, properties and events visible, HMI build succeeds. |
| 5 Live PLC | a mapped project on real hardware | Values move the pose, units and scaling agree, events drive HMI actions, no unintended writes, bindings survive view removal and recreation. |

A control that passes 1–3 has never met TwinCAT. Say so in those words.

## The traces

```
node harness/sheet.mjs my-machine --trace sweep   # every axis min to max together: the envelope
node harness/sheet.mjs my-machine --trace axes    # one axis at a time: min, home, max
node harness/sheet.mjs my-machine --trace cycle   # a plausible motion, axes out of phase
node harness/sheet.mjs my-machine --trace states  # no data, valid, stale, offline, out of range, NaN
```

`--trace states` is the one that finds real defects. Run it on every machine.

Useful flags: `--n 12` samples, `--cols 4`, `--theme dark`, `--size 1920x1400`, `--shadows 0`, `--out <file.png>`.

## Reading a tile

**The mechanism.** Every part that should touch touches. Nothing passes through anything at either limit. The pose matches the numbers in the caption. A six-axis arm folded into its own base at 100% is either wrong limits or wrong axis directions.

**The frame.** The machine fills 50–70% of the tile at the default view. Nothing important is cut off. The part an operator cares about is not hidden behind the machine at the default camera.

**The states.** No data, stale and offline each say something different and each is legible at a glance. A dimmed machine with no message is not a state.

**Colour.** Accent only on what is selected or active; amber and red only on warning and fault. If a tile is colourful for decoration, take the colour out.

**Type.** Readouts legible at panel distance. Nothing clipped. Units shown.

## Reading the table

`sheet.mjs` prints one row per tile:

```
pose              validity   renders  ms
no data yet       invalid    1        40
valid             valid      1        6
stale             stale      1        6
PLC offline       offline    1        5
```

- **validity** must be what the trace asked for. A tile that says `valid` while the trace asked for `stale` is a bug in the control, not in the sheet.
- **renders** must be 1. More than one means something is redrawing without being asked, which on a panel means a view that never idles.
- **ms** is the draw cost on this machine's GPU. A panel PC is several times slower: treat anything over about 25 ms here as a problem there.

## Performance, checked rather than assumed

In the harness page (`mode=single`), the readout shows renders, last frame time and skipped frames. Leave it open on a static machine for a minute: the render count must not move. If it climbs, something is driving a frame that no feedback asked for.

## What to report

- Which levels you ran, and which you did not.
- The sheets you read, by file name.
- Dependency versions, the package path, and the exact build command.
- Anything you could not test, named plainly: no Engineering, no PLC, no panel.
