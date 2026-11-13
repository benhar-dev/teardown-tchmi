// Small pure helpers shared by the kit and by generated controls.
// Lengths are millimetres and angles are degrees everywhere above the pose
// layer, because that is what CAD and PLC axis data arrive in.

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const clamp01 = (x) => clamp(x, 0, 1);
export const lerp = (a, b, k) => a + (b - a) * k;
export const deg = (rad) => (rad * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

export const smooth = (x) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
export const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOutCubic = (x) => {
  const k = clamp01(x);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};

/**
 * Keyframed value: keys = [[at, value], ...] with numbers or arrays of numbers.
 * Only for display interpolation (a readout easing towards a new feedback
 * value). Never for machine state: actual position comes from the PLC.
 */
export const keyed = (keys, t, ease = easeInOutCubic) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t <= t1) {
      const k = ease((t - t0) / (t1 - t0));
      return Array.isArray(v0) ? v0.map((v, j) => lerp(v, v1[j], k)) : lerp(v0, v1, k);
    }
  }
  return keys[keys.length - 1][1];
};

export const fmt = (n, d = 0) =>
  Number(n).toLocaleString(undefined, {minimumFractionDigits: d, maximumFractionDigits: d});
export const pad = (n, w) => String(Math.max(0, Math.floor(n))).padStart(w, '0');

/** A finite number, or null. Everything from a binding goes through this first. */
export const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Change detection for property setters: avoids redundant notifications and redraws. */
export const same = (a, b, eps = 1e-9) => {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= eps;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i], eps));
  return false;
};

/**
 * Escape for HTML text and quoted attributes.
 *
 * Generated controls should build their DOM with textContent and
 * createElement. Where a template string is unavoidable, every value that
 * came from a binding goes through this: whoever can write a PLC string
 * symbol would otherwise be writing the HMI's DOM.
 */
export const escHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
