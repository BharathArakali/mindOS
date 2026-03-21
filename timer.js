/* ============================================================
   timer.js — Focus Engine
   ============================================================ */

import { Storage, KEYS } from './storage.js';
import { uuid, formatTime, toDateKey } from './utils.js';
import * as Distraction from './distraction.js';

const DEFAULTS = { workMins: 25, shortBreakMins: 5, longBreakMins: 15, sessionsUntilLong: 4 };

let _state        = 'idle';
let _mode         = 'work';
let _remaining    = 0;
let _planned      = 0;
let _tick         = null;
let _sessionId    = null;
let _workCount    = 0;
let _zenMode      = false;
let _settingsOpen = false;   // persists across re-renders
let _container    = null;
let _keyFn        = null;

export function init(container) {
  _container = container;
  _workCount = Storage.get('mindos_work_count', 0);
  const s = Storage.get(KEYS.SETTINGS, DEFAULTS);
  _applyMode('work', s);
  _render();
  _keyFn = _onKey.bind(null);
  document.addEventListener('keydown', _keyFn);
}

export function destroy() {
  clearInterval(_tick); _tick = null;
  Distraction.stopTracking();
  if (_keyFn) document.removeEventListener('keydown', _keyFn);
  if (_zenMode) { document.body.classList.remove('zen-mode'); _zenMode = false; }
  _container = null;
}

/* ── Render ── */
function _render() {
  if (!_container) return;
  const s        = Storage.get(KEYS.SETTINGS, DEFAULTS);
  const sessions = Storage.get(KEYS.SESSIONS, []);
  const today    = toDateKey();
  const todaySess= sessions.filter(x => x.type === 'work' && x.date === today && x.actual);
  const todayMin = Math.round(todaySess.reduce((a, x) => a + x.actual, 0) / 60);
  const streak   = _streak(sessions);
  const CIRC     = 603;

  _container.innerHTML = `
    <div class="timer-wrap" id="timer-wrap">

      <div class="timer-tabs">
        <button class="timer-tab${_mode==='work'?' timer-tab--active':''}" data-mode="work">Focus</button>
        <button class="timer-tab${_mode==='shortBreak'?' timer-tab--active':''}" data-mode="shortBreak">Short break</button>
        <button class="timer-tab${_mode==='longBreak'?' timer-tab--active':''}" data-mode="longBreak">Long break</button>
      </div>

      <div class="timer-body" id="timer-body">
        <div class="timer-left">
        <div class="timer-ring-wrap">
        <svg class="timer-ring" viewBox="0 0 220 220">
          <circle class="timer-ring__track" cx="110" cy="110" r="96" fill="none" stroke-width="8"/>
          <circle class="timer-ring__prog" id="t-prog"
            cx="110" cy="110" r="96" fill="none" stroke-width="8"
            stroke-linecap="round" transform="rotate(-90 110 110)"
            stroke-dasharray="${CIRC}" stroke-dashoffset="0"/>
        </svg>
        <div class="timer-centre">
          <div class="timer-display" id="t-display">${formatTime(_remaining)}</div>
          <div class="timer-mode-label">${_modeLabel()}</div>
        </div>
        <button class="timer-zen-btn${_zenMode?' zen-active':''}" id="t-zen" title="Zen (Z)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3
                     m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        </button>
      </div>

      <div class="timer-controls">
        <button class="btn btn-secondary timer-btn-reset" id="t-reset" style="min-width:90px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          Reset
        </button>
        <button class="btn btn-primary timer-btn-main" id="t-main" style="min-width:110px;">${_mainLabel()}</button>
        <button class="btn btn-secondary timer-btn-settings" id="t-settings" style="min-width:100px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06
                     a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09
                     A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83
                     l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09
                     A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83
                     l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09
                     a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83
                     l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09
                     a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Settings
        </button>
      </div>

      <p class="timer-hint">
        <kbd>Space</kbd> start/pause &nbsp;·&nbsp;
        <kbd>R</kbd> reset &nbsp;·&nbsp;
        <kbd>Z</kbd> zen
      </p>

      <div class="timer-stats">
        <div class="timer-stat">
          <span class="timer-stat__val">${todaySess.length}</span>
          <span class="timer-stat__lbl">Sessions today</span>
        </div>
        <div class="timer-stat">
          <span class="timer-stat__val">${todayMin}m</span>
          <span class="timer-stat__lbl">Focus time</span>
        </div>
        <div class="timer-stat">
          <span class="timer-stat__val">${streak}</span>
          <span class="timer-stat__lbl">Day streak</span>
        </div>
      </div><!-- /timer-stats -->

      </div><!-- /timer-left -->

      <div class="timer-settings-panel" id="t-spanel">
        <div class="timer-settings-title">Timer settings</div>
        <div class="settings-row">
          <label class="form-label">Focus (min)</label>
          <input class="input" type="number" id="s-work" min="1" max="120" value="${s.workMins}"/>
        </div>
        <div class="settings-row">
          <label class="form-label">Short break (min)</label>
          <input class="input" type="number" id="s-short" min="1" max="30" value="${s.shortBreakMins}"/>
        </div>
        <div class="settings-row">
          <label class="form-label">Long break (min)</label>
          <input class="input" type="number" id="s-long" min="1" max="60" value="${s.longBreakMins}"/>
        </div>
        <button class="btn btn-primary btn-block" id="s-save" style="margin-top:4px;">Save</button>

        </div><!-- /timer-settings-panel -->
      </div><!-- /timer-body -->

    </div>`;

  _updateRing();
  _wire();
  // Restore settings panel state after re-render
  if (_settingsOpen) {
    const wrap = _get('timer-wrap');
    if (wrap) wrap.classList.add('settings-open');
  }
}

/* ── Wire events ── */
function _wire() {
  _get('t-main').addEventListener('click', _toggle);
  _get('t-reset').addEventListener('click', _doReset);
  _get('t-zen').addEventListener('click', _toggleZen);
  _get('t-settings').addEventListener('click', _toggleSettings);
  _get('s-save').addEventListener('click', _saveSettings);

  _container.querySelectorAll('.timer-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (_state === 'running') return;
      _doReset();
      const s = Storage.get(KEYS.SETTINGS, DEFAULTS);
      _applyMode(tab.dataset.mode, s);
      _render();
    });
  });
}

function _get(id) { return document.getElementById(id); }

/* ── Timer controls ── */
function _toggle() {
  if (_state === 'running') _pause();
  else _start();
}

function _start() {
  _state     = 'running';
  _sessionId = _sessionId || uuid();
  // Begin distraction tracking for this session
  Distraction.startTracking(_sessionId);
  _tick = setInterval(() => {
    _remaining--;
    const el = _get('t-display');
    if (el) el.textContent = formatTime(_remaining);
    _updateRing();
    if (_remaining <= 0) _complete();
  }, 1000);
  const btn = _get('t-main');
  if (btn) btn.textContent = 'Pause';
}

function _pause() {
  clearInterval(_tick); _tick = null;
  _state = 'paused';
  Distraction.stopTracking();
  const btn = _get('t-main');
  if (btn) btn.textContent = 'Resume';
}

function _doReset() {
  clearInterval(_tick); _tick = null;
  const s = Storage.get(KEYS.SETTINGS, DEFAULTS);
  _applyMode(_mode, s);
  _render();
}

function _complete() {
  clearInterval(_tick); _tick = null;
  Distraction.stopTracking();

  if (_mode === 'work') {
    _workCount++;
    Storage.set('mindos_work_count', _workCount);
    _logSession();
    _notify('Focus complete! Take a break.');
    const s    = Storage.get(KEYS.SETTINGS, DEFAULTS);
    const long = _workCount % (s.sessionsUntilLong || 4) === 0;
    _applyMode(long ? 'longBreak' : 'shortBreak', s);
  } else {
    _notify('Break over. Ready to focus?');
    const s = Storage.get(KEYS.SETTINGS, DEFAULTS);
    _applyMode('work', s);
  }
  _render();
}

function _applyMode(mode, settings) {
  _mode      = mode;
  _state     = 'idle';
  _sessionId = null;
  // Always merge with DEFAULTS so missing keys never produce NaN
  const s    = { ...DEFAULTS, ...settings };
  const mins = mode === 'work'       ? s.workMins
             : mode === 'shortBreak' ? s.shortBreakMins
             : s.longBreakMins;
  _planned   = (Number(mins) || 25) * 60;
  _remaining = _planned;
}

/* ── Ring update ── */
function _updateRing() {
  const el = _get('t-prog');
  if (!el) return;
  const CIRC  = 603;
  const ratio = _planned > 0 ? _remaining / _planned : 1;
  el.style.strokeDashoffset = String(CIRC * (1 - ratio));
  el.style.stroke =
    _mode !== 'work'                          ? 'var(--success)' :
    _state === 'running' && _remaining <= 300 ? 'var(--warning)' :
                                                'var(--accent)';
  el.style.transition = _state === 'idle' ? 'none' : 'stroke-dashoffset 1s linear, stroke 1s ease';
}

/* ── Helpers ── */
function _modeLabel() {
  return _mode === 'work' ? 'Focus time' : _mode === 'shortBreak' ? 'Short break' : 'Long break';
}

function _mainLabel() {
  return _state === 'running' ? 'Pause' : _state === 'paused' ? 'Resume' : 'Start';
}

function _toggleZen() {
  _zenMode = !_zenMode;
  document.body.classList.toggle('zen-mode', _zenMode);
  const btn = _get('t-zen');
  if (btn) btn.classList.toggle('zen-active', _zenMode);
}

function _toggleSettings() {
  const wrap = _get('timer-wrap');
  if (!wrap) return;
  _settingsOpen = !wrap.classList.contains('settings-open');
  wrap.classList.toggle('settings-open', _settingsOpen);
}

function _saveSettings() {
  const work  = parseInt(_get('s-work')?.value)  || DEFAULTS.workMins;
  const short = parseInt(_get('s-short')?.value) || DEFAULTS.shortBreakMins;
  const long  = parseInt(_get('s-long')?.value)  || DEFAULTS.longBreakMins;
  Storage.set(KEYS.SETTINGS, { workMins: work, shortBreakMins: short, longBreakMins: long, sessionsUntilLong: 4 });
  // Close settings panel with a brief delay so user sees the save
  _settingsOpen = false;
  const wrap = _get('timer-wrap');
  if (wrap) {
    setTimeout(() => wrap.classList.remove('settings-open'), 300);
  }
  _doReset();
}

function _onKey(e) {
  if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === ' ')                { e.preventDefault(); _toggle(); }
  if (e.key.toLowerCase() === 'r') _doReset();
  if (e.key.toLowerCase() === 'z') _toggleZen();
  if (e.key.toLowerCase() === 's') _toggleSettings();
}

function _logSession() {
  const insights = Distraction.getInsights(_sessionId);
  Storage.update(KEYS.SESSIONS, list => {
    const arr = Array.isArray(list) ? list : [];
    return [...arr, {
      id: _sessionId || uuid(),
      type: 'work',
      duration: _planned,
      actual: _planned,
      distractions: insights.count,
      focusScore: insights.score,
      completedAt: new Date().toISOString(),
      date: toDateKey(),
    }];
  }, []);
}

function _streak(sessions) {
  const days = [...new Set(
    sessions.filter(s => s.type === 'work' && s.actual > 0).map(s => s.date)
  )].sort().reverse();
  if (!days.length) return 0;
  let streak = 0;
  let cursor = toDateKey();
  for (const day of days) {
    if (day === cursor) {
      streak++;
      const d = new Date(cursor);
      d.setDate(d.getDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    } else break;
  }
  return streak;
}

function _notify(msg) {
  if (Notification.permission === 'granted') {
    new Notification('mindOS', { body: msg, icon: './icon-192.png' });
  } else if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}