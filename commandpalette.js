/* ============================================================
   commandpalette.js — Global Command Palette
   Press "/" anywhere (not in text input) to open.
   ============================================================ */

import { Storage, KEYS } from './storage.js';
import { uuid }           from './utils.js';
import * as FocusMusic    from './focusmusic.js';

let _overlay  = null;
let _keyFn    = null;

/* ── Commands ── */
function _getCommands(query) {
  const q = (query || '').toLowerCase().trim();

  const all = [
    /* Navigation */
    { icon:'⏱', label:'Open Focus timer',    action: () => { window.location.hash = '#focus'; },      tags:['focus','timer','pomodoro'] },
    { icon:'📝', label:'Open Notes',          action: () => { window.location.hash = '#notes'; },      tags:['notes','write'] },
    { icon:'🔔', label:'Open Reminders',      action: () => { window.location.hash = '#reminders'; },  tags:['reminders','alerts'] },
    { icon:'📊', label:'Open Dashboard',      action: () => { window.location.hash = '#dashboard'; },  tags:['dashboard','stats'] },
    { icon:'✅', label:'Open Habits',         action: () => { window.location.hash = '#habits'; },     tags:['habits','streak'] },
    { icon:'🏠', label:'Go home',             action: () => { window.location.hash = '#home'; },       tags:['home'] },

    /* Timer */
    { icon:'▶', label:'Start 25 min focus',  action: () => _startTimer(25),  tags:['start','focus','25'] },
    { icon:'▶', label:'Start 50 min focus',  action: () => _startTimer(50),  tags:['start','focus','50'] },
    { icon:'▶', label:'Start 15 min focus',  action: () => _startTimer(15),  tags:['start','focus','15'] },

    /* Notes */
    { icon:'✏️', label:'New note',            action: () => _newNote(),        tags:['note','new','create'] },
    { icon:'📅', label:'Weekly review',       action: () => _weeklyReview(),   tags:['review','weekly','reflect'] },

    /* Reminders */
    { icon:'➕', label:'New reminder',        action: () => _newReminder(),    tags:['reminder','new','add'] },

    /* Music */
    ...FocusMusic.SOUNDS.map(s => ({
      icon: s.icon,
      label: `Play ${s.label}`,
      action: async () => { await FocusMusic.toggle(s.id); },
      tags: [s.id, 'music', 'sound', 'ambient', s.label.toLowerCase()],
    })),
    { icon:'🔇', label:'Stop music',          action: () => FocusMusic.stopAll(), tags:['stop','music','quiet'] },

    /* Theme */
    { icon:'🌙', label:'Toggle dark/light',   action: () => import('./theme.js').then(m => m.Theme.toggle()), tags:['theme','dark','light'] },
  ];

  if (!q) return all.slice(0, 8); // show first 8 when empty
  return all.filter(cmd =>
    cmd.label.toLowerCase().includes(q) ||
    cmd.tags.some(t => t.includes(q))
  ).slice(0, 10);
}

/* ── Open / Close ── */
export function init() {
  _keyFn = (e) => {
    // Open on "/" key — not when typing in input/textarea/contenteditable
    const tag = document.activeElement?.tagName;
    const ce  = document.activeElement?.contentEditable;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || ce === 'true') return;
    if (e.key === '/') { e.preventDefault(); open(); }
    if (e.key === 'Escape' && _overlay) close();
  };
  document.addEventListener('keydown', _keyFn);
}

export function destroy() {
  if (_keyFn) document.removeEventListener('keydown', _keyFn);
  close();
}

export function open() {
  if (_overlay) return;

  _overlay = document.createElement('div');
  _overlay.className = 'cp-overlay';
  _overlay.innerHTML = `
    <div class="cp-modal">
      <div class="cp-search-wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input class="cp-input" id="cp-input" type="text"
               placeholder="Search commands… (e.g. focus, new note, rain)" autocomplete="off"/>
        <kbd class="cp-esc-hint">ESC</kbd>
      </div>
      <div class="cp-list" id="cp-list"></div>
      <div class="cp-footer">
        <span>↑↓ navigate</span>
        <span>↵ select</span>
        <span>/ or ESC close</span>
      </div>
    </div>`;

  document.body.appendChild(_overlay);

  const input   = _overlay.querySelector('#cp-input');
  const list    = _overlay.querySelector('#cp-list');
  let selected  = 0;

  const render = (q) => {
    const cmds = _getCommands(q);
    selected   = 0;
    list.innerHTML = cmds.map((cmd, i) => `
      <button class="cp-item${i === 0 ? ' cp-item--active' : ''}" data-idx="${i}">
        <span class="cp-item-icon">${cmd.icon}</span>
        <span class="cp-item-label">${_highlight(cmd.label, q)}</span>
      </button>`).join('') || `<div class="cp-empty">No commands found</div>`;

    list.querySelectorAll('.cp-item').forEach((btn, i) => {
      btn.addEventListener('click', () => { _exec(cmds[i]); });
      btn.addEventListener('mouseover', () => {
        selected = i;
        list.querySelectorAll('.cp-item').forEach((b,j) =>
          b.classList.toggle('cp-item--active', j === selected));
      });
    });
  };

  const move = (dir) => {
    const items = list.querySelectorAll('.cp-item');
    if (!items.length) return;
    selected = (selected + dir + items.length) % items.length;
    items.forEach((b,i) => b.classList.toggle('cp-item--active', i === selected));
    items[selected]?.scrollIntoView({ block:'nearest' });
  };

  const select = () => {
    const cmds = _getCommands(input.value);
    if (cmds[selected]) _exec(cmds[selected]);
  };

  input.addEventListener('input', (e) => render(e.target.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); move(1); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); move(-1); }
    if (e.key === 'Enter')      { e.preventDefault(); select(); }
    if (e.key === 'Escape')     close();
  });

  _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });

  render('');
  setTimeout(() => input.focus(), 30);
}

export function close() {
  if (!_overlay) return;
  _overlay.classList.add('cp-out');
  _overlay.addEventListener('animationend', () => {
    _overlay?.remove(); _overlay = null;
  }, { once: true });
}

function _exec(cmd) {
  close();
  setTimeout(() => cmd.action(), 80); // slight delay so palette closes first
}

function _highlight(label, query) {
  if (!query) return label;
  const idx = label.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return label;
  return label.slice(0, idx) +
    `<mark class="cp-mark">${label.slice(idx, idx + query.length)}</mark>` +
    label.slice(idx + query.length);
}

/* ── Actions ── */
function _startTimer(mins) {
  const s = { ...Storage.get(KEYS.SETTINGS, {}), workMins: mins };
  Storage.set(KEYS.SETTINGS, s);
  window.location.hash = '#focus';
}

function _newNote() {
  window.location.hash = '#notes';
  // Signal notes module to open new note after load
  sessionStorage.setItem('mindos_action', 'new_note');
}

function _weeklyReview() {
  window.location.hash = '#notes';
  sessionStorage.setItem('mindos_action', 'weekly_review');
}

function _newReminder() {
  window.location.hash = '#reminders';
  sessionStorage.setItem('mindos_action', 'new_reminder');
}