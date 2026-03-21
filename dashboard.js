/* ============================================================
   dashboard.js — Dashboard Module
   Stats · Streak · 7-day SVG chart · Upcoming reminders
   All stats computed fresh on each render — never cached.
   ============================================================ */

import { Storage, KEYS } from './storage.js';
import { toDateKey, formatDuration } from './utils.js';

let _container = null;

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

  const sessions   = Storage.get(KEYS.SESSIONS, []);
  const reminders  = Storage.get(KEYS.REMINDERS, []);
  const todayKey   = toDateKey();

  /* Today's stats */
  const todaySess  = sessions.filter(s => s.type === 'work' && s.date === todayKey && s.actual > 0);
  const todayMins  = Math.round(todaySess.reduce((a, s) => a + s.actual, 0) / 60);
  const todayCount = todaySess.length;

  /* All-time stats */
  const allWork    = sessions.filter(s => s.type === 'work' && s.actual > 0);
  const totalMins  = Math.round(allWork.reduce((a, s) => a + s.actual, 0) / 60);
  const totalSess  = allWork.length;

  /* Streak */
  const streak     = _calcStreak(sessions);

  /* Focus score today (avg) */
  const avgScore   = todaySess.length
    ? Math.round(todaySess.reduce((a, s) => a + (s.focusScore || 100), 0) / todaySess.length)
    : null;

  /* Upcoming reminders (next 5, not completed) */
  const upcoming   = reminders
    .filter(r => !r.completed && new Date(r.datetime) > new Date())
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
    .slice(0, 5);

  /* 7-day chart data */
  const chartData  = _buildChartData(sessions, 7);

  _container.innerHTML = `
    <div class="dash-wrap anim-fade-in">

      <!-- Page title -->
      <div class="dash-heading">
        <h2 class="dash-title">Dashboard</h2>
        <p class="dash-subtitle">${_todayLabel()}</p>
      </div>

      <!-- Today stat cards -->
      <div class="dash-stats-grid">
        ${_statCard('Sessions today', todayCount, '', 'var(--accent)')}
        ${_statCard('Focus time today', todayMins, 'm', 'var(--success)')}
        ${_statCard('Day streak', streak, streak === 1 ? ' day' : ' days', 'var(--warning)')}
        ${avgScore !== null
          ? _statCard('Focus score', avgScore, '%', avgScore >= 80 ? 'var(--success)' : 'var(--warning)')
          : _statCard('Focus score', '—', '', 'var(--text-faint)')}
      </div>

      <!-- All-time row -->
      <div class="dash-alltime">
        <div class="dash-alltime-item">
          <span class="dash-alltime-val">${totalSess}</span>
          <span class="dash-alltime-lbl">Total sessions</span>
        </div>
        <div class="dash-alltime-divider"></div>
        <div class="dash-alltime-item">
          <span class="dash-alltime-val">${formatDuration(totalMins)}</span>
          <span class="dash-alltime-lbl">Total focus time</span>
        </div>
        <div class="dash-alltime-divider"></div>
        <div class="dash-alltime-item">
          <span class="dash-alltime-val">${_longestStreak(sessions)}</span>
          <span class="dash-alltime-lbl">Best streak</span>
        </div>
      </div>

      <!-- 7-day chart -->
      <div class="dash-card">
        <div class="dash-card-header">
          <span class="dash-card-title">7-day focus</span>
          <span class="dash-card-sub">${formatDuration(chartData.reduce((a,d)=>a+d.mins,0))} this week</span>
        </div>
        ${_renderChart(chartData)}
      </div>

      <!-- Upcoming reminders -->
      <div class="dash-card">
        <div class="dash-card-header">
          <span class="dash-card-title">Upcoming reminders</span>
          <a href="#reminders" class="dash-card-link">View all</a>
        </div>
        ${upcoming.length === 0
          ? `<p class="dash-empty-msg">No upcoming reminders.</p>`
          : `<div class="dash-reminder-list">
              ${upcoming.map(r => _renderReminderRow(r)).join('')}
             </div>`}
      </div>

    </div>`;
}

/* ── Stat card ── */
function _statCard(label, value, unit, color) {
  return `
    <div class="dash-stat-card">
      <div class="dash-stat-val" style="color:${color};">${value}<span class="dash-stat-unit">${unit}</span></div>
      <div class="dash-stat-lbl">${label}</div>
    </div>`;
}

/* ── 7-day chart ── */
function _buildChartData(sessions, days) {
  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    const d   = new Date();
    d.setDate(d.getDate() - i);
    const key  = toDateKey(d);
    const mins = Math.round(
      sessions
        .filter(s => s.type === 'work' && s.date === key && s.actual > 0)
        .reduce((a, s) => a + s.actual, 0) / 60
    );
    data.push({
      key,
      mins,
      label: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      isToday: key === toDateKey(),
    });
  }
  return data;
}

function _renderChart(data) {
  const maxMins = Math.max(...data.map(d => d.mins), 1);
  const W = 560, H = 120, BAR_W = 36, GAP = 44;
  const totalW = data.length * GAP;
  const offsetX = (W - totalW) / 2;

  const bars = data.map((d, i) => {
    const barH   = d.mins > 0 ? Math.max((d.mins / maxMins) * H, 6) : 2;
    const x      = offsetX + i * GAP + (GAP - BAR_W) / 2;
    const y      = H - barH;
    const color  = d.isToday ? 'var(--accent)' : 'var(--text-faint)';
    const radius = Math.min(6, barH / 2);

    return `
      <g>
        ${d.mins > 0 ? `
          <rect x="${x}" y="${y}" width="${BAR_W}" height="${barH}"
            rx="${radius}" fill="${color}" opacity="${d.isToday ? 1 : 0.5}"/>
          <text x="${x + BAR_W/2}" y="${y - 5}"
            text-anchor="middle" font-size="9"
            fill="${color}" font-family="var(--font-mono)"
            opacity="${d.isToday ? 1 : 0.7}">
            ${d.mins}m
          </text>` : `
          <rect x="${x}" y="${H - 2}" width="${BAR_W}" height="2"
            rx="1" fill="var(--border)"/>`}
        <text x="${x + BAR_W/2}" y="${H + 16}"
          text-anchor="middle" font-size="10"
          fill="${d.isToday ? 'var(--accent)' : 'var(--text-muted)'}"
          font-family="var(--font-ui)"
          font-weight="${d.isToday ? '600' : '400'}">
          ${d.label}
        </text>
      </g>`;
  }).join('');

  return `
    <svg class="dash-chart" viewBox="0 0 ${W} ${H + 28}"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${bars}
    </svg>`;
}

/* ── Reminder row ── */
function _renderReminderRow(r) {
  const dt      = new Date(r.datetime);
  const dateStr = dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return `
    <div class="dash-reminder-row">
      <div class="dash-reminder-dot"></div>
      <div class="dash-reminder-body">
        <span class="dash-reminder-text">${_esc(r.text)}</span>
        <span class="dash-reminder-time">${dateStr} · ${timeStr}</span>
      </div>
    </div>`;
}

/* ── Streak calculator ── */
function _calcStreak(sessions) {
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
      cursor = toDateKey(d);
    } else break;
  }
  return streak;
}

function _longestStreak(sessions) {
  const days = [...new Set(
    sessions.filter(s => s.type === 'work' && s.actual > 0).map(s => s.date)
  )].sort();

  if (!days.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const curr = new Date(days[i]);
    const diff = (curr - prev) / 86400000;
    if (diff === 1) { cur++; best = Math.max(best, cur); }
    else cur = 1;
  }
  return best;
}

function _todayLabel() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}