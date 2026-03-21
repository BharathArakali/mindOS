/* ============================================================
   utils.js — Pure utility functions. No DOM, no storage.
   Import from any module — never the reverse.
   ============================================================ */

/**
 * Generates a RFC4122-compliant UUID v4.
 * Uses crypto.randomUUID() if available (all modern browsers),
 * falls back to a manual implementation for older environments.
 */
export function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: manual v4 UUID using crypto.getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant bits
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

/**
 * Returns a debounced version of fn that delays execution by `ms`
 * milliseconds after the last invocation. Trailing-edge by default.
 *
 * @param {Function} fn - The function to debounce
 * @param {number}   ms - Delay in milliseconds
 */
export function debounce(fn, ms) {
  let timerId = null;
  return function (...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(this, args);
    }, ms);
  };
}

/**
 * Converts a total number of seconds into a MM:SS string.
 * e.g. 1500 → '25:00', 65 → '01:05', 0 → '00:00'
 *
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Formats an ISO8601 date string into a human-readable short form.
 * e.g. '2024-03-17T10:30:00.000Z' → 'Mon, 17 Mar'
 *
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Formats a Date object or ISO string into 'YYYY-MM-DD' local date.
 * Used for session date keys and streak calculations.
 *
 * @param {Date|string} date
 * @returns {string}
 */
export function toDateKey(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Formats total minutes into a readable duration string.
 * e.g. 90 → '1h 30m', 25 → '25m', 0 → '0m'
 *
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatDuration(totalMinutes) {
  const mins = Math.round(totalMinutes);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Hashes a password string using SubtleCrypto SHA-256.
 * Returns a hex-encoded string.
 * This is a one-way hash — used for local password storage only.
 * NOT a substitute for bcrypt/argon2 in a real backend.
 *
 * @param {string} password
 * @returns {Promise<string>} hex string
 */
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a cryptographically secure 6-digit OTP.
 * Always returns exactly 6 digits (100000–999999).
 *
 * @returns {string}
 */
export function generateOTP() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String((array[0] % 900000) + 100000);
}

/**
 * Returns a greeting string based on the current local hour.
 *
 * @param {string} name - User's display name
 * @returns {string}
 */
export function getGreeting(name) {
  const hour = new Date().getHours();
  if (hour >= 5  && hour < 12) return `Good morning, ${name}.`;
  if (hour >= 12 && hour < 17) return `Good afternoon, ${name}.`;
  if (hour >= 17 && hour < 21) return `Good evening, ${name}.`;
  return `Still up, ${name}?`;
}

/**
 * Clamps a value between min and max.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Checks if two 'YYYY-MM-DD' date strings are consecutive days.
 *
 * @param {string} earlier
 * @param {string} later
 * @returns {boolean}
 */
export function areConsecutiveDays(earlier, later) {
  const a = new Date(earlier);
  const b = new Date(later);
  const diffMs = b.getTime() - a.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}