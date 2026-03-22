/* ============================================================
   onboarding.js — First-time setup flow
   3 screens: Welcome → Preferences → Notifications
   Only shown once. Skippable. Saves to KEYS.SETTINGS.
   ============================================================ */

import { Storage, KEYS } from './storage.js';

const ONBOARDING_KEY = 'mindos_onboarded';

export function shouldShow() {
  return !Storage.get(ONBOARDING_KEY, false);
}

export function markDone() {
  Storage.set(ONBOARDING_KEY, true);
}

export function show(onComplete) {
  let _step = 0;

  const overlay = document.createElement('div');
  overlay.id        = 'onboarding-overlay';
  overlay.className = 'onboarding-overlay';
  document.body.appendChild(overlay);

  const steps = [_stepWelcome, _stepPrefs, _stepNotifs];

  function goTo(n) {
    _step = n;
    overlay.innerHTML = steps[n](n, steps.length, next, skip);
    _attachStepEvents(n, overlay, next);
  }

  function next() {
    if (_step < steps.length - 1) goTo(_step + 1);
    else finish();
  }

  function skip() { finish(); }

  function finish() {
    markDone();
    overlay.classList.add('onboarding-out');
    overlay.addEventListener('animationend', () => {
      overlay.remove();
      onComplete?.();
    }, { once: true });
  }

  goTo(0);
}

/* ── Step renderers ── */
function _stepWelcome(step, total, next, skip) {
  return `
    <div class="onboarding-card anim-fade-in">
      <button class="onboarding-skip" id="ob-skip">Skip setup</button>
      ${_dots(step, total)}
      <div class="onboarding-icon">🧠</div>
      <h2 class="onboarding-title">Welcome to mindOS_</h2>
      <p class="onboarding-body">
        Your personal focus operating system.<br/>
        Let's get you set up in 30 seconds.
      </p>
      <button class="btn btn-primary btn-block onboarding-next" id="ob-next"
              style="margin-top:24px;">
        Let's go →
      </button>
    </div>`;
}

function _stepPrefs(step, total, next, skip) {
  const s = Storage.get(KEYS.SETTINGS, {});
  return `
    <div class="onboarding-card anim-fade-in">
      <button class="onboarding-skip" id="ob-skip">Skip</button>
      ${_dots(step, total)}
      <div class="onboarding-icon">⏱</div>
      <h2 class="onboarding-title">Focus preferences</h2>
      <p class="onboarding-body">How long is your default focus session?</p>

      <div class="onboarding-options" id="ob-duration">
        ${[15,20,25,30,45,60].map(m => `
          <button class="onboarding-chip${(s.workMins||25)===m?' selected':''}"
                  data-val="${m}">${m} min</button>`).join('')}
      </div>

      <p class="onboarding-body" style="margin-top:16px;">Short break length?</p>
      <div class="onboarding-options" id="ob-break">
        ${[5,10,15].map(m => `
          <button class="onboarding-chip${(s.shortBreakMins||5)===m?' selected':''}"
                  data-val="${m}">${m} min</button>`).join('')}
      </div>

      <button class="btn btn-primary btn-block onboarding-next" id="ob-next"
              style="margin-top:24px;">Next →</button>
    </div>`;
}

function _stepNotifs(step, total, next, skip) {
  const granted = Notification.permission === 'granted';
  return `
    <div class="onboarding-card anim-fade-in">
      <button class="onboarding-skip" id="ob-skip">Skip</button>
      ${_dots(step, total)}
      <div class="onboarding-icon">${granted ? '✅' : '🔔'}</div>
      <h2 class="onboarding-title">Stay on track</h2>
      <p class="onboarding-body">
        ${granted
          ? 'Notifications are enabled. You\'ll be alerted when timers complete and reminders fire.'
          : 'Enable notifications to get alerted when your focus session ends and reminders are due.'}
      </p>
      ${granted ? '' : `
        <button class="btn btn-primary btn-block" id="ob-notif-btn" style="margin-top:8px;">
          Enable notifications
        </button>`}
      <button class="btn ${granted?'btn-primary':'btn-secondary'} btn-block onboarding-next"
              id="ob-next" style="margin-top:${granted?'24':'10'}px;">
        ${granted ? 'Get started 🚀' : 'Skip for now'}
      </button>
    </div>`;
}

function _dots(current, total) {
  return `<div class="onboarding-dots">
    ${Array.from({length:total}, (_,i) =>
      `<div class="onboarding-dot${i===current?' active':''}"></div>`
    ).join('')}
  </div>`;
}

/* ── Step-specific event handlers ── */
function _attachStepEvents(step, overlay, next) {
  overlay.querySelector('#ob-skip')?.addEventListener('click', () => {
    // Call the skip function from closure — re-find it via parent
    overlay.classList.add('onboarding-out');
    overlay.addEventListener('animationend', () => {
      markDone(); overlay.remove();
    }, { once: true });
  });

  overlay.querySelector('#ob-next')?.addEventListener('click', next);

  if (step === 1) {
    // Preferences — chip selection
    overlay.querySelectorAll('#ob-duration .onboarding-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('#ob-duration .onboarding-chip').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const s = Storage.get(KEYS.SETTINGS, {});
        Storage.set(KEYS.SETTINGS, { ...s, workMins: parseInt(btn.dataset.val) });
      });
    });
    overlay.querySelectorAll('#ob-break .onboarding-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('#ob-break .onboarding-chip').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const s = Storage.get(KEYS.SETTINGS, {});
        Storage.set(KEYS.SETTINGS, { ...s, shortBreakMins: parseInt(btn.dataset.val) });
      });
    });
  }

  if (step === 2) {
    overlay.querySelector('#ob-notif-btn')?.addEventListener('click', async () => {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        overlay.querySelector('#ob-notif-btn')?.remove();
        overlay.querySelector('.onboarding-icon').textContent = '✅';
        overlay.querySelector('.onboarding-body').textContent =
          "You're all set! Notifications are enabled.";
        const nextBtn = overlay.querySelector('#ob-next');
        if (nextBtn) { nextBtn.textContent = 'Get started 🚀'; nextBtn.className = 'btn btn-primary btn-block onboarding-next'; }
      }
    });
  }
}