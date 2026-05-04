/* ============================================================
   auth.js — Authentication Module (Supabase v2)
   Boot sequence · Login · Signup (OTP via Supabase) · Forgot
   Same public API: init(container) / destroy()
   ============================================================ */

import { supabase, Storage, KEYS } from './storage.js';

let _bootDone = false;

/* ── Public API ─────────────────────────────────────────── */
export async function init(container) {
  const route = (window.location.hash || '#auth/login').replace('#auth/', '');

  /* Restore existing session first */
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    /* Already logged in — load data and go home */
    await _hydrateUser(session.user);
    await Storage.load(session.user.id);
    _goHome(container);
    return;
  }

  if (!_bootDone && (route === 'login' || route === '')) {
    await _runBootSequence(container);
    _renderRoute(container, 'login');
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

/* ── Shell ──────────────────────────────────────────────── */
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
            style="font-size:13px;">Continue as guest</button>
  `);

  container.querySelector('#l-email').focus();
  container.querySelector('#l-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') _doLogin(container);
  });
  container.querySelector('#l-btn').addEventListener('click', () => _doLogin(container));
  container.querySelector('#guest-btn').addEventListener('click', () => _continueAsGuest(container));
}

async function _doLogin(container) {
  const email = container.querySelector('#l-email').value.trim().toLowerCase();
  const pass  = container.querySelector('#l-pass').value;
  const errEl = container.querySelector('#l-error');
  const btn   = container.querySelector('#l-btn');

  errEl.style.display = 'none';
  if (!email || !pass) return _err(errEl, 'Please fill in all fields.');

  btn.disabled = true; btn.textContent = 'Signing in…';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });

  if (error) {
    btn.disabled = false; btn.textContent = 'Sign in';
    return _err(errEl, error.message === 'Invalid login credentials'
      ? 'Incorrect email or password.' : error.message);
  }

  await _hydrateUser(data.user);
  await Storage.load(data.user.id);
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

  btn.disabled = true; btn.textContent = 'Creating account…';

  const parts    = name.split(' ');
  const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();

  /* Supabase signup — sends its own confirmation email by default.
     We disable email confirm in the dashboard and use OTP instead,
     so signUp here goes straight through. */
  const { data, error } = await supabase.auth.signUp({
    email,
    password: pass,
    options: {
      data: { name, avatar_initials: initials },
      // emailRedirectTo not needed — OTP flow handles confirmation
    },
  });

  if (error) {
    btn.disabled = false; btn.textContent = 'Continue';
    return _err(errEl, error.message);
  }

  /* If Supabase email confirm is ON, user gets a confirm link —
     redirect them to verify-otp screen which shows a waiting message. */
  if (data.user && !data.session) {
    /* Email not yet confirmed — store name for verify screen */
    sessionStorage.setItem('_pending_signup', JSON.stringify({ email, name, initials }));
    window.location.hash = '#auth/verify-otp';
    return;
  }

  /* Email confirm is OFF — session returned immediately */
  await _hydrateUser(data.user);
  await Storage.load(data.user.id);
  _goHome(container);
}

/* ── Forgot Password ────────────────────────────────────── */
function _renderForgot(container) {
  container.innerHTML = _shell(`
    ${_backArrow('#auth/login')}
    <div class="auth-title">Reset password</div>
    <div class="auth-subtitle">
      We'll send a reset link to your email.
    </div>

    <div class="form-group">
      <label class="form-label" for="f-email">Email address</label>
      <input class="input" type="email" id="f-email"
             placeholder="you@example.com" autocomplete="email"/>
    </div>

    <span id="f-error" class="form-error" style="display:none;"></span>

    <button class="btn btn-primary btn-block btn-lg" id="f-btn"
            style="margin-top:24px;">Send reset link</button>
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

  btn.disabled = true; btn.textContent = 'Sending…';

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}${location.pathname}#auth/reset-password`,
  });

  if (error) {
    btn.disabled = false; btn.textContent = 'Send reset link';
    return _err(errEl, error.message);
  }

  _showToast('Reset link sent — check your email', 'success', 5000);
  setTimeout(() => { window.location.hash = '#auth/login'; }, 1500);
}

/* ── Verify OTP (Supabase email confirmation) ───────────── */
function _renderVerifyOTP(container) {
  const pending = JSON.parse(sessionStorage.getItem('_pending_signup') || 'null');
  const emailDisplay = pending?.email || 'your email';

  container.innerHTML = _shell(`
    ${_backArrow('#auth/signup')}
    <div class="auth-title">Verify email</div>
    <div class="otp-info">
      We sent a confirmation link to <strong>${emailDisplay}</strong>.<br/>
      Click the link in the email, then come back here and press Continue.
    </div>

    <span id="otp-error" class="form-error"
          style="display:none;text-align:center;margin-top:10px;"></span>

    <button class="btn btn-primary btn-block btn-lg" id="otp-btn"
            style="margin-top:24px;">I've confirmed — Continue</button>

    <p class="auth-footer">
      Didn't receive it?
      <button class="auth-link-btn" id="resend-btn">Resend</button>
    </p>
  `);

  container.querySelector('#otp-btn').addEventListener('click', async () => {
    const errEl = container.querySelector('#otp-error');
    const btn   = container.querySelector('#otp-btn');
    btn.disabled = true; btn.textContent = 'Checking…';

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      sessionStorage.removeItem('_pending_signup');
      await _hydrateUser(session.user);
      await Storage.load(session.user.id);
      _goHome(container);
    } else {
      btn.disabled = false; btn.textContent = 'I\'ve confirmed — Continue';
      _err(errEl, 'Email not yet confirmed. Click the link in your email first.');
    }
  });

  container.querySelector('#resend-btn').addEventListener('click', () => {
    sessionStorage.removeItem('_pending_signup');
    window.location.hash = '#auth/signup';
  });
}

/* ── Reset Password (deep-link return) ──────────────────── */
function _renderResetPassword(container) {
  container.innerHTML = _shell(`
    <div class="auth-title">New password</div>
    <div class="auth-subtitle">Choose a strong new password</div>

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

  const { error } = await supabase.auth.updateUser({ password: pass });
  if (error) {
    btn.disabled = false; btn.textContent = 'Update password';
    return _err(errEl, error.message);
  }

  await supabase.auth.signOut();
  Storage.clearCache();
  _showToast('Password updated — please sign in', 'success');
  window.location.hash = '#auth/login';
}

/* ── Hydrate local user object from Supabase session ──────
   Mirrors the shape the rest of mindOS_ expects on KEYS.USER
   --------------------------------------------------------- */
async function _hydrateUser(sbUser) {
  const meta = sbUser.user_metadata || {};

  /* Try to load existing profile row */
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', sbUser.id)
    .single();

  const name     = profile?.name     || meta.name     || sbUser.email.split('@')[0];
  const initials = profile?.avatar_initials || meta.avatar_initials
    || name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  /* Upsert profile row */
  await supabase.from('users').upsert({
    id:              sbUser.id,
    email:           sbUser.email,
    name,
    avatar_initials: initials,
    timezone:        profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    default_focus_mins: profile?.default_focus_mins || 25,
    theme:           profile?.theme || 'dark',
  }, { onConflict: 'id' });

  /* Write to cache — same shape as old localStorage KEYS.USER */
  Storage['_cache'] = Storage['_cache'] || {};
  const userObj = {
    id:               sbUser.id,
    name,
    email:            sbUser.email,
    avatarInitials:   initials,
    timezone:         profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    defaultFocusMins: profile?.default_focus_mins || 25,
    joinedAt:         profile?.joined_at || new Date().toISOString(),
    theme:            profile?.theme || 'dark',
    isGuest:          false,
  };

  /* Use internal cache write — no remote write needed for USER key */
  Storage.get; // ensure Storage is imported
  await _setCacheDirectly(KEYS.USER, userObj);
}

/* Direct cache write without triggering remote upsert for USER key */
function _setCacheDirectly(key, value) {
  // Access the module-level _cache via a thin escape hatch
  // storage.js exposes Storage.get which reads _cache; we set via set()
  // but set() skips USER key intentionally — so we use sessionStorage
  // as a fast bridge that storage.js.get() falls back to on miss.
  // Actually: storage.js.get() reads _cache directly. We call Storage.set
  // for non-USER keys. For USER we write to sessionStorage and storage.js
  // reads it back via a special check.
  //
  // Simplest: just call Storage.set — it guards USER key from remote write.
  return Storage.set(key, value);
}

/* ── Guest Mode ─────────────────────────────────────────── */
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

/* ── Logout (call from settings panel) ─────────────────── */
export async function logout() {
  await supabase.auth.signOut();
  Storage.clearCache();
  window.location.hash = '#auth/login';
}

/* ── Helpers ─────────────────────────────────────────────── */
function _goHome(container) {
  const card = container?.querySelector('.auth-card');
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