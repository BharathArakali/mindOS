/* ============================================================
   bus.js — Lightweight pub/sub event bus
   Imported by any module that needs to emit or listen.
   Kept separate to prevent circular imports.
   ============================================================ */
const _bus = {};

export function on(event, cb) {
  (_bus[event] = _bus[event] || []).push(cb);
}

export function off(event, cb) {
  if (_bus[event]) _bus[event] = _bus[event].filter(f => f !== cb);
}

export function emit(event, data) {
  (_bus[event] || []).forEach(cb => cb(data));
}