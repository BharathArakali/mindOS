/* ============================================================
   timer.js — Focus Engine
   Editable MM:SS · Live clock · Background timer via BG module
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
let _editMode     = false;   // 'mins' | 'secs' | false
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
  _startClock();
}

export function destroy() {
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

/* ── Live clock ── */
function _startClock() {
  if (_clockInterval) clearInterval(_clockInterval);
  _clockInterval = setInterval(_tickClock, 1000);
  _tickClock(); // immediate first render
}

function _tickClock() {
  const el = document.getElementById('t-clock');
  if (!el) return;
  const now = new Date();
  const h   = String(now.getHours()).padStart(2, '0');
  const m   = String(now.getMinutes()).padStart(2, '0');
  const s   = String(now.getSeconds()).padStart(2, '0');
  el.textContent = `${h}:${m}:${s}`;
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

  const remMins = Math.floor(_remaining / 60);
  const remSecs = _remaining % 60;

  _container.innerHTML = `
    <div class="timer-wrap" id="timer-wrap">

      <!-- Live clock -->
      <div class="timer-clock-bar">
        <span class="timer-clock" id="t-clock">--:--:--</span>
      </div>

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

        <!-- Normal countdown view -->
        <div class="timer-centre" id="t-centre"
             style="${_editMode ? 'display:none' : ''}">

          <!-- MM:SS — each segment clickable separately -->
          <div class="timer-display-split" id="t-display-split"
               title="${_state === 'running' ? '' : 'Click minutes or seconds to edit'}">
            <span class="timer-seg timer-seg--mins${_state==='running'?' timer-seg--running':''}"
                  id="t-seg-mins"
                  data-edit="mins">${String(remMins).padStart(2,'0')}</span>
            <span class="timer-seg timer-seg--colon${_state==='running'?' timer-seg--running':''}"
                  id="t-colon">:</span>
            <span class="timer-seg timer-seg--secs${_state==='running'?' timer-seg--running':''}"
                  id="t-seg-secs"
                  data-edit="secs">${String(remSecs).padStart(2,'0')}</span>
          </div>

          <div class="timer-mode-label">${_modeLabel()}</div>
          ${_state !== 'running' ? '<div class="timer-edit-hint">tap mins or secs to edit</div>' : ''}
        </div>

        <!-- Edit view: shows inside ring when editing mins or secs -->
        <div class="timer-edit-centre" id="t-edit"
             style="${_editMode ? '' : 'display:none'}">
          <div class="timer-edit-label" id="t-edit-label">
            ${_editMode === 'secs' ? 'seconds (0–59)' : 'minutes (1–120)'}
          </div>
          <input class="timer-edit-input" id="t-edit-val" type="number"
                 min="${_editMode === 'secs' ? 0 : 1}"
                 max="${_editMode === 'secs' ? 59 : 120}"
                 value="${_editMode === 'secs' ? remSecs : remMins}"/>
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

      <!-- Controls -->
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
                 min="0" max="100" value="${Math.round(FocusMusic.getVolume()*100)}"
                 style="width:100%;"
                 title="${Math.round(FocusMusic.getVolume()*100)}%"/>
        </div>
      </div>

      ${_historyView ? _renderHistory() : ''}

    </div>`;

  _updateRing();
  _wire();
  _startClock(); // restart clock after re-render (new DOM node)
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

  /* Click on minutes segment */
  _get('t-seg-mins')?.addEventListener('click', () => {
    if (_state === 'running') return;
    _openEdit('mins');
  });

  /* Click on seconds segment */
  _get('t-seg-secs')?.addEventListener('click', () => {
    if (_state === 'running') return;
    _openEdit('secs');
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
function _openEdit(part) { // part = 'mins' | 'secs'
  _editMode = part;
  const centre = _get('t-centre');
  const edit   = _get('t-edit');
  const label  = _get('t-edit-label');
  const input  = _get('t-edit-val');

  if (centre) centre.style.display = 'none';
  if (edit)   edit.style.display   = 'flex';
  if (label)  label.textContent    = part === 'secs' ? 'seconds (0–59)' : 'minutes (1–120)';
  if (input) {
    input.min   = part === 'secs' ? '0' : '1';
    input.max   = part === 'secs' ? '59' : '120';
    input.value = part === 'secs' ? String(_remaining % 60) : String(Math.floor(_remaining / 60));
    setTimeout(() => input.select(), 30);
  }
}

function _saveEdit() {
  const raw  = parseInt(_get('t-edit-val')?.value);
  const currentMins = Math.floor(_remaining / 60);
  const currentSecs = _remaining % 60;

  let newMins = currentMins;
  let newSecs = currentSecs;

  if (_editMode === 'mins') {
    newMins = Math.max(0, Math.min(120, isNaN(raw) ? currentMins : raw));
    // If mins set to 0, keep at least 1 second
    if (newMins === 0 && newSecs === 0) newSecs = 1;
  } else if (_editMode === 'secs') {
    newSecs = Math.max(0, Math.min(59, isNaN(raw) ? currentSecs : raw));
  }

  const totalSecs = newMins * 60 + newSecs;
  _remaining = totalSecs;
  _planned   = totalSecs; // treat edited value as the new planned duration

  /* Persist to settings (minutes portion only, as before) */
  const s   = { ...DEFAULTS, ...Storage.get(KEYS.SETTINGS, DEFAULTS) };
  const key = _mode === 'work' ? 'workMins'
            : _mode === 'shortBreak' ? 'shortBreakMins' : 'longBreakMins';
  s[key] = newMins || 1;
  Storage.set(KEYS.SETTINGS, s);

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
  if (_tick) { clearInterval(_tick); _tick = null; }
  _state     = 'running';
  _sessionId = _sessionId || uuid();
  Distraction.startTracking(_sessionId);
  _tick = setInterval(() => {
    _remaining--;

    /* Update MM:SS display in-place without full re-render */
    const minsEl = _get('t-seg-mins');
    const secsEl = _get('t-seg-secs');
    if (minsEl) minsEl.textContent = String(Math.floor(_remaining / 60)).padStart(2, '0');
    if (secsEl) secsEl.textContent = String(_remaining % 60).padStart(2, '0');

    _updateRing();
    if (_remaining <= 0) _complete();
  }, 1000);

  const btn = _get('t-main');
  if (btn) btn.textContent = 'Pause';

  /* Add running class to segments */
  _get('t-seg-mins')?.classList.add('timer-seg--running');
  _get('t-colon')?.classList.add('timer-seg--running');
  _get('t-seg-secs')?.classList.add('timer-seg--running');

  /* Remove edit hint if present */
  _container?.querySelector('.timer-edit-hint')?.remove();
}

function _pause() {
  clearInterval(_tick); _tick = null;
  _state = 'paused';
  Distraction.stopTracking();
  BG.saveTimerState(getState());
  const btn = _get('t-main');
  if (btn) btn.textContent = 'Resume';

  /* Remove running class */
  _get('t-seg-mins')?.classList.remove('timer-seg--running');
  _get('t-colon')?.classList.remove('timer-seg--running');
  _get('t-seg-secs')?.classList.remove('timer-seg--running');
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
  BG.stopBackgroundTimer();
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

/* ── History ── */
function _renderHistory() {
  const sessions = Storage.get(KEYS.SESSIONS, []);
  const recent   = [...sessions].reverse().slice(0, 10);
  if (!recent.length) return `<div class="timer-history"><p style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px 0">No sessions yet</p></div>`;
  return `
    <div class="timer-history">
      <div class="timer-history__title">Recent sessions</div>
      ${recent.map(s => `
        <div class="timer-history__row">
          <span class="timer-history__type ${s.type==='work'?'work':'break'}">
            ${s.type==='work'?'Focus':'Break'}
          </span>
          <span class="timer-history__dur">${Math.round((s.actual||s.duration)/60)}m</span>
          <span class="timer-history__score">${s.focusScore!=null?`${s.focusScore}%`:''}</span>
          <span class="timer-history__date">${s.date||''}</span>
        </div>`).join('')}
    </div>`;
}