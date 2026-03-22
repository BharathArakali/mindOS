/* ============================================================
   theme.js — Theme Module
   Manages light/dark mode: reads preference, renders the toggle,
   handles transitions. Called once from main.js on boot.
   ============================================================ */

import { Storage, KEYS } from './storage.js';

const THEMES = { DARK: 'dark', LIGHT: 'light', AUTO: 'auto' };

export const Theme = {
  /**
   * Initialises the theme system.
   * Reads saved preference, sets data-theme on <html>,
   * then mounts the toggle widget into #theme-toggle-mount.
   * Call once on app boot — before any module init.
   */
  init() {
    const saved = Storage.get(KEYS.THEME, THEMES.DARK);
    _applyTheme(saved);
    _renderToggle();
    // Watch system preference changes when in auto mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (Storage.get(KEYS.THEME, THEMES.DARK) === THEMES.AUTO) {
        _applyTheme(THEMES.AUTO);
      }
    });
  },

  /**
   * Toggles between light and dark, persists the new value,
   * and animates the transition.
   */
  toggle() {
    const saved = Storage.get(KEYS.THEME, THEMES.DARK);
    const cycle = { dark:'light', light:'auto', auto:'dark' };
    const next  = cycle[saved] || THEMES.DARK;
    Storage.set(KEYS.THEME, next);
    _applyTheme(next);
    _syncToggleVisuals(next);
  },

  setTheme(t) {
    Storage.set(KEYS.THEME, t);
    _applyTheme(t);
    _syncToggleVisuals(t);
  },

  /**
   * Returns the currently active theme string.
   * @returns {'dark'|'light'}
   */
  getCurrent() {
    return document.documentElement.getAttribute('data-theme') || THEMES.DARK;
  },
};

/* ── Private helpers ──────────────────────────────────────── */

/**
 * Sets data-theme on <html>. CSS variables cascade from here —
 * a single attribute swap changes the entire UI.
 */
function _applyTheme(theme) {
  if (theme === THEMES.AUTO) {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', sysDark ? THEMES.DARK : THEMES.LIGHT);
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

/**
 * Builds and mounts the toggle widget into #theme-toggle-mount.
 * The toggle is rendered once and never re-created on route changes.
 */
function _renderToggle() {
  const mount = document.getElementById('theme-toggle-mount');
  if (!mount) return;

  const current = Theme.getCurrent();

  const toggle = document.createElement('button');
  toggle.className = 'theme-toggle';
  toggle.setAttribute('aria-label', 'Toggle light/dark mode');
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', current === THEMES.LIGHT ? 'true' : 'false');
  toggle.id = 'theme-toggle';

  toggle.innerHTML = `
    <!-- Sun icon: stroke-based, circle + 8 radiating lines -->
    <span class="theme-toggle__sun" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
           xmlns="http://www.w3.org/2000/svg" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round">
        <!-- Center circle -->
        <circle cx="8" cy="8" r="3"/>
        <!-- 8 radiating lines at 45° intervals -->
        <line x1="8" y1="1"    x2="8"    y2="2.5"/>
        <line x1="8" y1="13.5" x2="8"    y2="15"/>
        <line x1="1" y1="8"    x2="2.5"  y2="8"/>
        <line x1="13.5" y1="8" x2="15"   y2="8"/>
        <line x1="3.05" y1="3.05" x2="4.11" y2="4.11"/>
        <line x1="11.89" y1="11.89" x2="12.95" y2="12.95"/>
        <line x1="12.95" y1="3.05"  x2="11.89" y2="4.11"/>
        <line x1="4.11"  y1="11.89" x2="3.05"  y2="12.95"/>
      </svg>
    </span>

    <!-- Sliding thumb -->
    <span class="theme-toggle__thumb" aria-hidden="true"></span>

    <!-- Moon icon: crescent via SVG path -->
    <span class="theme-toggle__moon" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 16 16"
           xmlns="http://www.w3.org/2000/svg" fill="currentColor">
        <!--
          Crescent: start with a full circle, subtract a shifted circle
          using an even-odd fill rule. The offset circle creates the
          crescent cut-out on the upper right.
        -->
        <path fill-rule="evenodd" clip-rule="evenodd"
          d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm3.5 1.2a4.5 4.5 0 1 1-6.3 6.3
             A5.5 5.5 0 0 0 11.5 3.2z"/>
      </svg>
    </span>
  `;

  toggle.addEventListener('click', () => {
    Theme.toggle();
    // Update aria-checked to reflect new state
    const isLight = Theme.getCurrent() === THEMES.LIGHT;
    toggle.setAttribute('aria-checked', isLight ? 'true' : 'false');
  });

  mount.appendChild(toggle);
}

/**
 * Updates the toggle's visual state after a theme change.
 * CSS handles most of the animation via [data-theme] selectors,
 * but we keep aria-checked in sync here.
 */
function _syncToggleVisuals(theme) {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  toggle.setAttribute('aria-checked', theme === THEMES.LIGHT ? 'true' : 'false');
  toggle.title = theme === 'auto' ? 'Theme: Auto (system)' : theme === 'light' ? 'Theme: Light' : 'Theme: Dark';
}