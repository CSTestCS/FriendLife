// Small shared helpers used across the game.

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const chance = (p) => Math.random() < p;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const smooth = (t) => t * t * (3 - 2 * t);
export const DEG = Math.PI / 180;

/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function angleDamp(a, b, lambda, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

let uidCounter = 0;
export function uid(prefix = 'id') {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function weightedPick(entries) {
  // entries: [[value, weight], ...]
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) return entries[0]?.[0];
  let r = Math.random() * total;
  for (const [v, w] of entries) {
    r -= Math.max(0, w);
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

export function formatClock(minutes) {
  const m = Math.floor(minutes) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class Emitter {
  constructor() { this._handlers = new Map(); }
  on(evt, fn) {
    if (!this._handlers.has(evt)) this._handlers.set(evt, new Set());
    this._handlers.get(evt).add(fn);
    return () => this._handlers.get(evt)?.delete(fn);
  }
  emit(evt, ...args) {
    const set = this._handlers.get(evt);
    if (set) for (const fn of [...set]) fn(...args);
  }
}

export function fileExt(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function baseName(name) {
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  const n = name.slice(slash + 1);
  const i = n.lastIndexOf('.');
  return i > 0 ? n.slice(0, i) : n;
}
