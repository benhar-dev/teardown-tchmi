// The review harness: a generated control's adapter and viewer, driven by a
// feedback trace, with no TwinCAT anywhere.
//
//   ?machine=robot-6r&mode=single            sliders per axis, for poking
//   ?machine=gantry&mode=sheet&trace=axes    a pose sheet, for reading
//
// Feedback goes in through the adapter's setProperty, exactly as the
// framework would deliver it, so conversion, range policy, change detection
// and the unavailable states are all exercised here rather than first
// discovered on a panel.

import machines from 'virtual:machines';
import {createAdapter} from '../kit/control-base.js';
import {propertyMap} from '../kit/pose.js';
import {trace} from './traces.js';

const q = new URLSearchParams(location.search);
const app = document.getElementById('app');

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text; // never innerHTML, here least of all
  return n;
};

const name = q.get('machine') || 'robot-6r';
const entry = machines[name];
if (!entry) {
  app.appendChild(el('p', 'error', `no machine "${name}". Built in: ${Object.keys(machines).join(', ')}`));
  throw new Error('unknown machine');
}

const {machine, build} = entry;
const theme = q.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = theme;
const shadows = q.get('shadows') !== '0';
const props = propertyMap(machine); // property -> joint
const jointToProp = Object.fromEntries(Object.entries(props).map(([p, j]) => [j, p]));

function makeAdapter(host, {orbit, live = true}) {
  const adapter = createAdapter({
    machine,
    build: (THREE, def, nodes) => build(THREE, def, nodes, {theme}),
    // A pose sheet is a still: without this, every tile would mark itself
    // stale a second or two after it was drawn, which is correct for a live
    // view and nonsense for a sheet. The states trace asks for stale
    // explicitly instead.
    staleAfterMs: live ? machine.staleAfterMs : 0,
    viewer: {theme, orbit, shadows, maxPixelRatio: 1},
  });
  adapter.attach(host);
  return adapter;
}

/** Feed one trace sample in through the control's own property setters. */
function feed(adapter, sample) {
  for (const [joint, value] of Object.entries(sample.feedback || {})) {
    const prop = jointToProp[joint];
    if (prop) adapter.setProperty(prop, value);
  }
  adapter.setConnected(sample.validity !== 'offline');
  if (sample.validity && sample.validity !== 'valid') adapter.viewer?.setValidity(sample.validity);
}

// ---------------------------------------------------------------- sheet mode
async function sheet() {
  const which = q.get('trace') || 'sweep';
  const n = Number(q.get('n') || 9);
  const samples = trace(machine, which, n);
  const cols = Number(q.get('cols') || Math.min(3, samples.length));

  const head = el('header', 'head');
  head.appendChild(el('h1', null, `${machine.title || machine.name} — ${which}`));
  head.appendChild(el('p', null, `${samples.length} poses · theme ${theme} · mm/deg`));
  app.appendChild(head);

  const grid = el('div', 'grid');
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  app.appendChild(grid);

  const made = samples.map((s) => {
    const tile = el('figure', 'tile');
    const host = el('div', 'host');
    const cap = el('figcaption');
    cap.appendChild(el('b', null, s.name));
    cap.appendChild(el('span', null, s.label || ''));
    tile.appendChild(host);
    tile.appendChild(cap);
    grid.appendChild(tile);
    return {sample: s, adapter: makeAdapter(host, {orbit: false, live: false})};
  });

  await Promise.all(made.map((m) => m.adapter.viewer.ready));
  for (const m of made) {
    feed(m.adapter, m.sample);
    m.adapter.viewer.renderNow();
  }
  // The sheet script waits for this before it screenshots.
  window.__SHEET_READY = true;
  window.__SHEET_STATS = made.map((m) => ({
    name: m.sample.name,
    validity: m.adapter.viewer.validity, // what the tile shows, not what the adapter computed
    renders: m.adapter.viewer.stats.renders,
    ms: Math.round(m.adapter.viewer.stats.lastMs),
  }));
}

// --------------------------------------------------------------- single mode
function single() {
  const wrap = el('div', 'single');
  const host = el('div', 'host big');
  const panel = el('div', 'panel');
  wrap.appendChild(host);
  wrap.appendChild(panel);
  app.appendChild(wrap);

  const adapter = makeAdapter(host, {orbit: true});
  const readout = el('pre', 'readout');

  panel.appendChild(el('h1', null, machine.title || machine.name));
  for (const j of machine.joints) {
    if (j.type === 'fixed') continue;
    const row = el('label', 'row');
    const tag = el('span', 'tag', `${j.name} (${j.feedback.unit})`);
    const val = el('b', 'val', '—');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(j.min);
    input.max = String(j.max);
    input.step = String(Math.max((j.max - j.min) / 400, 0.01));
    input.value = String(typeof j.home === 'number' ? j.home : 0);
    input.addEventListener('input', () => {
      val.textContent = input.value;
      adapter.setProperty(j.feedback.property, Number(input.value));
      show();
    });
    row.appendChild(tag);
    row.appendChild(input);
    row.appendChild(val);
    panel.appendChild(row);
  }

  const buttons = el('div', 'buttons');
  for (const v of ['valid', 'stale', 'invalid', 'offline', 'error']) {
    const b = el('button', null, v);
    b.addEventListener('click', () => {
      if (v === 'offline') adapter.setConnected(false);
      else adapter.setConnected(true);
      adapter.viewer.setValidity(v);
      show();
    });
    buttons.appendChild(b);
  }
  const bad = el('button', null, 'send NaN');
  bad.addEventListener('click', () => {
    const first = Object.keys(props)[0];
    adapter.setProperty(first, Number.NaN);
    show();
  });
  buttons.appendChild(bad);
  panel.appendChild(buttons);
  panel.appendChild(readout);

  function show() {
    const s = adapter.viewer.stats;
    readout.textContent = [
      `validity   ${adapter.viewer.validity}`,
      `renders    ${s.renders} (last ${s.lastMs.toFixed(1)} ms, ${s.skipped} skipped)`,
      ...Object.entries(adapter.values).map(([k, v]) => `${k.padEnd(10)} ${v.toFixed(2)}`),
    ].join('\n');
  }

  adapter.onEvent((name) => {
    if (name === 'ready' || name === 'validity') show();
  });
  show();
  window.__ADAPTER = adapter; // for poking from the console
}

if ((q.get('mode') || 'single') === 'sheet') sheet();
else single();
