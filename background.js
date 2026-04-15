/* ============================================================
   background.js — Persistent background services
   Runs independently of which module is displayed.
   Survives navigation. Initialised once in main.js.

   Handles:
   - Reminder scheduling & firing (survives page nav)
   - Timer state persistence across navigation
   - Push notification registration
   ============================================================ */

import { Storage, KEYS } from './storage.js';

/* ── Reminder engine ── */
const _remTimers = new Map();

export function startReminderEngine() {
  _rescheduleAll();
  // Re-check every minute (catches reminders added while on other pages)
  setInterval(_rescheduleAll, 60_000);
}

export function rescheduleReminder(reminder) {
  _cancelTimer(reminder.id);
  if (!reminder.completed && !reminder.notified) _schedule(reminder);
}

export function cancelReminderTimer(id) {
  _cancelTimer(id);
}

function _rescheduleAll() {
  const reminders = Storage.get(KEYS.REMINDERS, []);
  reminders.forEach(r => {
    if (!r.completed && !r.notified && !_remTimers.has(r.id)) {
      _schedule(r);
    }
  });
}

function _schedule(reminder) {
  const msUntil = new Date(reminder.datetime).getTime() - Date.now();
  if (msUntil <= 0) return;

  const t = setTimeout(() => {
    _remTimers.delete(reminder.id);
    _fireReminder(reminder.id);
  }, msUntil);

  _remTimers.set(reminder.id, t);
}

function _cancelTimer(id) {
  if (_remTimers.has(id)) {
    clearTimeout(_remTimers.get(id));
    _remTimers.delete(id);
  }
}

function _fireReminder(id) {
  // Mark notified in storage
  Storage.update(KEYS.REMINDERS, list =>
    (list || []).map(r => r.id === id ? { ...r, notified: true } : r), []);

  const reminder = (Storage.get(KEYS.REMINDERS, []) || []).find(r => r.id === id);
  if (!reminder) return;

  // Play tone
  _playTone();

  // Always show in-app banner (works regardless of permission)
  _showInAppBanner(reminder.text);

  // Also show OS notification if permitted
  if (Notification.permission === 'granted') {
    _showNotification('mindOS_ Reminder', reminder.text, { tag: id });
  } else if (Notification.permission !== 'denied') {
    // Request permission then show
    Notification.requestPermission().then(p => {
      if (p === 'granted') _showNotification('mindOS_ Reminder', reminder.text, { tag: id });
    });
  }
}

function _showNotification(title, body, opts = {}) {
  const notifOpts = {
    body,
    icon:    './icon-192.png',
    badge:   './icon-192.png',
    tag:     opts.tag || 'mindos-reminder',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    silent:  false,
  };
  // Prefer SW notification (works when tab hidden/backgrounded)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(reg => reg.showNotification(title, notifOpts))
      .catch(() => {
        try { new Notification(title, notifOpts); } catch {}
      });
  } else {
    try { new Notification(title, notifOpts); } catch {}
  }
}

function _showInAppBanner(text) {
  const existing = document.getElementById('notif-banner');
  if (existing) existing.remove();
  const banner   = document.createElement('div');
  banner.id        = 'notif-banner';
  banner.className = 'notif-banner';
  banner.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
    '<path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
    '<span>' + text.replace(/</g,'&lt;') + '</span>' +
    '<button onclick="this.parentElement.remove()" class="notif-banner-close">✕</button>';
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}

function _playTone() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.30);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc.start(); osc.stop(ctx.currentTime + 0.7);
    osc.onended = () => ctx.close();
  } catch {}
}

/* ── Background timer countdown ── */
let _bgTimerInterval = null;
let _bgTimerState    = null;

export function startBackgroundTimer(state, onComplete) {
  stopBackgroundTimer();
  _bgTimerState = { ...state };

  _bgTimerInterval = setInterval(() => {
    if (!_bgTimerState || _bgTimerState.timerState !== 'running') {
      stopBackgroundTimer();
      return;
    }
    _bgTimerState.remaining--;
    // Keep storage fresh every 5s
    if (_bgTimerState.remaining % 5 === 0) {
      saveTimerState(_bgTimerState);
    }
    // Update running dot in header
    _updateRunningDot(_bgTimerState.remaining);

    if (_bgTimerState.remaining <= 0) {
      stopBackgroundTimer();
      clearTimerState();
      // Fire completion
      _playTone();
      const msg = _bgTimerState.mode === 'work'
        ? 'Focus session complete! Time for a break.'
        : 'Break over. Ready to focus?';
      _showNotification('mindOS_ Focus', msg, { tag: 'timer-complete' });
      _showInAppBanner(msg);
      onComplete?.(_bgTimerState.mode);
    }
  }, 1000);
}

export function stopBackgroundTimer() {
  if (_bgTimerInterval) { clearInterval(_bgTimerInterval); _bgTimerInterval = null; }
  _bgTimerState = null;
}

function _updateRunningDot(remaining) {
  const dot = document.getElementById('timer-running-dot');
  if (!dot) return;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  dot.textContent = m + ':' + String(s).padStart(2, '0');
}

/* ── Timer persistence ── */
const TIMER_KEY = 'mindos_timer_state';

export function saveTimerState(state) {
  Storage.set(TIMER_KEY, { ...state, savedAt: Date.now() });
}

export function loadTimerState() {
  const s = Storage.get(TIMER_KEY, null);
  if (!s) return null;
  // If timer was running, adjust remaining for time elapsed
  if (s.timerState === 'running' && s.savedAt) {
    const elapsed = Math.floor((Date.now() - s.savedAt) / 1000);
    s.remaining   = Math.max(0, s.remaining - elapsed);
    if (s.remaining === 0) s.timerState = 'idle';
  }
  return s;
}

export function clearTimerState() {
  Storage.remove(TIMER_KEY);
}

/* ── Push notification setup ── */
export async function requestPushPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  const result = await Notification.requestPermission();
  return result;
}