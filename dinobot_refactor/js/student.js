/* ══════════════════════════════════════════════════════════
   student.js — Student ordering flow, tracking, pickup
══════════════════════════════════════════════════════════ */

/* ── MENU DATA ───────────────────────────────────────────── */
let MENU_ITEMS = [];

async function loadMenuItems() {
  try {
    const res = await fetch(API_BASE + '/api/menu');
    const data = await res.json();
    MENU_ITEMS = (data.items || []).map(item => ({
      id: item.id,
      cat: item.cat,
      emoji: item.emoji,
      name: item.name,
      desc: item.description,
      price: Number(item.price)
    }));
  } catch {
    // fallback to empty
  }
}

/* ── STATE ───────────────────────────────────────────────── */
let studentStep     = 1;
let selectedTable   = null;
let cart            = {};
let activeMenuCat   = 'All';
let sessionOrders   = [];
let activeTrackingRef = null;
let trackMapFrame   = null;
let trackingInterval = null;

const STATUS_LABEL = {
  new:'Received', prep:'Preparing', ready:'Ready', dispatched:'Dispatched',
  delivering:'Delivering', delivered:'Delivered', cancelled:'Cancelled'
};
const STATUS_ETA = {
  new:'Calculating...', prep:'~5 min', ready:'~2 min', dispatched:'~1 min',
  delivering:'Arrived!', delivered:'Delivered ✓', cancelled:'Cancelled'
};

/* ── INIT TABLE GRID ─────────────────────────────────────── */
(async function buildTables() {
  await loadMenuItems();
  rebuildStudentTableGrid();
  fetch(API_BASE + '/api/tables/layout')
    .then(r => r.json())
    .then(d => {
      if (d.tables && d.tables.length > 0) {
        tables.length = 0;
        d.tables.forEach(t => tables.push(t));
        rebuildStudentTableGrid();
      }
    }).catch(() => {});
  setTimeout(() => {
  if (typeof io !== 'undefined') {
    connectSocket('student');
  } else {
    const script = document.createElement('script');
    script.src = API_BASE + '/socket.io/socket.io.js';
    script.onload = () => connectSocket('student');
    document.head.appendChild(script);
  }
}, 1000);
})();

/* ── TABLE SELECTION ─────────────────────────────────────── */
function selectStudentTable(n) {
  selectedTable = n;
  document.querySelectorAll('.table-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('tbtn-' + n)?.classList.add('selected');
  const btn = document.getElementById('btn-step1-next');
  if (btn) { btn.disabled = false; btn.textContent = 'TABLE ' + n + ' SELECTED →'; }
}

/* ── STEP NAVIGATION ─────────────────────────────────────── */
function goStep(n) {
  if (n === 2 && !selectedTable) return;
  if (n === 4 && cartTotal() === 0) return;
  if (n === 5 && sessionOrders.length === 0) return;
  studentStep = n;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('step-' + n).classList.add('active');
  for (let i = 1; i <= 5; i++) {
    const si = document.getElementById('si-' + i);
    si.classList.remove('active', 'done');
    if (i < n) si.classList.add('done');
    if (i === n) si.classList.add('active');
  }
  if (n === 2) renderMenu();
  if (n === 3) renderCart();
  if (n === 4) renderConfirm();
  if (n === 5) renderOrderList();
  const bubble = document.getElementById('cart-bubble');
  if (bubble) bubble.classList.toggle('show', n === 2 && cartCount() > 0);
  window.scrollTo(0, 0);
}

/* ── MENU ────────────────────────────────────────────────── */
function renderMenu() {
  const cats = ['All', ...new Set(MENU_ITEMS.map(m => m.cat))];
  document.getElementById('menu-cats').innerHTML = cats.map(c =>
    `<button class="menu-cat-btn${c === activeMenuCat ? ' active' : ''}" onclick="filterMenuCat('${c}')">${c}</button>`
  ).join('');
  renderMenuGrid();
  updateStep2Btn();
}

function filterMenuCat(cat) {
  activeMenuCat = cat;
  document.querySelectorAll('.menu-cat-btn').forEach(b => b.classList.toggle('active', b.textContent === cat));
  renderMenuGrid();
}

function renderMenuGrid() {
  const items = activeMenuCat === 'All' ? MENU_ITEMS : MENU_ITEMS.filter(m => m.cat === activeMenuCat);
  document.getElementById('menu-grid').innerHTML = items.map(m => {
    const qty = cart[m.id] || 0;
    return `<div class="menu-item${qty > 0 ? ' in-cart' : ''}">
      <div class="menu-item-qty-badge${qty > 0 ? ' show' : ''}" id="badge-${m.id}">${qty}</div>
      <div class="menu-item-emoji">${m.emoji}</div>
      <div class="menu-item-name">${m.name}</div>
      <div class="menu-item-desc">${m.desc}</div>
      <div class="menu-item-footer">
        <span class="menu-item-price">$${m.price.toFixed(2)}</span>
        <button class="add-to-cart-btn" onclick="addToCart('${m.id}')">+</button>
      </div>
    </div>`;
  }).join('');
}

function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  const badge = document.getElementById('badge-' + id);
  if (badge) { badge.textContent = cart[id]; badge.classList.add('show'); }
  updateCartBubble(); updateStep2Btn();
  showToast('⬡ ' + MENU_ITEMS.find(m => m.id === id).name + ' added');
}

function updateStep2Btn() {
  const btn = document.getElementById('btn-step2-next');
  if (!btn) return;
  const n = cartCount();
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? `VIEW CART (${n}) →` : 'VIEW CART →';
}

function updateCartBubble() {
  const n = cartCount();
  const bubble = document.getElementById('cart-bubble');
  const count  = document.getElementById('cart-bubble-count');
  if (bubble) bubble.classList.toggle('show', n > 0);
  if (count)  count.textContent = n;
}

function cartCount() { return Object.values(cart).reduce((a, b) => a + b, 0); }
function cartTotal() { return MENU_ITEMS.reduce((s, m) => s + (cart[m.id] || 0) * m.price, 0); }

/* ── CART ────────────────────────────────────────────────── */
function renderCart() {
  const el    = document.getElementById('cart-contents');
  const items = MENU_ITEMS.filter(m => (cart[m.id] || 0) > 0);
  if (!items.length) {
    el.innerHTML = '<div class="cart-empty">⬡ Your cart is empty</div>';
    document.getElementById('btn-step3-next').disabled = true;
    return;
  }
  document.getElementById('btn-step3-next').disabled = false;
  el.innerHTML = `<table class="cart-table">
    <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
    <tbody>
      ${items.map(m => `<tr>
        <td><span class="cart-item-name">${m.emoji} ${m.name}</span></td>
        <td><div class="cart-qty-ctrl">
          <button class="cart-qty-btn" onclick="changeQty('${m.id}',-1)">−</button>
          <span>${cart[m.id]}</span>
          <button class="cart-qty-btn" onclick="changeQty('${m.id}',+1)">+</button>
        </div></td>
        <td class="cart-item-price">$${(cart[m.id] * m.price).toFixed(2)}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot><tr class="cart-total-row">
      <td colspan="2" style="color:var(--text-dim);font-family:monospace;font-size:13px;letter-spacing:3px;">TOTAL</td>
      <td class="cart-item-price" style="font-size:22px;">$${cartTotal().toFixed(2)}</td>
    </tr></tfoot>
  </table>
  <div style="margin-top:16px;">
    <div style="font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:3px;color:var(--text-dim);margin-bottom:8px;">⬡ SPECIAL INSTRUCTIONS (optional)</div>
    <textarea id="order-notes" placeholder="e.g. No tomatoes, extra sauce, allergies..." style="width:100%;padding:12px 14px;background:rgba(255,107,26,0.05);border:1px solid rgba(255,107,26,0.25);color:var(--text);font-family:'Share Tech Mono',monospace;font-size:12px;letter-spacing:1px;resize:vertical;min-height:80px;outline:none;box-sizing:border-box;" maxlength="300"></textarea>
  </div>`;
}

function changeQty(id, delta) {
  cart[id] = Math.max(0, (cart[id] || 0) + delta);
  if (cart[id] === 0) delete cart[id];
  renderCart(); updateCartBubble(); updateStep2Btn();
}

function openCartFromAnywhere() {
  if (!selectedTable) {
    const allText = sessionOrders.map(o => '').join('');
    showPage('student');
    studentStep = 1;
    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('step-1').classList.add('active');
    for (let i = 1; i <= 5; i++) { const si = document.getElementById('si-' + i); si.classList.remove('active','done'); if (i===1) si.classList.add('active'); }
    showToast('⬡ Pick a table first!');
    return;
  }
  showPage('student');
  studentStep = 3;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('step-3').classList.add('active');
  for (let i = 1; i <= 5; i++) { const si = document.getElementById('si-' + i); si.classList.remove('active','done'); if (i<3) si.classList.add('done'); if (i===3) si.classList.add('active'); }
  renderCart();
  window.scrollTo(0, 0);
}

/* ── CONFIRM ─────────────────────────────────────────────── */
function renderConfirm() {
  const items = MENU_ITEMS.filter(m => (cart[m.id] || 0) > 0);
  document.getElementById('confirm-card').innerHTML =
    `<div class="confirm-row"><span class="confirm-row-label">Delivering to</span><span style="font-family:'Share Tech Mono',monospace;color:var(--orange);">TABLE ${selectedTable}</span></div>` +
    `<div class="confirm-row"><span class="confirm-row-label">Items (${cartCount()})</span></div>` +
    items.map(m => `<div class="confirm-row"><span>${m.emoji} ${m.name} ×${cart[m.id]}</span><span class="cart-item-price">$${(cart[m.id] * m.price).toFixed(2)}</span></div>`).join('') +
    `<div class="confirm-row" style="margin-top:8px;"><span class="confirm-row-label">Total</span><span class="confirm-total">$${cartTotal().toFixed(2)}</span></div>`;
}

/* ── PLACE ORDER ─────────────────────────────────────────── */
async function placeOrder() {
  const btn = document.getElementById('btn-place-order');
  if (btn) { btn.disabled = true; btn.textContent = 'PLACING ORDER...'; }
  try {
    const orderItems = MENU_ITEMS.filter(m => (cart[m.id] || 0) > 0).map(m => ({
      id: m.id, name: m.name, emoji: m.emoji, qty: cart[m.id], unitPrice: m.price
    }));
    const notes = document.getElementById('order-notes')?.value?.trim() || '';
    const res  = await fetch(API_BASE + '/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: selectedTable, items: orderItems, notes })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    const order = data.order;
    const now   = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    sessionOrders.push({ order_ref: order.order_ref, table_number: order.table_number, status: 'new', placedAt: timeStr, items: orderItems, notes });
    _shownPickupScreens.clear();
    activeTrackingRef = order.order_ref;

    // Reset state
    cart = {}; selectedTable = null; activeMenuCat = 'All';
    document.querySelectorAll('.table-btn').forEach(b => b.classList.remove('selected'));
    const s1btn = document.getElementById('btn-step1-next');
    if (s1btn) { s1btn.disabled = true; s1btn.textContent = 'CHOOSE A TABLE →'; }

    // Go to tracking
    studentStep = 5;
    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('step-5').classList.add('active');
    for (let i = 1; i <= 5; i++) { const si = document.getElementById('si-' + i); si.classList.remove('active','done'); if (i<5) si.classList.add('done'); if (i===5) si.classList.add('active'); }
    document.getElementById('cart-bubble').classList.remove('show');
    renderOrderList();
    selectOrderForTracking(order.order_ref);
    connectSocket('student');
    startDeliveryWatcher(order.order_ref);
    showToast('✓ Order ' + order.order_ref + ' placed — Kitchen notified!');
    window.scrollTo(0, 0);
    if (btn) { btn.disabled = false; btn.textContent = 'PLACE ORDER →'; }
  } catch (err) {
    showToast('✗ ' + (err.message || 'Failed to place order'));
    if (btn) { btn.disabled = false; btn.textContent = 'PLACE ORDER →'; }
  }
}

/* ── ORDER LIST (step 5) ─────────────────────────────────── */
function renderOrderList() {
  const container = document.getElementById('order-list-container');
  container.innerHTML = '';
  if (sessionOrders.length === 0) {
    container.innerHTML = '<div style="font-family:\'Share Tech Mono\',monospace;font-size:10px;letter-spacing:2px;color:var(--text-dim);padding:16px 0;">No orders yet</div>';
    return;
  }
  [...sessionOrders].reverse().forEach(o => {
    const card = document.createElement('div');
    card.className = 'order-list-card' + (o.order_ref === activeTrackingRef ? ' selected' : '');
    card.id = 'olc-' + o.order_ref;
    card.innerHTML = `
      <div>
        <div class="olc-ref">${o.order_ref}</div>
        <div class="olc-meta">TABLE ${o.table_number} · ${o.placedAt}</div>
      </div>
      <span class="olc-status olc-status-${o.status || 'new'}" id="olc-badge-${o.order_ref}">${STATUS_LABEL[o.status] || o.status}</span>`;
    card.onclick = () => selectOrderForTracking(o.order_ref);
    container.appendChild(card);
  });
}

function selectOrderForTracking(ref) {
  activeTrackingRef = ref;
  document.querySelectorAll('.order-list-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('olc-' + ref)?.classList.add('selected');
  renderTrackDetail(ref);
}

function updateSessionOrderStatus(ref, status) {
  const order = sessionOrders.find(o => o.order_ref === ref);
  if (!order) return;
  order.status = status;
  const badge = document.getElementById('olc-badge-' + ref);
  if (badge) { badge.textContent = STATUS_LABEL[status] || status; badge.className = 'olc-status olc-status-' + status; }
  if (activeTrackingRef === ref) applyStatusToTimeline(ref, status, order.table_number);
}

/* ── TRACK DETAIL ────────────────────────────────────────── */
function renderTrackDetail(ref) {
  const order = sessionOrders.find(o => o.order_ref === ref);
  if (!order) return;
  const detail = document.getElementById('track-detail');
  detail.innerHTML = `
    <div class="tracking-wrap">
      <div>
        <div class="track-status-card">
          <div class="track-order-id">${order.order_ref}</div>
          <div class="track-table-tag">TABLE ${order.table_number} · ${order.placedAt}</div>
          <div class="track-timeline" id="tl-${ref}">
            <div class="track-step done" id="ts-ordered-${ref}"><div class="track-step-dot">⬡</div><div class="track-step-body"><div class="track-step-title">Order Placed</div><div class="track-step-sub">${order.placedAt}</div></div></div>
            <div class="track-step" id="ts-prep-${ref}"><div class="track-step-dot">⬡</div><div class="track-step-body"><div class="track-step-title">Kitchen Preparing</div><div class="track-step-sub">Waiting for kitchen</div></div></div>
            <div class="track-step" id="ts-ready-${ref}"><div class="track-step-dot">⬡</div><div class="track-step-body"><div class="track-step-title">Food Ready</div><div class="track-step-sub">Waiting for robot pickup</div></div></div>
            <div class="track-step" id="ts-enroute-${ref}"><div class="track-step-dot">🤖</div><div class="track-step-body"><div class="track-step-title">Robot En Route</div><div class="track-step-sub" id="ts-enroute-sub-${ref}">—</div></div></div>
            <div class="track-step" id="ts-delivered-${ref}"><div class="track-step-dot">✓</div><div class="track-step-body" style="padding-bottom:0;"><div class="track-step-title">Delivered!</div><div class="track-step-sub">Enjoy your meal 🎓</div></div></div>
          </div>
          <div class="track-eta-strip"><span class="track-eta-label">Robot ETA</span><span class="track-eta-val" id="track-eta-${ref}">—</span></div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
          <button id="cancel-btn-${ref}" class="student-btn" style="background:#ef4444;color:#fff;box-shadow:0 0 24px rgba(239,68,68,0.25);" onclick="cancelOrder('${ref}')">CANCEL ORDER</button>
        </div>
      </div>
      <div>
        <div class="student-section-title">⬡ Live Robot Map</div>
        <div class="track-map-wrap"><canvas id="trackMap-${ref}"></canvas></div>
      </div>
    </div>`;
  applyStatusToTimeline(ref, order.status, order.table_number);
  initTrackMap(ref);
  startTrackingPolling(ref);
}

function applyStatusToTimeline(ref, status, tableNum) {
  const eta = document.getElementById('track-eta-' + ref);
  const markDone   = id => { const el = document.getElementById(id + '-' + ref); if (el) { el.classList.remove('active'); el.classList.add('done'); } };
  const markActive = id => { const el = document.getElementById(id + '-' + ref); if (el && !el.classList.contains('done')) el.classList.add('active'); };

  if (status === 'cancelled') {
    if (eta) eta.textContent = 'Cancelled';
  } else if (status === 'new') {
    if (eta) eta.textContent = 'Calculating...';
    fetch(API_BASE + '/api/orders/queue-eta?ref=' + ref)
      .then(r => r.json())
      .then(d => {
        const total = (d.ordersAhead||0) * (d.avgPrep||8) + (d.avgPrep||8) + 2;
        if (eta) eta.textContent = '~' + Math.round(total) + ' min';
        let strip = document.getElementById('pred-strip-' + ref);
        const etaStrip = document.querySelector('#track-detail .track-eta-strip');
        if (!strip && etaStrip) {
          strip = document.createElement('div'); strip.id = 'pred-strip-' + ref;
          strip.style.cssText = 'margin-top:8px;padding:10px 16px;background:rgba(251,185,36,0.05);border:1px solid rgba(251,185,36,0.2);font-family:Share Tech Mono,monospace;font-size:9px;letter-spacing:2px;color:rgba(251,185,36,0.7);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);';
          etaStrip.after(strip);
        }
        if (strip && d.ordersAhead !== undefined) {
          strip.textContent = d.ordersAhead > 0
            ? `⬡ ${d.ordersAhead} ORDER${d.ordersAhead>1?'S':''} AHEAD · AVG PREP ${Math.round(d.avgPrep||8)} MIN · +2 MIN ROBOT`
            : '⬡ YOUR ORDER IS NEXT · +2 MIN ROBOT TRAVEL';
        }
      }).catch(() => { if (eta) eta.textContent = '~10 min'; });
  } else {
    if (eta) eta.textContent = STATUS_ETA[status] || '—';
    document.getElementById('pred-strip-' + ref)?.remove();

    if (['prep','ready','dispatched','delivering','delivered'].includes(status)) markDone('ts-prep');
    if (['ready','dispatched','delivering','delivered'].includes(status)) markDone('ts-ready');
    if (['dispatched','delivering','delivered'].includes(status)) {
      markActive('ts-enroute');
      const sub = document.getElementById('ts-enroute-sub-' + ref);
      if (sub) sub.textContent = 'Heading to Table ' + tableNum;
    }
    if (status === 'delivering' && sessionOrders.some(o => o.order_ref === ref) && studentStep === 5) {
      showPickupScreen(ref);
    }
    if (status === 'delivered') {
      markDone('ts-enroute'); markDone('ts-delivered');
      document.getElementById('pickup-overlay')?.classList.remove('show');
      // Show tray collection button
      const cancelBtn = document.getElementById('cancel-btn-' + ref);
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.textContent = '🤖 COLLECT MY TRAY';
        cancelBtn.style.background = 'linear-gradient(135deg,#FF6B1A,#ff8c3a)';
        cancelBtn.style.opacity = '1';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.onclick = () => requestTrayCollection(ref, tableNum);
      }
    }
  }

  const badge = document.getElementById('olc-badge-' + ref);
  if (badge) { badge.textContent = STATUS_LABEL[status] || status; badge.className = 'olc-status olc-status-' + status; }
  const cancelBtn = document.getElementById('cancel-btn-' + ref);
  if (cancelBtn) {
    if (status === 'new') { cancelBtn.disabled=false;cancelBtn.textContent='CANCEL ORDER';cancelBtn.style.opacity='1';cancelBtn.style.cursor='pointer'; }
    else if (status === 'cancelled') { cancelBtn.disabled=true;cancelBtn.textContent='ORDER CANCELLED';cancelBtn.style.opacity='0.5';cancelBtn.style.cursor='not-allowed'; }
    else if (status === 'delivered') { /* handled above — tray collection button */ }
    else { cancelBtn.disabled=true;cancelBtn.textContent='CANNOT CANCEL';cancelBtn.style.opacity='0.5';cancelBtn.style.cursor='not-allowed'; }
  }
}

/* ── CANCEL ORDER ────────────────────────────────────────── */
async function cancelOrder(ref) {
  const order = sessionOrders.find(o => o.order_ref === ref);
  if (!order || order.status !== 'new') { showToast('✗ This order can no longer be cancelled'); return; }
  const btn = document.getElementById('cancel-btn-' + ref);
  if (btn) { btn.disabled = true; btn.textContent = 'CANCELLING...'; }
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API_BASE + '/api/orders/' + ref + '/status', {
      method: 'PATCH', headers, body: JSON.stringify({ status: 'cancelled' })
    });
    if (!res.ok) {
      // Retry without auth
      const res2 = await fetch(API_BASE + '/api/orders/' + ref + '/status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      });
      if (!res2.ok) throw new Error((await res2.json()).error || 'Failed');
    }
    updateSessionOrderStatus(ref, 'cancelled');
    recordCancelled();
    showToast('✓ Order ' + ref + ' cancelled');
  } catch (err) {
    showToast('✗ ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'CANCEL ORDER'; }
  }
}

/* ── TRACKING POLLING ────────────────────────────────────── */
function startTrackingPolling(ref) {
  clearInterval(trackingInterval);
  trackingInterval = setInterval(async () => {
    if (!ref) return;
    try {
      const [orderRes, robotRes] = await Promise.all([
        fetch(API_BASE + '/api/orders/' + ref),
        fetch(API_BASE + '/api/robot/status', { headers: authHeaders() })
      ]);
      const data   = await orderRes.json();
      const status = data.order.status;
      const order  = sessionOrders.find(o => o.order_ref === ref);
      updateSessionOrderStatus(ref, status);
      applyStatusToTimeline(ref, status, order?.table_number);
      if (['delivered','cancelled'].includes(status)) clearInterval(trackingInterval);
      if (robotRes.ok) {
        const robotData = await robotRes.json();
        robotX = robotData.x_norm; robotY = robotData.y_norm; robotAngle = robotData.theta;
      }
    } catch {}
  }, 5000);
}

function startDeliveryWatcher(ref) {
  if (window._deliveryWatcher) clearInterval(window._deliveryWatcher);
  window._deliveryWatcher = setInterval(async () => {
    try {
      const res  = await fetch(API_BASE + '/api/orders/' + ref);
      if (!res.ok) return;
      const data = await res.json();
      const status = data.order?.status;
      if (!status) return;
      updateSessionOrderStatus(ref, status);
      if (status === 'delivering' && !_shownPickupScreens.has(ref) && sessionOrders.some(o => o.order_ref === ref) && studentStep === 5) {
        showPickupScreen(ref);
      }
      if (status === 'delivered' || status === 'cancelled') {
        clearInterval(window._deliveryWatcher); window._deliveryWatcher = null;
      }
    } catch {}
  }, 2000);
}

/* ── TRACK MAP ───────────────────────────────────────────── */
function initTrackMap(ref) {
  cancelAnimationFrame(trackMapFrame);
  const canvas = document.getElementById('trackMap-' + ref);
  if (!canvas) return;
  const wrap = canvas.parentElement;
  canvas.width  = wrap.offsetWidth  || 400;
  canvas.height = wrap.offsetHeight || 320;
  const order   = sessionOrders.find(o => o.order_ref === ref);
  animateTrackMap(ref, order?.table_number);
}

function animateTrackMap(ref, tableNum) {
  const canvas = document.getElementById('trackMap-' + ref);
  if (!canvas) return;
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const isLight = document.body.classList.contains('light-mode');
  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = isLight ? 'rgba(30,100,200,0.15)' : 'rgba(5,22,65,0.9)'; ctx.lineWidth = 1;
  for (let i=0;i<W;i+=40){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,H);ctx.stroke();}
  for (let j=0;j<H;j+=40){ctx.beginPath();ctx.moveTo(0,j);ctx.lineTo(W,j);ctx.stroke();}

  // Tables
  tables.forEach(t => {
    const tx = t.x*W, ty = t.y*H, isTarget = tableNum === t.id;
    ctx.save();
    ctx.fillStyle = isTarget ? (isLight?'rgba(255,106,0,0.25)':'#C084FC') : (isLight?'rgba(29,78,216,0.15)':'rgba(96,165,250,0.25)');
    ctx.strokeStyle = isTarget ? (isLight?'#FF6F3C':'#C084FC') : (isLight?'#1d4ed8':'#60A5FA');
    ctx.lineWidth = isLight ? 1.5 : 0;
    ctx.shadowColor = isTarget ? (isLight?'#FF6F3C':'#C084FC') : (isLight?'#1d4ed8':'#60A5FA');
    ctx.shadowBlur = isTarget ? 10 : 4;
    ctx.fillRect(tx-12, ty-8, 24, 16); if (isLight) ctx.strokeRect(tx-12, ty-8, 24, 16);
    ctx.fillStyle = isLight ? (isTarget?'#7c1d00':'#0d3b8c') : 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 0; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('T'+t.id, tx, ty); ctx.restore();
  });

  // Dock
  ctx.save();
  ctx.fillStyle = isLight ? 'rgba(22,163,74,0.15)' : 'rgba(74,222,128,0.2)';
  ctx.strokeStyle = isLight ? '#16a34a' : '#4ADE80'; ctx.lineWidth = 1;
  ctx.shadowColor = isLight ? '#16a34a' : '#4ADE80'; ctx.shadowBlur = isLight ? 4 : 10;
  ctx.fillRect(dockX*W-14, dockY*H-10, 28, 20); ctx.strokeRect(dockX*W-14, dockY*H-10, 28, 20);
  ctx.fillStyle = isLight ? 'rgba(20,8,0,0.7)' : '#4ADE80';
  ctx.shadowBlur = 0; ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('DOCK', dockX*W, dockY*H); ctx.restore();

  // Robot arrow
  ctx.save(); ctx.translate(robotX*W, robotY*H); ctx.rotate(robotAngle + Math.PI/2);
  ctx.shadowColor = isLight ? '#e05800' : '#FF6B1A'; ctx.shadowBlur = isLight ? 8 : 20;
  ctx.fillStyle = isLight ? '#FF6F3C' : '#FF6B1A';
  ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(6,6); ctx.lineTo(0,2); ctx.lineTo(-6,6); ctx.closePath(); ctx.fill(); ctx.restore();

  drawObstacles(ctx, W, H);
  trackMapFrame = requestAnimationFrame(() => animateTrackMap(ref, tableNum));
}

/* ── START NEW ORDER ─────────────────────────────────────── */
function startNewOrder() {
  cancelAnimationFrame(trackMapFrame); clearInterval(trackingInterval);
  cart = {}; selectedTable = null; activeMenuCat = 'All';
  document.querySelectorAll('.table-btn').forEach(b => b.classList.remove('selected'));
  const btn = document.getElementById('btn-step1-next');
  if (btn) { btn.disabled = true; btn.textContent = 'CHOOSE A TABLE →'; }
  const placeBtn = document.getElementById('btn-place-order');
  if (placeBtn) { placeBtn.disabled = false; placeBtn.textContent = 'PLACE ORDER →'; }
  studentStep = 1;
  for (let i=1;i<=5;i++) { const si=document.getElementById('si-'+i); si.classList.remove('active','done'); if(i===1)si.classList.add('active'); }
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('step-1').classList.add('active');
  _shownPickupScreens.clear(); _pickupOrderRef = null;
}

/* ── PICKUP SCREEN ───────────────────────────────────────── */
let _pickupOrderRef = null;
const _shownPickupScreens = new Set();

function showPickupScreen(ref) {
  if (_shownPickupScreens.has(ref)) return;
  _shownPickupScreens.add(ref); _pickupOrderRef = ref;
  const order = sessionOrders.find(o => o.order_ref === ref);
  if (!order) return;
  const list = document.getElementById('pickup-items-list');
  list.innerHTML = '';
  (order.items || []).forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'pickup-item';
    el.innerHTML = `<span class="pickup-item-emoji">${item.emoji||'🍽️'}</span><span class="pickup-item-name">${item.name}</span><span class="pickup-item-qty">${item.qty}×</span><span class="pickup-item-price">$${(item.qty*item.unitPrice).toFixed(2)}</span>`;
    list.appendChild(el);
    setTimeout(() => el.classList.add('revealed'), 200 + i * 120);
  });
  document.getElementById('pickup-table-tag').textContent = `⬡ Table ${order.table_number} · ${order.order_ref}`;
  document.getElementById('pickup-overlay').classList.add('show');
  const btn = document.getElementById('pickup-confirm-btn');
  btn.disabled = false; btn.textContent = "✓ I'VE TAKEN MY ORDER";
}

async function confirmPickup() {
  const btn = document.getElementById('pickup-confirm-btn');
  btn.disabled = true; btn.textContent = 'RELEASING ROBOT...';
  try {
    await fetch(API_BASE + '/api/robot/pickup', { method: 'POST', headers: authHeaders() }).catch(() => {});
    await fetch(API_BASE + '/api/robot/recall', { method: 'POST', headers: authHeaders() }).catch(() => {});
    if (_pickupOrderRef) {
      await fetch(API_BASE + '/api/orders/' + _pickupOrderRef + '/status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status: 'delivered' })
      });
      updateSessionOrderStatus(_pickupOrderRef, 'delivered');
      _shownPickupScreens.add(_pickupOrderRef);
    }
    btn.textContent = '✓ ENJOY YOUR MEAL!'; btn.style.background = 'linear-gradient(135deg,#FF6B1A,#ff8c3a)';
    setTimeout(() => {
      document.getElementById('pickup-overlay').classList.remove('show');
      showToast('✓ Enjoy your meal! 🎓'); _pickupOrderRef = null;
    }, 1500);
  } catch {
    showToast('✗ Failed — try again'); btn.disabled = false; btn.textContent = "✓ I'VE TAKEN MY ORDER";
  }
}

/* ── TRAY COLLECTION ─────────────────────────────────────── */
async function requestTrayCollection(ref, tableNum) {
  const btn = document.getElementById('cancel-btn-' + ref);
  if (btn) { btn.disabled = true; btn.textContent = '⬡ Dispatching Robot...'; }
  try {
    const res = await fetch(API_BASE + '/api/robot/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_number: tableNum, order_ref: null, role: 'tray' })
    });
    if (!res.ok) throw new Error('Robot unavailable');
    if (btn) { btn.disabled = true; btn.textContent = '⬡ Robot Coming to Collect Tray...'; }
    showToast('🤖 Robot dispatched to collect your tray!');

    // Poll for robot arrival then show tray loaded screen
    window._trayWatcher = setInterval(async () => {
      try {
        const r = await fetch(API_BASE + '/api/robot/status', { headers: authHeaders() });
        const data = await r.json();
        if (data.state === 'DELIVERING') {
          clearInterval(window._trayWatcher);
          showTrayLoadedScreen(ref);
        }
      } catch {}
    }, 3000);
  } catch (err) {
    showToast('✗ ' + (err.message || 'Failed to dispatch robot'));
    if (btn) { btn.disabled = false; btn.textContent = '🤖 COLLECT MY TRAY'; }
  }
}

function showTrayLoadedScreen(ref) {
  const overlay = document.getElementById('pickup-overlay');
  const list    = document.getElementById('pickup-items-list');
  const tag     = document.getElementById('pickup-table-tag');
  const btn     = document.getElementById('pickup-confirm-btn');
  const order   = sessionOrders.find(o => o.order_ref === ref);

  list.innerHTML = `
    <div style="text-align:center;padding:24px 0;">
      <div style="font-size:48px;margin-bottom:12px;">🤖</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:3px;color:rgba(251,185,36,0.8);">ROBOT HAS ARRIVED</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;margin-top:8px;">Place your tray on the robot</div>
    </div>`;
  if (tag) tag.textContent = `⬡ Table ${order?.table_number} · Tray Collection`;
  if (btn) {
    btn.disabled = false;
    btn.textContent = '✓ TRAY LOADED — SEND ROBOT BACK';
    btn.onclick = confirmTrayLoaded;
  }
  if (overlay) overlay.classList.add('show');
}

async function confirmTrayLoaded() {
  const btn = document.getElementById('pickup-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'SENDING ROBOT BACK...'; }
  try {
    await fetch(API_BASE + '/api/robot/pickup', { method: 'POST', headers: authHeaders() }).catch(() => {});
    await fetch(API_BASE + '/api/robot/recall', { method: 'POST', headers: authHeaders() }).catch(() => {});
    btn.textContent = '✓ THANK YOU!';
    setTimeout(() => {
      document.getElementById('pickup-overlay')?.classList.remove('show');
      showToast('✓ Tray collected — thank you! 🎓');
      btn.onclick = confirmPickup; // reset for next use
    }, 1500);
  } catch {
    showToast('✗ Failed — try again');
    if (btn) { btn.disabled = false; btn.textContent = '✓ TRAY LOADED — SEND ROBOT BACK'; }
  }
}