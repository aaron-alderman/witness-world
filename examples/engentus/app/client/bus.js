/**
 * bus.js — Lightweight pub/sub event bus for cross-module coordination.
 *
 * Events used in this app:
 *   sim:progress  { simId }   — tick during a MC run (batch complete)
 *   sim:done      { simId }   — MC run finished successfully
 *   sim:stopped   { simId }   — MC run halted by user
 *   chart:ready               — D3 chart initialised (xSc/ySc available)
 */
const bus = {
  _h: new Map(),

  /** Subscribe to an event. Returns an unsubscribe function. */
  on(ev, fn) {
    if (!this._h.has(ev)) this._h.set(ev, new Set());
    this._h.get(ev).add(fn);
    return () => this._h.get(ev).delete(fn);
  },

  /** Emit an event with an optional payload object. */
  emit(ev, payload) {
    this._h.get(ev)?.forEach(fn => fn(payload));
  },

  /** Subscribe for a single firing, then auto-unsubscribe. */
  once(ev, fn) {
    const off = this.on(ev, payload => { fn(payload); off(); });
  },
};

export default bus;
