/* ============================================================
   storage.js — LocalStorage Abstraction Layer
   ALL LocalStorage reads and writes go through this module.
   Swapping to IndexedDB or Firebase = change only this file.
   ============================================================ */

/**
 * Centralized key registry.
 * Every key used in the app is defined here — no magic strings
 * scattered across modules.
 */
export const KEYS = {
  THEME:      'mindos_theme',
  USER:       'mindos_user',
  SESSIONS:   'mindos_sessions',
  NOTES:      'mindos_notes',
  REMINDERS:  'mindos_reminders',
  SETTINGS:   'mindos_settings',
  USERS_DB:   'mindos_users_db',   // stores all registered users (demo only)
  HABITS:     'mindos_habits',
  HABIT_LOGS: 'mindos_habit_logs',
};

export const Storage = {
  /**
   * Retrieves a value from LocalStorage.
   * Returns `defaultValue` if the key doesn't exist or JSON parsing fails.
   *
   * @param {string} key
   * @param {*}      defaultValue - Returned when key is missing
   * @returns {*}
   */
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch {
      // Corrupted value — return default instead of crashing
      return defaultValue;
    }
  },

  /**
   * Persists a value to LocalStorage as JSON.
   *
   * @param {string} key
   * @param {*}      value - Must be JSON-serializable
   */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Storage quota exceeded or privacy mode — fail silently
      console.warn(`[Storage] Failed to set "${key}":`, err);
    }
  },

  /**
   * Atomic read-modify-write.
   * Reads the current value, passes it to updaterFn, writes the result.
   * Useful for array operations (push, filter, map) without full replacement.
   *
   * @param {string}   key
   * @param {Function} updaterFn   - Receives current value, must return new value
   * @param {*}        defaultValue - Used if key doesn't exist yet
   */
  update(key, updaterFn, defaultValue = null) {
    const current = Storage.get(key, defaultValue);
    const next = updaterFn(current);
    Storage.set(key, next);
    return next;
  },

  /**
   * Removes a key from LocalStorage.
   *
   * @param {string} key
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn(`[Storage] Failed to remove "${key}":`, err);
    }
  },

  /**
   * Returns true if the key exists in LocalStorage.
   *
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return localStorage.getItem(key) !== null;
  },

  /**
   * Clears ALL mindOS keys from LocalStorage.
   * Used for logout / data reset — leaves other apps' keys intact.
   */
  clearAll() {
    Object.values(KEYS).forEach(key => Storage.remove(key));
  },
};