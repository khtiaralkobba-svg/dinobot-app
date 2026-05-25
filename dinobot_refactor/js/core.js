/* ══════════════════════════════════════════════════════════
   core.js — Config, utilities, page routing, auth, theme
══════════════════════════════════════════════════════════ */

/* ── API CONFIG ──────────────────────────────────────────── */
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : 'https://dinobot-app.onrender.com';

function getAccessToken() { return sessionStorage.getItem('accessToken'); }
function authHeaders(extra = {}) {
  const token = getAccessToken();
  return { ...extra, ...(token ? { 'Authorization': 'Bearer ' + token } : {}) };
}

/* ── THEME ───────────────────────────────────────────────── */
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  document.documentElement.classList.remove('light-mode-early');
  sessionStorage.setItem('dinobotTheme', isLight ? 'light' : 'dark');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = isLight ? '🌙 DARK' : '☀ LIGHT';
}

(function applyStoredTheme() {
  if (sessionStorage.getItem('dinobotTheme') === 'light') {
    document.body.classList.add('light-mode');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = '🌙 DARK';
  }
})();

/* ── LOADER ──────────────────────────────────────────────── */
window.addEventListener('load', () => {
  const loader = document.getElementById('cine-loader');
  setTimeout(() => {
    loader.classList.add('out');
    setTimeout(() => loader.style.display = 'none', 800);
  }, 2800);
});

/* ── CURSOR ──────────────────────────────────────────────── */
const cursor = document.getElementById('cursor');
const ring   = document.getElementById('cursorRing');
let mx = 0, my = 0, crx = 0, cry = 0;
document.addEventListener('mousemove', e => {
  mx = e.clientX; my = e.clientY;
  cursor.style.left = (mx - 6) + 'px';
  cursor.style.top  = (my - 6) + 'px';
});
(function lagRing() {
  crx += (mx - crx) * 0.1;
  cry += (my - cry) * 0.1;
  ring.style.left = (crx - 16) + 'px';
  ring.style.top  = (cry - 16) + 'px';
  requestAnimationFrame(lagRing);
})();

/* ── PAGE SWITCH ─────────────────────────────────────────── */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(name).classList.add('active');
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  document.getElementById('nav-' + name)?.classList.add('active');
  window.scrollTo(0, 0);
}

/* ── CLOCK ───────────────────────────────────────────────── */
function updateClock() {
  const now = new Date();
  const t = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
  const el = document.getElementById('clock');
  if (el) el.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + '  //  ' + t;
}
setInterval(updateClock, 1000);
updateClock();

/* ── TOAST ───────────────────────────────────────────────── */
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<span>⬡</span> ' + msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ── COUNTER ANIMATION ───────────────────────────────────── */
function animateCounter(id, target, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  let start = 0;
  const step = target / (duration / 16);
  const timer = setInterval(() => {
    start = Math.min(start + step, target);
    el.textContent = Math.floor(start);
    if (start >= target) clearInterval(timer);
  }, 16);
}

/* ── LOAD HOME STATS ─────────────────────────────────────── */
setTimeout(async () => {
  if (!sessionStorage.getItem('accessToken')) {
    animateCounter('counter-1', 0, 800);
    animateCounter('counter-2', 0, 800);
    animateCounter('counter-3', 0, 800);
    return;
  }
  try {
    const res = await fetch(API_BASE + '/api/orders/all', {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('accessToken')}` }
    });
    if (!res.ok) {
      animateCounter('counter-1', 0, 800);
      animateCounter('counter-2', 0, 800);
      animateCounter('counter-3', 0, 800);
      return;
    }
    const data = await res.json();
    const orders = data.orders || [];
    const today = new Date().toDateString();

    const deliveredToday = orders.filter(o =>
      o.status === 'delivered' && new Date(o.placed_at).toDateString() === today
    ).length;

    const deliveredWithTimes = orders.filter(o =>
      o.status === 'delivered' && o.placed_at && o.delivered_at
    );
    const avgDelivery = deliveredWithTimes.length
      ? Math.round(deliveredWithTimes.reduce((sum, o) =>
          sum + (new Date(o.delivered_at) - new Date(o.placed_at)) / 60000, 0
        ) / deliveredWithTimes.length)
      : 0;

    const tablesServed = new Set(
      orders.filter(o => new Date(o.placed_at).toDateString() === today).map(o => o.table_number)
    ).size;

    animateCounter('counter-1', deliveredToday || 0, 1200);
    animateCounter('counter-2', avgDelivery || 0, 800);
    animateCounter('counter-3', tablesServed || 0, 1000);
  } catch {
    animateCounter('counter-1', 0, 800);
    animateCounter('counter-2', 0, 800);
    animateCounter('counter-3', 0, 800);
  }
}, 3200);

/* ── SPEECH HELPERS ──────────────────────────────────────── */
function speak(text, { rate = 1.05, pitch = 1.0, volume = 0.9, priority = false } = {}) {
  if (!window.speechSynthesis) return;
  if (priority) _voiceQueue.unshift(text);
  else          _voiceQueue.push(text);
  _drainVoiceQueue();
}

const _voiceQueue = [];
let _voiceBusy = false;

function _drainVoiceQueue() {
  if (_voiceBusy || _voiceQueue.length === 0) return;
  _voiceBusy = true;
  const text = _voiceQueue.shift();
  const utt  = new SpeechSynthesisUtterance(text);
  utt.rate = 1.05; utt.pitch = 1.0; utt.volume = 0.9;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
  ) || voices.find(v => v.lang.startsWith('en')) || null;
  if (preferred) utt.voice = preferred;
  utt.onend = utt.onerror = () => { _voiceBusy = false; setTimeout(_drainVoiceQueue, 900); };
  window.speechSynthesis.speak(utt);
}

if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

/* ── AUDIO CONTEXT ───────────────────────────────────────── */
const SFX_VOL = 0.18;
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playTones(notes) {
  try {
    const ctx = getAudioCtx();
    let t = ctx.currentTime;
    notes.forEach(({ freq, duration, type = 'sine', vol = SFX_VOL }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.start(t); osc.stop(t + duration);
      t += duration;
    });
  } catch(e) {}
}

function sfxNewOrder()  { playTones([{freq:523,duration:0.08},{freq:659,duration:0.08},{freq:784,duration:0.18}]); }
function sfxOrderReady(){ playTones([{freq:784,duration:0.10},{freq:1047,duration:0.22}]); }
function sfxDispatched(){ playTones([{freq:440,duration:0.06,type:'square',vol:0.06},{freq:660,duration:0.06,type:'square',vol:0.06},{freq:880,duration:0.10,type:'square',vol:0.06}]); }
function sfxWarn()      { playTones([{freq:440,duration:0.15,type:'triangle',vol:0.10}]); }

let _lastCritSound = 0;
function playCritAlert() {
  const now = Date.now();
  if (now - _lastCritSound < 30000) return;
  _lastCritSound = now;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18, 0.36].forEach((delay, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(880 - i * 110, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.14);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    });
  } catch(e) {}
}

setInterval(() => {
  fetch(API_BASE + '/health').catch(() => {});
}, 840000); // 14 minutes

/* ── VOICE BUILDERS ──────────────────────────────────────── */
function voiceNewOrder(orderRef, tableNum) { speak(`New order for table ${tableNum}`); }
function voiceOrderReady(orderRef) { speak(`Order ${orderRef.replace('ORD-', '')} is ready for pickup`); }
function voiceOrderLate(orderRef, mins) { speak(`Order ${orderRef.replace('ORD-', '')} is late — ${Math.round(mins)} minutes and counting`, { priority: true }); }
function voiceOrderCrit(orderRef, mins) { speak(`Urgent. Order ${orderRef.replace('ORD-', '')} needs immediate attention`, { priority: true }); }
function voiceNotAcknowledged(orderRef, tableNum) { speak(`Order for table ${tableNum} has not been acknowledged`, { priority: true }); }