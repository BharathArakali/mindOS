/* ============================================================
   distraction.js — Distraction Intelligence
   Tracks tab switches, window blurs, and idle time
   during active focus sessions only.
   Called by timer.js: startTracking(sessionId) / stopTracking()
   ============================================================ */

import { Storage, KEYS } from './storage.js';
import { toDateKey }      from './utils.js';

const IDLE_THRESHOLD_MS = 60_000; // 60 seconds of no input = idle

let _sessionId    = null;
let _tracking     = false;
let _sessionStart = null;
let _lastActivity = Date.now();
let _idleTimer    = null;
let _isIdle       = false;

/* Per-event timestamps for duration calc */
let _tabHiddenAt   = null;
let _windowBlurAt  = null;

/* Handlers kept as refs for removal */
const _handlers = {
  visibility: _onVisibility,
  blur:       _onBlur,
  focus:      _onFocus,
  mousemove:  _onActivity,
  keydown:    _onActivity,
};

/* ── Public API ────────────────────────────────────────────── */

export function startTracking(sessionId) {
  if (_tracking) stopTracking();

  _sessionId    = sessionId;
  _tracking     = true;
  _sessionStart = Date.now();
  _lastActivity = Date.now();
  _isIdle       = false;

  document.addEventListener('visibilitychange', _handlers.visibility);
  window.addEventListener('blur',      _handlers.blur);
  window.addEventListener('focus',     _handlers.focus);
  document.addEventListener('mousemove', _handlers.mousemove, { passive: true });
  document.addEventListener('keydown',   _handlers.keydown,   { passive: true });

  _scheduleIdleCheck();
}

export function stopTracking() {
  if (!_tracking) return;
  _tracking = false;

  document.removeEventListener('visibilitychange', _handlers.visibility);
  window.removeEventListener('blur',      _handlers.blur);
  window.removeEventListener('focus',     _handlers.focus);
  document.removeEventListener('mousemove', _handlers.mousemove);
  document.removeEventListener('keydown',   _handlers.keydown);

  clearInterval(_idleTimer);
  _idleTimer  = null;
  _sessionId  = null;
}

/**
 * Returns computed insights for a given sessionId.
 * Called by timer.js to show per-session stats.
 */
export function getInsights(sessionId) {
  const events = _getEvents(sessionId);
  if (!events.length) return { count: 0, longestFocus: 0, score: 100 };

  const count = events.length;

  // Longest uninterrupted window (ms between consecutive distractions)
  let longest = 0;
  for (let i = 1; i < events.length; i++) {
    const gap = new Date(events[i].timestamp) - new Date(events[i - 1].timestamp);
    if (gap > longest) longest = gap;
  }

  return {
    count,
    longestFocusMin: Math.round(longest / 60000),
    score: Math.max(0, Math.round(100 - count * 8)), // 8 pts per distraction
  };
}

/**
 * Returns all distraction events for a session.
 */
export function getEvents(sessionId) {
  return _getEvents(sessionId);
}

/* ── Event handlers ────────────────────────────────────────── */

function _onVisibility() {
  if (!_tracking) return;
  if (document.hidden) {
    _tabHiddenAt = Date.now();
  } else {
    const duration = _tabHiddenAt ? Date.now() - _tabHiddenAt : 0;
    _log('tab_switch', duration);
    _tabHiddenAt = null;
  }
}

function _onBlur() {
  if (!_tracking || document.hidden) return; // skip if tab was already hidden
  _windowBlurAt = Date.now();
}

function _onFocus() {
  if (!_tracking || !_windowBlurAt) return;
  const duration = Date.now() - _windowBlurAt;
  if (duration > 1000) { // ignore sub-second blurs (OS notifications etc)
    _log('window_blur', duration);
  }
  _windowBlurAt = null;
}

function _onActivity() {
  _lastActivity = Date.now();
  if (_isIdle) {
    // Returned from idle
    const duration = Date.now() - _lastActivity;
    _log('idle', duration);
    _isIdle = false;
  }
}

function _scheduleIdleCheck() {
  _idleTimer = setInterval(() => {
    if (!_tracking) return;
    const idleMs = Date.now() - _lastActivity;
    if (idleMs >= IDLE_THRESHOLD_MS && !_isIdle) {
      _isIdle = true;
      _log('idle', idleMs);
    }
  }, 15_000); // check every 15s
}

/* ── Storage helpers ───────────────────────────────────────── */

function _log(type, durationMs) {
  if (!_sessionId) return;
  const event = {
    type,
    timestamp: new Date().toISOString(),
    sessionId: _sessionId,
    durationMs: Math.round(durationMs),
    date: toDateKey(),
  };

  const key = `mindos_distractions_${_sessionId}`;
  Storage.update(key, list => {
    const arr = Array.isArray(list) ? list : [];
    return [...arr, event];
  }, []);
}

function _getEvents(sessionId) {
  const key = `mindos_distractions_${sessionId}`;
  return Storage.get(key, []);
}