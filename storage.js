/* ============================================================
   storage.js — Storage Abstraction Layer (Supabase v2)
   Same public API as the localStorage version:
     Storage.get / set / update / remove
   All callers (timer.js, notes.js, etc.) are unchanged.
   ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = 'https://alfcierkvdjvvvodaqjn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsZmNpZXJrdmRqdnZ2b2RhcWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1Mjk4ODAsImV4cCI6MjA5MjEwNTg4MH0.2gh3o8dTpaBqqEZa74PmWwyTs1N06LQ583qWGYckfaU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
// Auto-refresh session silently every 6 days
setInterval(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await supabase.auth.refreshSession();
    console.log('[mindOS_] Session refreshed');
  }
}, 6 * 24 * 60 * 60 * 1000); // every 6 days

// Also refresh immediately on tab focus (covers the gap)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    await supabase.auth.refreshSession();
  }
});
/* ── Storage Keys (unchanged — all other modules use these) ── */
export const KEYS = {
  USER:        'user',
  USERS_DB:    'users_db',       // only used by auth internals
  SETTINGS:    'settings',
  TIMER:       'timer',
  NOTES:       'notes',
  REMINDERS:   'reminders',
  DISTRACTIONS:'distractions',
  HABITS:      'habits',
  HABIT_LOGS:  'habit_logs',
  DASHBOARD:   'dashboard',
  ONBOARDING:  'onboarding_done',
  FOCUS_MUSIC: 'focus_music',
  WEEKLY:      'weekly_review',
};

/* ── In-memory write-through cache ─────────────────────────
   Keeps reads synchronous for modules that call Storage.get()
   at boot before any await resolves.
   ---------------------------------------------------------- */
const _cache = {};

/* ── Auth helper — returns current Supabase user id ──────── */
function _uid() {
  // supabase.auth.getUser() is async; use the session cache instead
  return supabase.auth.getSession().then(({ data }) => data?.session?.user?.id ?? null);
}

/* ── Core API ─────────────────────────────────────────────── */

/**
 * Storage.get(key, fallback?)
 * Synchronous read from cache (populated by Storage.load()).
 * Returns fallback if key is not yet loaded.
 */
export const Storage = {

  get(key, fallback = null) {
    return key in _cache ? _cache[key] : fallback;
  },

  /**
   * Storage.set(key, value)
   * Writes to cache immediately, then persists to Supabase async.
   */
  async set(key, value) {
    _cache[key] = value;

    /* USER row is stored in public.users, everything else in user_data */
    if (key === KEYS.USER) {
      // Handled entirely by auth.js — skip remote write here
      return;
    }

    const uid = await _uid();
    if (!uid) return; // guest mode — cache-only

    await supabase
      .from('user_data')
      .upsert({ user_id: uid, key, value, updated_at: new Date().toISOString() },
               { onConflict: 'user_id,key' });
  },

  /**
   * Storage.update(key, updaterFn, fallback?)
   * Read → transform → write.  updaterFn receives current value.
   */
  async update(key, fn, fallback = null) {
    const current = this.get(key, fallback);
    const next    = fn(current);
    await this.set(key, next);
    return next;
  },

  /**
   * Storage.remove(key)
   * Deletes from cache and Supabase.
   */
  async remove(key) {
    delete _cache[key];

    const uid = await _uid();
    if (!uid) return;

    await supabase
      .from('user_data')
      .delete()
      .match({ user_id: uid, key });
  },

  /**
   * Storage.load(uid?)
   * Called once at boot (by auth.js after session restore).
   * Pulls all user_data rows into the local cache.
   */
  async load(uid) {
    if (!uid) return;

    const { data, error } = await supabase
      .from('user_data')
      .select('key, value')
      .eq('user_id', uid);

    if (error) {
      console.error('[mindOS_] Storage.load error:', error.message);
      return;
    }

    for (const row of data ?? []) {
      _cache[row.key] = row.value;
    }
  },

  /**
   * Storage.clearCache()
   * Called on logout — wipes in-memory state.
   */
  clearCache() {
    for (const k of Object.keys(_cache)) delete _cache[k];
  },
};