/* ══════════════════════════════════════════════════════════
   analytics.js — Analytics engine, predictive delay, leaderboard
══════════════════════════════════════════════════════════ */

const analytics = {
  prepTimes: [],
  lateOrders: 0,
  totalOrders: 0,
  completedOrders: 0,
  cancelledOrders: 0,
  dispatches: 0,
  fastestPrep: null,
  slowestPrep: null,
  waitTimes: [],
  stuckOrders: 0,
};

let _analyticsInterval = null;

/* ── PREDICTIVE ENGINE ───────────────────────────────────── */
function getPredictedETA(orderRef) {
  const avgPrep = analytics.prepTimes.length
    ? analytics.prepTimes.reduce((a, b) => a + b, 0) / analytics.prepTimes.length
    : 8;
  const order = kitchenOrders[orderRef];
  if (!order) return null;
  const ordersAhead = Object.values(kitchenOrders).filter(o =>
    o.status === 'new' && new Date(o.placed_at) < new Date(order.placed_at)
  ).length;
  const ordersInPrep = Object.values(kitchenOrders).filter(o => o.status === 'prep').length;
  const queueDelay = ordersAhead * avgPrep;
  const prepBurden = ordersInPrep > 0 ? avgPrep * 0.5 : 0;
  const totalETA = queueDelay + prepBurden + avgPrep;
  return { avgPrep: Math.round(avgPrep * 10) / 10, ordersAhead, totalETA: Math.round(totalETA * 10) / 10 };
}

function getKitchenPrediction(ref) {
  const order = kitchenOrders[ref];
  if (!order || !order.prep_started_at) return null;
  const avgPrep = analytics.prepTimes.length
    ? analytics.prepTimes.reduce((a, b) => a + b, 0) / analytics.prepTimes.length
    : 8;
  const elapsed = (Date.now() - new Date(order.prep_started_at).getTime()) / 60000;
  const remaining = avgPrep - elapsed;
  const willBeLateIn = ALERT.WARN - elapsed;
  return {
    elapsed: Math.round(elapsed * 10) / 10,
    remaining: Math.round(remaining * 10) / 10,
    willBeLateIn: Math.round(willBeLateIn * 10) / 10,
    isOnTrack: elapsed < avgPrep * 0.7
  };
}

/* ── RECORD HELPERS ──────────────────────────────────────── */
function recordPrepTime(ref) {
  const order = kitchenOrders[ref];
  if (!order || !order.prep_started_at) return;
  const mins = (Date.now() - new Date(order.prep_started_at).getTime()) / 60000;
  analytics.prepTimes.push(mins);
  analytics.completedOrders++;
  analytics.totalOrders++;
  if (mins > 15) analytics.lateOrders++;
  if (analytics.fastestPrep === null || mins < analytics.fastestPrep) analytics.fastestPrep = mins;
  if (analytics.slowestPrep === null || mins > analytics.slowestPrep) analytics.slowestPrep = mins;
  updateAnalyticsUI();
}

function recordCancelled() { analytics.cancelledOrders++; analytics.totalOrders++; updateAnalyticsUI(); }
function recordDispatch()   { analytics.dispatches++; updateAnalyticsUI(); }

function recordWaitTime(ref) {
  const order = kitchenOrders[ref];
  if (!order || !order.placed_at) return;
  const mins = (Date.now() - new Date(order.placed_at).getTime()) / 60000;
  analytics.waitTimes.push(mins);
}

/* ── FORMAT HELPERS ──────────────────────────────────────── */
function fmtMins(mins) {
  if (mins === null || mins === undefined) return '—';
  const totalSeconds = Math.round(mins * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/* ── UPDATE UI ───────────────────────────────────────────── */
function updateAnalyticsUI() {
  const avgPrep = analytics.prepTimes.length
    ? analytics.prepTimes.reduce((a,b) => a+b, 0) / analytics.prepTimes.length
    : null;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Avg prep
  setEl('an-avg-prep', avgPrep !== null ? fmtMins(avgPrep) : '—');
  setEl('an-avg-prep-sub', analytics.prepTimes.length ? `based on ${analytics.prepTimes.length} order${analytics.prepTimes.length>1?'s':''}` : 'no completed orders yet');
  const prepBarPct = avgPrep !== null ? Math.min(100, (avgPrep / 10) * 100) : 0;
  const prepBar = document.getElementById('an-avg-prep-bar');
  if (prepBar) prepBar.style.width = prepBarPct + '%';
  setEl('an-avg-prep-pct', avgPrep !== null ? Math.round(prepBarPct) + '%' : '—');

  // Late orders
  const lateRate = analytics.totalOrders > 0 ? (analytics.lateOrders / analytics.totalOrders) * 100 : 0;
  const lateEl = document.getElementById('an-late');
  if (lateEl) { lateEl.textContent = analytics.lateOrders; lateEl.className = 'ac-value ' + (lateRate < 10 ? 'green' : lateRate < 25 ? 'orange' : 'red'); }
  setEl('an-late-sub', `of ${analytics.totalOrders} total order${analytics.totalOrders!==1?'s':''}`);
  const lateBar = document.getElementById('an-late-bar');
  if (lateBar) lateBar.style.width = Math.min(100, lateRate) + '%';
  setEl('an-late-pct', Math.round(lateRate) + '%');

  // Robot efficiency
  const effScore = analytics.completedOrders > 0
    ? Math.min(100, (analytics.dispatches / analytics.completedOrders) * 100)
    : 0;
  const effLabel = effScore === 0 ? '—' : effScore >= 90 ? 'OPTIMAL' : effScore >= 60 ? 'GOOD' : 'LOW';
  const efficiencyEl = document.getElementById('an-efficiency');
  if (efficiencyEl) { efficiencyEl.textContent = effLabel; efficiencyEl.className = 'ac-value ' + (effScore >= 90 ? 'green' : effScore >= 60 ? 'orange' : 'red'); }
  setEl('an-efficiency-sub', `${analytics.dispatches} dispatch${analytics.dispatches!==1?'es':''}`);
  const effBar = document.getElementById('an-efficiency-bar');
  if (effBar) effBar.style.width = effScore + '%';
  setEl('an-efficiency-pct', Math.round(effScore) + '%');

  // Breakdown
  setEl('an-completed', analytics.completedOrders);
  setEl('an-fastest', fmtMins(analytics.fastestPrep));
  setEl('an-slowest', fmtMins(analytics.slowestPrep));
  setEl('an-dispatches', analytics.dispatches);
  const avgWait = analytics.waitTimes.length ? analytics.waitTimes.reduce((a,b)=>a+b,0)/analytics.waitTimes.length : null;
  setEl('an-avg-wait', fmtMins(avgWait));
  setEl('an-stuck', analytics.stuckOrders || 0);

  const cancelledEl = document.getElementById('an-cancelled');
  if (cancelledEl) { cancelledEl.textContent = analytics.cancelledOrders; cancelledEl.className = 'ab-val ' + (analytics.cancelledOrders === 0 ? 'good' : analytics.cancelledOrders > 3 ? 'bad' : 'warn'); }
  const slowestEl = document.getElementById('an-slowest');
  if (slowestEl && analytics.slowestPrep !== null) slowestEl.className = 'ab-val ' + (analytics.slowestPrep < 10 ? 'good' : analytics.slowestPrep < 15 ? 'warn' : 'bad');
  const stuckEl = document.getElementById('an-stuck');
  if (stuckEl) stuckEl.className = 'ab-val ' + (analytics.stuckOrders === 0 ? 'good' : analytics.stuckOrders > 3 ? 'bad' : 'warn');

  if (!document.getElementById('an-leaderboard').dataset.loaded) loadItemLeaderboard();
}

async function loadItemLeaderboard() {
  if (currentRole !== 'manager') return;
  const container = document.getElementById('an-leaderboard');
  if (!container) return;
  container.innerHTML = '<div style="font-family:\'Share Tech Mono\',monospace;font-size:10px;letter-spacing:2px;color:var(--text-dim);text-align:center;padding:16px;">⬡ LOADING...</div>';
  try {
    const res = await fetch(API_BASE + '/api/orders/item-stats', { headers: authHeaders({ 'Content-Type': 'application/json' }) });
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    const items = data.items || [];
    if (items.length === 0) {
      container.innerHTML = '<div style="color:var(--text-dim);font-family:\'Share Tech Mono\',monospace;font-size:10px;padding:16px;text-align:center;">No data yet</div>';
      return;
    }
    container.dataset.loaded = 'true';
    const maxQty = items[0].qty;
    container.innerHTML = items.slice(0, 8).map((item, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--card-bg,rgba(5,20,60,0.5));border:1px solid var(--border);border-left:3px solid ${i===0?'#FF6B1A':i===1?'rgba(255,107,26,0.6)':i===2?'rgba(255,107,26,0.4)':'rgba(255,107,26,0.15)'};margin-bottom:6px;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;color:${i===0?'#FF6B1A':'var(--text-dim)'};width:28px;flex-shrink:0;">#${i+1}</div>
        <div style="font-size:24px;flex-shrink:0;">${item.emoji||'🍽️'}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:1px;color:var(--text);margin-bottom:4px;">${item.name}</div>
          <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;"><div style="height:100%;width:${Math.round((item.qty/maxQty)*100)}%;background:${i===0?'linear-gradient(90deg,#FF6B1A,#ffb07a)':'linear-gradient(90deg,rgba(255,107,26,0.5),rgba(255,107,26,0.2))'};"></div></div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;color:${i===0?'#FF6B1A':'var(--text)'};">${item.qty.toLocaleString()}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:1px;color:var(--text-dim);">$${item.revenue.toFixed(0)} revenue</div>
        </div>
      </div>`).join('');
  } catch {
    container.innerHTML = '<div style="color:var(--text-dim);font-family:\'Share Tech Mono\',monospace;font-size:10px;padding:16px;text-align:center;">Could not load data</div>';
  }
}

async function loadAnalyticsFromDB() {
  if (currentRole !== 'manager') return;
  try {
    const res = await fetch(API_BASE + '/api/orders/all', { headers: authHeaders({ 'Content-Type': 'application/json' }) });
    if (!res.ok) return;
    const data = await res.json();
    const orders = data.orders || [];

    // Reset
    analytics.prepTimes = []; analytics.lateOrders = 0; analytics.totalOrders = 0;
    analytics.completedOrders = 0; analytics.cancelledOrders = 0; analytics.dispatches = 0;
    analytics.fastestPrep = null; analytics.slowestPrep = null; analytics.waitTimes = []; analytics.stuckOrders = 0;

    orders.forEach(order => {
      analytics.totalOrders++;
      if (order.status === 'cancelled') { analytics.cancelledOrders++; return; }
      if (['ready','dispatched','delivering','delivered'].includes(order.status)) analytics.completedOrders++;
      if (['dispatched','delivering','delivered'].includes(order.status)) analytics.dispatches++;
      if (order.prep_started_at && order.ready_at) {
        const mins = (new Date(order.ready_at) - new Date(order.prep_started_at)) / 60000;
        if (mins > 0.1 && mins < 120) {
          analytics.prepTimes.push(mins);
          if (mins > 15) analytics.lateOrders++;
          if (analytics.fastestPrep === null || mins < analytics.fastestPrep) analytics.fastestPrep = mins;
          if (analytics.slowestPrep === null || mins > analytics.slowestPrep) analytics.slowestPrep = mins;
        }
      }
      if (order.placed_at && order.prep_started_at) {
        const wait = (new Date(order.prep_started_at) - new Date(order.placed_at)) / 60000;
        if (wait > 0 && wait < 60) analytics.waitTimes.push(wait);
      }
    });

    try {
      const stuckRes = await fetch(API_BASE + '/api/orders/stuck', { headers: authHeaders({ 'Content-Type': 'application/json' }) });
      if (stuckRes.ok) {
        const stuckData = await stuckRes.json();
        const uniqueRefs = new Set((stuckData.stuck_orders || []).map(o => o.order_ref));
        analytics.stuckOrders = uniqueRefs.size;
      }
    } catch { analytics.stuckOrders = 0; }

    updateAnalyticsUI();
  } catch (err) { console.error('[loadAnalyticsFromDB]', err); }
}

function startAnalyticsPolling() {
  if (_analyticsInterval) clearInterval(_analyticsInterval);
  if (currentRole === 'manager') loadAnalyticsFromDB();
  _analyticsInterval = setInterval(() => {
    if (currentRole === 'manager') loadAnalyticsFromDB();
  }, 10000);
}

/* ── ANALYTICS OVERLAY ───────────────────────────────────── */
function openAnalyticsOverlay() {
  const el = document.getElementById('analytics-overlay');
  el.style.display = 'flex';
  el.style.position = 'fixed';
  el.style.inset = '0';
  el.style.zIndex = '10000';
  document.body.style.overflow = 'hidden';
  updateAnalyticsUI();
}

function closeAnalyticsOverlay() {
  const el = document.getElementById('analytics-overlay');
  el.style.opacity = '0'; el.style.transform = 'translateY(32px)'; el.style.transition = 'all 0.3s ease';
  setTimeout(() => {
    el.style.display = 'none'; el.style.opacity = ''; el.style.transform = ''; el.style.transition = '';
    el.style.position = ''; el.style.inset = ''; el.style.zIndex = '';
    document.body.style.overflow = '';
  }, 300);
}