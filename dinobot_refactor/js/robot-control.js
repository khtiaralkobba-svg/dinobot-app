/* ══════════════════════════════════════════════════════════
   robot-control.js — E-Stop, dispatch, recall, manual control
══════════════════════════════════════════════════════════ */

/* ── E-STOP ──────────────────────────────────────────────── */
function toggleEStop() {
  eStopActive = !eStopActive;
  const btn     = document.getElementById('estop-btn');
  const warning = document.getElementById('estop-warning');

  if (eStopActive) {
    btn.classList.add('active');
    btn.innerHTML = '<span>🛑</span> EMERGENCY STOP ENGAGED — CLICK TO RELEASE <span>🛑</span>';
    warning.classList.add('show');
    setRobotState('EMERGENCY STOP', '—', '#ef4444');
    document.getElementById('speed-val').textContent = '0 cm/s';
    document.getElementById('speed-bar').style.width = '0%';
    addActivity('dot-system', '🛑 <strong>EMERGENCY STOP</strong> activated');
    // ✅ FIX
    fetch(API_BASE + '/api/robot/stop', { method: 'POST', headers: authHeaders() }).catch(() => {});
  } else {
    btn.classList.remove('active');
    btn.innerHTML = '<span class="estop-icon">🛑</span> EMERGENCY STOP — ALL UNITS <span class="estop-icon">🛑</span>';
    warning.classList.remove('show');
    setRobotState('RETURNING TO DOCK', '—', '#60A5FA');
    targetX = dockX; targetY = dockY; robotState = 'RETURNING'; currentTarget = null;
    document.querySelectorAll('.dispatch-btn').forEach(b => b.classList.remove('active'));
    addActivity('dot-system', '✓ Emergency stop <strong>released</strong> — returning to dock');
    // ✅ FIX
    fetch(API_BASE + '/api/robot/recall', { method: 'POST', headers: authHeaders() }).catch(() => {});
  }
}

/* ── DISPATCH ────────────────────────────────────────────── */
let _dispatching = false;
async function dispatch(tableId) {
  if (eStopActive) { showToast('⚠ EMERGENCY STOP ACTIVE'); return; }
  if (_dispatching) { showToast('⬡ Already dispatching...'); return; }
  _dispatching = true;

  let orderRef = null;
  try {
    const ordRes  = await fetch(API_BASE + '/api/orders', { headers: authHeaders({ 'Content-Type': 'application/json' }) });
    const ordData = await ordRes.json();
    const readyOrder = (ordData.orders || []).find(o => o.table_number === tableId && o.status === 'ready');
    if (readyOrder) {
      orderRef = readyOrder.order_ref;
      await fetch(API_BASE + '/api/orders/' + orderRef + '/status', {
        method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: 'dispatched' })
      });
    }
  } catch {}

  try {
    console.log('Dispatching:', { table_number: tableId, order_ref: orderRef });
    // ✅ FIX
    const res = await fetch(API_BASE + '/api/robot/dispatch', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ table_number: tableId, order_ref: orderRef })
    });
    const errData = await res.json().catch(() => ({}));
    if (!res.ok) { showToast('⬡ ' + (errData.error || 'Robot unavailable')); return; }
  } catch { showToast('✗ Cannot reach robot server'); _dispatching = false; return; }

  document.querySelectorAll('.dispatch-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.dispatch-btn')[tableId - 1]?.classList.add('active');
  currentTarget = tables.find(t => t.id === tableId) || null;
  if (currentTarget) { targetX = currentTarget.x; targetY = currentTarget.y; }
  robotState = 'DISPATCHED'; robotBusy = true; setAllDispatchButtons(false);
  addActivity('dot-robot', `UNIT-01 dispatched to <strong>Table ${tableId}</strong>`);
  showToast('⬡ UNIT-01 dispatched → Table ' + tableId);
  recordDispatch();
  setTimeout(() => { _dispatching = false; }, 3000);
}

/* ── RECALL ──────────────────────────────────────────────── */
function recallUnit() {
  if (eStopActive) { showToast('⚠ EMERGENCY STOP ACTIVE'); return; }
  targetX = dockX; targetY = dockY; robotState = 'RETURNING'; currentTarget = null;
  document.querySelectorAll('.dispatch-btn').forEach(b => b.classList.remove('active'));
  setRobotState('RETURNING TO DOCK', 'Dock', '#60A5FA');
  document.getElementById('speed-val').textContent = '95 cm/s';
  document.getElementById('speed-bar').style.width = '90%';
  addActivity('dot-robot', 'UNIT-01 recalled to <strong>Dock</strong>');
  showToast('⬡ UNIT-01 recalling to dock');
  // ✅ FIX
  fetch(API_BASE + '/api/robot/recall', { method: 'POST', headers: authHeaders() }).catch(() => {});
}

/* ── PAUSE ───────────────────────────────────────────────── */
function pauseUnit() {
  if (eStopActive) return;
  paused = !paused;
  if (paused && robotState === 'DOCKED') { paused = false; showToast('⬡ Nothing to pause'); return; }
  const btn = document.getElementById('pause-btn');
  if (paused) {
    btn.textContent = '⬡ RESUME UNIT';
    setRobotState('PAUSED', document.getElementById('dest-label').textContent, '#FBB924');
    document.getElementById('speed-val').textContent = '0 cm/s';
    document.getElementById('speed-bar').style.width = '0%';
    addActivity('dot-status', 'UNIT-01 <strong>paused</strong>');
    // ✅ FIX
    fetch(API_BASE + '/api/robot/pause', { method: 'POST', headers: authHeaders() }).catch(() => {});
  } else {
    btn.textContent = '⬡ PAUSE UNIT';
    addActivity('dot-status', 'UNIT-01 <strong>resumed</strong>');
    // ✅ FIX
    fetch(API_BASE + '/api/robot/resume', { method: 'POST', headers: authHeaders() }).catch(() => {});
  }
}

/* ── ROBOT ALARM BANNER ──────────────────────────────────── */
function showRobotAlarm() {
  const banner = document.getElementById('robot-alarm-banner');
  if (!banner) return;
  banner.classList.remove('hiding');
  banner.classList.add('show');
}

function dismissRobotAlarm() {
  const banner = document.getElementById('robot-alarm-banner');
  if (!banner) return;
  banner.classList.add('hiding');
  setTimeout(() => banner.classList.remove('show', 'hiding'), 400);
}

/* ── MANUAL CONTROL ──────────────────────────────────────── */
let manualActive = false;

function toggleManual() {
  manualActive = !manualActive;
  const toggle = document.getElementById('manual-toggle');
  const dpad   = document.getElementById('dpad');

  if (manualActive) {
    toggle.classList.add('active'); toggle.textContent = '⬡ MANUAL CONTROL ACTIVE';
    dpad.style.opacity = '1'; dpad.style.pointerEvents = 'auto';
    setRobotState('MANUAL OVERRIDE', 'Operator', '#FBB924');
    // ✅ FIX
    fetch(API_BASE + '/api/robot/manual/start', { method: 'POST', headers: authHeaders() }).catch(() => {});
    fetch(API_BASE + '/api/robot-stats/manual', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ triggered_by: 'manager' }) }).catch(() => {});
  } else {
    toggle.classList.remove('active'); toggle.textContent = '⬡ ENABLE MANUAL CONTROL';
    dpad.style.opacity = '0.35'; dpad.style.pointerEvents = 'none';
    stopMove();
    // ✅ FIX
    fetch(API_BASE + '/api/robot/manual/stop', { method: 'POST', headers: authHeaders() }).catch(() => {});
    setRobotState('DOCKED — STANDBY', '—', '#4ADE80');
  }
}

function moveRobot(dir) {
  if (!manualActive) return;
  const speedLevel = parseInt(document.getElementById('manual-speed')?.value || 2);
  document.getElementById('speed-val').textContent = (speedLevel * 12) + ' cm/s';
  document.getElementById('speed-bar').style.width = (speedLevel * 18) + '%';
  const angles = { up: -Math.PI/2, down: Math.PI/2, left: Math.PI, right: 0 };
  robotAngle = angles[dir] ?? robotAngle;
  targetX = robotX; targetY = robotY;
  // ✅ FIX
  fetch(API_BASE + '/api/robot/manual/move', {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ direction: dir, speed: speedLevel })
  }).catch(() => {});
}

let manualTimer = null;

function startMove(dir) {
  if (!manualActive) return;
  highlightDpad(dir, true); moveRobot(dir);
  clearInterval(manualTimer);
  manualTimer = setInterval(() => moveRobot(dir), 100);
}

function stopMove() {
  clearInterval(manualTimer); manualTimer = null;
  highlightDpad(null, false);
  if (manualActive) {
    // ✅ FIX
    fetch(API_BASE + '/api/robot/manual/move', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ direction: 'stop', speed: 1 })
    }).catch(() => {});
  }
}

function manualStop() {
  stopMove();
  // ✅ FIX
  fetch(API_BASE + '/api/robot/manual/move', {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ direction: 'stop', speed: 1 })
  }).catch(() => {});
  showToast('⬡ Manual stop');
}

function highlightDpad(dir, on) {
  ['up','down','left','right'].forEach(d => {
    const btn = document.getElementById('btn-' + d);
    if (btn) btn.classList.toggle('pressed', on && d === dir);
  });
}

/* ── KEYBOARD CONTROL ────────────────────────────────────── */
const keyMap   = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right' };
const keysHeld = {};

document.addEventListener('keydown', e => {
  if (!manualActive) return;
  const dir = keyMap[e.key];
  if (dir && !keysHeld[e.key]) { keysHeld[e.key] = true; startMove(dir); e.preventDefault(); }
});
document.addEventListener('keyup', e => {
  const dir = keyMap[e.key];
  if (dir) { keysHeld[e.key] = false; if (!Object.values(keysHeld).some(Boolean)) stopMove(); }
});

/* ── SPEED SLIDER ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const slider = document.getElementById('manual-speed');
  if (slider) slider.addEventListener('input', () => {
    document.getElementById('manual-speed-label').textContent = '×' + slider.value;
  });
});