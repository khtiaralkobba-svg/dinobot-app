/* ══════════════════════════════════════════════════════════
   auth.js — Login, logout, role selection
══════════════════════════════════════════════════════════ */

let currentRole = null;
let _socket = null;
window._pythonOnline = false;

const ROLES = {
  manager: { label: 'Robot Manager', icon: '🤖' },
  kitchen: { label: 'Kitchen Staff', icon: '👨‍🍳' }
};

function selectRole(role) {
  document.querySelectorAll('.role-pill').forEach(p => p.classList.remove('selected'));
  document.getElementById('pill-' + role).classList.add('selected');
  document.querySelectorAll('.auth-fields').forEach(f => f.classList.remove('show'));
  document.getElementById('fields-' + role).classList.add('show');
  currentRole = role;
}

async function doLogin(role) {
  const r = ROLES[role];
  if (!r) return;
  const empInput  = document.getElementById(role + '-employee-id');
  const passInput = document.getElementById(role + '-password');
  if (!empInput.value.trim() || !passInput.value) {
    showToast('Please enter your ID and password');
    return;
  }
  const btn = document.querySelector('#fields-' + role + ' .btn-login');
  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'AUTHENTICATING...';

  try {
    const res  = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ employeeId: empInput.value.trim(), password: passInput.value })
    });
    const data = await res.json();
    passInput.value = '';

    if (!res.ok) {
      showToast('Login failed: ' + (data.error || data.message || 'Unknown error'));
      return;
    }

    const serverRole = data?.user?.role || role;
    if (data.accessToken) localStorage.setItem('accessToken', data.accessToken);

    // Hide auth gate
    document.getElementById('auth-gate').classList.add('hidden');
    document.getElementById('control-center').classList.remove('unlocked');
    document.getElementById('kitchen-center').classList.remove('unlocked');

    if (serverRole === 'manager') {
      document.querySelector('#dashboard-hero-title .dash-subtitle').textContent = '// Robot Manager Dashboard';
      document.querySelector('#dashboard-hero-title .dash-title').innerHTML = 'CONTROL <span style="color:var(--orange)">CENTER</span>';
      document.getElementById('control-center').classList.add('unlocked');
      setTimeout(initMap, 300);
      setTimeout(loadAnalyticsFromDB, 500);
      startAnalyticsPolling();
      connectSocket('manager');
      setTimeout(loadStaffList, 600);
    } else {
      document.querySelector('#dashboard-hero-title .dash-subtitle').textContent = '// Kitchen Staff Dashboard';
      document.querySelector('#dashboard-hero-title .dash-title').innerHTML = 'KITCHEN <span style="color:var(--orange)">CENTER</span>';
      document.getElementById('kitchen-center').classList.add('unlocked');
      await loadKitchenOrders();
      connectSocket('kitchen');
      localStorage.setItem('lastEmployeeId', empInput.value.trim());
      if (window._kitchenPollInterval) clearInterval(window._kitchenPollInterval);
      window._kitchenPollInterval = setInterval(loadKitchenOrders, 30000);
      startAlertEngine();
      startKitchenRobotPolling();imeout(initMap, 300);
    }

    // Show user badge
    document.getElementById('ub-icon').textContent = r.icon;
    document.getElementById('ub-name').textContent = ((data.user?.fullName || data.user?.full_name || r.label) + '').toUpperCase();
    document.getElementById('ub-role').textContent = serverRole;
    document.getElementById('user-badge').classList.add('show');

    showToast('⬡ Welcome — Access granted');

    // Unlock audio context
    const ctx = getAudioCtx();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start(0);
    if (window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(utt);
    }

    currentRole = serverRole;
    sessionOrders = [];
    studentStep = 1;

  } catch (err) {
    console.error(err);
    showToast('Backend connection failed — is the server running?');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
}

async function doLogout() {
  try { await fetch(API_BASE + '/api/auth/logout', { method: 'POST', headers: authHeaders() }); } catch {}
  localStorage.removeItem('accessToken');

  if (window._kitchenPollInterval)  { clearInterval(window._kitchenPollInterval);  window._kitchenPollInterval = null; }
  if (window._kitchenRobotPoll)     { clearInterval(window._kitchenRobotPoll);      window._kitchenRobotPoll = null; }
  if (window._alertCheckInterval)   { clearInterval(_alertCheckInterval);            _alertCheckInterval = null; }
  if (window.speechSynthesis)       { window.speechSynthesis.cancel(); }
  _voiceQueue.length = 0;
  _voiceBusy = false;

  Object.values(kitchenOrders).forEach(order => {
    if (order.timerInterval) clearInterval(order.timerInterval);
    if (order.waitInterval)  clearInterval(order.waitInterval);
  });
  kitchenOrders = {};

  document.getElementById('control-center').classList.remove('unlocked');
  document.getElementById('kitchen-center').classList.remove('unlocked');
  document.getElementById('auth-gate').classList.remove('hidden');
  document.querySelector('#dashboard-hero-title .dash-subtitle').textContent = '// Staff Authentication';
  document.querySelector('#dashboard-hero-title .dash-title').innerHTML = 'STAFF <span style="color:var(--orange)">LOGIN</span>';
  document.querySelectorAll('.role-pill').forEach(p => p.classList.remove('selected'));
  document.querySelectorAll('.auth-fields').forEach(f => f.classList.remove('show'));
  document.getElementById('user-badge').classList.remove('show');
  currentRole = null;
  showToast('⬡ Logged out');
}

/* ── WEBSOCKET ───────────────────────────────────────────── */
function connectSocket(room) {
  if (_socket && _socket.connected) {
    _socket.emit('join', room);
    return;
  }
  if (_socket) return;

  const script = document.createElement('script');
  script.src = API_BASE + '/socket.io/socket.io.js';
  script.onload = () => {
    _socket = io(API_BASE, {
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    _socket.on('connect', () => {
      console.log('[socket] connected, joining:', room);
      _socket.emit('join', room);
      if (room === 'kitchen') {
        const empId = localStorage.getItem('lastEmployeeId');
        if (empId) _socket.emit('staff:login', empId);
      }
    });

    _socket.on('staff:online',  (id) => { _onlineStaff.add(id);    loadStaffList(); });
    _socket.on('staff:offline', (id) => { _onlineStaff.delete(id); loadStaffList(); });

    _socket.on('reconnect', () => {
      _socket.emit('join', room);
      if (room === 'kitchen') loadKitchenOrders();
    });

    _socket.on('order:new', (order) => {
      if (currentRole === 'kitchen') {
        if (!document.getElementById('order-' + order.order_ref)) {
          renderKitchenOrder(order);
          resortColumns();
        }
        sfxNewOrder();
        voiceNewOrder(order.order_ref, order.table_number);
      }
      addActivity('dot-order', `New order <strong>${order.order_ref}</strong> — Table ${order.table_number}`);
      showToast('⬡ New order ' + order.order_ref + ' — Table ' + order.table_number);
    });

    _socket.on('order:updated', (payload) => {
      const { order_ref, status, prep_started_at, table_number } = payload;

      // Always update student tracking
      updateSessionOrderStatus(order_ref, status);
      if (status === 'delivering' && !_shownPickupScreens.has(order_ref) && sessionOrders.some(o => o.order_ref === order_ref) && studentStep === 5) {
        showPickupScreen(order_ref);
      }

      if (status === 'delivered') {
        const card = document.getElementById('order-' + order_ref);
        if (card) {
          card.style.transition = 'opacity 0.3s, transform 0.3s';
          card.style.opacity = '0'; card.style.transform = 'translateX(20px)';
          setTimeout(() => {
            card.remove();
            if (kitchenOrders[order_ref]) {
              clearInterval(kitchenOrders[order_ref].timerInterval);
              clearInterval(kitchenOrders[order_ref].waitInterval);
              delete kitchenOrders[order_ref];
            }
            resortColumns();
          }, 320);
        }
        return;
      }

      if (status === 'cancelled') {
        const card = document.getElementById('order-' + order_ref);
        if (card) {
          card.style.transition = 'opacity 0.3s, transform 0.3s';
          card.style.opacity = '0'; card.style.transform = 'translateX(20px)';
          setTimeout(() => {
            card.remove();
            if (kitchenOrders[order_ref]) {
              clearInterval(kitchenOrders[order_ref].timerInterval);
              clearInterval(kitchenOrders[order_ref].waitInterval);
              delete kitchenOrders[order_ref];
            }
            resortColumns();
          }, 320);
        }
        return;
      }

      const existing = kitchenOrders[order_ref];
      if (existing && existing.status !== status) {
        if (!_kitchenTransitioning.has(order_ref)) {
          if (status === 'prep' && prep_started_at) existing.prep_started_at = prep_started_at;
          updateKitchenOrderStatus(order_ref, status, table_number || existing.table);
        }
      }
    });

    _socket.on('disconnect', (reason) => { console.log('[socket] disconnected:', reason); });
  };
  document.head.appendChild(script);
}