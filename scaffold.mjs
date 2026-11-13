#!/usr/bin/env node
// Write a TwinCAT HMI control package skeleton for a machine, into the
// user's project.
//
//   node scaffold.mjs ./examples/robot-6r --out ../MyProject/Robot6RControl \
//        --namespace Mobject.Machines --version 1.0.0
//
// Everything that can be derived from machine.json is derived: one bindable
// property per axis, with its unit, range, default and description, plus the
// Connected validity property, the events, the template, the scoped CSS, the
// control shell and a contract document. Typing those by hand six times is
// where the mistakes come from.
//
// What this does NOT do: validate the generated metadata against the
// framework schemas, pack a .nupkg, or prove any of it installs. Those are
// levels 3 to 5 in references/review-loop.md and they need Engineering.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireMachine} from './kit/pose.js';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 ? d : argv[i + 1];
};

const src = argv[0];
if (!src || src.startsWith('--')) {
  console.error('usage: node scaffold.mjs <machine-dir> --out <dir> [--namespace Ns] [--version 1.0.0] [--runtime native1.12-tchmi]');
  process.exit(1);
}
const machineDir = path.resolve(src);
const machine = requireMachine(JSON.parse(fs.readFileSync(path.join(machineDir, 'machine.json'), 'utf8')));

const name = machine.name;
const ns = opt('namespace', 'Machines');
const version = opt('version', '1.0.0');
const runtime = opt('runtime', 'native1.12-tchmi');
const packageId = opt('package', `${ns}.${name}`);
const outDir = path.resolve(opt('out', path.join('teardown-out', 'packages', `${packageId}`)));
const ctrlDir = path.join(outDir, 'runtimes', runtime, name);
const srcDir = path.join(outDir, 'src');
const moving = machine.joints.filter((j) => j.type !== 'fixed');

const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
  console.log(`  ${path.relative(process.cwd(), file)}`);
};
const [maj, min, bld] = version.split('.').map((n) => Number(n) || 0);

// ---------------------------------------------------------------- metadata
const attributes = [
  ...moving.map((j) => ({
    name: `data-tchmi-${j.feedback.property.toLowerCase()}`,
    propertyName: j.feedback.property,
    propertySetterName: `set${j.feedback.property}`,
    propertyGetterName: `get${j.feedback.property}`,
    displayName: j.feedback.property,
    visible: true,
    themeable: 'None',
    displayPriority: 10,
    type: 'tchmi:general#/definitions/Number',
    category: 'Feedback',
    description: `${j.feedback.description || j.name} (${j.feedback.unit}, ${j.min} to ${j.max}). Actual value from the PLC; bind OneWay. Expected symbol: ${j.feedback.symbol || 'to be mapped'}.`,
    defaultValue: typeof j.home === 'number' ? j.home : 0,
    defaultValueInternal: typeof j.home === 'number' ? j.home : 0,
    bindable: true,
    defaultBindingMode: 'OneWay',
  })),
  {
    name: 'data-tchmi-connected',
    propertyName: 'Connected',
    propertySetterName: 'setConnected',
    propertyGetterName: 'getConnected',
    displayName: 'Connected',
    visible: true,
    themeable: 'None',
    displayPriority: 20,
    type: 'tchmi:general#/definitions/Boolean',
    category: 'Feedback',
    description:
      'Application validity signal. Bind to a real watchdog or connection-quality signal, not to a toggling test bit. False shows the unavailable state.',
    defaultValue: null,
    bindable: true,
    defaultBindingMode: 'OneWay',
  },
];

const events = [
  {name: 'onReady', description: 'Raised once the viewer has compiled its shaders and drawn its first frame.'},
  {name: 'onFeedbackChanged', description: 'Raised when accepted feedback moved the machine. Payload: the accepted values.'},
  {name: 'onValidityChanged', description: 'Raised when the view changed between valid, stale, invalid, offline and error.'},
  {name: 'onError', description: 'Raised when a value was refused (non-finite, out of range) or the GPU context was lost.'},
];

write(
  path.join(ctrlDir, 'Description.json'),
  JSON.stringify(
    {
      apiVersion: 1,
      name,
      namespace: ns,
      displayName: machine.title || name,
      version: {major: maj, minor: min, build: bld, revision: 0},
      visible: true,
      themeable: 'Standard',
      base: 'TcHmi.Controls.System.TcHmiControl',
      description: machine.description || `${name} machine view`,
      properties: {
        template: 'Template.html',
        dependencyFiles: [
          {name: `${name}.js`, type: 'JavaScript', description: `${name} control implementation (bundled, includes three.js)`},
          {name: 'Style.css', type: 'Stylesheet', description: `${name} scoped styles`},
        ],
        attributes,
        events,
      },
    },
    null,
    2,
  ) + '\n',
);

write(
  path.join(outDir, 'runtimes', runtime, 'Manifest.json'),
  JSON.stringify(
    {
      apiVersion: 1,
      name: packageId,
      displayName: `${machine.title || name} HMI control`,
      version: {major: maj, minor: min, build: bld, revision: 0},
      dependencies: [{name: 'Beckhoff.TwinCAT.HMI.Framework', version: 'REPLACE-with-the-target-project-version'}],
      modules: [
        {
          type: 'Control',
          name,
          namespace: ns,
          basePath: `${name}/`,
          descriptionFile: `${name}/Description.json`,
          toolboxCategory: opt('category', 'Machines'),
        },
      ],
    },
    null,
    2,
  ) + '\n',
);

write(
  path.join(outDir, `${packageId}.nuspec`),
  `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://schemas.microsoft.com/packaging/2013/05/nuspec.xsd">
  <metadata>
    <id>${packageId}</id>
    <version>${version}</version>
    <title>${machine.title || name} HMI control</title>
    <authors>REPLACE</authors>
    <description>${machine.description || `${name} machine view for TwinCAT HMI`}</description>
    <license type="expression">MIT</license>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <tags>TwinCAT HMI Control Machine</tags>
    <dependencies>
      <!-- Match the versions of the target project, do not pin arbitrary ones. -->
      <dependency id="Beckhoff.TwinCAT.HMI.Framework" version="REPLACE" />
    </dependencies>
  </metadata>
  <files>
    <file src="runtimes/**" target="runtimes" />
    <file src="LICENSE*" target="" />
    <file src="THIRD-PARTY-NOTICES.md" target="" />
  </files>
</package>
`,
);

// ---------------------------------------------------------------- the control
write(
  path.join(ctrlDir, 'Template.html'),
  `<div class="${ns.replace(/\./g, '_')}_${name}-Template">
  <!-- The viewer creates its canvas and its unavailable overlay inside this host. -->
  <div class="${name}-host" data-machine-host></div>
</div>
`,
);

write(
  path.join(ctrlDir, 'Style.css'),
  `/* Scoped to the control: never style the HMI document or body. */
.${ns.replace(/\./g, '_')}_${name}-Template {
  width: 100%;
  height: 100%;
}

.${name}-host {
  position: relative;   /* the canvas and overlay are absolutely placed inside */
  width: 100%;
  height: 100%;
  min-height: 120px;
}

.${name}-host > canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;   /* orbiting must not scroll the HMI page */
}

.${name}-host [data-machine-overlay] {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #6b7480;
  background: rgba(244, 246, 248, 0.72);
  pointer-events: none;
}
`,
);

// The generated control imports the kit from where the skill is installed.
const kitRel = path.relative(srcDir, path.join(SKILL_DIR, 'kit')).split(path.sep).join('/');

write(
  path.join(srcDir, 'control.js'),
  `// ${name} — TwinCAT HMI control shell.
//
// Everything machine-specific lives in machine.json and geometry.js; everything
// framework-independent lives in the kit's adapter. This file is only the
// mapping between the two, which is how it stays small enough to read.
//
// Bundle it with:
//   node ${path.relative(outDir, path.join(process.cwd(), 'build.mjs')).split(path.sep).join('/')} src/control.js --out runtimes/${runtime}/${name}/${name}.js

import {createAdapter} from '${kitRel}/control-base.js';
import machine from './machine.json';
import {build} from './geometry.js';

const PROPERTIES = ${JSON.stringify(moving.map((j) => j.feedback.property), null, 2).replace(/\n/g, '\n')};

// The framework hands __element over as a jQuery object; a plain element is
// what the kit wants, and this works with both.
const asElement = (el) => (el && el.jquery ? el[0] : el);

(function (TcHmi) {
  const Base = TcHmi.Controls.System.TcHmiControl;

  class ${name} extends Base {
    constructor(element, pcElement, attrs) {
      super(element, pcElement, attrs);
      this.__host = null;
      this.__adapter = createAdapter({
        machine,
        build,
        staleAfterMs: machine.staleAfterMs,
        viewer: {theme: 'light', orbit: true},
      });
      this.__adapter.onPropertyChanged((propertyName) => {
        TcHmi.EventProvider.raise(this.__id + '.onPropertyChanged', {propertyName});
      });
      this.__adapter.onEvent((name, payload) => {
        if (name === 'ready') TcHmi.EventProvider.raise(this.__id + '.onReady', {});
        else if (name === 'feedback') TcHmi.EventProvider.raise(this.__id + '.onFeedbackChanged', payload);
        else if (name === 'validity') TcHmi.EventProvider.raise(this.__id + '.onValidityChanged', payload);
        else if (name === 'error' || name === 'out-of-range') TcHmi.EventProvider.raise(this.__id + '.onError', payload);
      });
    }

    __previnit() {
      this.__host = asElement(this.__element).querySelector('[data-machine-host]');
      if (!this.__host) throw new Error('${name}: template is missing [data-machine-host]');
      super.__previnit();
    }

    __init() {
      super.__init();
    }

    __attach() {
      super.__attach();
      // Values delivered before attach are held by the adapter and applied here.
      this.__adapter.attach(this.__host);
    }

    __detach() {
      super.__detach();
      this.__adapter.detach();
    }

    destroy() {
      if (this.__keepAlive) return;
      this.__adapter.destroy();
      super.destroy();
    }
  }

  // One setter/getter pair per axis. Conversion, range policy, change
  // detection and notification all happen inside the adapter.
  for (const property of PROPERTIES) {
    ${name}.prototype['set' + property] = function (value) {
      this.__adapter.setProperty(property, TcHmi.ValueConverter.toNumber(value));
    };
    ${name}.prototype['get' + property] = function () {
      return this.__adapter.getProperty(property);
    };
  }

  ${name}.prototype.setConnected = function (value) {
    if (this.__adapter.setConnected(TcHmi.ValueConverter.toBoolean(value))) {
      TcHmi.EventProvider.raise(this.__id + '.onPropertyChanged', {propertyName: 'Connected'});
    }
  };
  ${name}.prototype.getConnected = function () {
    return this.__adapter.validity !== 'offline';
  };

  TcHmi.Controls.registerEx('${name}', '${ns}', ${name});
})(TcHmi);
`,
);

fs.copyFileSync(path.join(machineDir, 'machine.json'), path.join(srcDir, 'machine.json'));
// The geometry moves next to the control, so its imports of the kit are
// rewritten to where the skill is installed.
const geometry = fs
  .readFileSync(path.join(machineDir, 'geometry.js'), 'utf8')
  .replace(/(['"])(?:\.\.\/)+kit\//g, (_, quote) => `${quote}${kitRel}/`);
write(path.join(srcDir, 'geometry.js'), geometry);
console.log(`  ${path.relative(process.cwd(), path.join(srcDir, 'machine.json'))}`);

// ---------------------------------------------------------------- contract doc
write(
  path.join(outDir, 'README.md'),
  `# ${machine.title || name} — TwinCAT HMI control

Generated by teardown-tchmi from \`machine.json\`. Regenerate rather than
hand-editing the metadata, so the contract stays in one place.

## Feedback contract

| Property | PLC symbol | Unit | Range | Out of range | Binding |
|---|---|---|---|---|---|
${moving
  .map(
    (j) =>
      `| \`${j.feedback.property}\` | \`${j.feedback.symbol || 'TO BE MAPPED'}\` | ${j.feedback.unit} | ${j.min} … ${j.max} | ${j.range ?? 'clamp'} | OneWay |`,
  )
  .join('\n')}
| \`Connected\` | application validity signal | bool | — | — | OneWay |

Scale and offset are applied as \`value * scale + offset\` before the limits are
checked. Nothing is ever written back to the PLC by this control.

## Validity

- Unavailable until valid data arrives.
- \`staleAfterMs\`: ${machine.staleAfterMs ?? 'not set'} — a floor for a source that stopped sending, not a watchdog.
- \`Connected\` false shows "PLC not connected".

## Events

${events.map((e) => `- \`${e.name}\` — ${e.description}`).join('\n')}

## Build

\`\`\`
node <skill>/build.mjs src/control.js --out runtimes/${runtime}/${name}/${name}.js
\`\`\`

Then pack with the real NuGet client. A renamed ZIP is not a package.

## Before this is called working

- [ ] \`node <skill>/harness/check.mjs <machine-dir>\` passes
- [ ] Pose sheets read, including \`--trace states\`
- [ ] Description.json and Manifest.json validated against the installed schemas in \`runtimes/${runtime}/Schema\`
- [ ] Framework and Controls dependency versions replaced with the target project's
- [ ] Package restores and the control appears in the Engineering toolbox
- [ ] Live PLC values move the pose, and no feedback writes appear in the ADS traffic
`,
);

write(
  path.join(outDir, 'THIRD-PARTY-NOTICES.md'),
  `# Third-party notices

This control bundles:

- **three.js** — MIT licence, Copyright (c) 2010-present three.js authors.
  https://github.com/mrdoob/three.js

Replace or extend this file to match what the bundle actually contains before
shipping the package.
`,
);

console.log(`\n${packageId} ${version} scaffolded in ${path.relative(process.cwd(), outDir)}`);
console.log('next:');
console.log(`  1. node build.mjs ${path.relative(process.cwd(), path.join(srcDir, 'control.js')).split(path.sep).join('/')} --out ${path.relative(process.cwd(), path.join(ctrlDir, `${name}.js`)).split(path.sep).join('/')}`);
console.log(`  2. replace every REPLACE in ${packageId}.nuspec and Manifest.json with the target project's versions`);
console.log(`  3. validate Description.json and Manifest.json against the installed schemas (runtimes/${runtime}/Schema) — this generator does not`);
console.log('  4. pack with the real NuGet client, then install into a test HMI project');
