/* ============================================================
   main.js — Bootstrap · Router · Event Bus · Profile · Settings
   ============================================================ */

import { Theme }         from './theme.js';
import { Storage, KEYS } from './storage.js';
import * as Auth         from './auth.js';

/* ── Event Bus ── */
const _bus = {};
function on(event, cb)  { (_bus[event] = _bus[event] || []).push(cb); }
function off(event, cb) { if (_bus[event]) _bus[event] = _bus[event].filter(f => f !== cb); }
function emit(event, d) { (_bus[event] || []).forEach(cb => cb(d)); }

function makeSVG(paths) {
  return `<svg class="dock-item__icon" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
    stroke-linejoin="round">${paths}</svg>`;
}

const MODULES = [
  { id:'focus',     label:'Focus',
    icon: makeSVG('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>') },
  { id:'notes',     label:'Notes',
    icon: makeSVG('<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/>') },
  { id:'reminders', label:'Reminders',
    icon: makeSVG('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') },
  { id:'dashboard', label:'Dashboard',
    icon: makeSVG('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>') },
  { id:'habits',    label:'Habits',    soon: true,
    icon: makeSVG('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>') },
  { id:'analytics', label:'Analytics', soon: true,
    icon: makeSVG('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>') },
];

let _activeModule = null;

Theme.init();
_renderDock();

document.addEventListener('DOMContentLoaded', () => {
  _initLogoClick();
  _initProfile();
  _initSettingsBtn();
});
_initLogoClick();
_initProfile();
_initSettingsBtn();

_handleRoute();
window.addEventListener('hashchange', _handleRoute);

/* ── Router ── */
async function _handleRoute() {
  const hash   = window.location.hash || '#auth/login';
  const isAuth = hash.startsWith('#auth/');
  const isHome = hash === '#home' || hash === '#' || hash === '';
  const user   = Storage.get(KEYS.USER, null);

  // Update page title to reflect current section
  const moduleId = hash.replace('#','');
  const mod = MODULES.find(m => m.id === moduleId);
  document.title = mod ? `${mod.label} — mindOS_` : 'mindOS_';

  if (_activeModule && typeof _activeModule.destroy === 'function') {
    _activeModule.destroy();
  }
  _activeModule = null;

  const viewRoot = document.getElementById('view-root');
  if (!viewRoot) return;

  _updateAvatar(user, isAuth);
  _updateHeaderNav(isAuth, isHome, hash);

  if (isAuth) {
    document.body.classList.remove('app-mode');
    _setActiveDock(null);
    _activeModule = Auth;
    Auth.init(viewRoot);
    return;
  }

  if (!user) { window.location.hash = '#auth/login'; return; }

  if (isHome) {
    document.body.classList.add('app-mode');
    _setActiveDock(null);
    _renderHome(viewRoot, user);
    return;
  }

  if (mod && !mod.soon) {
    document.body.classList.add('app-mode');
    _setActiveDock(moduleId);
    await _loadModule(moduleId, viewRoot);
  } else {
    window.location.hash = '#home';
  }
}

/* ── Header nav ── */
function _updateHeaderNav(isAuth, isHome, hash) {
  const nav      = document.getElementById('header-nav');
  const settBtn  = document.getElementById('settings-btn');
  if (!nav) return;

  if (isAuth) {
    nav.style.display = 'none';
    if (settBtn) settBtn.style.display = 'none';
    return;
  }

  if (settBtn) settBtn.style.display = 'flex';

  // On home: hide nav tabs (module cards are the nav)
  if (isHome) {
    nav.style.display = 'none';
    return;
  }

  // On a module page: show tab nav
  nav.style.display = 'flex';
  const activeId = hash.replace('#', '');

  nav.innerHTML = MODULES.filter(m => !m.soon).map(m => `
    <a href="#${m.id}"
       class="header-nav-tab${m.id === activeId ? ' header-nav-tab--active' : ''}"
       aria-current="${m.id === activeId ? 'page' : 'false'}">
      ${m.label}
    </a>`).join('');
}

/* ── Avatar ── */
function _updateAvatar(user, isAuth) {
  const btn    = document.getElementById('avatar-btn');
  const initEl = document.getElementById('avatar-initials');
  if (!btn) return;
  if (user && !isAuth) {
    btn.style.display = 'flex';
    if (initEl) initEl.textContent = user.avatarInitials || user.name?.[0]?.toUpperCase() || '?';
  } else {
    btn.style.display = 'none';
  }
}

/* ── Home ── */
function _renderHome(container, user) {
  const h     = new Date().getHours();
  const name  = user.name || 'there';
  const greet =
    h >= 5  && h < 12 ? `Good morning, ${name}.` :
    h >= 12 && h < 17 ? `Good afternoon, ${name}.` :
    h >= 17 && h < 21 ? `Good evening, ${name}.` :
                        `Still up, ${name}?`;
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  const sessions  = Storage.get(KEYS.SESSIONS, []);
  const todayKey  = new Date().toISOString().slice(0, 10);
  const todaySess = sessions.filter(s => s.type === 'work' && s.date === todayKey && s.actual);
  const totalMins = Math.round(todaySess.reduce((a, s) => a + s.actual, 0) / 60);

  container.innerHTML = `
    <div class="home-wrap anim-fade-in">
      <div class="home-brand">mindOS_</div>
      <div class="home-greeting">${greet}</div>
      <div class="home-date">${today}</div>
      ${todaySess.length ? `<div class="home-summary">${todaySess.length} session${todaySess.length > 1 ? 's' : ''} · ${totalMins}m focus today</div>` : ''}
      <div class="home-modules">
        ${MODULES.filter(m => !m.soon).map((m, i) => `
          <a href="#${m.id}" class="home-module-card" style="--stagger-i:${i}">
            <div class="home-module-icon">${m.icon}</div>
            <div class="home-module-label">${m.label}</div>
          </a>`).join('')}
      </div>
    </div>`;
}

/* ── Module loader ── */
async function _loadModule(moduleId, container) {
  const file = moduleId === 'focus' ? 'timer' : moduleId;
  try {
    const mod = await import(`./${file}.js`);
    _activeModule = mod;
    container.innerHTML = '';
    mod.init(container);
  } catch (err) {
    console.error(`Failed to load "${moduleId}":`, err);
    container.innerHTML = `<div class="empty-state">
      <p class="empty-state__title">${moduleId.charAt(0).toUpperCase() + moduleId.slice(1)}</p>
      <p class="empty-state__body">Coming soon.</p></div>`;
  }
}

/* ── Dock ── */
function _renderDock() {
  const capsule = document.querySelector('.dock-capsule');
  if (!capsule) return;
  capsule.innerHTML = MODULES.map(m => `
    <button class="dock-item${m.soon ? ' dock-item--disabled' : ''}"
      data-module="${m.id}" data-label="${m.label}"
      ${m.soon ? 'disabled' : ''}
      aria-label="${m.label}">${m.icon}</button>`).join('');

  capsule.querySelectorAll('.dock-item:not(.dock-item--disabled)').forEach(btn => {
    btn.addEventListener('click', () => { window.location.hash = `#${btn.dataset.module}`; });

    // Show label on hover only
    btn.addEventListener('mouseenter', () => {
      const label = document.getElementById('dock-label');
      if (label) { label.textContent = btn.dataset.label; label.classList.add('visible'); }
    });
    btn.addEventListener('mouseleave', () => {
      const label = document.getElementById('dock-label');
      if (label) label.classList.remove('visible');
    });
  });
}

function _setActiveDock(moduleId) {
  document.querySelectorAll('.dock-item').forEach(b =>
    b.classList.toggle('dock-item--active', b.dataset.module === moduleId)
  );
  // Never show persistent label — only on hover
  const label = document.getElementById('dock-label');
  if (label) label.classList.remove('visible');
}

/* ── Logo → home ── */
function _initLogoClick() {
  const logo = document.getElementById('header-logo');
  if (!logo || logo._bound) return;
  logo._bound = true;
  logo.addEventListener('click', () => {
    if (Storage.get(KEYS.USER, null)) window.location.hash = '#home';
  });
}

/* ── Settings button (stub — opens a simple dropdown for now) ── */
function _initSettingsBtn() {
  const btn = document.getElementById('settings-btn');
  if (!btn || btn._bound) return;
  btn._bound = true;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    _toggleSettingsDropdown(btn);
  });
}

function _toggleSettingsDropdown(anchor) {
  const existing = document.getElementById('settings-dropdown');
  if (existing) { existing.remove(); return; }

  const settings = Storage.get(KEYS.SETTINGS, { workMins: 25, shortBreakMins: 5, longBreakMins: 15 });
  const theme    = Storage.get(KEYS.THEME, 'dark');

  const dd = document.createElement('div');
  dd.id = 'settings-dropdown';
  dd.className = 'settings-dropdown';
  const colorTagsOn = !!settings.colorTagsEnabled;

  dd.innerHTML = `
    <div class="settings-dd-header">Settings</div>

    <div class="settings-dd-section">
      <div class="settings-dd-label">Appearance</div>
      <div class="settings-dd-row">
        <span>Theme</span>
        <button class="btn btn-secondary" id="dd-theme-toggle"
                style="padding:5px 12px;font-size:12px;">
          ${theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
      </div>
    </div>

    <div class="settings-dd-section">
      <div class="settings-dd-label">Notes</div>
      <div class="settings-dd-row">
        <span>Color tags</span>
        <button class="dd-toggle${colorTagsOn?' on':''}" id="dd-color-tags"
                aria-pressed="${colorTagsOn}"></button>
      </div>
    </div>

    <div class="settings-dd-section">
      <div class="settings-dd-label">Focus timer</div>
      <div class="settings-dd-row">
        <span style="font-size:12px;color:var(--text-muted);">Work</span>
        <span class="settings-dd-val">${settings.workMins || 25}m</span>
      </div>
      <div class="settings-dd-row">
        <span style="font-size:12px;color:var(--text-muted);">Short break</span>
        <span class="settings-dd-val">${settings.shortBreakMins || 5}m</span>
      </div>
      <div class="settings-dd-row">
        <span style="font-size:12px;color:var(--text-muted);">Long break</span>
        <span class="settings-dd-val">${settings.longBreakMins || 15}m</span>
      </div>
    </div>

    <div class="settings-dd-section">
      <div class="settings-dd-label">Data</div>
      <button class="btn btn-block" id="dd-clear-sessions"
              style="background:var(--error-dim);color:var(--error);
                     border:1px solid var(--error);font-size:12px;padding:8px;">
        Clear session data
      </button>
    </div>`;

  document.body.appendChild(dd);

  // Position below anchor
  const rect = anchor.getBoundingClientRect();
  dd.style.top  = `${rect.bottom + 8}px`;
  dd.style.right = `${window.innerWidth - rect.right}px`;

  // Theme toggle
  dd.querySelector('#dd-theme-toggle').addEventListener('click', () => {
    import('./theme.js').then(({ Theme }) => { Theme.toggle(); });
    dd.remove();
  });

  // Color tags toggle
  dd.querySelector('#dd-color-tags')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn  = dd.querySelector('#dd-color-tags');
    const s    = Storage.get(KEYS.SETTINGS, {});
    const next = !s.colorTagsEnabled;
    Storage.set(KEYS.SETTINGS, { ...s, colorTagsEnabled: next });
    btn.classList.toggle('on', next);
    btn.setAttribute('aria-pressed', next);
  });

  // Clear sessions
  dd.querySelector('#dd-clear-sessions').addEventListener('click', () => {
    if (confirm('Clear all focus session data? This cannot be undone.')) {
      Storage.remove(KEYS.SESSIONS);
      Storage.remove('mindos_work_count');
    }
    dd.remove();
  });

  // Click outside to close
  setTimeout(() => {
    document.addEventListener('click', () => dd.remove(), { once: true });
  }, 10);
}

/* ── Profile panel ── */
function _initProfile() {
  const btn      = document.getElementById('avatar-btn');
  const overlay  = document.getElementById('profile-overlay');
  const closeBtn = document.getElementById('profile-close');
  if (!btn || !overlay || !closeBtn || btn._bound) return;
  btn._bound = true;
  btn.addEventListener('click', _openProfile);
  closeBtn.addEventListener('click', _closeProfile);
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeProfile(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeProfile(); });
}

function _openProfile() {
  const overlay = document.getElementById('profile-overlay');
  const body    = document.getElementById('profile-body');
  if (!overlay || !body) return;

  const user     = Storage.get(KEYS.USER, {});
  const sessions = Storage.get(KEYS.SESSIONS, []);
  const todayKey = new Date().toISOString().slice(0, 10);
  const allWork  = sessions.filter(s => s.type === 'work' && s.actual);
  const totalMin = Math.round(allWork.reduce((a, s) => a + s.actual, 0) / 60);
  const todayMin = Math.round(allWork.filter(s => s.date === todayKey).reduce((a, s) => a + s.actual, 0) / 60);
  const joined   = user.joinedAt
    ? new Date(user.joinedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    : '—';

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;">
      <div class="profile-avatar-lg">${user.avatarInitials || '?'}</div>
      <div class="profile-meta">
        <div class="profile-meta__name">${user.name || '—'}</div>
        <div class="profile-meta__email">${user.email || '—'}</div>
        <div class="profile-meta__joined">Joined ${joined}</div>
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section__title">Focus stats</div>
      <div class="profile-stats">
        <div class="profile-stat"><div class="profile-stat__val">${allWork.length}</div><div class="profile-stat__lbl">Sessions</div></div>
        <div class="profile-stat"><div class="profile-stat__val">${totalMin}m</div><div class="profile-stat__lbl">Total</div></div>
        <div class="profile-stat"><div class="profile-stat__val">${todayMin}m</div><div class="profile-stat__lbl">Today</div></div>
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section__title">Preferences</div>
      <div class="profile-field">
        <label for="p-name">Display name</label>
        <input class="input" id="p-name" type="text" value="${user.name || ''}" placeholder="Your name"/>
      </div>
      <div class="profile-field">
        <label for="p-focus">Default focus (min)</label>
        <input class="input" id="p-focus" type="number" min="5" max="120" value="${user.defaultFocusMins || 25}"/>
      </div>
      <div class="profile-field">
        <label>Timezone</label>
        <input class="input" type="text" value="${user.timezone || ''}" readonly style="opacity:0.5;cursor:default;"/>
      </div>
      <button class="btn btn-primary btn-block" id="save-profile-btn" style="margin-top:8px;">Save changes</button>
      <p id="profile-msg" style="display:none;font-size:12px;color:var(--success);text-align:center;margin-top:6px;"></p>
    </div>
    <div class="profile-logout-wrap">
      <button class="btn btn-block" id="logout-btn"
        style="background:var(--error-dim);color:var(--error);border:1px solid var(--error);font-weight:600;padding:12px;">
        Sign out
      </button>
    </div>`;

  body.querySelector('#save-profile-btn').addEventListener('click', () => {
    const name  = body.querySelector('#p-name').value.trim();
    const focus = parseInt(body.querySelector('#p-focus').value) || 25;
    if (!name) return;
    const parts    = name.split(' ');
    const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
    const updated  = { ...Storage.get(KEYS.USER, {}), name, avatarInitials: initials, defaultFocusMins: focus };
    Storage.set(KEYS.USER, updated);
    Storage.update(KEYS.USERS_DB, db => ({ ...db, [updated.email]: { ...db[updated.email], name, avatarInitials: initials, defaultFocusMins: focus } }), {});
    _updateAvatar(updated, false);
    const msg = body.querySelector('#profile-msg');
    msg.textContent = '✓ Saved!'; msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  });

  body.querySelector('#logout-btn').addEventListener('click', () => {
    _closeProfile();
    setTimeout(() => {
      Storage.remove(KEYS.USER);
      document.body.classList.remove('app-mode');
      _updateAvatar(null, true);
      window.location.hash = '#auth/login';
    }, 280);
  });

  overlay.style.display = 'block';
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.remove('closing');
}

function _closeProfile() {
  const overlay = document.getElementById('profile-overlay');
  if (!overlay || overlay.style.display === 'none') return;
  overlay.classList.add('closing');
  overlay.addEventListener('animationend', () => {
    overlay.style.display = 'none';
    overlay.classList.remove('closing');
  }, { once: true });
}