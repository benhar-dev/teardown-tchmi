// A stand-in for the TwinCAT HMI framework, enough to run a generated
// control outside Engineering.
//
// What this proves: that the control registers, that its setters convert and
// validate, that property-change notifications and semantic events are
// raised with the instance id, and that attach/detach/destroy release what
// they allocated. That is wiring, and wiring is most of what goes wrong.
//
// What this does not prove: anything about the real framework. It is not the
// TcHmi API, it does not validate against the installed schemas, and a
// control that passes here can still fail to restore, register in the
// toolbox or bind in Engineering. Those are separate acceptance levels, and
// references/twincat-hmi.md keeps them apart on purpose. Never report a
// control as HMI-compatible on the strength of this file.

export function installDouble(win = globalThis) {
  const handlers = new Map();
  const registry = new Map();
  const raised = [];

  class TcHmiControl {
    constructor(element, pcElement, attrs, id = `ctrl-${registry.size + 1}`) {
      this.__element = element;
      this.__pcElement = pcElement ?? element;
      this.__attrs = attrs || {};
      this.__id = id;
      this.__keepAlive = false;
      this.__initialized = false;
      this.__attached = false;
      this.__destroyed = false;
    }
    getId() {
      return this.__id;
    }
    getElement() {
      return this.__element;
    }
    __previnit() {}
    __init() {
      this.__initialized = true;
    }
    __attach() {
      this.__attached = true;
    }
    __detach() {
      this.__attached = false;
    }
    destroy() {
      this.__destroyed = true;
    }
  }

  const TcHmi = {
    EventProvider: {
      raise(name, payload) {
        raised.push({name, payload, at: Date.now()});
        for (const cb of handlers.get(name) || []) cb({name}, payload);
      },
      register(name, cb) {
        if (!handlers.has(name)) handlers.set(name, new Set());
        handlers.get(name).add(cb);
        return {destroy: () => handlers.get(name)?.delete(cb)};
      },
    },
    ValueConverter: {
      toNumber: (v) => {
        const n = typeof v === 'string' ? Number(v) : v;
        return typeof n === 'number' && Number.isFinite(n) ? n : null;
      },
      toBoolean: (v) => (v === null || v === undefined ? null : v === 'false' ? false : !!v),
      toString: (v) => (v === null || v === undefined ? null : String(v)),
    },
    Controls: {
      System: {TcHmiControl},
      registerEx(name, namespace, ctor) {
        registry.set(`${namespace}.${name}`, ctor);
      },
      get: (key) => registry.get(key),
    },
    Log: {
      debug: () => {},
      warn: (...a) => console.warn('[TcHmi]', ...a),
      error: (...a) => console.error('[TcHmi]', ...a),
    },

    // Test-only handles, not part of the real API.
    __test: {
      registry,
      raised,
      clear: () => {
        raised.length = 0;
      },
      eventsFor: (id) => raised.filter((r) => r.name.startsWith(`${id}.`)),
    },
  };

  win.TcHmi = TcHmi;
  return TcHmi;
}
