// The adapter between a TwinCAT HMI control and a machine viewer.
//
// Nothing in this file imports TcHmi. That is deliberate: the whole adapter
// can be driven, stepped through a feedback trace and screenshotted in a
// plain browser, so the review loop runs without Engineering, a server or a
// PLC. The generated control is the thin shell that maps framework setters
// onto setProperty() and adapter events onto TcHmi.EventProvider.raise().

import {acceptValue, homePose, propertyMap, requireMachine} from './pose.js';
import {finite, same} from './util.js';
import {createViewer} from './viewer.js';

/**
 * @param {object} cfg
 * @param {object} cfg.machine machine.json
 * @param {Function} cfg.build geometry builder, see kit/viewer.js
 * @param {object} [cfg.viewer] options passed to createViewer
 * @param {number} [cfg.staleAfterMs] no accepted feedback for this long marks
 *   the view stale. A number alone cannot prove a live ADS connection, so
 *   this is a floor, not a watchdog: bind Connected to a real application
 *   validity signal as well.
 */
export function createAdapter(cfg) {
  const machine = requireMachine(cfg.machine);
  const props = propertyMap(machine);
  const byName = new Map(machine.joints.map((j) => [j.name, j]));
  const listeners = {property: new Set(), event: new Set()};

  let viewer = null;
  let host = null;
  const values = {...homePose(machine)};
  const raw = {};
  let connected = null; // null until something says
  let lastAccepted = 0;
  let staleTimer = 0;

  const emit = (name, payload) => {
    for (const cb of listeners.event) cb(name, payload);
  };
  const notify = (property) => {
    for (const cb of listeners.property) cb(property);
  };

  function validity() {
    if (connected === false) return 'offline';
    if (!lastAccepted) return 'invalid';
    if (cfg.staleAfterMs && Date.now() - lastAccepted > cfg.staleAfterMs) return 'stale';
    return 'valid';
  }

  function refreshValidity() {
    viewer?.setValidity(validity());
  }

  function armStaleTimer() {
    if (!cfg.staleAfterMs) return;
    clearTimeout(staleTimer);
    staleTimer = setTimeout(refreshValidity, cfg.staleAfterMs + 20);
  }

  return {
    machine,
    properties: Object.keys(props),

    /** Create the viewer inside `element`. Call from the control's __attach. */
    attach(element) {
      if (viewer) return viewer;
      host = element;
      viewer = createViewer(element, machine, cfg.build, {
        ...(cfg.viewer || {}),
        onEvent: (name, payload) => emit(name, payload),
      });
      viewer.setFeedback(values); // values that arrived before attach are not lost
      refreshValidity();
      return viewer;
    },

    /** Stop drawing and release observers. Call from __detach. */
    detach() {
      clearTimeout(staleTimer);
      viewer?.dispose();
      viewer = null;
      host = null;
    },

    destroy() {
      this.detach();
      listeners.property.clear();
      listeners.event.clear();
    },

    /**
     * One feedback property from the framework.
     * Conversion, range policy and change detection all happen here, and the
     * result is never written back anywhere: an out-of-range actual value is
     * a display problem, not something to correct on the PLC.
     *
     * @returns {{changed: boolean, state: string}}
     */
    setProperty(property, value) {
      const jointName = props[property];
      if (!jointName) return {changed: false, state: 'unknown-property'};
      const joint = byName.get(jointName);
      const v = finite(value);
      if (v === null) {
        emit('error', {property, reason: 'not a finite number', value});
        refreshValidity();
        return {changed: false, state: 'invalid'};
      }
      if (same(raw[property], v)) return {changed: false, state: 'unchanged'};
      raw[property] = v;

      const {value: accepted, state} = acceptValue(joint, v);
      if (accepted === null) {
        emit('error', {property, reason: state, value: v});
        return {changed: false, state};
      }
      values[jointName] = accepted;
      lastAccepted = Date.now();
      armStaleTimer();
      viewer?.setFeedback({[jointName]: accepted});
      refreshValidity();
      notify(property);
      if (state !== 'ok') emit('out-of-range', {property, value: v, used: accepted});
      return {changed: true, state};
    },

    getProperty(property) {
      return raw[property];
    },

    /** Bind to a real application validity or watchdog signal, not to a toggling test bit. */
    setConnected(flag) {
      const next = flag === null || flag === undefined ? null : !!flag;
      if (next === connected) return false;
      connected = next;
      refreshValidity();
      notify('Connected');
      return true;
    },

    /** Framework property-change notifications (the control raises onPropertyChanged). */
    onPropertyChanged: (cb) => listeners.property.add(cb),
    /** Semantic events: ready, feedback, validity, out-of-range, error. */
    onEvent: (cb) => listeners.event.add(cb),

    get validity() {
      return validity();
    },
    get values() {
      return {...values};
    },
    get viewer() {
      return viewer;
    },
    get attached() {
      return !!host;
    },
  };
}
