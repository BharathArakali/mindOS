/* ============================================================
   main.js — Bootstrap · Router · Event Bus · Profile · Settings
   ============================================================ */

import { Theme }         from './theme.js';
import { Storage, KEYS } from './storage.js';
import * as Auth         from './auth.js';
import * as Onboarding  from './onboarding.js';
import * as CmdPalette  from './commandpalette.js';

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
  { id:'habits',    label:'Streaks',
    icon: makeSVG('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>') },
  { id:'analytics', label:'Analytics', soon: true,
    icon: makeSVG('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>') },
];

let _activeModule = null;

Theme.init();
_renderDock();
CmdPalette.init();

document.addEventListener('DOMContentLoaded', () => {
  _initLogoClick();
  _initProfile();
  _initSettingsBtn();
  _initHelpBtn();
});
_initLogoClick();
_initProfile();
_initSettingsBtn();
_initHelpBtn();

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
    // Show onboarding on first visit after login (not for guests)
    if (!user.isGuest && Onboarding.shouldShow()) {
      setTimeout(() => Onboarding.show(), 600);
    }
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
    const helpBtnH = document.getElementById('help-btn');
    if (helpBtnH) helpBtnH.style.display = 'none';
    return;
  }

  if (settBtn) settBtn.style.display = 'flex';
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.style.display = 'flex';

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
      <div class="home-slash-hint">Press <kbd>/</kbd> for commands</div>
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
function _initHelpBtn() {
  const btn = document.getElementById('help-btn');
  if (!btn || btn._bound) return;
  btn._bound = true;
  btn.addEventListener('click', _openHelp);
}

function _openHelp() {
  const existing = document.getElementById('help-overlay');
  if (existing) { existing.remove(); return; }

  const MODULES_HELP = [
    { icon:'⏱', name:'Focus',     color:'var(--accent)',
      desc:'Pomodoro-style focus timer. Click the number to set duration. Zen mode for distraction-free sessions. Session history shows past focus with scores.',
      tips:['Tap the timer number to edit duration','Z key toggles Zen (fullscreen) mode','Ambient sounds play underneath while you work','Focus score drops 8pts per distraction'] },
    { icon:'📝', name:'Notes',    color:'var(--success)',
      desc:'Rich text notes with formatting, tags and colour labels. Voice typing available. Download as Markdown.',
      tips:['Use #tag anywhere in body to create tags','Mic button for voice typing','Download saves as .md for Notion/Obsidian','Toggle colour tags in Settings'] },
    { icon:'🔔', name:'Reminders',color:'var(--warning)',
      desc:'Time-based reminders with browser notifications and audio tone. Add to Google Calendar with one click.',
      tips:['Allow notifications so alerts fire when tab is hidden','Calendar icon exports to Google Calendar','Overdue reminders shown in amber','Undo delete within 5 seconds'] },
    { icon:'📊', name:'Dashboard',color:'var(--accent)',
      desc:'Your productivity at a glance — 7-day chart, streak, upcoming reminders, all-time totals.',
      tips:['Check weekly for patterns','Focus score = 100 minus 8 per distraction','Streak requires one session per day'] },
    { icon:'✅', name:'Streaks',   color:'var(--success)',
      desc:'Daily streak tracker — build routines, track consistency with mini heatmaps and a weekly chart.',
      tips:['Tap anywhere on a routine card to check it off','Mini dots show last 7 days','Archive old routines to keep things clean'] },
  ];

  const SHORTCUTS = [
    { key:'/', label:'Open command palette' },
    { key:'Space', label:'Start / pause timer' },
    { key:'R', label:'Reset timer' },
    { key:'Z', label:'Zen mode' },
    { key:'Esc', label:'Close any overlay' },
  ];

  const CMD_EXAMPLES = [
    '"focus 45" — start a 45-minute session',
    '"new note" — open notes and create immediately',
    '"weekly review" — generate a structured reflection note',
    '"rain" — play rain ambient sound',
    '"reminder" — jump to reminders and open the form',
  ];

  // Build HTML without nested template literals
  const modulesHtml = MODULES_HELP.map(m =>
    '<div class="help-module">' +
      '<div class="help-module-header">' +
        '<span class="help-module-icon" style="color:' + m.color + '">' + m.icon + '</span>' +
        '<span class="help-module-name">' + m.name + '</span>' +
      '</div>' +
      '<p class="help-module-desc">' + m.desc + '</p>' +
      '<div class="help-module-tips">' +
        m.tips.map(t => '<div class="help-tip">→ ' + t + '</div>').join('') +
      '</div>' +
    '</div>'
  ).join('');

  const shortcutsHtml = SHORTCUTS.map(s =>
    '<div class="help-shortcut"><kbd>' + s.key + '</kbd><span>' + s.label + '</span></div>'
  ).join('');

  const cmdHtml = CMD_EXAMPLES.map(e =>
    '<div class="help-tip">→ ' + e + '</div>'
  ).join('');

  const overlay = document.createElement('div');
  overlay.id        = 'help-overlay';
  overlay.className = 'help-overlay';
  overlay.innerHTML =
    '<div class="help-modal">' +
      '<div class="help-header">' +
        '<div class="help-title">Help &amp; Guide</div>' +
        '<button class="help-close" id="help-close">✕</button>' +
      '</div>' +
      '<div class="help-body">' +

        '<div class="help-section">' +
          '<div class="help-section-title">Quick start</div>' +
          '<div class="help-quickstart">' +
            '<div class="help-qs-step"><span class="help-qs-num">1</span><span>Create an account or continue as guest</span></div>' +
            '<div class="help-qs-step"><span class="help-qs-num">2</span><span>Go to Focus → tap the timer number to set session length</span></div>' +
            '<div class="help-qs-step"><span class="help-qs-num">3</span><span>Press Start. mindOS_ tracks distractions automatically</span></div>' +
            '<div class="help-qs-step"><span class="help-qs-num">4</span><span>Check Dashboard after a week to see your patterns</span></div>' +
          '</div>' +
        '</div>' +

        '<div class="help-section">' +
          '<div class="help-section-title">Modules</div>' +
          modulesHtml +
        '</div>' +

        '<div class="help-section">' +
          '<div class="help-section-title">Keyboard shortcuts</div>' +
          '<div class="help-shortcuts">' + shortcutsHtml + '</div>' +
        '</div>' +

        '<div class="help-section">' +
          '<div class="help-section-title">Command palette ( / key )</div>' +
          '<p class="help-module-desc">Press / anywhere to open spotlight search. Examples:</p>' +
          '<div class="help-module-tips">' + cmdHtml + '</div>' +
        '</div>' +

      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelector('#help-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function closeOnEsc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', closeOnEsc); }
  });
}

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

  const s     = { workMins:25, shortBreakMins:5, longBreakMins:15, sessionsUntilLong:4,
                  colorTagsEnabled:true,  autoStart:false, dailyGoalMins:120,
                  accentColor:'', sessionAlerts:true, workingHoursStart:'09:00',
                  workingHoursEnd:'18:00',
                  ...Storage.get(KEYS.SETTINGS, {}) };
  const theme = Storage.get(KEYS.THEME, 'dark');

  const ACCENTS = [
    { id:'',        hex:'#5B6EF5', label:'Indigo (default)' },
    { id:'teal',    hex:'#14B8A6', label:'Teal'   },
    { id:'rose',    hex:'#F43F5E', label:'Rose'   },
    { id:'amber',   hex:'#F59E0B', label:'Amber'  },
    { id:'violet',  hex:'#8B5CF6', label:'Violet' },
    { id:'emerald', hex:'#10B981', label:'Emerald'},
  ];

  const dd = document.createElement('div');
  dd.id        = 'settings-dropdown';
  dd.className = 'settings-dropdown settings-panel';

  dd.innerHTML = `
    <div class="settings-dd-header">
      <span>Settings</span>
      <button class="settings-close-btn" id="settings-close">✕</button>
    </div>

    <div class="settings-panel-body">

      <!-- Appearance -->
      <div class="settings-section">
        <div class="settings-section-title">Appearance</div>
        <div class="settings-row">
          <div class="settings-row-info"><span>Theme</span></div>
          <button class="btn btn-secondary settings-small-btn" id="dd-theme-toggle">
            ${theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
        <div class="settings-row">
          <div class="settings-row-info"><span>Accent colour</span></div>
          <div class="settings-accent-row">
            ${ACCENTS.map(a => `
              <button class="settings-accent-swatch${s.accentColor===a.id?' selected':''}"
                      data-accent="${a.id}" style="background:${a.hex}" title="${a.label}"></button>`).join('')}
          </div>
        </div>
      </div>

      <!-- Focus Timer -->
      <div class="settings-section">
        <div class="settings-section-title">Focus timer</div>
        <div class="settings-row">
          <div class="settings-row-info"><span>Work session</span><small>minutes</small></div>
          <input class="settings-num-input" id="s-work" type="number" min="1" max="180" value="${s.workMins}"/>
        </div>
        <div class="settings-row">
          <div class="settings-row-info"><span>Short break</span><small>minutes</small></div>
          <input class="settings-num-input" id="s-short" type="number" min="1" max="60" value="${s.shortBreakMins}"/>
        </div>
        <div class="settings-row">
          <div class="settings-row-info"><span>Long break</span><small>minutes</small></div>
          <input class="settings-num-input" id="s-long" type="number" min="1" max="60" value="${s.longBreakMins}"/>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <span>Auto-start next session</span>
            <small>Automatically starts break/focus after completion</small>
          </div>
          <button class="dd-toggle${s.autoStart?' on':''}" id="s-autostart"></button>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <span>Daily goal</span><small>minutes of focus per day</small>
          </div>
          <input class="settings-num-input" id="s-daily-goal" type="number" min="15" max="720" value="${s.dailyGoalMins}"/>
        </div>
      </div>

      <!-- Notes -->
      <div class="settings-section">
        <div class="settings-section-title">Notes</div>
        <div class="settings-row">
          <div class="settings-row-info">
            <span>Color tags</span>
            <small>Assign colour labels to notes</small>
          </div>
          <button class="dd-toggle${s.colorTagsEnabled?' on':''}" id="s-colortags"></button>
        </div>
      </div>

      <!-- Notifications -->
      <div class="settings-section">
        <div class="settings-section-title">Notifications</div>
        <div class="settings-row">
          <div class="settings-row-info">
            <span>Session alerts</span>
            <small>Notify when focus/break completes</small>
          </div>
          <button class="dd-toggle${s.sessionAlerts!==false?' on':''}" id="s-alerts"></button>
        </div>
      </div>

      <!-- Working hours -->
      <div class="settings-section">
        <div class="settings-section-title">Working hours</div>
        <p class="settings-hint">Used for smart reminder scheduling</p>
        <div class="settings-row">
          <div class="settings-row-info"><span>Start</span></div>
          <input class="settings-time-input" id="s-work-start" type="time" value="${s.workingHoursStart}"/>
        </div>
        <div class="settings-row">
          <div class="settings-row-info"><span>End</span></div>
          <input class="settings-time-input" id="s-work-end" type="time" value="${s.workingHoursEnd}"/>
        </div>
      </div>

      <!-- Data -->
      <div class="settings-section">
        <div class="settings-section-title">Data & privacy</div>
        <div class="settings-row">
          <div class="settings-row-info">
            <span>Export all data</span>
            <small>Download everything as JSON</small>
          </div>
          <button class="btn btn-secondary settings-small-btn" id="s-export">Export</button>
        </div>
        <div class="settings-row" style="margin-top:4px;">
          <div class="settings-row-info">
            <span>Clear session data</span>
            <small>Removes all focus sessions</small>
          </div>
          <button class="btn settings-small-btn" id="s-clear-sessions"
                  style="background:var(--error-dim);color:var(--error);border:1px solid var(--error);">
            Clear
          </button>
        </div>
      </div>

      <!-- Keyboard shortcuts -->
      <div class="settings-section">
        <div class="settings-section-title">Keyboard shortcuts</div>
        <div class="settings-shortcuts">
          <div class="settings-shortcut"><kbd>/</kbd><span>Command palette</span></div>
          <div class="settings-shortcut"><kbd>Space</kbd><span>Start / pause timer</span></div>
          <div class="settings-shortcut"><kbd>R</kbd><span>Reset timer</span></div>
          <div class="settings-shortcut"><kbd>Z</kbd><span>Zen mode</span></div>
          <div class="settings-shortcut"><kbd>Esc</kbd><span>Close any overlay</span></div>
        </div>
      </div>

    </div>

    <div class="settings-panel-footer">
      <button class="btn btn-primary btn-block" id="s-save">Save settings</button>
    </div>`;

  document.body.appendChild(dd);

  // Position
  const rect = anchor.getBoundingClientRect();
  dd.style.top   = `${rect.bottom + 8}px`;
  dd.style.right = `${window.innerWidth - rect.right}px`;

  // Close
  const closeDD = () => dd.remove();
  dd.querySelector('#settings-close').addEventListener('click', closeDD);
  setTimeout(() => document.addEventListener('click', e => {
    if (!dd.contains(e.target) && e.target !== anchor) closeDD();
  }, { once: true }), 10);

  // Theme
  dd.querySelector('#dd-theme-toggle').addEventListener('click', e => {
    e.stopPropagation();
    import('./theme.js').then(({ Theme }) => Theme.toggle());
    closeDD();
  });

  // Accent colour
  dd.querySelectorAll('.settings-accent-swatch').forEach(sw => {
    sw.addEventListener('click', e => {
      e.stopPropagation();
      dd.querySelectorAll('.settings-accent-swatch').forEach(s2 => s2.classList.remove('selected'));
      sw.classList.add('selected');
      // Apply accent colour via CSS variable
      const hex = sw.style.background;
      document.documentElement.style.setProperty('--accent', hex);
      document.documentElement.style.setProperty('--accent-hover', hex);
      const cur = Storage.get(KEYS.SETTINGS, {});
      Storage.set(KEYS.SETTINGS, { ...cur, accentColor: sw.dataset.accent, accentHex: hex });
    });
  });

  // Toggles
  const mkToggle = (id, key) => {
    dd.querySelector(id)?.addEventListener('click', e => {
      e.stopPropagation();
      const btn = dd.querySelector(id);
      const cur = Storage.get(KEYS.SETTINGS, {});
      const next = !cur[key];
      Storage.set(KEYS.SETTINGS, { ...cur, [key]: next });
      btn.classList.toggle('on', next);
    });
  };
  mkToggle('#s-autostart',  'autoStart');
  mkToggle('#s-colortags',  'colorTagsEnabled');
  mkToggle('#s-alerts',     'sessionAlerts');

  // Export
  dd.querySelector('#s-export').addEventListener('click', e => {
    e.stopPropagation();
    const data = {
      exportedAt: new Date().toISOString(),
      sessions:   Storage.get(KEYS.SESSIONS, []),
      notes:      Storage.get(KEYS.NOTES, []),
      reminders:  Storage.get(KEYS.REMINDERS, []),
      habits:     Storage.get(KEYS.HABITS, []),
      habitLogs:  Storage.get(KEYS.HABIT_LOGS, {}),
      settings:   Storage.get(KEYS.SETTINGS, {}),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'),
      { href:url, download:`mindos_export_${new Date().toISOString().slice(0,10)}.json` }
    ).click();
    URL.revokeObjectURL(url);
  });

  // Clear sessions
  dd.querySelector('#s-clear-sessions').addEventListener('click', e => {
    e.stopPropagation();
    if (confirm('Clear all focus session data? This cannot be undone.')) {
      Storage.remove(KEYS.SESSIONS);
      Storage.set('mindos_work_count', 0);
    }
  });

  // Save
  dd.querySelector('#s-save').addEventListener('click', e => {
    e.stopPropagation();
    const cur   = Storage.get(KEYS.SETTINGS, {});
    const work  = parseInt(dd.querySelector('#s-work')?.value) || 25;
    const short = parseInt(dd.querySelector('#s-short')?.value) || 5;
    const long  = parseInt(dd.querySelector('#s-long')?.value) || 15;
    const goal  = parseInt(dd.querySelector('#s-daily-goal')?.value) || 120;
    const wkStart = dd.querySelector('#s-work-start')?.value || '09:00';
    const wkEnd   = dd.querySelector('#s-work-end')?.value   || '18:00';
    Storage.set(KEYS.SETTINGS, { ...cur,
      workMins:work, shortBreakMins:short, longBreakMins:long,
      dailyGoalMins:goal, workingHoursStart:wkStart, workingHoursEnd:wkEnd,
    });
    const btn = dd.querySelector('#s-save');
    btn.textContent = '✓ Saved';
    setTimeout(() => { btn.textContent = 'Save settings'; }, 1500);
  });
}

/* ── Profile panel ── */
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
  const habits   = Storage.get(KEYS.HABITS, []);
  const habitLogs= Storage.get(KEYS.HABIT_LOGS, {});
  const todayKey = new Date().toISOString().slice(0, 10);
  const isGuest  = !!user.isGuest;

  const allWork   = sessions.filter(s => s.type === 'work' && s.actual > 0);
  const totalMin  = Math.round(allWork.reduce((a, s) => a + s.actual, 0) / 60);
  const todayMin  = Math.round(allWork.filter(s => s.date === todayKey).reduce((a, s) => a + s.actual, 0) / 60);
  const avgLen    = allWork.length ? Math.round(allWork.reduce((a,s) => a + s.actual, 0) / allWork.length / 60) : 0;

  // Streak
  const days = [...new Set(allWork.map(s => s.date))].sort().reverse();
  let streak = 0, cur = todayKey;
  for (const d of days) {
    if (d === cur) { streak++; const dt = new Date(cur); dt.setDate(dt.getDate()-1); cur = dt.toISOString().slice(0,10); }
    else break;
  }
  let bestStreak = 0, curB = 1;
  const sortedDays = [...new Set(allWork.map(s => s.date))].sort();
  for (let i = 1; i < sortedDays.length; i++) {
    const diff = (new Date(sortedDays[i]) - new Date(sortedDays[i-1])) / 86400000;
    if (diff === 1) { curB++; bestStreak = Math.max(bestStreak, curB); } else curB = 1;
  }
  if (sortedDays.length === 1) bestStreak = 1;

  // Most productive hour
  const hourCounts = {};
  allWork.forEach(s => {
    if (!s.completedAt) return;
    const h = new Date(s.completedAt).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  const peakHour = Object.keys(hourCounts).length
    ? Object.entries(hourCounts).sort((a,b) => b[1]-a[1])[0][0]
    : null;
  const peakLabel = peakHour !== null
    ? `${peakHour}:00–${(parseInt(peakHour)+1)%24}:00`
    : '—';

  // Daily goal progress
  const goalMins    = Storage.get(KEYS.SETTINGS, {}).dailyGoalMins || 120;
  const goalPct     = Math.min(100, Math.round((todayMin / goalMins) * 100));

  // Badges
  const badges = _calcBadges(allWork, streak, bestStreak);

  // Week comparison
  const thisWeekStart = new Date(); thisWeekStart.setDate(thisWeekStart.getDate() - 6);
  const lastWeekStart = new Date(); lastWeekStart.setDate(lastWeekStart.getDate() - 13);
  const lastWeekEnd   = new Date(); lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);
  const thisWeekMins  = Math.round(allWork.filter(s => new Date(s.date) >= thisWeekStart).reduce((a,s) => a+s.actual,0)/60);
  const lastWeekMins  = Math.round(allWork.filter(s => {
    const d = new Date(s.date); return d >= lastWeekStart && d <= lastWeekEnd;
  }).reduce((a,s) => a+s.actual,0)/60);
  const weekDiff = lastWeekMins > 0 ? Math.round(((thisWeekMins-lastWeekMins)/lastWeekMins)*100) : null;

  const joined = user.joinedAt
    ? new Date(user.joinedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    : '—';

  body.innerHTML = `
    <!-- Avatar + name -->
    <div class="profile-hero">
      <div class="profile-avatar-lg${isGuest?' profile-avatar-guest':''}">
        ${user.avatarInitials || '?'}
      </div>
      <div class="profile-meta">
        <div class="profile-meta__name">${isGuest ? 'Guest' : (user.name || '—')}</div>
        <div class="profile-meta__email">${isGuest ? 'Not signed in' : (user.email || '—')}</div>
        ${!isGuest ? `<div class="profile-meta__joined">Member since ${joined}</div>` : ''}
      </div>
    </div>

    ${isGuest ? `
    <div class="profile-section">
      <div class="profile-section__title">Your data</div>
      <p style="font-size:13px;color:var(--text-muted);line-height:1.6;margin-bottom:12px;">
        Guest mode — data saved locally only. Create an account to keep it forever.
      </p>
      <a href="#auth/signup" class="btn btn-primary btn-block" id="guest-signup-btn"
         style="text-align:center;text-decoration:none;">Create free account</a>
      <a href="#auth/login" class="btn btn-secondary btn-block" id="guest-signin-btn"
         style="text-align:center;text-decoration:none;margin-top:8px;">Sign in</a>
    </div>` : ''}

    <!-- Daily goal -->
    <div class="profile-section">
      <div class="profile-section__title">Today's progress</div>
      <div class="profile-goal-wrap">
        <div class="profile-goal-label">
          <span>${todayMin}m of ${goalMins}m goal</span>
          <span class="profile-goal-pct">${goalPct}%</span>
        </div>
        <div class="profile-goal-track">
          <div class="profile-goal-fill" style="width:${goalPct}%"></div>
        </div>
      </div>
      ${weekDiff !== null ? `
        <div class="profile-week-compare ${weekDiff >= 0 ? 'positive' : 'negative'}">
          ${weekDiff >= 0 ? '↑' : '↓'} ${Math.abs(weekDiff)}% vs last week
        </div>` : ''}
    </div>

    <!-- Stats grid -->
    <div class="profile-section">
      <div class="profile-section__title">Focus stats</div>
      <div class="profile-stats-grid">
        <div class="profile-stat-card">
          <div class="profile-stat-card__val">${allWork.length}</div>
          <div class="profile-stat-card__lbl">Sessions</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-card__val">${totalMin >= 60 ? Math.floor(totalMin/60)+'h '+totalMin%60+'m' : totalMin+'m'}</div>
          <div class="profile-stat-card__lbl">Total focus</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-card__val" style="color:var(--warning)">${streak} 🔥</div>
          <div class="profile-stat-card__lbl">Streak</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-card__val">${bestStreak}</div>
          <div class="profile-stat-card__lbl">Best streak</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-card__val">${avgLen}m</div>
          <div class="profile-stat-card__lbl">Avg session</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-card__val" style="font-size:13px;">${peakLabel}</div>
          <div class="profile-stat-card__lbl">Peak hour</div>
        </div>
      </div>
    </div>

    <!-- Badges -->
    ${badges.length ? `
    <div class="profile-section">
      <div class="profile-section__title">Badges</div>
      <div class="profile-badges">
        ${badges.map(b => `
          <div class="profile-badge${b.earned?'':' profile-badge--locked'}" title="${b.desc}">
            <div class="profile-badge__icon">${b.icon}</div>
            <div class="profile-badge__name">${b.name}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- Edit profile (non-guest) -->
    ${!isGuest ? `
    <div class="profile-section">
      <div class="profile-section__title">Account</div>
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
        <input class="input" type="text" value="${user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}"
               readonly style="opacity:0.5;cursor:default;"/>
      </div>
      <button class="btn btn-primary btn-block" id="save-profile-btn" style="margin-top:8px;">
        Save changes
      </button>
      <p id="profile-msg" style="display:none;font-size:12px;color:var(--success);
         text-align:center;margin-top:6px;"></p>
    </div>` : ''}

    <div class="profile-logout-wrap">
      ${isGuest
        ? `<button class="btn btn-block" id="logout-btn"
               style="background:var(--surface-raised);color:var(--text-muted);
                      border:1px solid var(--border);">Exit guest session</button>`
        : `<button class="btn btn-block" id="logout-btn"
               style="background:var(--error-dim);color:var(--error);
                      border:1px solid var(--error);font-weight:600;">Sign out</button>`}
    </div>`;

  // Guest buttons
  body.querySelector('#guest-signup-btn')?.addEventListener('click', e => {
    e.preventDefault(); Storage.remove(KEYS.USER); _closeProfile();
    setTimeout(() => { window.location.hash = '#auth/signup'; }, 280);
  });
  body.querySelector('#guest-signin-btn')?.addEventListener('click', e => {
    e.preventDefault(); Storage.remove(KEYS.USER); _closeProfile();
    setTimeout(() => { window.location.hash = '#auth/login'; }, 280);
  });

  // Save profile
  body.querySelector('#save-profile-btn')?.addEventListener('click', () => {
    const name  = body.querySelector('#p-name').value.trim();
    const focus = parseInt(body.querySelector('#p-focus').value) || 25;
    if (!name) return;
    const parts    = name.split(' ');
    const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
    const updated  = { ...Storage.get(KEYS.USER, {}), name, avatarInitials:initials, defaultFocusMins:focus };
    Storage.set(KEYS.USER, updated);
    Storage.update(KEYS.USERS_DB, db => ({...db, [updated.email]:{...db[updated.email], name, avatarInitials:initials}}), {});
    _updateAvatar(updated, false);
    const msg = body.querySelector('#profile-msg');
    msg.textContent = '✓ Saved!'; msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  });

  // Logout
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

function _calcBadges(sessions, streak, bestStreak) {
  const total    = sessions.length;
  const totalMin = Math.round(sessions.reduce((a,s) => a+s.actual,0) / 60);
  return [
    { icon:'🔥', name:'On fire',      desc:'7-day streak',      earned: bestStreak >= 7  },
    { icon:'💯', name:'Century',      desc:'100 sessions',      earned: total >= 100     },
    { icon:'⏱',  name:'First focus',  desc:'Complete 1 session',earned: total >= 1       },
    { icon:'🧘', name:'10 sessions',  desc:'10 sessions done',  earned: total >= 10      },
    { icon:'⚡', name:'Power user',   desc:'50 sessions',       earned: total >= 50      },
    { icon:'🎯', name:'Hour club',    desc:'60+ min in one day', earned: (() => {
        const byDay = {};
        sessions.forEach(s => { byDay[s.date] = (byDay[s.date]||0) + s.actual; });
        return Object.values(byDay).some(m => m >= 3600);
      })() },
    { icon:'🏆', name:'Marathon',     desc:'5h total focus',    earned: totalMin >= 300  },
    { icon:'🌱', name:'Consistent',   desc:'3-day streak',      earned: bestStreak >= 3  },
  ];
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