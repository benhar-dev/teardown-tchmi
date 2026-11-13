# Generate native TwinCAT HMI machine controls

Use this reference when the requested output is a PLC-driven TwinCAT HMI control
or installable HMI package. The deliverable is generated in the user's project.
Do not add a particular machine's implementation to the skill repository merely
to teach this workflow. Existing `sims/` examples are geometry/kinematics references.

## Establish the contract

Inspect the target project and any supplied reference controls before choosing
namespaces, dependency versions or symbol names. A useful reference is
[MobjectHmiComponents/src](https://github.com/benhar-dev/MobjectHmiComponents/tree/main/src):
compare its package Manifest.json and .nuspec with a control's Description.json,
Template.html, scoped CSS, getters/setters, property notifications and lifecycle.
Check the current files rather than copying their optional shared libraries or
unrelated package dependencies. If access fails, report it and continue work that
does not require the missing source; do not invent the reference's conventions.

Record the following in the generated project's documentation:

| Contract | Decide from the machine and target project |
|---|---|
| Actual feedback | Property name, PLC symbol, type, physical unit, valid range and conversion |
| Visual state | What each feedback value poses; limits, visibility, selection and alarms |
| Validity | Connection/watchdog signal, stale-data policy and visible unavailable state |
| Interaction | Camera/inspection actions versus explicit machine command requests |
| Events | Name, payload, firing condition, initialization behavior and HMI action use |
| Deployment | Package ID, namespace, HMI target, dependencies and build command |

Use existing symbol mappings when available. Discover mappings in HMI Engineering
or the project's server configuration; request missing target/symbol information
only when it cannot be found. Do not reconfigure a running PLC to suit a viewer.

## Separate feedback, geometry and rendering

Reuse a machine's deterministic geometry/update function, not its standalone
`live.js`, simulation clock, idle tour, flight sequence or DOM-global console.
For example, `sims/cessna-shared/gear.js` exposes `buildGear()` and
`update({stroke})`: stroke 0 is down/locked, 1 is retracted, and full travel is
201 mm. This is one example of a feedback-to-pose mapping, not a required machine.
For another machine, identify its own axes, units and degrees of freedom.

Generate three cooperating pieces as appropriate to the requested machine:

- A deterministic pose layer that consumes accepted actual feedback.
- An instance-owned Three.js scene/renderer that draws into the control template.
- A native TcHmiControl adapter exposing the documented properties and events.

Do not advance actual position from wall time, an animation loop, a command
setpoint or an operator gesture. No automatic tour should resume after inactivity.
Prefer on-demand drawing for static feedback; a render loop, if needed for camera
interaction, must not integrate or alter the machine state. Document any display
interpolation and distinguish it from actual feedback.

Keep command requests separate from actual state. If the user requests machine
commands, define separate request properties/events and deliberately configured
HMI write actions; wait for PLC acknowledgement/feedback to move the actual pose.
A feedback-only viewer needs no direct ADS client or symbol writes.

## Native framework metadata

Generate a package Manifest.json registering framework dependencies and a Control
module with `basePath`, `descriptionFile` and a toolbox category. Generate the
control Description.json with its name, namespace, version, base
`TcHmi.Controls.System.TcHmiControl`, template, dependency files, attributes and events.
Keep the registered class, metadata namespace, template selectors and file paths
consistent. Scope CSS to the control; do not style the HMI document/body globally.

For each public property declare:

- `name` using `data-tchmi-*`, `propertyName`, `propertySetterName` and `propertyGetterName`.
- A framework/general schema type or a declared custom schema for structured data.
- `bindable`, `defaultBindingMode`, defaults, units/range and a useful description.

Actual feedback normally uses `OneWay` binding from the PLC. `readOnly` in the
description is an engineering attribute setting, not a mechanism for making the
PLC the source of truth: the framework must still be able to call the setter.
Do not mark actual feedback TwoWay just to receive values.

Each setter converts with the appropriate `TcHmi.ValueConverter`, handles null
and invalid input deliberately, detects changes, stores accepted state, and emits:

```js
TcHmi.EventProvider.raise(this.__id + '.onPropertyChanged', {
  propertyName: 'ActualPosition'
});
```

Expose the matching getter. Render only when the instance is ready, while retaining
values delivered before attach. Define equality and object-resolver ownership for
structured attributes using the installed framework's supported pattern. Reject
non-finite values before they reach Three.js. Reject or display-clamp out-of-range
feedback according to the documented contract; never write a correction back to
the PLC from an actual-feedback setter. Avoid duplicate notifications for unchanged
values. Register using `TcHmi.Controls.registerEx` with the exact metadata namespace.

Declare semantic events in Description.json and raise them through EventProvider
with the instance ID prefix, for example `.onReady`, `.onFeedbackChanged`,
`.onSelectionChanged` or `.onError` as relevant. Distinguish feedback events from
operator requests. Document payloads and whether initialization raises them.
Framework property-change notifications and semantic events serve different uses;
implement both where required. Verify an actual HMI Actions trigger consumes an
event, not merely that a JavaScript callback can receive it.

Validate metadata against the target installation's schemas, usually available in
the Framework package under `runtimes/native1.12-tchmi/Schema`. Consult the
[official Beckhoff control sample](https://github.com/Beckhoff/TE2000_Client_Samples/blob/master/ExampleControl/ExampleControl/ColorChange/ColorChange.ts)
for registration and lifecycle, and the installed framework declarations for the
version-specific API. Do not fabricate a schema or silently suppress validation errors.

## Lifecycle and resource ownership

Use `__previnit` to resolve and validate the instance's template elements. Follow
the framework base-call pattern for `__previnit`, `__init`, `__attach` and `__detach`.
Create or resume the viewer on attach and apply the latest properties. Observe
the host's size with ResizeObserver, update camera aspect and drawing-buffer size,
cap pixel ratio appropriately, and tolerate zero-sized/hidden hosts.

On detach, stop drawing, disconnect observers and remove listeners/subscriptions
owned by the adapter. Either dispose GPU resources there and rebuild on attach,
or explicitly suspend them with a tested lifetime policy. Do not leave an idle
timer, event listener or WebGL context running for an inactive view.

In `destroy`, honor `__keepAlive`, release resources idempotently and call the base
implementation. Dispose unique geometries, materials, textures, render targets,
postprocessing passes and renderer resources as applicable. Release resources
allocated before a failed initialization, and show a useful WebGL/unavailable error.
For asynchronous asset loading, prevent late completion from reviving a detached
or destroyed instance and dispose abandoned assets.

Use one scene, canvas and state per control instance. Shared immutable data may be
cached only with clear ownership; one instance must not dispose another's assets.
Avoid global element IDs, window-level sizing assumptions and unsolicited document
listeners inherited from the standalone page.

## Invalid and stale feedback

A numeric binding alone cannot prove ADS connection quality or detect a frozen
source. Define a validity/watchdog contract using supported project/framework
signals, and an explicit policy for binding errors and disconnected PLCs. HMI
projects may ignore read errors and retain the last value; account for that.
Default to an unavailable indication until the required data is valid.

A separate Boolean property can hide or mark invalid geometry when bound to a
real application validity signal. It is not a watchdog by itself. A toggling PLC
Boolean used in a test demonstrates binding, not loss-of-communication detection.
Do not describe that test as proof of production stale-data handling.

## Generate a repeatable package build

Create the build target in the output project. Keep standalone builds available
when both output modes are requested. Bundle Three.js/addons and required assets
locally; avoid a CDN, iframe or runtime module resolution dependency unless the
user explicitly chooses that architecture. Preserve third-party license notices.

Generate a .nuspec with a real package ID/version and the dependencies actually
used. Match a known working target project instead of pinning arbitrary versions.
The tested packaging convention is:

```text
<PackageId>.<version>.nupkg
  <PackageId>.nuspec
  runtimes/native1.12-tchmi/
    Manifest.json
    <ControlName>/
      Description.json
      Template.html
      Style.css
      <ControlName>.js
      ...required local assets
  ...license/readme files referenced by the nuspec
```

Use the installed NuGet pack tooling where available, or a tested portable
packager that writes a valid NuGet/OPC archive. A renamed ZIP alone is not proof
of an installable package. Verify with the real NuGet client. Check every manifest,
template, script, asset and license reference against the produced archive.
Do not include node_modules, credentials, machine-specific server settings or a
user's PLC project. Document a local NuGet source/install procedure and the exact
output package path. Keep builds reproducible and test the documented command.

## Acceptance in TcXaeShell64

When a connected Windows engineering environment is available, test the generated
package in a real TwinCAT HMI project before claiming native compatibility. Use a
separate test project unless the user selects an existing one. Prefer a short
project path: deeply nested paths can cause NuGet extraction to omit files on
Windows. Missing Beckhoff schema files in a fresh project may be a restoration or
path problem, not a custom-control error. Installed Beckhoff offline packages can
restore the project's declared versions without changing its dependencies.

Resolve licensing/authentication challenges through the user when required. Choose
`TwinCAT HMI` or a suitable mixed solution platform for HMI builds when a solution
also contains a PLC project; do not silently launch stale output after a platform
warning. Verify the active server port and runtime URL from that project.

Check observable behavior at these levels, using tests appropriate to the output:

1. **Adapter:** conversion/range policy, getters, change notifications, pre-attach
   values, duplicate suppression, semantic events and failed initialization.
2. **Renderer:** representative feedback poses, validity, multiple instances,
   resize, detach/reattach and final resource cleanup.
3. **Package:** real restore/install, toolbox registration, properties/events in
   Engineering, no missing files/schema errors and a successful HMI build.
4. **Live runtime:** mapped PLC values change the actual 3D pose; readouts and pose
   agree on units/scaling; native HMI Actions consume events. Check outgoing ADS
   requests for unintended feedback writes. Verify bindings resume after view
   removal/recreation. Test PLC disconnection/staleness against the chosen validity
   policy when the environment permits it.
5. **Standalone:** if maintained, its existing build/examples still work.

An illustrative live test uses three independently counting PLC INTs `i`, `j`,
`k` from 0 through 10, mapped as `ADS.PLC1.MAIN.*`. Three controls bind position
through expressions such as `%f%%s%ADS.PLC1.MAIN.i%/s% / 10%/f%`. A mapped `bValue`
can toggle a visibility/validity property on one instance. Discover actual mappings
instead of assuming these names exist. Use a native feedback-change trigger to
update an HMI status label without writing to the PLC. These are test inputs, not
a mandatory generated API or a machine command model.

This approach was exercised with Engineering 14.18.57.1, Framework 14.7.23,
Controls 14.9.11 and Server.Engineering 25.0.122. It demonstrated native rendering,
three PLC expression bindings, Boolean visibility, HMI event Actions, DOM
detach/reattach, resize and no feedback writes. That is evidence for the approach,
not certification of future generated controls, older package versions or other PLCs.
Run the relevant acceptance tests for each generated deliverable.

Report what was actually tested, dependency versions, installable package location,
and any remaining blockers. Distinguish an automated framework double, a generic
browser render, Engineering installation and a live PLC test. For repository work,
follow the requested branch/PR workflow and keep generated machine output outside
the skill changes unless the user specifically requests a reusable asset.
