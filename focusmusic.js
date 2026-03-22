/* ============================================================
   focusmusic.js — Ambient Focus Music
   Pure Web Audio API — zero external files.
   ============================================================ */

export const SOUNDS = [
  { id:'brown',  label:'Brown noise', icon:'🌊', desc:'Deep warm rumble'   },
  { id:'white',  label:'White noise', icon:'📡', desc:'Pure static mask'   },
  { id:'rain',   label:'Rain',        icon:'🌧', desc:'Steady rainfall'    },
  { id:'lofi',   label:'Lo-fi',       icon:'🎵', desc:'Soft rhythmic tones'},
  { id:'forest', label:'Forest',      icon:'🌿', desc:'Birds and wind'     },
  { id:'cafe',   label:'Café',        icon:'☕', desc:'Gentle background'  },
];

let _ctx      = null;
let _master   = null;   // master GainNode
let _playing  = null;
let _nodes    = [];     // all running nodes for cleanup
let _volume   = 0.08;   // 8% default — subtle background

export function getPlaying() { return _playing; }
export function getVolume()  { return _volume;  }

/* Returns true if now playing, false if stopped */
export async function toggle(soundId) {
  if (_playing === soundId) {
    _stop();
    return false;
  }
  await _play(soundId);
  return true;
}

export function setVolume(v) {
  _volume = Math.max(0, Math.min(1, v));
  if (_master) _master.gain.linearRampToValueAtTime(_volume, _ctx.currentTime + 0.05);
}

export function stopAll() { _stop(); }

/* ── Internal ── */
async function _play(soundId) {
  _stop();

  // Create / resume AudioContext inside user gesture
  if (!_ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { alert('Web Audio not supported in this browser.'); return; }
    _ctx = new Ctor();
  }
  if (_ctx.state === 'suspended') await _ctx.resume();

  _master = _ctx.createGain();
  _master.gain.value = _volume;
  _master.connect(_ctx.destination);

  _playing = soundId;

  switch (soundId) {
    case 'brown':  _brown();  break;
    case 'white':  _white();  break;
    case 'rain':   _rain();   break;
    case 'lofi':   _lofi();   break;
    case 'forest': _forest(); break;
    case 'cafe':   _cafe();   break;
  }
}

function _stop() {
  _playing = null;
  _nodes.forEach(n => {
    try {
      if (typeof n.stop  === 'function') n.stop(0);
      if (typeof n.disconnect === 'function') n.disconnect();
    } catch {}
    if (n._timer) clearTimeout(n._timer);
  });
  _nodes = [];
  if (_master) { try { _master.disconnect(); } catch {} _master = null; }
}

/* ── Noise buffer factory ── */
function _noiseBuffer(seconds, type = 'white') {
  const sr  = _ctx.sampleRate;
  const len = sr * seconds;
  const buf = _ctx.createBuffer(1, len, sr);
  const d   = buf.getChannelData(0);

  if (type === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      d[i] = last = (last + 0.02 * w) / 1.02;
    }
    // normalise
    let max = 0;
    for (let i = 0; i < len; i++) if (Math.abs(d[i]) > max) max = Math.abs(d[i]);
    for (let i = 0; i < len; i++) d[i] /= max;
  } else {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function _loopNoise(buf, dest, gain = 1) {
  const src = _ctx.createBufferSource();
  src.buffer = buf;
  src.loop   = true;
  const g = _ctx.createGain();
  g.gain.value = gain;
  src.connect(g); g.connect(dest);
  src.start();
  _nodes.push(src, g);
  return src;
}

function _filter(type, freq, dest) {
  const f = _ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq;
  f.connect(dest);
  _nodes.push(f);
  return f;
}

/* ── Sounds ── */
function _brown() {
  const buf = _noiseBuffer(4, 'brown');
  _loopNoise(buf, _master, 1.0);
}

function _white() {
  const buf = _noiseBuffer(2, 'white');
  const lo  = _filter('lowpass', 6000, _master);
  _loopNoise(buf, lo, 0.6);
}

function _rain() {
  const buf = _noiseBuffer(3, 'white');
  // Main rain body
  const bp1 = _filter('bandpass', 800, _master);
  bp1.Q.value = 0.3;
  _loopNoise(buf, bp1, 1.0);
  // High drizzle
  const bp2 = _filter('bandpass', 3000, _master);
  bp2.Q.value = 0.5;
  _loopNoise(buf, bp2, 0.3);
  // Low rumble
  const lp = _filter('lowpass', 120, _master);
  _loopNoise(buf, lp, 0.5);
}

function _lofi() {
  const bpm  = 76;
  const beat = 60 / bpm;
  const now  = _ctx.currentTime + 0.05;
  const bars = 8;

  for (let b = 0; b < bars; b++) {
    const t0 = now + b * 4 * beat;
    // Kick: beats 0, 2
    [0, 2].forEach(k => _kick(t0 + k * beat));
    // Snare: beats 1, 3
    [1, 3].forEach(k => _snare(t0 + k * beat));
    // Hi-hat: every eighth note
    for (let h = 0; h < 8; h++) _hat(t0 + h * beat * 0.5);
    // Pad every 2 bars
    if (b % 2 === 0) _pad([261.63, 329.63, 392.00], t0, 2 * beat * 4);
  }

  // Loop
  const dur = bars * 4 * beat * 1000 - 80;
  const timer = { _timer: setTimeout(() => { if (_playing === 'lofi') _lofi(); }, dur) };
  _nodes.push(timer);
}

function _kick(t) {
  const osc = _ctx.createOscillator();
  const g   = _ctx.createGain();
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.35);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(g); g.connect(_master);
  osc.start(t); osc.stop(t + 0.4);
  _nodes.push(osc, g);
}

function _snare(t) {
  const noise = _noiseBuffer(0.2, 'white');
  const src   = _ctx.createBufferSource();
  src.buffer  = noise;
  const bp    = _ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.7;
  const g = _ctx.createGain();
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  src.connect(bp); bp.connect(g); g.connect(_master);
  src.start(t); src.stop(t + 0.15);
  _nodes.push(src, bp, g);
}

function _hat(t) {
  const noise = _noiseBuffer(0.05, 'white');
  const src   = _ctx.createBufferSource();
  src.buffer  = noise;
  const hp    = _ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 9000;
  const g = _ctx.createGain();
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  src.connect(hp); hp.connect(g); g.connect(_master);
  src.start(t); src.stop(t + 0.05);
  _nodes.push(src, hp, g);
}

function _pad(freqs, t, dur) {
  freqs.forEach(freq => {
    const osc = _ctx.createOscillator();
    const g   = _ctx.createGain();
    osc.type  = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.4);
    g.gain.setValueAtTime(0.06, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g); g.connect(_master);
    osc.start(t); osc.stop(t + dur);
    _nodes.push(osc, g);
  });
}

function _forest() {
  const buf = _noiseBuffer(3, 'white');
  // Wind layers
  const bp1 = _filter('bandpass', 500, _master); bp1.Q.value = 0.3;
  _loopNoise(buf, bp1, 0.4);
  const lp  = _filter('lowpass', 200, _master);
  _loopNoise(buf, lp, 0.3);
  // Birds
  _bird();
}

function _bird() {
  if (_playing !== 'forest') return;
  const freq = 1600 + Math.random() * 1400;
  const osc  = _ctx.createOscillator();
  const g    = _ctx.createGain();
  const t    = _ctx.currentTime;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.setValueAtTime(freq * 1.2, t + 0.06);
  osc.frequency.setValueAtTime(freq, t + 0.12);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.12, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(g); g.connect(_master);
  osc.start(t); osc.stop(t + 0.16);
  _nodes.push(osc, g);
  const next = { _timer: setTimeout(_bird, 1000 + Math.random() * 3500) };
  _nodes.push(next);
}

function _cafe() {
  const buf = _noiseBuffer(3, 'white');
  // Murmur bed
  const bp = _filter('bandpass', 700, _master); bp.Q.value = 0.2;
  _loopNoise(buf, bp, 0.35);
  const lp = _filter('lowpass', 300, _master);
  _loopNoise(buf, lp, 0.25);
  // Clinking cups
  _clink();
}

function _clink() {
  if (_playing !== 'cafe') return;
  const freq = 900 + Math.random() * 600;
  const osc  = _ctx.createOscillator();
  const g    = _ctx.createGain();
  osc.type   = 'triangle';
  osc.frequency.value = freq;
  const t    = _ctx.currentTime;
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(g); g.connect(_master);
  osc.start(t); osc.stop(t + 0.4);
  _nodes.push(osc, g);
  const next = { _timer: setTimeout(_clink, 3000 + Math.random() * 8000) };
  _nodes.push(next);
}