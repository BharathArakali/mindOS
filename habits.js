/* ============================================================
   habits.js — Habit Tracker
   Create habits · Daily check-ins · Streaks · Heatmap
   ============================================================ */

import { Storage, KEYS } from './storage.js';
import { uuid, toDateKey } from './utils.js';

const HABIT_COLORS = [
  { id:'blue',   color:'#5B6EF5' },
  { id:'green',  color:'#3DDC97' },
  { id:'orange', color:'#F5A623' },
  { id:'red',    color:'#F56565' },
  { id:'purple', color:'#B197FC' },
  { id:'pink',   color:'#F783AC' },
];

let _container = null;
let _view      = 'today'; // 'today' | 'manage'

export function init(container) {
  _container = container;
  _render();
}

export function destroy() {
  _container = null;
}

/* ── Render ── */
function _render() {
  if (!_container) return;
  const habits  = _getHabits();
  const today   = toDateKey();

  _container.innerHTML = `
    <div class="hab-wrap">
      <div class="hab-header">
        <div>
          <h2 class="hab-title">Habits</h2>
          <p class="hab-subtitle">${_dateLabel()}</p>
        </div>
        <div class="hab-header-actions">
          <button class="btn btn-secondary hab-view-btn${_view==='today'?' active':''}"
                  id="hab-view-today">Today</button>
          <button class="btn btn-secondary hab-view-btn${_view==='manage'?' active':''}"
                  id="hab-view-manage">Manage</button>
          <button class="btn btn-primary" id="hab-add-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New habit
          </button>
        </div>
      </div>

      <!-- Add habit form -->
      <div class="hab-form-wrap" id="hab-form-wrap" style="display:none;">
        <div class="hab-form card">
          <div class="form-group">
            <label class="form-label">Habit name</label>
            <input class="input" id="hab-name" type="text"
                   placeholder="e.g. Morning run, Read 20 pages, Meditate…"/>
          </div>
          <div class="form-group">
            <label class="form-label">Colour</label>
            <div class="hab-color-row" id="hab-color-row">
              ${HABIT_COLORS.map((c, i) => `
                <button class="hab-color-swatch${i===0?' selected':''}"
                        data-color="${c.id}" data-hex="${c.color}"
                        style="background:${c.color}"></button>`).join('')}
            </div>
          </div>
          <span id="hab-form-err" class="form-error" style="display:none;"></span>
          <div class="hab-form-actions">
            <button class="btn btn-secondary" id="hab-cancel">Cancel</button>
            <button class="btn btn-primary" id="hab-save">Add habit</button>
          </div>
        </div>
      </div>

      <!-- Today view -->
      ${_view === 'today' ? _renderToday(habits, today) : _renderManage(habits)}
    </div>`;

  _attachEvents();
}

/* ── Today view ── */
function _renderToday(habits, today) {
  if (!habits.length) return _renderEmpty();

  const logs     = _getLogs();
  const todayLog = logs[today] || {};
  const done     = habits.filter(h => todayLog[h.id]).length;

  return `
    <!-- Progress bar -->
    <div class="hab-progress-wrap">
      <div class="hab-progress-label">
        <span>${done} of ${habits.length} done today</span>
        <span class="hab-progress-pct">${habits.length ? Math.round((done/habits.length)*100) : 0}%</span>
      </div>
      <div class="hab-progress-track">
        <div class="hab-progress-fill"
             style="width:${habits.length ? (done/habits.length)*100 : 0}%"></div>
      </div>
    </div>

    <!-- Habit list -->
    <div class="hab-list">
      ${habits.map(h => {
        const checked = !!todayLog[h.id];
        const streak  = _calcStreak(h.id, logs, today);
        const hex     = HABIT_COLORS.find(c=>c.id===h.color)?.color || '#5B6EF5';
        return `
          <div class="hab-item${checked?' hab-item--done':''}" data-id="${h.id}">
            <button class="hab-check" data-id="${h.id}"
                    style="--hab-color:${hex}; ${checked?`background:${hex};border-color:${hex}`:''}">
              ${checked ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="white" stroke-width="3" stroke-linecap="round">
                <polyline points="20 6 9 17 4 12"/></svg>` : ''}
            </button>
            <div class="hab-item-body">
              <div class="hab-item-name" style="color:${checked?'var(--text-muted)':'var(--text)'};
                   text-decoration:${checked?'line-through':'none'}">
                ${_esc(h.name)}
              </div>
              <div class="hab-item-streak">
                ${streak > 0 ? `🔥 ${streak} day streak` : 'Start your streak today'}
              </div>
            </div>
            ${_renderMiniHeatmap(h.id, logs)}
          </div>`;
      }).join('')}
    </div>

    <!-- 7-day overview -->
    <div class="hab-week-wrap">
      <div class="hab-section-label">This week</div>
      <div class="hab-week-grid">
        ${_renderWeekGrid(habits, logs)}
      </div>
    </div>`;
}

/* ── Manage view ── */
function _renderManage(habits) {
  if (!habits.length) return _renderEmpty();
  return `
    <div class="hab-manage-list">
      ${habits.map(h => {
        const hex = HABIT_COLORS.find(c=>c.id===h.color)?.color || '#5B6EF5';
        return `
          <div class="hab-manage-item">
            <div class="hab-manage-dot" style="background:${hex}"></div>
            <span class="hab-manage-name">${_esc(h.name)}</span>
            <div class="hab-manage-actions">
              <button class="btn btn-secondary hab-archive-btn" data-id="${h.id}"
                      style="font-size:12px;padding:6px 10px;">
                ${h.archived ? 'Restore' : 'Archive'}
              </button>
              <button class="hab-del-btn" data-id="${h.id}" title="Delete">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function _renderEmpty() {
  return `
    <div class="empty-state" style="margin-top:40px;">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="1.2" stroke-linecap="round"
           style="color:var(--text-faint)">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      <p class="empty-state__title">No habits yet</p>
      <p class="empty-state__body">Hit "New habit" to start building your daily routine.</p>
    </div>`;
}

/* ── Mini heatmap (last 7 days) ── */
function _renderMiniHeatmap(habitId, logs) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = toDateKey(d);
    days.push({ key, done: !!(logs[key]?.[habitId]) });
  }
  return `
    <div class="hab-mini-heat">
      ${days.map(d => `
        <div class="hab-mini-cell${d.done?' done':''}"
             title="${d.key}"></div>`).join('')}
    </div>`;
}

/* ── Week grid ── */
function _renderWeekGrid(habits, logs) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(toDateKey(d));
  }

  return days.map(day => {
    const log   = logs[day] || {};
    const done  = habits.filter(h => log[h.id]).length;
    const pct   = habits.length ? done / habits.length : 0;
    const label = new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short' });
    const isToday = day === toDateKey();
    return `
      <div class="hab-week-day">
        <div class="hab-week-bar-wrap">
          <div class="hab-week-bar"
               style="height:${Math.max(pct*100,0)}%;
                      background:${isToday?'var(--accent)':'var(--accent-dim)'}">
          </div>
        </div>
        <div class="hab-week-label" style="color:${isToday?'var(--accent)':'var(--text-muted)'}">
          ${label}
        </div>
      </div>`;
  }).join('');
}

/* ── Events ── */
function _attachEvents() {
  _container.querySelector('#hab-view-today')?.addEventListener('click', () => {
    _view = 'today'; _render();
  });
  _container.querySelector('#hab-view-manage')?.addEventListener('click', () => {
    _view = 'manage'; _render();
  });
  _container.querySelector('#hab-add-btn')?.addEventListener('click', () => {
    const wrap = _container.querySelector('#hab-form-wrap');
    if (wrap) { wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none'; }
    setTimeout(() => _container.querySelector('#hab-name')?.focus(), 50);
  });
  _container.querySelector('#hab-cancel')?.addEventListener('click', () => {
    _container.querySelector('#hab-form-wrap').style.display = 'none';
  });
  _container.querySelector('#hab-save')?.addEventListener('click', _saveHabit);
  _container.querySelector('#hab-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _saveHabit();
  });

  // Color swatches
  _container.querySelectorAll('.hab-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      _container.querySelectorAll('.hab-color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
  });

  // Check / uncheck habit
  _container.querySelectorAll('.hab-check').forEach(btn => {
    btn.addEventListener('click', () => _toggleHabit(btn.dataset.id));
  });
  _container.querySelectorAll('.hab-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.hab-check')) return;
      _toggleHabit(item.dataset.id);
    });
  });

  // Manage actions
  _container.querySelectorAll('.hab-archive-btn').forEach(btn => {
    btn.addEventListener('click', () => _archiveHabit(btn.dataset.id));
  });
  _container.querySelectorAll('.hab-del-btn').forEach(btn => {
    btn.addEventListener('click', () => _deleteHabit(btn.dataset.id));
  });
}

/* ── Habit CRUD ── */
function _saveHabit() {
  const name    = _container.querySelector('#hab-name')?.value.trim();
  const errEl   = _container.querySelector('#hab-form-err');
  if (!name) { errEl.textContent = 'Please enter a habit name.'; errEl.style.display='block'; return; }

  const selected = _container.querySelector('.hab-color-swatch.selected');
  const color    = selected?.dataset.color || 'blue';

  Storage.update(KEYS.HABITS, list => {
    const arr = Array.isArray(list) ? list : [];
    return [...arr, { id: uuid(), name, color, archived: false, createdAt: new Date().toISOString() }];
  }, []);

  _container.querySelector('#hab-form-wrap').style.display = 'none';
  _container.querySelector('#hab-name').value = '';
  _render();
}

function _toggleHabit(id) {
  const today = toDateKey();
  Storage.update(KEYS.HABIT_LOGS, logs => {
    const l = logs || {};
    const dayLog = { ...(l[today] || {}) };
    dayLog[id] = !dayLog[id];
    return { ...l, [today]: dayLog };
  }, {});
  _render();
}

function _archiveHabit(id) {
  Storage.update(KEYS.HABITS, list =>
    (list || []).map(h => h.id === id ? { ...h, archived: !h.archived } : h), []);
  _render();
}

function _deleteHabit(id) {
  Storage.update(KEYS.HABITS, list => (list||[]).filter(h => h.id !== id), []);
  _render();
}

/* ── Streak calculator ── */
function _calcStreak(habitId, logs, today) {
  let streak = 0;
  let cursor = today;
  for (let i = 0; i < 365; i++) {
    if (logs[cursor]?.[habitId]) {
      streak++;
      const d = new Date(cursor + 'T12:00:00'); d.setDate(d.getDate() - 1);
      cursor = toDateKey(d);
    } else break;
  }
  return streak;
}

/* ── Helpers ── */
function _getHabits() { return (Storage.get(KEYS.HABITS, []) || []).filter(h => !h.archived); }
function _getLogs()   { return Storage.get(KEYS.HABIT_LOGS, {}) || {}; }
function _dateLabel() {
  return new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });
}
function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}