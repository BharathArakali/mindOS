/* ============================================================
   focusmusic.js — Ambient Focus Music
   Pure Web Audio API — no external files needed.
   Sounds: Brown noise · White noise · Rain · Lo-fi beats
   ============================================================ */

const AudioContext = window.AudioContext || window.webkitAudioContext;

let _ctx        = null;
let _playing    = null; // current sound id
let _gainNode   = null;
let _sources    = [];   // active audio nodes
let _volume     = 0.4;

/* ── Sound definitions ── */
const SOUNDS = [
  { id: 'brown', label: 'Brown noise',  icon: '🌊', desc: 'Deep, warm rumble' },
  { id: 'white', label: 'White noise',  icon: '📡', desc: 'Pure static mask' },
  { id: 'rain',  label: 'Rain',         icon: '🌧', desc: 'Steady rainfall'  },
  { id: 'lofi',  label: 'Lo-fi beats',  icon: '🎵', desc: 'Soft rhythmic tones' },
  { id: 'forest',label: 'Forest',       icon: '🌿', desc: 'Birds & wind'     },
  { id: 'cafe',  label: 'Café',         icon: '☕', desc: 'Gentle chatter'   },
];

/* ── Public API ── */
export function getPlaying() { return _playing; }
export function getVolume()  { return _volume; }

export async function play(soundId) {
  await _ensureCtx();
  stop();
  _playing = soundId;
  _gainNode = _ctx.createGain();
  _gainNode.gain.value = _volume;
  _gainNode.connect(_ctx.destination);
  _generateSound(soundId);
}

export function stop() {
  _sources.forEach(s => { try { s.stop(); } catch {} });
  _sources = [];
  if (_gainNode) { _gainNode.disconnect(); _gainNode = null; }
  _playing = null;
}

export function setVolume(v) {
  _volume = Math.max(0, Math.min(1, v));
  if (_gainNode) _gainNode.gain.setTargetAtTime(_volume, _ctx.currentTime, 0.05);
}

export async function toggle(soundId) {
  if (_playing === soundId) { stop(); return false; }
  await play(soundId);
  return true;
}

export { SOUNDS };

/* ── Context ── */
async function _ensureCtx() {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') await _ctx.resume();
}

/* ── Sound generators ── */
function _generateSound(id) {
  switch (id) {
    case 'brown':  _brownNoise();  break;
    case 'white':  _whiteNoise();  break;
    case 'rain':   _rainSound();   break;
    case 'lofi':   _lofiBeats();   break;
    case 'forest': _forestSound(); break;
    case 'cafe':   _cafeSound();   break;
  }
}

/* Brown noise — filtered white noise, deep rumble */
function _brownNoise() {
  const bufSize = _ctx.sampleRate * 4;
  const buf     = _ctx.createBuffer(1, bufSize, _ctx.sampleRate);
  const data    = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufSize; i++) {
    const white = Math.random() * 2 - 1;
    data[i] = (last + 0.02 * white) / 1.02;
    last    = data[i];
    data[i] *= 3.5;
  }
  const src = _ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const filter = _ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 300;
  src.connect(filter); filter.connect(_gainNode);
  src.start(); _sources.push(src);
}

/* White noise — flat spectrum */
function _whiteNoise() {
  const bufSize = _ctx.sampleRate * 2;
  const buf     = _ctx.createBuffer(1, bufSize, _ctx.sampleRate);
  const data    = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = _ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  src.connect(_gainNode); src.start(); _sources.push(src);
}

/* Rain — layered filtered noise with shimmer */
function _rainSound() {
  // Heavy rain base
  _addFilteredNoise(400, 'bandpass', 0.6);
  // Light drizzle shimmer
  _addFilteredNoise(2000, 'bandpass', 0.15);
  // Rumble
  _addFilteredNoise(80, 'lowpass', 0.3);
}

function _addFilteredNoise(freq, type, gainMult) {
  const bufSize = _ctx.sampleRate * 2;
  const buf     = _ctx.createBuffer(1, bufSize, _ctx.sampleRate);
  const data    = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src    = _ctx.createBufferSource();
  src.buffer   = buf; src.loop = true;
  const filter = _ctx.createBiquadFilter();
  filter.type  = type; filter.frequency.value = freq; filter.Q.value = 0.5;
  const g      = _ctx.createGain(); g.gain.value = gainMult;
  src.connect(filter); filter.connect(g); g.connect(_gainNode);
  src.start(); _sources.push(src);
}

/* Lo-fi beats — simple rhythmic pattern with soft tones */
function _lofiBeats() {
  const bpm    = 75;
  const beat   = 60 / bpm;
  const now    = _ctx.currentTime;
  const bars   = 8;

  // Kick pattern
  const kicks  = [0, 2, 4, 6];
  // Hi-hat pattern (every half beat)
  const hats   = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5];
  // Chord tones for pad
  const chords = [261.63, 329.63, 392.00, 523.25]; // C major

  for (let bar = 0; bar < bars; bar++) {
    const barStart = now + bar * 8 * beat;

    // Kick drum (sine burst)
    kicks.forEach(k => _scheduleKick(barStart + k * beat));
    // Hi-hat (short filtered noise burst)
    hats.forEach(h  => _scheduleHat(barStart + h * beat));
    // Soft pad chord
    if (bar % 2 === 0) _schedulePad(chords, barStart, 4 * beat);
  }

  // Restart loop
  const restartTimer = setTimeout(() => {
    if (_playing === 'lofi') _lofiBeats();
  }, bars * 8 * beat * 1000 - 100);
  // Store handle as pseudo-source for cleanup
  _sources.push({ stop: () => clearTimeout(restartTimer) });
}

function _scheduleKick(t) {
  const osc  = _ctx.createOscillator();
  const gain = _ctx.createGain();
  osc.type   = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  gain.gain.setValueAtTime(0.6, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(gain); gain.connect(_gainNode);
  osc.start(t); osc.stop(t + 0.4);
}

function _scheduleHat(t) {
  const bufSize = 512;
  const buf     = _ctx.createBuffer(1, bufSize, _ctx.sampleRate);
  const data    = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src    = _ctx.createBufferSource(); src.buffer = buf;
  const filter = _ctx.createBiquadFilter();
  filter.type  = 'highpass'; filter.frequency.value = 8000;
  const gain   = _ctx.createGain();
  gain.gain.setValueAtTime(0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(filter); filter.connect(gain); gain.connect(_gainNode);
  src.start(t); _sources.push(src);
}

function _schedulePad(freqs, t, duration) {
  freqs.forEach(freq => {
    const osc  = _ctx.createOscillator();
    const gain = _ctx.createGain();
    osc.type   = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.04, t + 0.3);
    gain.gain.setValueAtTime(0.04, t + duration - 0.3);
    gain.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(gain); gain.connect(_gainNode);
    osc.start(t); osc.stop(t + duration);
  });
}

/* Forest — birds chirping + wind */
function _forestSound() {
  _addFilteredNoise(600, 'bandpass', 0.2);  // wind mid
  _addFilteredNoise(150, 'lowpass',  0.15); // wind low
  // Schedule bird chirps
  _scheduleBirds();
}

function _scheduleBirds() {
  const chirp = () => {
    if (_playing !== 'forest') return;
    const freq = 1800 + Math.random() * 1200;
    const osc  = _ctx.createOscillator();
    const gain = _ctx.createGain();
    osc.type   = 'sine';
    osc.frequency.setValueAtTime(freq, _ctx.currentTime);
    osc.frequency.setValueAtTime(freq * 1.15, _ctx.currentTime + 0.05);
    osc.frequency.setValueAtTime(freq, _ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0, _ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, _ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, _ctx.currentTime + 0.15);
    osc.connect(gain); gain.connect(_gainNode);
    osc.start(); osc.stop(_ctx.currentTime + 0.15);
    const next = setTimeout(chirp, 1500 + Math.random() * 3000);
    _sources.push({ stop: () => clearTimeout(next) });
  };
  chirp();
}

/* Café — gentle hubbub with soft background noise */
function _cafeSound() {
  _addFilteredNoise(800,  'bandpass', 0.1);
  _addFilteredNoise(200,  'lowpass',  0.2);
  _addFilteredNoise(3000, 'bandpass', 0.05);
  // Random "clunk" sounds (cups, chairs)
  _scheduleCafeEvents();
}

function _scheduleCafeEvents() {
  const clunk = () => {
    if (_playing !== 'cafe') return;
    const freq = 200 + Math.random() * 300;
    const osc  = _ctx.createOscillator();
    const gain = _ctx.createGain();
    osc.type   = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.07, _ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _ctx.currentTime + 0.3);
    osc.connect(gain); gain.connect(_gainNode);
    osc.start(); osc.stop(_ctx.currentTime + 0.3);
    const next = setTimeout(clunk, 3000 + Math.random() * 7000);
    _sources.push({ stop: () => clearTimeout(next) });
  };
  clunk();
}