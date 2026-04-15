/* ============================================================
   timer.js — Focus Engine
   Click timer to edit inline · Background timer via BG module
   ============================================================ */

import { Storage, KEYS } from './storage.js';
import { uuid, formatTime, toDateKey } from './utils.js';
import * as Distraction  from './distraction.js';
import * as BG           from './background.js';
import * as FocusMusic   from './focusmusic.js';

const DEFAULTS = { workMins:25, shortBreakMins:5, longBreakMins:15, sessionsUntilLong:4 };

/* ── Module state ── */
let _state        = 'idle';
let _mode         = 'work';
let _remaining    = 0;
let _planned      = 0;
let _tick         = null;
let _sessionId    = null;
let _workCount    = 0;
let _zenMode      = false;
let _settingsOpen = false;
let _editMode     = false;
let _historyView  = false;
let _container    = null;
let _keyFn        = null;
let _clockInterval= null;

/* ── Public API ── */
export function getState() {
  return { timerState:_state, mode:_mode, remaining:_remaining,
           planned:_planned, workCount:_workCount, sessionId:_sessionId };
}

export function init(container) {
  _container = container;
  _workCount = Storage.get('mindos_work_count', 0);

  // Restore state if timer was running during navigation
  const saved = BG.loadTimerState();
  if (saved && saved.timerState !== 'idle') {
    _state     = 'paused';
    _mode      = saved.mode      || 'work';
    _remaining = saved.remaining || 0;
    _planned   = saved.planned   || 0;
    _sessionId = saved.sessionId || null;
    _workCount = saved.workCount || _workCount;
    BG.clearTimerState();
  } else {
    const s = Storage.get(KEYS.SETTINGS, DEFAULTS);
    _applyMode('work', s);
  }

  _render();
  _keyFn = _onKey.bind(null);
  document.addEventListener('keydown', _keyFn);
}

export function destroy() {
  // Stop tick but preserve _state/_remaining so getState() works after destroy
  if (_tick)         { clearInterval(_tick);         _tick = null; }
  if (_clockInterval){ clearInterval(_clockInterval); _clockInterval = null; }
  Distraction.stopTracking();
  FocusMusic.stopAll();
  if (_keyFn) document.removeEventListener('keydown', _keyFn);
  if (_zenMode) { document.body.classList.remove('zen-mode'); _zenMode = false; }
  _editMode    = false;
  _historyView = false;
  _container   = null;
}


/* ── Render ── */
function _render() {
  if (!_container) return;
  const s        = { ...DEFAULTS, ...Storage.get(KEYS.SETTINGS, DEFAULTS) };
  const sessions = Storage.get(KEYS.SESSIONS, []);
  const today    = toDateKey();
  const todaySess= sessions.filter(x => x.type==='work' && x.date===today && x.actual);
  const todayMin = Math.round(todaySess.reduce((a,x)=>a+x.actual,0)/60);
  const streak   = _streak(sessions);
  const CIRC     = 603;

  _container.innerHTML = `
    <div class="timer-wrap" id="timer-wrap">

      <!-- Mode tabs -->
      <div class="timer-tabs">
        <button class="timer-tab${_mode==='work'?' timer-tab--active':''}"
                data-mode="work">Focus</button>
        <button class="timer-tab${_mode==='shortBreak'?' timer-tab--active':''}"
                data-mode="shortBreak">Short break</button>
        <button class="timer-tab${_mode==='longBreak'?' timer-tab--active':''}"
                data-mode="longBreak">Long break</button>
      </div>

      <!-- Ring -->
      <div class="timer-ring-wrap" id="timer-ring-wrap">
        <svg class="timer-ring" viewBox="0 0 220 220">
          <circle class="timer-ring__track" cx="110" cy="110" r="96"
                  fill="none" stroke-width="8"/>
          <circle class="timer-ring__prog" id="t-prog"
            cx="110" cy="110" r="96" fill="none" stroke-width="8"
            stroke-linecap="round" transform="rotate(-90 110 110)"
            stroke-dasharray="${CIRC}" stroke-dashoffset="0"/>
        </svg>

        <!-- Normal view: countdown (clickable to edit) -->
        <div class="timer-centre" id="t-centre"
             style="${_editMode ? 'display:none' : ''}">
          <div class="timer-display" id="t-display"
               title="Click to edit duration">${formatTime(_remaining)}</div>
          <div class="timer-mode-label">${_modeLabel()}</div>
          <div class="timer-edit-hint">tap to edit</div>
        </div>

        <!-- Edit view: inline inputs inside ring -->
        <div class="timer-edit-centre" id="t-edit"
             style="${_editMode ? '' : 'display:none'}">
          <div class="timer-edit-label">minutes</div>
          <input class="timer-edit-input" id="t-edit-val" type="number"
                 min="1" max="120"
                 value="${Math.round(_planned/60)}"/>
          <div class="timer-edit-actions">
            <button class="timer-edit-btn timer-edit-cancel" id="t-edit-cancel">✕</button>
            <button class="timer-edit-btn timer-edit-save"   id="t-edit-save">✓</button>
          </div>
        </div>

        <!-- Zen toggle -->
        <button class="timer-zen-btn${_zenMode?' zen-active':''}" id="t-zen"
                title="Zen mode (Z)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3
                     m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        </button>
      </div>

      <!-- History toggle -->
      <button class="timer-history-btn${_historyView?' active':''}" id="t-history"
              title="Session history">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
        </svg>
      </button>

      <!-- Controls — only Reset + Start/Pause -->
      <div class="timer-controls">
        <button class="btn btn-secondary timer-btn-reset" id="t-reset">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          Reset
        </button>
        <button class="btn btn-primary timer-btn-main" id="t-main">${_mainLabel()}</button>
      </div>

      <!-- Today stats -->
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
      </div>

      <!-- Focus music player -->
      <div class="timer-music-bar">
        <div class="timer-music-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          Ambient sounds
        </div>
        <div class="timer-music-sounds">
          ${FocusMusic.SOUNDS.map(s => `
            <button class="music-sound-btn${FocusMusic.getPlaying()===s.id?' active':''}"
                    data-sound="${s.id}" title="${s.desc}">
              <span class="music-sound-icon">${s.icon}</span>
              <span class="music-sound-label">${s.label}</span>
            </button>`).join('')}
        </div>
        <div class="timer-music-vol">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
          <input type="range" class="music-vol-slider" id="music-vol"
                 min="0" max="100" value="${Math.round(FocusMusic.getVolume()*100)}" style="width:100%;" title="${Math.round(FocusMusic.getVolume()*100)}%"/>
        </div>
      </div>

      ${_historyView ? _renderHistory() : ''}

    </div>`;

  _updateRing();
  _wire();
}

/* ── Wire events ── */
function _wire() {
  _get('t-main').addEventListener('click', _toggle);
  _get('t-reset').addEventListener('click', _doReset);
  _get('t-zen').addEventListener('click', _toggleZen);
  _get('t-history')?.addEventListener('click', () => {
    _historyView = !_historyView;
    _render();
  });

  /* Clicking the timer display opens inline edit (only when idle/paused) */
  _get('t-display')?.addEventListener('click', () => {
    if (_state === 'running') return;
    _openEdit();
  });

  /* Edit actions */
  _get('t-edit-save')?.addEventListener('click', _saveEdit);
  _get('t-edit-cancel')?.addEventListener('click', _cancelEdit);
  _get('t-edit-val')?.addEventListener('keydown', e => {
    if (e.key === 'Enter')  _saveEdit();
    if (e.key === 'Escape') _cancelEdit();
  });

  /* Focus music */
  _container.querySelectorAll('.music-sound-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const isNowPlaying = await FocusMusic.toggle(btn.dataset.sound);
      _container.querySelectorAll('.music-sound-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.sound === btn.dataset.sound && isNowPlaying)
      );
    });
  });
  _container.querySelector('#music-vol')?.addEventListener('input', e => {
    FocusMusic.setVolume(e.target.value / 100);
  });

  /* Mode tabs */
  _container.querySelectorAll('.timer-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (_state === 'running') return;
      const s = { ...DEFAULTS, ...Storage.get(KEYS.SETTINGS, DEFAULTS) };
      _applyMode(tab.dataset.mode, s);
      _editMode = false;
      _render();
    });
  });
}

function _get(id) { return document.getElementById(id); }

/* ── Inline edit ── */
function _openEdit() {
  _editMode = true;
  const centre = _get('t-centre');
  const edit   = _get('t-edit');
  if (centre) centre.style.display = 'none';
  if (edit)   edit.style.display   = 'flex';
  setTimeout(() => _get('t-edit-val')?.select(), 30);
}

function _saveEdit() {
  const val  = parseInt(_get('t-edit-val')?.value) || 25;
  const mins = Math.max(1, Math.min(120, val));

  /* Save into settings under the current mode key */
  const s   = { ...DEFAULTS, ...Storage.get(KEYS.SETTINGS, DEFAULTS) };
  const key = _mode === 'work' ? 'workMins'
            : _mode === 'shortBreak' ? 'shortBreakMins' : 'longBreakMins';
  s[key] = mins;
  Storage.set(KEYS.SETTINGS, s);

  _applyMode(_mode, s);
  _editMode = false;
  _render();
}

function _cancelEdit() {
  _editMode = false;
  const centre = _get('t-centre');
  const edit   = _get('t-edit');
  if (edit)   edit.style.display   = 'none';
  if (centre) centre.style.display = 'flex';
}

/* ── Timer controls ── */
function _toggle() {
  if (_state === 'running') _pause();
  else _start();
}

function _start() {
  if (_editMode) _cancelEdit();
  // Always clear any existing tick before creating new one
  if (_tick) { clearInterval(_tick); _tick = null; }
  _state     = 'running';
  _sessionId = _sessionId || uuid();
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
  _get('t-display')?.classList.add('is-running');
}

function _pause() {
  clearInterval(_tick); _tick = null;
  _state = 'paused';
  Distraction.stopTracking();
  BG.saveTimerState(getState()); // save on pause so navigation can restore
  const btn = _get('t-main');
  if (btn) btn.textContent = 'Resume';
  _get('t-display')?.classList.remove('is-running');
}

function _doReset() {
  clearInterval(_tick); _tick = null;
  Distraction.stopTracking();
  BG.stopBackgroundTimer();
  BG.clearTimerState();
  const s = { ...DEFAULTS, ...Storage.get(KEYS.SETTINGS, DEFAULTS) };
  _applyMode(_mode, s);
  _editMode = false;
  _render();
}

function _complete() {
  clearInterval(_tick); _tick = null;
  Distraction.stopTracking();
  BG.stopBackgroundTimer(); // ensure BG isn't also counting
  BG.clearTimerState();

  if (_mode === 'work') {
    _workCount++;
    Storage.set('mindos_work_count', _workCount);
    _logSession();
    _notify('Focus complete! Time for a break.');
    const s    = { ...DEFAULTS, ...Storage.get(KEYS.SETTINGS, DEFAULTS) };
    const long = _workCount % (s.sessionsUntilLong || 4) === 0;
    _applyMode(long ? 'longBreak' : 'shortBreak', s);
  } else {
    _notify('Break over. Ready to focus?');
    const s = { ...DEFAULTS, ...Storage.get(KEYS.SETTINGS, DEFAULTS) };
    _applyMode('work', s);
  }
  _editMode    = false;
  _historyView = false;
  // Only re-render if we're still on the focus page
  if (_container) _render();
}

function _applyMode(mode, settings) {
  _mode      = mode;
  _state     = 'idle';
  _sessionId = null;
  const s    = { ...DEFAULTS, ...settings };
  const mins = mode === 'work'       ? s.workMins
             : mode === 'shortBreak' ? s.shortBreakMins
             : s.longBreakMins;
  _planned   = (Number(mins) || 25) * 60;
  _remaining = _planned;
}

/* ── Ring ── */
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

function _modeLabel() {
  return _mode === 'work' ? 'Focus time'
       : _mode === 'shortBreak' ? 'Short break' : 'Long break';
}

function _mainLabel() {
  return _state === 'running' ? 'Pause'
       : _state === 'paused'  ? 'Resume' : 'Start';
}

/* ── Zen ── */
function _toggleZen() {
  _zenMode = !_zenMode;
  document.body.classList.toggle('zen-mode', _zenMode);
  const btn = _get('t-zen');
  if (btn) btn.classList.toggle('zen-active', _zenMode);
}

/* ── Keyboard ── */
function _onKey(e) {
  if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === ' ')                { e.preventDefault(); _toggle(); }
  if (e.key.toLowerCase() === 'r') _doReset();
  if (e.key.toLowerCase() === 'z') _toggleZen();
}

/* ── Session log ── */
function _logSession() {
  const insights = Distraction.getInsights(_sessionId);
  Storage.update(KEYS.SESSIONS, list => {
    const arr = Array.isArray(list) ? list : [];
    return [...arr, {
      id: _sessionId || uuid(),
      type: 'work', duration: _planned, actual: _planned,
      distractions: insights.count, focusScore: insights.score,
      completedAt: new Date().toISOString(), date: toDateKey(),
    }];
  }, []);
}

/* ── Streak ── */
function _streak(sessions) {
  const days = [...new Set(
    sessions.filter(s=>s.type==='work'&&s.actual>0).map(s=>s.date)
  )].sort().reverse();
  if (!days.length) return 0;
  let streak=0, cursor=toDateKey();
  for (const day of days) {
    if (day===cursor) {
      streak++;
      const d=new Date(cursor); d.setDate(d.getDate()-1);
      cursor=d.toISOString().slice(0,10);
    } else break;
  }
  return streak;
}

/* ── Notify ── */
function _notify(msg) {
  if (Notification.permission==='granted')
    new Notification('mindOS_', {body:msg, icon:'./icon-192.png'});
  else if (Notification.permission==='default')
    Notification.requestPermission();
}