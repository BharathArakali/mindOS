/* ============================================================
   reminders.js — Reminders Module
   Create · Edit · Delete · Browser notifications · Audio tone
   ============================================================ */

import { Storage, KEYS } from './storage.js';
import * as BG from './background.js';
import { uuid, formatDate } from './utils.js';

/* Scheduled setTimeout handles — cleared on destroy */
const _timers = new Map();
let _container = null;

/* ── Public API ── */
export function init(container) {
  _container = container;
  _scheduleAll();
  _render();
  const action = sessionStorage.getItem('mindos_action');
  if (action === 'new_reminder') {
    sessionStorage.removeItem('mindos_action');
    setTimeout(() => _openForm(), 200);
  }
}

export function destroy() {
  // DO NOT cancel reminder timers — background.js owns scheduling
  // Just detach UI
  _container = null;
}

/* ── Schedule all pending reminders on init ── */
function _scheduleAll() {
  const reminders = _getReminders();
  reminders.forEach(r => {
    if (!r.completed && !r.notified) _schedule(r);
  });
}

function _schedule(reminder) {
  const msUntil = new Date(reminder.datetime).getTime() - Date.now();
  if (msUntil <= 0) return;

  const t = setTimeout(() => {
    _fire(reminder.id);
  }, msUntil);

  _timers.set(reminder.id, t);
}

function _fire(id) {
  _timers.delete(id);

  /* Mark as notified in storage */
  Storage.update(KEYS.REMINDERS, list =>
    list.map(r => r.id === id ? { ...r, notified: true } : r), []);

  const reminder = _getReminders().find(r => r.id === id);
  if (!reminder) return;

  /* Play audio tone */
  _playTone();

  /* Browser notification */
  if (Notification.permission === 'granted') {
    new Notification('mindOS_ Reminder', {
      body: reminder.text,
      icon: './icon-192.png',
    });
  } else {
    /* In-app fallback banner */
    _showBanner(reminder.text);
  }

  /* Re-render to reflect notified state */
  if (_container) _render();
}

/* ── Render ── */
function _render() {
  if (!_container) return;

  const all       = _getReminders();
  const pending   = all.filter(r => !r.completed).sort(
    (a, b) => new Date(a.datetime) - new Date(b.datetime)
  );
  const completed = all.filter(r => r.completed).sort(
    (a, b) => new Date(b.datetime) - new Date(a.datetime)
  );

  _container.innerHTML = `
    <div class="rem-wrap">

      <!-- Header -->
      <div class="rem-header">
        <div>
          <h2 class="rem-title">Reminders</h2>
          <p class="rem-subtitle">
            ${pending.length} pending
            ${completed.length ? ` · ${completed.length} completed` : ''}
          </p>
        </div>
        <button class="btn btn-primary" id="rem-add-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New reminder
        </button>
      </div>

      <!-- Add / Edit form (hidden by default) -->
      <div class="rem-form-wrap" id="rem-form-wrap" style="display:none;">
        <div class="rem-form card">
          <div class="rem-form-title" id="rem-form-title">New reminder</div>

          <div class="form-group">
            <label class="form-label">What to remind you</label>
            <input class="input" id="rem-text" type="text"
                   placeholder="e.g. Take a break, Review PR, Call back…"
                   autocomplete="off"/>
          </div>

          <div class="rem-form-row">
            <div class="form-group" style="flex:1;">
              <label class="form-label">Date</label>
              <input class="input" id="rem-date" type="date"/>
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">Time</label>
              <input class="input" id="rem-time" type="time"/>
            </div>
          </div>

          <span id="rem-form-error" class="form-error" style="display:none;"></span>

          <div class="rem-form-actions">
            <button class="btn btn-secondary" id="rem-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="rem-save-btn">Save reminder</button>
          </div>
        </div>
      </div>

      <!-- Pending list -->
      ${pending.length === 0 && completed.length === 0
        ? _renderEmptyState()
        : ''}

      ${pending.length > 0 ? `
        <div class="rem-section">
          <div class="rem-section-label">Upcoming</div>
          <div class="rem-list" id="rem-pending-list">
            ${pending.map(r => _renderItem(r)).join('')}
          </div>
        </div>` : ''}

      ${completed.length > 0 ? `
        <div class="rem-section">
          <div class="rem-section-label">Completed</div>
          <div class="rem-list rem-list--completed">
            ${completed.slice(0, 10).map(r => _renderItem(r)).join('')}
          </div>
        </div>` : ''}

    </div>`;

  _attachEvents();
}

function _renderItem(r) {
  const dt      = new Date(r.datetime);
  const now     = new Date();
  const isOverdue = !r.completed && dt < now;
  const dateStr = dt.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short'
  });
  const timeStr = dt.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit'
  });

  return `
    <div class="rem-item${r.completed ? ' rem-item--done' : ''}${isOverdue ? ' rem-item--overdue' : ''}"
         data-id="${r.id}">
      <button class="rem-check" data-id="${r.id}" title="${r.completed ? 'Mark pending' : 'Mark complete'}">
        ${r.completed
          ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
               <polyline points="20 6 9 17 4 12"/>
             </svg>`
          : ''}
      </button>

      <div class="rem-item-body">
        <div class="rem-item-text">${_esc(r.text)}</div>
        <div class="rem-item-meta">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="${isOverdue ? 'rem-overdue-text' : ''}">
            ${dateStr} at ${timeStr}
            ${isOverdue ? ' · overdue' : ''}
            ${r.notified && !r.completed ? ' · notified' : ''}
          </span>
        </div>
      </div>

      <button class="rem-cal-btn" data-id="${r.id}" data-text="${r.text.replace(/"/g,'&quot;')}"
              data-dt="${r.datetime}" title="Add to Google Calendar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8"  y1="2" x2="8"  y2="6"/>
          <line x1="3"  y1="10" x2="21" y2="10"/>
        </svg>
      </button>
      <button class="rem-delete-btn" data-id="${r.id}" title="Delete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
        </svg>
      </button>
    </div>`;
}

function _renderEmptyState() {
  return `
    <div class="empty-state" style="margin-top:40px;">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="1.2" stroke-linecap="round"
           style="color:var(--text-faint)">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <p class="empty-state__title">No reminders yet</p>
      <p class="empty-state__body">
        Hit "New reminder" to create one.<br/>
        We'll notify you at the right time.
      </p>
    </div>`;
}

/* ── Events ── */
function _attachEvents() {
  /* Open form */
  _container.querySelector('#rem-add-btn')
    ?.addEventListener('click', () => _openForm());

  /* Cancel */
  _container.querySelector('#rem-cancel-btn')
    ?.addEventListener('click', () => _closeForm());

  /* Save */
  _container.querySelector('#rem-save-btn')
    ?.addEventListener('click', () => _handleSave());

  /* Enter key in text field */
  _container.querySelector('#rem-text')
    ?.addEventListener('keydown', e => {
      if (e.key === 'Enter') _handleSave();
    });

  /* Check / uncheck */
  _container.querySelectorAll('.rem-check').forEach(btn => {
    btn.addEventListener('click', () => _toggleComplete(btn.dataset.id));
  });

  /* Delete */
  _container.querySelectorAll('.rem-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => _deleteReminder(btn.dataset.id));
  });

  _container.querySelectorAll('.rem-cal-btn').forEach(btn => {
    btn.addEventListener('click', () => _addToCalendar(btn.dataset.id));
  });
}

/* ── Form ── */
function _openForm(existing = null) {
  const wrap  = _container.querySelector('#rem-form-wrap');
  const title = _container.querySelector('#rem-form-title');
  const text  = _container.querySelector('#rem-text');
  const date  = _container.querySelector('#rem-date');
  const time  = _container.querySelector('#rem-time');
  const save  = _container.querySelector('#rem-save-btn');

  if (!wrap) return;

  /* Default date/time = now + 1 hour, rounded to next 5 min */
  const defaultDt = new Date(Date.now() + 60 * 60 * 1000);
  defaultDt.setMinutes(Math.ceil(defaultDt.getMinutes() / 5) * 5, 0, 0);
  const pad    = n => String(n).padStart(2, '0');
  const defDate = `${defaultDt.getFullYear()}-${pad(defaultDt.getMonth()+1)}-${pad(defaultDt.getDate())}`;
  const defTime = `${pad(defaultDt.getHours())}:${pad(defaultDt.getMinutes())}`;

  if (existing) {
    const dt = new Date(existing.datetime);
    title.textContent    = 'Edit reminder';
    text.value           = existing.text;
    date.value           = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
    time.value           = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    save.dataset.editId  = existing.id;
  } else {
    title.textContent    = 'New reminder';
    text.value           = '';
    date.value           = defDate;
    time.value           = defTime;
    delete save.dataset.editId;
  }

  wrap.style.display = 'block';
  wrap.style.animation = 'riseIn 250ms ease both';
  setTimeout(() => text.focus(), 50);

  /* Request notification permission on first form open */
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function _closeForm() {
  const wrap = _container?.querySelector('#rem-form-wrap');
  if (wrap) wrap.style.display = 'none';
  const err = _container?.querySelector('#rem-form-error');
  if (err) err.style.display = 'none';
}

function _handleSave() {
  const text    = _container.querySelector('#rem-text')?.value.trim();
  const dateVal = _container.querySelector('#rem-date')?.value;
  const timeVal = _container.querySelector('#rem-time')?.value;
  const errEl   = _container.querySelector('#rem-form-error');
  const saveBtn = _container.querySelector('#rem-save-btn');

  errEl.style.display = 'none';

  if (!text)            return _showErr(errEl, 'Please enter a reminder.');
  if (!dateVal || !timeVal) return _showErr(errEl, 'Please set a date and time.');

  const datetime = new Date(`${dateVal}T${timeVal}`);
  if (isNaN(datetime.getTime())) return _showErr(errEl, 'Invalid date or time.');

  const editId = saveBtn.dataset.editId;

  if (editId) {
    /* Edit existing */
    const old = _getReminders().find(r => r.id === editId);
    BG.cancelReminderTimer(editId);

    Storage.update(KEYS.REMINDERS, list =>
      list.map(r => r.id === editId
        ? { ...r, text, datetime: datetime.toISOString(), notified: false }
        : r), []);

    const updated = _getReminders().find(r => r.id === editId);
    if (updated && !updated.completed) _schedule(updated);
  } else {
    /* New */
    const reminder = {
      id:       uuid(),
      text,
      datetime: datetime.toISOString(),
      completed: false,
      notified:  false,
    };
    Storage.update(KEYS.REMINDERS, list =>
      [...(Array.isArray(list) ? list : []), reminder], []);

    _schedule(reminder);
  }

  _closeForm();
  _render();
}

/* ── CRUD helpers ── */
function _toggleComplete(id) {
  Storage.update(KEYS.REMINDERS, list =>
    list.map(r => r.id === id ? { ...r, completed: !r.completed } : r), []);

  /* Cancel timer if marking complete */
  if (_timers.has(id)) {
    clearTimeout(_timers.get(id));
    _timers.delete(id);
  }
  _render();
}

function _deleteReminder(id) {
  const reminder = _getReminders().find(r => r.id === id);
  if (!reminder) return;

  BG.cancelReminderTimer(id);

  Storage.update(KEYS.REMINDERS, list => list.filter(r => r.id !== id), []);
  _render();

  /* Undo toast */
  _showUndoToast(`"${reminder.text.slice(0, 30)}" deleted`, () => {
    Storage.update(KEYS.REMINDERS,
      list => [...(Array.isArray(list) ? list : []), reminder], []);
    if (!reminder.completed) _schedule(reminder);
    _render();
  });
}

/* ── Audio tone (Web Audio API — no external files) ── */
function _playTone() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type      = 'sine';
    osc.frequency.setValueAtTime(523, ctx.currentTime);          // C5
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);   // E5
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.30);   // G5

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.7);
    osc.onended = () => ctx.close();
  } catch {
    /* Audio not available — silent fail */
  }
}

/* ── In-app notification banner ── */
function _showBanner(text) {
  const existing = document.getElementById('notif-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id        = 'notif-banner';
  banner.className = 'notif-banner anim-rise-in';
  banner.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
    <span>${_esc(text)}</span>
    <button class="notif-banner-close" onclick="this.parentElement.remove()">✕</button>`;
  document.body.appendChild(banner);

  setTimeout(() => banner.remove(), 8000);
}

/* ── Helpers ── */
function _getReminders() { return Storage.get(KEYS.REMINDERS, []); }

function _showErr(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

function _addToCalendar(id) {
  const r = _getReminders().find(r => r.id === id);
  if (!r) return;

  const dt    = new Date(r.datetime);
  const pad   = n => String(n).padStart(2, '0');
  // Google Calendar format: YYYYMMDDTHHmmss
  const fmt   = d =>
    `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const end   = new Date(dt.getTime() + 30 * 60 * 1000); // 30-min default duration
  const title = encodeURIComponent(r.text);
  const dates = `${fmt(dt)}/${fmt(end)}`;
  const details = encodeURIComponent('Created in mindOS_');

  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${title}&dates=${dates}&details=${details}`;

  window.open(url, '_blank', 'noopener');
}

function _showUndoToast(msg, onUndo) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${_esc(msg)}</span>
    <button class="toast__action">Undo</button>`;
  root.appendChild(t);
  let done = false;
  t.querySelector('.toast__action').addEventListener('click', () => {
    done = true; onUndo();
    t.classList.add('exiting');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  });
  setTimeout(() => {
    if (!done) {
      t.classList.add('exiting');
      t.addEventListener('animationend', () => t.remove(), { once: true });
    }
  }, 5000);
}

function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}