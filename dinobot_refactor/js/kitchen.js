/* ══════════════════════════════════════════════════════════
   kitchen.js — Kitchen orders, timers, alert engine
══════════════════════════════════════════════════════════ */

let kitchenOrders = {};
let robotBusy = false;
const _kitchenTransitioning = new Set();

// ── Alert thresholds (minutes) ───────────────────────────
const ALERT = { WARN: 10, LATE: 15, CRIT: 20 };
const WAIT  = { WARN: 5,  CRIT: 9 };
let alertDismissed = false;
let _alertCheckInterval = null;

// ── Sort by placed_at ascending (oldest first) ───────────
function sortedOrders(statusList) {
  return Object.entries(kitchenOrders)
    .filter(([, o]) => statusList.includes(o.status))
    .map(([ref, o]) => ({ ref, ...o }))
    .sort((a, b) => new Date(a.placed_at) - new Date(b.placed_at));
}

function rebuildColumn(colId, refs) {
  const col = document.getElementById(colId);
  refs.forEach(ref => {
    const card = document.getElementById('order-' + ref);
    if (card) col.appendChild(card);
  });
}

function resortColumns() {
  rebuildColumn('kitch-col-new',   sortedOrders(['new']).map(o => o.ref));
  rebuildColumn('kitch-col-prep',  sortedOrders(['prep']).map(o => o.ref));
  rebuildColumn('kitch-col-ready', sortedOrders(['ready','dispatched','delivering']).map(o => o.ref));
  updateColCounts();
}

function updateColCounts() {
  let newC = 0, prepC = 0, readyC = 0;
  Object.values(kitchenOrders).forEach(o => {
    if (o.status === 'new') newC++;
    else if (o.status === 'prep') prepC++;
    else if (['ready','dispatched','delivering'].includes(o.status)) readyC++;
  });
  document.getElementById('count-new').textContent   = newC;
  document.getElementById('count-prep').textContent  = prepC;
  document.getElementById('count-ready').textContent = readyC;
  document.getElementById('empty-new').style.display   = newC   === 0 ? 'block' : 'none';
  document.getElementById('empty-prep').style.display  = prepC  === 0 ? 'block' : 'none';
  document.getElementById('empty-ready').style.display = readyC === 0 ? 'block' : 'none';
}

async function loadKitchenOrders() {
  try {
    const res = await fetch(API_BASE + '/api/orders', {
      method: 'GET',
      headers: authHeaders({ 'Content-Type': 'application/json' })
    });
    if (!res.ok) { showToast('Could not load orders from server'); return; }
    const data = await res.json();
    const incoming = data.orders || [];

    // Remove cancelled cards
    Object.keys(kitchenOrders).forEach(ref => {
      const still = incoming.find(o => o.order_ref === ref);
      const isActiveOnRobot = kitchenOrders[ref] && ['dispatched','delivering'].includes(kitchenOrders[ref].status);
      const shouldRemove = (!still || still.status === 'cancelled') && !isActiveOnRobot;
      if (shouldRemove) {
        const card = document.getElementById('order-' + ref);
        if (card) {
          card.style.transition = 'opacity 0.3s, transform 0.3s';
          card.style.opacity = '0'; card.style.transform = 'translateX(20px)';
          setTimeout(() => card.remove(), 320);
        }
        if (kitchenOrders[ref]?.timerInterval) clearInterval(kitchenOrders[ref].timerInterval);
        if (kitchenOrders[ref]?.waitInterval)  clearInterval(kitchenOrders[ref].waitInterval);
        delete kitchenOrders[ref];
      }
    });

    incoming.forEach(order => {
      if (order.status === 'cancelled') return;

      if (order.status === 'delivered') {
        const card = document.getElementById('order-' + order.order_ref);
        if (card) {
          card.style.transition = 'opacity 0.4s, transform 0.4s';
          card.style.opacity = '0'; card.style.transform = 'translateX(20px)';
          setTimeout(() => card.remove(), 420);
        }
        if (kitchenOrders[order.order_ref]) {
          clearInterval(kitchenOrders[order.order_ref].timerInterval);
          clearInterval(kitchenOrders[order.order_ref].waitInterval);
          delete kitchenOrders[order.order_ref];
        }
        return;
      }

      const existing = kitchenOrders[order.order_ref];
      if (!existing) {
        renderKitchenOrder(order);
        const card = document.getElementById('order-' + order.order_ref);
        if (card) {
          card.style.opacity = '0'; card.style.transform = 'translateY(-12px)';
          card.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
          requestAnimationFrame(() => requestAnimationFrame(() => { card.style.opacity = ''; card.style.transform = ''; }));
        }
      } else if (existing.status !== order.status) {
        if (_kitchenTransitioning.has(order.order_ref)) return;
        if (existing._lastManualUpdate && (Date.now() - existing._lastManualUpdate) < 10000) return;
        if (order.status === 'prep' && order.prep_started_at) existing.prep_started_at = order.prep_started_at;
        updateKitchenOrderStatus(order.order_ref, order.status, order.table_number);
      } else if (order.status === 'prep' && order.prep_started_at && !existing.prep_started_at) {
        existing.prep_started_at = order.prep_started_at;
        if (!existing.timerInterval) restartTimerFromServer(order.order_ref);
      }
    });

    const isRobotBusy = incoming.some(o => ['dispatched', 'delivering'].includes(o.status));
    if (isRobotBusy !== robotBusy) {
      robotBusy = isRobotBusy;
      setAllDispatchButtons(!isRobotBusy);
      if (!isRobotBusy) showToast('⬡ Robot back at dock — ready for next order');
    }

    cleanupOldReadyOrders();
    resortColumns();
  } catch (err) {
    console.error('[loadKitchenOrders]', err);
    showToast('Failed to connect to server');
  }
}

// ── Incoming wait timer ──────────────────────────────────
function startWaitTimer(ref) {
  const order = kitchenOrders[ref];
  if (!order || !order.placed_at) return;
  clearInterval(order.waitInterval);
  order.waitInterval = setInterval(() => {
    if (order.status !== 'new') { clearInterval(order.waitInterval); return; }
    const card = document.getElementById('order-' + ref);
    if (!card) { clearInterval(order.waitInterval); return; }

    const mins = (Date.now() - new Date(order.placed_at).getTime()) / 60000;
    const m = Math.floor(mins), s = Math.floor((mins % 1) * 60);
    const timeStr = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');

    const timerEl = document.getElementById('timer-' + ref);
    const timerLabel = timerEl?.nextElementSibling;
    if (timerEl) {
      timerEl.textContent = timeStr;
      if (timerLabel) timerLabel.textContent = 'wait time';
      timerEl.className = mins >= WAIT.CRIT ? 'ticket-timer late' : mins >= WAIT.WARN ? 'ticket-timer warn' : 'ticket-timer ok';
    }

    card.classList.remove('wait-warn', 'wait-crit');
    if (mins >= WAIT.CRIT) {
      card.classList.add('wait-crit');
      if (currentRole === 'kitchen' && !order._waitCritSpoken) {
        order._waitCritSpoken = true;
        voiceNotAcknowledged(ref, order.table);
        sfxWarn();
      }
    } else if (mins >= WAIT.WARN) {
      card.classList.add('wait-warn');
      if (currentRole === 'kitchen' && !order._waitWarnSpoken) {
        order._waitWarnSpoken = true;
        speak(`Order for table ${order.table} is waiting`);
        sfxWarn();
      }
    }
  }, 1000);
}

// ── Prep timer anchored to server timestamp ──────────────
function restartTimerFromServer(ref) {
  const order = kitchenOrders[ref];
  if (!order || !order.prep_started_at || order.status !== 'prep') return;
  clearInterval(order.timerInterval);
  order.timerInterval = setInterval(() => {
    const el = document.getElementById('timer-' + ref);
    if (!el) { clearInterval(order.timerInterval); return; }

    const elapsed = Math.max(0, Date.now() - new Date(order.prep_started_at).getTime());
    const total = Math.floor(elapsed / 1000);
    const m = Math.floor(total / 60), s = total % 60;
    el.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'00');

    const mins = elapsed / 60000;
    el.className = mins >= ALERT.LATE ? 'ticket-timer late' : mins >= ALERT.WARN ? 'ticket-timer warn' : 'ticket-timer ok';
    updateCardAlertClass(ref, mins);
    updateAgeBadge(ref, mins);

    const timerLabel = el?.nextElementSibling;
    if (mins < ALERT.WARN) {
      const prediction = getKitchenPrediction(ref);
      if (timerLabel && prediction) {
        if (prediction.willBeLateIn <= 3 && prediction.willBeLateIn > 0) {
          timerLabel.textContent = `late in ${Math.ceil(prediction.willBeLateIn)} min`;
          timerLabel.style.color = '#FBB924';
        } else if (prediction.remaining > 0) {
          timerLabel.textContent = `done in ~${Math.ceil(prediction.remaining)} min`;
          timerLabel.style.color = '';
        } else {
          timerLabel.textContent = 'prep time'; timerLabel.style.color = '';
        }
      }
    } else {
      if (timerLabel) { timerLabel.textContent = 'prep time'; timerLabel.style.color = ''; }
    }

    if (currentRole === 'kitchen') {
      if (mins >= ALERT.CRIT && !order._critSpoken) { order._critSpoken = true; voiceOrderCrit(ref, mins); }
      else if (mins >= ALERT.LATE && !order._lateSpoken) { order._lateSpoken = true; voiceOrderLate(ref, mins); }
      else if (mins >= ALERT.WARN && !order._warnSpoken) {
        order._warnSpoken = true; sfxWarn();
        speak(`Order ${ref.replace('ORD-','')} is approaching the time limit`);
      }
    }
  }, 1000);
}

function updateCardAlertClass(ref, mins) {
  const card = document.getElementById('order-' + ref);
  if (!card) return;
  card.classList.remove('order-ticket-warn','order-ticket-late','order-ticket-crit');
  if (mins >= ALERT.CRIT)      card.classList.add('order-ticket-crit');
  else if (mins >= ALERT.LATE) card.classList.add('order-ticket-late');
  else if (mins >= ALERT.WARN) card.classList.add('order-ticket-warn');
}

function updateAgeBadge(ref, mins) {
  const timerEl = document.getElementById('timer-' + ref);
  if (!timerEl) return;
  if (mins >= ALERT.LATE)      timerEl.className = 'ticket-timer late';
  else if (mins >= ALERT.WARN) timerEl.className = 'ticket-timer warn';
  else                          timerEl.className = 'ticket-timer ok';
}

// ── Global alert bar ─────────────────────────────────────
function runAlertEngine() {
  let warnCount = 0, lateCount = 0, critCount = 0;
  Object.entries(kitchenOrders).forEach(([ref, order]) => {
    if (order.status === 'prep' && order.prep_started_at) {
      const mins = (Date.now() - new Date(order.prep_started_at).getTime()) / 60000;
      if (mins >= ALERT.CRIT)      critCount++;
      else if (mins >= ALERT.LATE) lateCount++;
      else if (mins >= ALERT.WARN) warnCount++;
    }
    if (order.status === 'new' && order.placed_at) {
      const mins = (Date.now() - new Date(order.placed_at).getTime()) / 60000;
      if (mins >= WAIT.CRIT)      critCount++;
      else if (mins >= WAIT.WARN) warnCount++;
    }
  });

  const total = critCount + lateCount + warnCount;
  const bar   = document.getElementById('kitchen-alert-bar');
  const vign  = document.getElementById('crit-vignette');
  const icon  = document.getElementById('alert-bar-icon');
  const text  = document.getElementById('alert-bar-text');
  const count = document.getElementById('alert-bar-count');

  if (total === 0) {
    bar?.classList.remove('show','level-warn','level-late','level-crit');
    vign?.classList.remove('show');
    alertDismissed = false;
    return;
  }

  let level = critCount > 0 ? 'crit' : lateCount > 0 ? 'late' : 'warn';
  if (vign) vign.classList.toggle('show', level === 'crit');

  if (!alertDismissed && bar) {
    bar.classList.add('show');
    bar.classList.remove('level-warn','level-late','level-crit');
    bar.classList.add('level-' + level);
    if (icon)  icon.textContent  = level === 'crit' ? '🛑' : level === 'late' ? '⚠' : '⚡';
    if (count) count.textContent = total + (total === 1 ? ' ORDER' : ' ORDERS');
    if (text) {
      if (critCount > 0 && lateCount > 0) text.textContent = `${critCount} CRITICAL · ${lateCount} LATE — IMMEDIATE ACTION REQUIRED`;
      else if (critCount > 0) text.textContent = `${critCount} ORDER${critCount > 1 ? 'S' : ''} NEED IMMEDIATE ATTENTION`;
      else if (lateCount > 0) text.textContent = `${lateCount} ORDER${lateCount > 1 ? 'S' : ''} PAST TARGET PREP TIME`;
      else text.textContent = `${warnCount} ORDER${warnCount > 1 ? 'S' : ''} WAITING TOO LONG`;
    }
  }
  if (critCount > 0) playCritAlert();
}

function dismissAlertBar() {
  alertDismissed = true;
  document.getElementById('kitchen-alert-bar')?.classList.remove('show');
  setTimeout(() => { alertDismissed = false; }, 120000);
}

function startAlertEngine() {
  if (_alertCheckInterval) clearInterval(_alertCheckInterval);
  _alertCheckInterval = setInterval(runAlertEngine, 5000);
  runAlertEngine();
}

function startKitchenRobotPolling() {
  if (window._kitchenRobotPoll) clearInterval(window._kitchenRobotPoll);
  window._kitchenRobotPoll = setInterval(async () => {
    try {
      const res  = await fetch(API_BASE + '/api/robot/status');
      const data = await res.json();
      window._pythonOnline = true;

      const stateLabels = { 'MOVING_TO_TABLE':'● EN ROUTE', 'DELIVERING':'● DELIVERING', 'RETURNING':'● RETURNING', 'IDLE':'● DOCKED' };
      const kitchState = document.getElementById('kitch-robot-state');
      const kitchDest  = document.getElementById('kitch-robot-dest');
      const kitchBat   = document.getElementById('kitch-robot-bat');
      const kitchEta   = document.getElementById('kitch-robot-eta');
      if (kitchState) kitchState.textContent = stateLabels[data.state] || '● ' + data.state;
      if (kitchDest)  kitchDest.textContent  = data.target_table ? 'Table ' + data.target_table : '—';
      if (kitchBat)   kitchBat.textContent   = data.battery + '%';
      if (kitchEta) {
        if (data.state === 'IDLE')            kitchEta.textContent = '—';
        else if (data.state === 'DELIVERING') kitchEta.textContent = 'Arrived';
        else if (data.state === 'RETURNING')  kitchEta.textContent = '~1 min';
        else                                   kitchEta.textContent = '~2 min';
      }
      const isNowBusy = ['MOVING_TO_TABLE','DELIVERING'].includes(data.state);
      robotBusy = isNowBusy;
      setAllDispatchButtons(!isNowBusy);
    } catch {
      if (window._pythonOnline !== false) {
        window._pythonOnline = false;
        document.querySelectorAll('[data-dispatch="true"]').forEach(btn => {
          btn.disabled = true; btn.style.opacity = '0.4'; btn.style.pointerEvents = 'none';
          btn.title = 'Robot server offline';
        });
      }
    }
  }, 1000);
}

// ── Status transitions ───────────────────────────────────
function updateKitchenOrderStatus(ref, newStatus, tableNum) {
  const order = kitchenOrders[ref];
  if (!order) return;
  const card = document.getElementById('order-' + ref);
  if (!card) return;
  if (order.status === newStatus) return;
  order.status = newStatus;
  _kitchenTransitioning.add(ref);

  card.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
  card.style.opacity = '0'; card.style.transform = 'scale(0.97)';

  setTimeout(() => {
    const baseClass = 'order-ticket order-ticket-' + (
      newStatus === 'prep' ? 'prep' :
      newStatus === 'ready' ? 'ready' :
      ['dispatched','delivering'].includes(newStatus) ? 'sent' : 'new'
    );
    const alertClasses = ['order-ticket-warn','order-ticket-late','order-ticket-crit'].filter(c => card.classList.contains(c));
    card.className = baseClass + (alertClasses.length ? ' ' + alertClasses.join(' ') : '');

    const btn = card.querySelector('.ticket-action');
    if (btn) {
      if (newStatus === 'prep') {
        btn.className = 'ticket-action ticket-action-prep';
        btn.textContent = '✓ Mark as Ready';
        btn.setAttribute('onclick', `setOrderStatus('${ref}','ready')`);
        btn.removeAttribute('id'); btn.removeAttribute('data-dispatch');
      } else if (newStatus === 'ready') {
        btn.className = 'ticket-action ticket-action-prep';
        btn.setAttribute('id', 'action-' + ref);
        btn.setAttribute('data-dispatch', 'true');
        btn.setAttribute('onclick', `dispatchRobot('${ref}', ${tableNum})`);
        btn.textContent = `🤖 Dispatch Robot → Table ${tableNum}`;
      } else if (['dispatched','delivering'].includes(newStatus)) {
        btn.className = 'ticket-action ticket-action-status';
        btn.setAttribute('id', 'action-' + ref);
        btn.removeAttribute('data-dispatch'); btn.removeAttribute('onclick');
        btn.textContent = newStatus === 'delivering' ? '⬡ Robot Delivering...' : '⬡ Robot Dispatched';
      }
    }

    const colId = newStatus === 'prep' ? 'kitch-col-prep' :
                  ['ready','dispatched','delivering'].includes(newStatus) ? 'kitch-col-ready' : 'kitch-col-new';
    const targetCol = document.getElementById(colId);
    if (card.parentElement !== targetCol) targetCol.appendChild(card);

    if (newStatus === 'prep' && order.prep_started_at) restartTimerFromServer(ref);

    if (newStatus !== 'new' && order.waitInterval) {
      clearInterval(order.waitInterval); order.waitInterval = null;
      const timerEl = document.getElementById('timer-' + ref);
      const timerLabel = timerEl?.nextElementSibling;
      if (timerEl) { timerEl.textContent = '—:——'; timerEl.className = 'ticket-timer idle'; }
      if (timerLabel) timerLabel.textContent = 'prep time';
      card.classList.remove('wait-warn', 'wait-crit');
    }

    if (['ready','dispatched','delivering'].includes(newStatus)) {
      const timerLabel = document.getElementById('timer-' + ref)?.nextElementSibling;
      if (timerLabel) { timerLabel.textContent = 'prep time'; timerLabel.style.color = ''; }
      card.classList.remove('order-ticket-warn','order-ticket-late','order-ticket-crit');
    }

    card.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.style.opacity = ''; card.style.transform = '';
      _kitchenTransitioning.delete(ref);
      resortColumns();
    }));
  }, 220);
}

function renderKitchenOrder(order) {
  const ref = order.order_ref;
  const status = order.status || 'new';
  const table = order.table_number;
  if (status === 'cancelled') return;
  if (document.getElementById('order-' + ref)) return;

  kitchenOrders[ref] = {
    ref, status, table,
    placed_at: order.placed_at || new Date().toISOString(),
    prep_started_at: order.prep_started_at || null,
    timerInterval: null, waitInterval: null
  };

  const itemLines = (order.items || []).map(i =>
    `<div class="ticket-item-row"><span class="ticket-item-qty">${i.qty}×</span>${i.emoji || ''} ${i.name}</div>`
  ).join('');

  const placedDate = new Date(order.placed_at || Date.now());
  const timeStr = placedDate.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  let colId, ticketClass, actionHtml;
  if (status === 'new') {
    colId = 'kitch-col-new'; ticketClass = 'order-ticket order-ticket-new';
    actionHtml = `<button class="ticket-action ticket-action-new" onclick="setOrderStatus('${ref}','prep')">▶ Start Preparing</button>`;
  } else if (status === 'prep') {
    colId = 'kitch-col-prep'; ticketClass = 'order-ticket order-ticket-prep';
    actionHtml = `<button class="ticket-action ticket-action-prep" onclick="setOrderStatus('${ref}','ready')">✓ Mark as Ready</button>`;
  } else if (status === 'ready') {
    colId = 'kitch-col-ready'; ticketClass = 'order-ticket order-ticket-ready';
    const dispatchDisabled = !window._pythonOnline;
    actionHtml = `<button class="ticket-action ticket-action-prep" id="action-${ref}" data-dispatch="true" onclick="dispatchRobot('${ref}',${table})" ${dispatchDisabled ? 'disabled style="opacity:0.4;pointer-events:none;"' : ''}>🤖 Dispatch Robot → Table ${table}</button>`;
  } else {
    colId = 'kitch-col-ready'; ticketClass = 'order-ticket order-ticket-sent';
    actionHtml = `<button class="ticket-action ticket-action-prep" id="action-${ref}" data-dispatch="true" onclick="dispatchRobot('${ref}',${table})" style="font-size:10px;">🔄 RE-DISPATCH ROBOT → Table ${table}</button>`;
  }

  const card = document.createElement('div');
  card.className = ticketClass; card.id = 'order-' + ref;
  card.innerHTML = `
    <div class="ticket-top">
      <div class="ticket-id-block">
        <span class="ticket-id">${ref}</span>
        <span class="ticket-table">Table ${table}</span>
      </div>
      <div>
        <div class="ticket-timer idle" id="timer-${ref}">—:——</div>
        <div class="ticket-timer-label">prep time</div>
      </div>
    </div>
    <div class="ticket-items">${itemLines || '<span style="color:var(--text-dim)">No items</span>'}</div>
    <div class="ticket-received">Received ${timeStr}</div>
    ${actionHtml}`;

  document.getElementById(colId).appendChild(card);
  if (status === 'prep' && order.prep_started_at) restartTimerFromServer(ref);
  if (status === 'new') startWaitTimer(ref);
}

async function setOrderStatus(ref, newStatus) {
  const order = kitchenOrders[ref];
  if (!order || order.status === newStatus) return;
  if (_kitchenTransitioning.has(ref)) return;

  if (newStatus === 'prep') order.prep_started_at = new Date().toISOString();
  order._lastManualUpdate = Date.now();

  updateKitchenOrderStatus(ref, newStatus, order.table);

  if (newStatus === 'prep') {
    showToast('▶ Order ' + ref + ' — Now preparing');
    addActivity('dot-status', `Kitchen started preparing <strong>${ref}</strong>`);
  } else if (newStatus === 'ready') {
    if (kitchenOrders[ref]) clearInterval(kitchenOrders[ref].timerInterval);
    const timerEl = document.getElementById('timer-' + ref);
    if (timerEl) timerEl.className = 'ticket-timer ok';
    showToast('✓ Order ' + ref + ' ready for pickup');
    addActivity('dot-status', `Order <strong>${ref}</strong> marked READY`);
    sfxOrderReady();
    recordPrepTime(ref);
  }

  try {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(API_BASE + '/api/orders/' + ref + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok && newStatus === 'prep') {
      const d = await res.json();
      if (d.prep_started_at && kitchenOrders[ref]) {
        kitchenOrders[ref].prep_started_at = d.prep_started_at;
        kitchenOrders[ref]._lastManualUpdate = Date.now();
        restartTimerFromServer(ref);
      }
    }
  } catch (err) { console.error('[setOrderStatus patch]', err); }
}

async function dispatchRobot(ref, tableNum) {
  if (!window._pythonOnline) { showToast('✗ Robot server offline — start the Python script first'); return; }
  if (robotBusy) { showToast('⬡ Robot is busy — wait for it to return to dock'); return; }
  const btn = document.getElementById('action-' + ref);
  if (btn) { btn.disabled = true; btn.textContent = '⬡ Dispatching...'; btn.className = 'ticket-action ticket-action-status'; }
  try {
    const res = await fetch(API_BASE + '/api/orders/' + ref + '/status', {
      method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: 'dispatched' })
    });
    if (!res.ok) throw new Error('Failed to update order');
    const robotRes = await fetch(`${API_BASE}/api/robot/dispatch`, {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ order_ref: ref, table_number: tableNum })
    });
    if (!robotRes.ok) throw new Error('Robot rejected dispatch');
    robotBusy = true; setAllDispatchButtons(false);
    if (btn) btn.textContent = '⬡ Robot En Route';
    showToast('🤖 Robot dispatched → Table ' + tableNum);
    addActivity('dot-robot', `Robot dispatched for <strong>${ref}</strong> → Table ${tableNum}`);
    sfxDispatched();
  } catch(err) {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 Dispatch Robot → Table ' + tableNum; btn.className = 'ticket-action ticket-action-prep'; }
    showToast('✗ ' + (err.message || 'Failed to dispatch robot'));
  }
}

function setAllDispatchButtons(enabled) {
  document.querySelectorAll('[id^="action-"]').forEach(btn => {
    const isDispatchBtn = btn.dataset.dispatch === 'true' || btn.textContent.includes('Dispatch Robot') || btn.textContent.includes('RE-DISPATCH');
    if (isDispatchBtn) {
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '1' : '0.4';
      btn.style.pointerEvents = enabled ? '' : 'none';
      btn.title = enabled ? '' : 'Robot is busy';
      if (!enabled) btn.dataset.dispatch = 'true';
    }
  });
  const resetBtn = document.getElementById('reset-stuck-btn');
  if (resetBtn) { resetBtn.disabled = false; resetBtn.style.opacity = '1'; resetBtn.style.pointerEvents = 'auto'; resetBtn.style.cursor = 'pointer'; resetBtn.title = ''; }
}

async function resetStuckOrders() {
  let stuckRefs = Object.entries(kitchenOrders)
    .filter(([, o]) => ['dispatched','delivering'].includes(o.status))
    .map(([ref]) => ref);

  if (stuckRefs.length === 0) {
    try {
      const endpoint = currentRole === 'manager' ? '/api/orders/all' : '/api/orders';
      const res = await fetch(API_BASE + endpoint, { headers: authHeaders({ 'Content-Type': 'application/json' }) });
      const data = await res.json();
      stuckRefs = (data.orders || []).filter(o => ['dispatched','delivering'].includes(o.status)).map(o => o.order_ref);
    } catch { showToast('✗ Could not fetch orders'); return; }
  }

  if (stuckRefs.length === 0) { showToast('⬡ No stuck orders to reset'); return; }
  console.log('[resetStuck] Found stuck orders:', stuckRefs);

  for (const ref of stuckRefs) {
    try {
      await fetch(API_BASE + '/api/orders/stuck', {
        method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ order_ref: ref, table_number: kitchenOrders[ref]?.table, reason: 'Manual reset by manager', status_at_reset: kitchenOrders[ref]?.status })
      });
      await fetch(API_BASE + '/api/orders/' + ref + '/status', {
        method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: 'cancelled' })
      });
    } catch (e) { console.warn('[resetStuck] Failed for', ref, e); }

    const card = document.getElementById('order-' + ref);
    if (card) {
      card.style.transition = 'opacity 0.3s, transform 0.3s'; card.style.opacity = '0'; card.style.transform = 'translateX(20px)';
      setTimeout(() => card.remove(), 320);
    }
    if (kitchenOrders[ref]) { clearInterval(kitchenOrders[ref].timerInterval); clearInterval(kitchenOrders[ref].waitInterval); }
    delete kitchenOrders[ref];
  }

  robotBusy = false; setAllDispatchButtons(true);
  try { await fetch(API_BASE + '/api/robot/recall', { method: 'POST' }); } catch {}
  setTimeout(() => resortColumns(), 400);
  showToast(`⬡ ${stuckRefs.length} stuck order(s) logged and removed`);
}

function cleanupOldReadyOrders() {
  Object.entries(kitchenOrders).forEach(([ref, order]) => {
    if (order.status === 'delivered') {
      const age = (Date.now() - new Date(order.placed_at).getTime()) / 60000;
      if (age > 30 && !robotBusy) {
        const card = document.getElementById('order-' + ref);
        if (card) { card.style.transition = 'opacity 0.3s'; card.style.opacity = '0'; setTimeout(() => card.remove(), 300); }
        if (order.timerInterval) clearInterval(order.timerInterval);
        if (order.waitInterval)  clearInterval(order.waitInterval);
        delete kitchenOrders[ref];
      }
    }
  });
}

function addActivity(dot, msg) {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;
  const now = new Date();
  const t = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2,'0')).join(':');
  const item = document.createElement('div');
  item.className = 'activity-item new';
  item.innerHTML = `<div class="activity-dot ${dot}"></div><div><div class="activity-msg">${msg}</div><div class="activity-time">TODAY ${t}</div></div>`;
  feed.insertBefore(item, feed.firstChild);
}