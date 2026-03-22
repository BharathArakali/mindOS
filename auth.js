/* ============================================================
   auth.js — Authentication Module
   Boot sequence · Login · Signup (with OTP) · Forgot · Reset
   ============================================================ */

import { Storage, KEYS } from './storage.js';
import { uuid, hashPassword, generateOTP } from './utils.js';

const EMAILJS_SERVICE_ID  = 'service_txyxy1o';
const EMAILJS_TEMPLATE_ID = 'template_qbdjqvb';
const EMAILJS_PUBLIC_KEY  = 'cmvMHvi4CYMoyd_ri';

/* In-memory OTP state — never written to localStorage */
let _pendingOTP  = null;  // { code, email, expiresAt, forSignup, userData }
let _bootDone    = false;

/* ── Public API ─────────────────────────────────────────── */
export function init(container) {
  const route = (window.location.hash || '#auth/login').replace('#auth/', '');
  if (!_bootDone && (route === 'login' || route === '')) {
    _runBootSequence(container).then(() => _renderRoute(container, 'login'));
  } else {
    _renderRoute(container, route);
  }
}

export function destroy() {}

/* ── Router ─────────────────────────────────────────────── */
function _renderRoute(container, route) {
  switch (route) {
    case 'login':          return _renderLogin(container);
    case 'signup':         return _renderSignup(container);
    case 'forgot':         return _renderForgot(container);
    case 'verify-otp':     return _renderVerifyOTP(container);
    case 'reset-password': return _renderResetPassword(container);
    default:               return _renderLogin(container);
  }
}

/* ── Boot Sequence ──────────────────────────────────────── */
function _runBootSequence(container) {
  return new Promise(resolve => {
    _bootDone = true;
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  min-height:calc(100dvh - 56px);">
        <div id="boot-text" style="font-family:var(--font-mono);font-size:26px;
             font-weight:500;color:var(--accent);letter-spacing:-0.02em;"></div>
      </div>`;

    const bootText = container.querySelector('#boot-text');
    const fullText = 'mindOS_';
    let i = 0;

    const cursor = document.createElement('span');
    cursor.style.cssText = `display:inline-block;width:2px;height:1.1em;
      background:var(--accent);margin-left:3px;vertical-align:middle;
      animation:cursorBlink 600ms step-end infinite;`;

    function type() {
      if (i < fullText.length) {
        const s = document.createElement('span');
        s.textContent = fullText[i++];
        s.style.animation = 'fadeIn 60ms ease both';
        bootText.appendChild(s);
        bootText.appendChild(cursor);
        setTimeout(type, 700 / fullText.length);
      } else {
        setTimeout(() => {
          cursor.style.animation = 'none';
          cursor.style.opacity = '0';
          setTimeout(resolve, 180);
        }, 650);
      }
    }
    type();
  });
}

/* ── Shared card wrapper ────────────────────────────────── */
function _shell(html) {
  return `<div class="auth-outer"><div class="auth-card anim-rise-in">${html}</div></div>`;
}

function _backArrow(href) {
  return `<a href="${href}" class="auth-back">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
         stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M10 3L5 8l5 5"/>
    </svg>Back
  </a>`;
}

/* ── Login ──────────────────────────────────────────────── */
function _renderLogin(container) {
  container.innerHTML = _shell(`
    <div class="auth-logo">mindOS_</div>
    <div class="auth-title">Welcome back</div>
    <div class="auth-subtitle">Sign in to your focus operating system</div>

    <div class="form-group">
      <label class="form-label" for="l-email">Email</label>
      <input class="input" type="email" id="l-email"
             placeholder="you@example.com" autocomplete="email"/>
    </div>

    <div class="form-group" style="margin-top:14px;">
      <label class="form-label" for="l-pass">Password</label>
      <input class="input" type="password" id="l-pass"
             placeholder="••••••••" autocomplete="current-password"/>
    </div>

    <div style="text-align:right;margin-top:8px;">
      <a href="#auth/forgot" class="auth-link" style="font-size:12px;">
        Forgot password?
      </a>
    </div>

    <span id="l-error" class="form-error" style="display:none;"></span>

    <button class="btn btn-primary btn-block btn-lg" id="l-btn"
            style="margin-top:20px;">Sign in</button>

    <p class="auth-footer">
      No account yet? <a href="#auth/signup" class="auth-link">Create one</a>
    </p>

    <div class="auth-divider">or</div>

    <button class="btn btn-secondary btn-block" id="guest-btn"
            style="font-size:13px;">
      Continue as guest
    </button>
  `);

  container.querySelector('#l-email').focus();
  container.querySelector('#l-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') _doLogin(container);
  });
  container.querySelector('#l-btn').addEventListener('click', () => _doLogin(container));

  container.querySelector('#guest-btn').addEventListener('click', () => {
    _continueAsGuest(container);
  });
}

async function _doLogin(container) {
  const email   = container.querySelector('#l-email').value.trim().toLowerCase();
  const pass    = container.querySelector('#l-pass').value;
  const errEl   = container.querySelector('#l-error');
  const btn     = container.querySelector('#l-btn');

  errEl.style.display = 'none';
  if (!email || !pass) return _err(errEl, 'Please fill in all fields.');

  btn.disabled = true; btn.textContent = 'Signing in…';

  const db   = Storage.get(KEYS.USERS_DB, {});
  const user = db[email];
  if (!user) {
    btn.disabled = false; btn.textContent = 'Sign in';
    return _err(errEl, 'No account found with that email.');
  }

  const hash = await hashPassword(pass);
  if (hash !== user.passwordHash) {
    btn.disabled = false; btn.textContent = 'Sign in';
    return _err(errEl, 'Incorrect password.');
  }

  Storage.set(KEYS.USER, { ...user, passwordHash: undefined });
  _goHome(container);
}

/* ── Signup ─────────────────────────────────────────────── */
function _renderSignup(container) {
  container.innerHTML = _shell(`
    ${_backArrow('#auth/login')}
    <div class="auth-title">Create account</div>
    <div class="auth-subtitle">Join mindOS_ and start building focus habits</div>

    <div class="form-group">
      <label class="form-label" for="s-name">Full name</label>
      <input class="input" type="text" id="s-name"
             placeholder="Your name" autocomplete="name"/>
    </div>

    <div class="form-group" style="margin-top:14px;">
      <label class="form-label" for="s-email">Email</label>
      <input class="input" type="email" id="s-email"
             placeholder="you@example.com" autocomplete="email"/>
    </div>

    <div class="form-group" style="margin-top:14px;">
      <label class="form-label" for="s-pass">Password</label>
      <input class="input" type="password" id="s-pass"
             placeholder="At least 8 characters" autocomplete="new-password"/>
    </div>

    <div class="form-group" style="margin-top:14px;">
      <label class="form-label" for="s-confirm">Confirm password</label>
      <input class="input" type="password" id="s-confirm"
             placeholder="••••••••" autocomplete="new-password"/>
    </div>

    <span id="s-error" class="form-error" style="display:none;"></span>

    <button class="btn btn-primary btn-block btn-lg" id="s-btn"
            style="margin-top:24px;">Continue</button>

    <p class="auth-footer">
      Already have an account? <a href="#auth/login" class="auth-link">Sign in</a>
    </p>
  `);

  container.querySelector('#s-name').focus();
  container.querySelector('#s-btn').addEventListener('click', () => _doSignup(container));
  container.querySelector('#s-confirm').addEventListener('keydown', e => {
    if (e.key === 'Enter') _doSignup(container);
  });
}

async function _doSignup(container) {
  const name    = container.querySelector('#s-name').value.trim();
  const email   = container.querySelector('#s-email').value.trim().toLowerCase();
  const pass    = container.querySelector('#s-pass').value;
  const confirm = container.querySelector('#s-confirm').value;
  const errEl   = container.querySelector('#s-error');
  const btn     = container.querySelector('#s-btn');

  errEl.style.display = 'none';
  if (!name || !email || !pass || !confirm) return _err(errEl, 'Please fill in all fields.');
  if (pass.length < 8)  return _err(errEl, 'Password must be at least 8 characters.');
  if (pass !== confirm) return _err(errEl, 'Passwords do not match.');

  const db = Storage.get(KEYS.USERS_DB, {});
  if (db[email]) return _err(errEl, 'An account with this email already exists.');

  btn.disabled = true; btn.textContent = 'Sending code…';

  const passwordHash = await hashPassword(pass);
  const parts        = name.split(' ');
  const initials     = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();

  const userData = {
    id: uuid(), name, email, avatarInitials: initials,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    defaultFocusMins: 25,
    joinedAt: new Date().toISOString(),
    theme: 'dark',
    passwordHash,
  };

  /* Generate OTP and store user data in memory until verified */
  const otp = generateOTP();
  _pendingOTP = {
    code:      otp,
    email,
    expiresAt: Date.now() + 10 * 60 * 1000,
    forSignup: true,
    userData,
  };
  setTimeout(() => { if (_pendingOTP?.forSignup) _pendingOTP = null; }, 10 * 60 * 1000);

  try {
    await _sendEmail(email, otp, name);
  } catch {
    console.info(`[mindOS_ DEV] Signup OTP for ${email}: ${otp}`);
    _showToast(`Dev mode — OTP: ${otp}`, 'warning', 14000);
  }

  window.location.hash = '#auth/verify-otp';
}

/* ── Forgot Password ────────────────────────────────────── */
function _renderForgot(container) {
  container.innerHTML = _shell(`
    ${_backArrow('#auth/login')}
    <div class="auth-title">Reset password</div>
    <div class="auth-subtitle">
      Enter your email and we'll send you a 6-digit verification code.
    </div>

    <div class="form-group">
      <label class="form-label" for="f-email">Email address</label>
      <input class="input" type="email" id="f-email"
             placeholder="you@example.com" autocomplete="email"/>
    </div>

    <span id="f-error" class="form-error" style="display:none;"></span>

    <button class="btn btn-primary btn-block btn-lg" id="f-btn"
            style="margin-top:24px;">Send code</button>
  `);

  container.querySelector('#f-email').focus();
  container.querySelector('#f-btn').addEventListener('click', () => _doForgot(container));
  container.querySelector('#f-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') _doForgot(container);
  });
}

async function _doForgot(container) {
  const email = container.querySelector('#f-email').value.trim().toLowerCase();
  const errEl = container.querySelector('#f-error');
  const btn   = container.querySelector('#f-btn');

  errEl.style.display = 'none';
  if (!email) return _err(errEl, 'Please enter your email.');

  const db = Storage.get(KEYS.USERS_DB, {});
  if (!db[email]) return _err(errEl, 'No account found with that email.');

  btn.disabled = true; btn.textContent = 'Sending…';

  const otp = generateOTP();
  _pendingOTP = {
    code:      otp,
    email,
    expiresAt: Date.now() + 10 * 60 * 1000,
    forSignup: false,
  };
  setTimeout(() => { _pendingOTP = null; }, 10 * 60 * 1000);

  try {
    await _sendEmail(email, otp, db[email].name);
  } catch {
    console.info(`[mindOS_ DEV] Reset OTP for ${email}: ${otp}`);
    _showToast(`Dev mode — OTP: ${otp}`, 'warning', 14000);
  }

  window.location.hash = '#auth/verify-otp';
}

/* ── Verify OTP ─────────────────────────────────────────── */
function _renderVerifyOTP(container) {
  const isSignup = _pendingOTP?.forSignup;
  const emailDisplay = _pendingOTP?.email || 'your email';

  container.innerHTML = _shell(`
    ${_backArrow(isSignup ? '#auth/signup' : '#auth/forgot')}
    <div class="auth-title">${isSignup ? 'Verify email' : 'Check your email'}</div>
    <div class="otp-info">
      We sent a 6-digit code to <strong>${emailDisplay}</strong>.<br/>
      It expires in 10 minutes.
    </div>

    <div class="otp-row" id="otp-row">
      ${[0,1,2,3,4,5].map(i => `
        <input class="otp-box" id="otp-${i}" type="text"
               inputmode="numeric" pattern="[0-9]"
               maxlength="1" autocomplete="off"
               aria-label="Digit ${i+1} of 6"/>
      `).join('')}
    </div>

    <span id="otp-error" class="form-error"
          style="display:none;text-align:center;margin-top:10px;"></span>

    <button class="btn btn-primary btn-block btn-lg" id="otp-btn"
            style="margin-top:24px;">
      ${isSignup ? 'Verify & create account' : 'Verify code'}
    </button>

    <p class="auth-footer">
      Didn't receive it?
      <button class="auth-link-btn" id="resend-btn">Resend</button>
    </p>
  `);

  _wireOTPBoxes(container);
  container.querySelector('#otp-0').focus();
  container.querySelector('#otp-btn').addEventListener('click', () => _doVerifyOTP(container));
  container.querySelector('#resend-btn').addEventListener('click', () => {
    window.location.hash = isSignup ? '#auth/signup' : '#auth/forgot';
  });
}

function _wireOTPBoxes(container) {
  const boxes = container.querySelectorAll('.otp-box');
  boxes.forEach((box, i) => {
    box.addEventListener('input', e => {
      box.value = e.target.value.replace(/\D/g,'').slice(-1);
      if (box.value && i < boxes.length - 1) boxes[i+1].focus();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        boxes[i-1].focus(); boxes[i-1].value = '';
      }
      if (e.key === 'Enter') _doVerifyOTP(container);
    });
    box.addEventListener('paste', e => {
      e.preventDefault();
      const digits = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g,'').slice(0,6);
      digits.split('').forEach((c, idx) => { if (boxes[idx]) boxes[idx].value = c; });
      boxes[Math.min(digits.length, 5)].focus();
    });
  });
}

async function _doVerifyOTP(container) {
  const boxes   = container.querySelectorAll('.otp-box');
  const row     = container.querySelector('#otp-row');
  const errEl   = container.querySelector('#otp-error');
  const btn     = container.querySelector('#otp-btn');
  const entered = Array.from(boxes).map(b => b.value).join('');

  errEl.style.display = 'none';
  if (entered.length < 6) return _err(errEl, 'Enter all 6 digits.');
  if (!_pendingOTP)       return _err(errEl, 'OTP expired. Request a new one.');
  if (Date.now() > _pendingOTP.expiresAt) {
    _pendingOTP = null;
    return _err(errEl, 'Code expired. Request a new one.');
  }

  if (entered !== _pendingOTP.code) {
    row.classList.remove('anim-shake');
    void row.offsetWidth;
    row.classList.add('anim-shake');
    boxes.forEach(b => b.classList.add('otp-box--error'));
    setTimeout(() => {
      row.classList.remove('anim-shake');
      boxes.forEach(b => b.classList.remove('otp-box--error'));
    }, 600);
    return _err(errEl, 'Incorrect code. Try again.');
  }

  btn.disabled = true;
  boxes.forEach(b => b.classList.add('otp-box--success'));

  setTimeout(() => {
    const card = container.querySelector('.auth-card');
    card.style.transition = 'opacity 400ms ease';
    card.style.opacity = '0';

    setTimeout(() => {
      if (_pendingOTP?.forSignup && _pendingOTP?.userData) {
        /* Signup flow — save user and log in */
        const u = _pendingOTP.userData;
        Storage.update(KEYS.USERS_DB, db => ({ ...db, [u.email]: u }), {});
        Storage.set(KEYS.USER, { ...u, passwordHash: undefined });
        _pendingOTP = null;
        _goHome(container);
      } else {
        /* Reset flow — go to reset-password screen */
        window.location.hash = '#auth/reset-password';
      }
    }, 420);
  }, 350);
}

/* ── Reset Password ─────────────────────────────────────── */
function _renderResetPassword(container) {
  if (!_pendingOTP) { window.location.hash = '#auth/forgot'; return; }

  container.innerHTML = _shell(`
    <div class="auth-title">New password</div>
    <div class="auth-subtitle">
      Choose a strong password for <strong>${_pendingOTP.email}</strong>
    </div>

    <div class="form-group">
      <label class="form-label" for="r-pass">New password</label>
      <input class="input" type="password" id="r-pass"
             placeholder="At least 8 characters" autocomplete="new-password"/>
    </div>

    <div class="form-group" style="margin-top:14px;">
      <label class="form-label" for="r-confirm">Confirm password</label>
      <input class="input" type="password" id="r-confirm"
             placeholder="••••••••" autocomplete="new-password"/>
    </div>

    <span id="r-error" class="form-error" style="display:none;"></span>

    <button class="btn btn-primary btn-block btn-lg" id="r-btn"
            style="margin-top:24px;">Update password</button>
  `);

  container.querySelector('#r-pass').focus();
  container.querySelector('#r-btn').addEventListener('click', () => _doReset(container));
  container.querySelector('#r-confirm').addEventListener('keydown', e => {
    if (e.key === 'Enter') _doReset(container);
  });
}

async function _doReset(container) {
  const pass    = container.querySelector('#r-pass').value;
  const confirm = container.querySelector('#r-confirm').value;
  const errEl   = container.querySelector('#r-error');
  const btn     = container.querySelector('#r-btn');

  errEl.style.display = 'none';
  if (!pass || !confirm)  return _err(errEl, 'Please fill in both fields.');
  if (pass.length < 8)    return _err(errEl, 'Password must be at least 8 characters.');
  if (pass !== confirm)   return _err(errEl, 'Passwords do not match.');

  btn.disabled = true; btn.textContent = 'Updating…';

  const email = _pendingOTP.email;
  const hash  = await hashPassword(pass);
  Storage.update(KEYS.USERS_DB, db => ({
    ...db, [email]: { ...db[email], passwordHash: hash }
  }), {});
  _pendingOTP = null;
  _showToast('Password updated — please sign in', 'success');
  window.location.hash = '#auth/login';
}

/* ── EmailJS ────────────────────────────────────────────── */
async function _sendEmail(toEmail, otp, name) {
  if (typeof emailjs === 'undefined') {
    const s  = document.createElement('script');
    s.src    = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
    document.head.appendChild(s);
    await new Promise((res, rej) => { s.onload = res; s.onerror = rej; });
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }
  return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email: toEmail, otp_code: otp,
    user_name: name || 'there', expiry_minutes: '10',
  });
}

/* ── Helpers ────────────────────────────────────────────── */
function _goHome(container) {
  const card = container.querySelector('.auth-card');
  if (card) {
    card.style.transition = 'opacity 400ms ease';
    card.style.opacity = '0';
  }
  setTimeout(() => { window.location.hash = '#home'; }, card ? 420 : 0);
}

function _err(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

function _continueAsGuest(container) {
  const guestUser = {
    id:              'guest',
    name:            'Guest',
    email:           '',
    avatarInitials:  'G',
    timezone:        Intl.DateTimeFormat().resolvedOptions().timeZone,
    defaultFocusMins: 25,
    joinedAt:        new Date().toISOString(),
    theme:           'dark',
    isGuest:         true,
  };
  Storage.set(KEYS.USER, guestUser);
  _goHome(container);
}

function _showToast(msg, type = 'default', duration = 4000) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => {
    t.classList.add('exiting');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, duration);
}