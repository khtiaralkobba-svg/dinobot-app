/* ══════════════════════════════════════════════════════════
   robot-analytics.js — Robot performance overlay
══════════════════════════════════════════════════════════ */

let raData = {
  dispatches: 0,
  deliveryTimes: [],
  batteryReadings: [],
  estopEvents: 0,
  distanceTraveled: 0,
  avgSpeed: 0,
  lastBattery: null,
  batteryUsed: 0,
  obstaclesAvoided: 0,
};

function raTrackDispatch() { raData.dispatches++; raData._dispatchStart = Date.now(); }
function raTrackDelivery() {
  if (raData._dispatchStart) {
    raData.deliveryTimes.push((Date.now() - raData._dispatchStart) / 1000);
    raData._dispatchStart = null;
  }
}
async function raTrackEStop() {
  raData.estopEvents++;
  try {
    await fetch(API_BASE + '/api/robot-stats/estop', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ triggered_by: currentUser?.employee_id || 'manager' })
    });
  } catch {}
}
function raTrackBattery(pct) {
  raData.batteryReadings.push(pct);
  if (raData.lastBattery !== null && pct < raData.lastBattery) {
    raData.batteryUsed += raData.lastBattery - pct;
  }
  raData.lastBattery = pct;
}
function raTrackSpeed(speed) { raData.avgSpeed = speed; }

async function raTrackObstacleAvoided() {
  raData.obstaclesAvoided++;
  try {
    await fetch(API_BASE + '/api/robot-stats/obstacle', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ obstacles_avoided: raData.obstaclesAvoided })
    });
  } catch {}
}

async function openRobotAnalyticsOverlay() {
  let el = document.getElementById('robot-analytics-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'robot-analytics-overlay';
    document.body.appendChild(el);
  }
  const isLight = document.body.classList.contains('light-mode');
  el.style.cssText = `display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;overflow-y:auto;background:${isLight?'#f4faff':'#020b1a'};z-index:9500;`;
 

  el.innerHTML = `
    <div style="position:static;z-index:2;padding:80px 48px 40px;border-bottom:1px solid rgba(251,185,36,0.2);background:${isLight?'linear-gradient(160deg,rgba(255,106,0,0.06) 0%,transparent 60%)':'linear-gradient(160deg,rgba(40,30,5,0.45) 0%,transparent 60%)'};flex-shrink:0;">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:12px;color:rgba(251,185,36,0.8);letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">// Robot Intelligence</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:64px;line-height:1;letter-spacing:2px;color:var(--text);">ROBOT <span style="color:#FBB924;">ANALYTICS</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;font-family:'Share Tech Mono',monospace;font-size:12px;color:#4ADE80;letter-spacing:2px;"><div style="width:8px;height:8px;background:#4ADE80;border-radius:50%;animation:blink 2s ease-in-out infinite;box-shadow:0 0 8px #4ADE80;"></div> UNIT-01 TRACKED</div>
          <button onclick="closeRobotAnalyticsOverlay()" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.4);color:#ef4444;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:3px;cursor:pointer;clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.18)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'">✕ CLOSE</button>
        </div>
      </div>
    </div>
    <div id="ra-body" style="padding:32px 48px 80px;display:flex;flex-direction:column;gap:20px;">
      <div style="text-align:center;padding:80px;font-family:'Share Tech Mono',monospace;font-size:12px;letter-spacing:3px;color:rgba(251,185,36,0.6);">⬡ LOADING LIVE DATA...</div>
    </div>`;

  // Fetch real data
  let orders = [];
  try {
    const res = await fetch(API_BASE + '/api/orders/all', { headers: authHeaders({ 'Content-Type': 'application/json' }) });
    if (res.ok) { const data = await res.json(); orders = data.orders || []; }
  } catch { showToast('⬡ Using session data — backend unavailable'); }

  // Compute stats from real orders
  const delivered = orders.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at);
  const deliveryTimes = delivered.map(o => (new Date(o.delivered_at) - new Date(o.placed_at)) / 1000);
  const dispatched = orders.filter(o => (o.dispatch_count || 0) > 0 || ['dispatched','delivering','delivered'].includes(o.status));
  let estops = raData.estopEvents;
  let totalObstaclesAvoided = raData.obstaclesAvoided;
  try {
    const obsRes = await fetch(API_BASE + '/api/robot-stats/obstacle', { headers: authHeaders({ 'Content-Type': 'application/json' }) });
    if (obsRes.ok) {
        const od = await obsRes.json();
        totalObstaclesAvoided = od.obstacles_avoided || raData.obstaclesAvoided;
      }
    } catch {}
try {
  const estopRes = await fetch(API_BASE + '/api/robot-stats/estop', { headers: authHeaders({ 'Content-Type': 'application/json' }) });
  if (estopRes.ok) { const ed = await estopRes.json(); estops = ed.estop_events?.length || 0; }
} catch {} // still session-only
  const avgDelivery = deliveryTimes.length ? Math.round(deliveryTimes.reduce((a,b)=>a+b,0) / deliveryTimes.length) : null;
  const minDelivery = deliveryTimes.length ? Math.round(Math.min(...deliveryTimes)) : null;
  const maxDelivery = deliveryTimes.length ? Math.round(Math.max(...deliveryTimes)) : null;
  const avgBat = raData.batteryReadings.length ? Math.round(raData.batteryReadings.reduce((a,b)=>a+b,0) / raData.batteryReadings.length) : null;
  const maxT = deliveryTimes.length ? Math.max(...deliveryTimes) : 1;

  // Recent 20 deliveries for bar chart
  const recentTimes = deliveryTimes.slice(-20);

  const body = document.getElementById('ra-body');
  body.innerHTML = `
    <!-- Stat cards -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;">
      ${[
        ['Total Dispatches', dispatched.length, 'all time', '#FBB924'],
        ['Avg Delivery Time', avgDelivery ? avgDelivery+'s' : '—', 'placed → delivered', '#4ADE80'],
        ['Battery Used', raData.batteryUsed ? raData.batteryUsed.toFixed(1)+'%' : '—', 'this session', '#60A5FA'],
        ['E-Stop Events', estops, 'this session', '#ef4444'],
        ['Obstacles Avoided', totalObstaclesAvoided, 'all time + session', '#C084FC'],
      ].map(([lbl,val,sub,color]) => `
        <div style="background:${isLight?'#e8f4fd':'linear-gradient(160deg,#071828,#061422)'};border:1px solid ${isLight?'rgba(30,100,200,0.2)':'rgba(251,185,36,0.15)'};padding:20px 22px;">
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:${isLight?'rgba(20,8,0,0.7)':'var(--text-dim)'};text-transform:uppercase;margin-bottom:8px;">${lbl}</div>
          <div class="${lbl==='Total Dispatches'?'ra-card-dispatches':lbl==='Avg Delivery Time'?'ra-card-avgdelivery':lbl==='Battery Used'?'ra-card-battery':lbl==='E-Stop Events'?'ra-card-estops':'ra-card-obstacles'}" style="font-family:'Bebas Neue',sans-serif;font-size:36px;letter-spacing:2px;color:${color};line-height:1;">${val}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.5)':'var(--text-dim)'};letter-spacing:1px;margin-top:4px;">${sub}</div>
        </div>`).join('')}
    </div>

    <!-- Breakdown -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:${isLight?'#e8f4fd':'linear-gradient(160deg,rgba(10,25,60,0.98),rgba(5,15,40,0.98))'};border:1px solid ${isLight?'rgba(30,100,200,0.2)':'rgba(251,185,36,0.2)'};padding:28px 32px;">
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:#FBB924;text-transform:uppercase;margin-bottom:20px;border-bottom:1px solid rgba(251,185,36,0.15);padding-bottom:10px;">⬡ Delivery Time Breakdown</div>
        ${[
          ['Average', avgDelivery ? avgDelivery+'s' : '—'],
          ['Fastest', minDelivery ? minDelivery+'s' : '—'],
          ['Slowest', maxDelivery ? maxDelivery+'s' : '—'],
          ['Total Deliveries', deliveryTimes.length],
        ].map(([l,v]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid ${isLight?'rgba(30,100,200,0.1)':'rgba(255,255,255,0.05)'}">
            <span style="font-family:'Share Tech Mono',monospace;font-size:13px;color:${isLight?'rgba(20,8,0,0.7)':'var(--text-dim)'};letter-spacing:2px;">${l}</span>
            <span style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:${isLight?'#1C0F00':'var(--text)'};letter-spacing:1px;">${v}</span>
          </div>`).join('')}
      </div>

      <div style="background:${isLight?'#e8f4fd':'linear-gradient(160deg,rgba(10,25,60,0.98),rgba(5,15,40,0.98))'};border:1px solid ${isLight?'rgba(30,100,200,0.2)':'rgba(251,185,36,0.2)'};padding:28px 32px;">
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:#FBB924;text-transform:uppercase;margin-bottom:20px;border-bottom:1px solid rgba(251,185,36,0.15);padding-bottom:10px;">⬡ Battery & Power</div>
        ${[
          ['Current Battery', raData.lastBattery !== null ? raData.lastBattery+'%' : '—'],
          ['Avg Battery', avgBat !== null ? avgBat+'%' : '—'],
          ['Total Drain', raData.batteryUsed ? raData.batteryUsed.toFixed(1)+'%' : '—'],
          ['Readings Taken', raData.batteryReadings.length],
        ].map(([l,v]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid ${isLight?'rgba(30,100,200,0.1)':'rgba(255,255,255,0.05)'}">
            <span style="font-family:'Share Tech Mono',monospace;font-size:13px;color:${isLight?'rgba(20,8,0,0.7)':'var(--text-dim)'};letter-spacing:2px;">${l}</span>
            <span style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:${isLight?'#1C0F00':'var(--text)'};letter-spacing:1px;">${v}</span>
          </div>`).join('')}
      </div>
    </div>

    <!-- Bar chart -->
    <div style="background:${isLight?'#e8f4fd':'linear-gradient(160deg,rgba(10,25,60,0.98),rgba(5,15,40,0.98))'};border:1px solid ${isLight?'rgba(30,100,200,0.2)':'rgba(96,165,250,0.2)'};padding:40px 48px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:36px;">
        <div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:#60A5FA;text-transform:uppercase;margin-bottom:6px;">⬡ Performance History</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:3px;color:${isLight?'#1C0F00':'#ffffff'};">DELIVERY TIMES — LAST ${recentTimes.length} RUNS</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:48px;color:#60A5FA;line-height:1;">${deliveryTimes.length}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.5)':'rgba(180,210,245,0.8)'};">TOTAL RUNS</div>
        </div>
      </div>
      ${recentTimes.length === 0 ? `
        <div style="text-align:center;padding:48px 0;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:3px;color:${isLight?'rgba(20,8,0,0.35)':'rgba(180,210,245,0.3)'};">
          ⬡ NO DELIVERED ORDERS YET
        </div>` : `
        <div style="display:flex;align-items:flex-end;gap:10px;height:220px;position:relative;">
          ${recentTimes.map((t, i) => {
            const pct  = maxT > 0 ? (t / maxT) * 100 : 0;
            const barH = Math.max(4, (pct/100)*200);
            const delay = (i * 0.06).toFixed(2);
            const isAvg = avgDelivery && Math.abs(t - avgDelivery) < avgDelivery * 0.1;
            const barColor = isAvg
              ? 'linear-gradient(to top,#1d4ed8,#60A5FA,#bae6fd)'
              : t === minDelivery
                ? 'linear-gradient(to top,#15803d,#4ADE80)'
                : t === maxDelivery
                  ? 'linear-gradient(to top,#991b1b,#ef4444)'
                  : pct > 70
                    ? 'linear-gradient(to top,#1e3a8a,#3b82f6)'
                    : 'linear-gradient(to top,#2563eb,#93c5fd)';
            const valColor = t === minDelivery ? '#4ADE80' : t === maxDelivery ? '#ef4444' : '#60A5FA';
            return `
            <div onclick="raShowBarDetail(${i}, ${t}, ${deliveryTimes.length - recentTimes.length + i}, ${avgDelivery||0}, ${minDelivery||0}, ${maxDelivery||0})" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;cursor:pointer;">
              <div style="font-family:'Bebas Neue',sans-serif;font-size:13px;color:${valColor};line-height:1;animation:valPop 0.4s ease both;animation-delay:${delay}s;">${t.toFixed(0)}s</div>
              <div style="width:100%;height:${barH}px;background:${barColor};transform-origin:bottom;animation:barRise 0.6s cubic-bezier(0.34,1.56,0.64,1) both;animation-delay:${delay}s;border-radius:2px 2px 0 0;box-shadow:0 0 12px rgba(96,165,250,0.4);"></div>
              <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.5)':'rgba(180,210,245,0.6)'};letter-spacing:1px;">R${deliveryTimes.length - recentTimes.length + i + 1}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:20px;margin-top:20px;padding-top:16px;border-top:1px solid ${isLight?'rgba(30,100,200,0.1)':'rgba(96,165,250,0.1)'};">
          <div style="display:flex;align-items:center;gap:8px;"><div style="width:24px;height:3px;background:linear-gradient(to right,#1d4ed8,#bae6fd);border-radius:2px;box-shadow:0 0 8px rgba(96,165,250,0.5);"></div><span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.5)':'rgba(180,210,245,0.6)'};letter-spacing:2px;">NEAR AVG</span></div>
          <div style="display:flex;align-items:center;gap:8px;"><div style="width:24px;height:3px;background:#4ADE80;border-radius:2px;"></div><span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.5)':'rgba(180,210,245,0.6)'};letter-spacing:2px;">FASTEST</span></div>
          <div style="display:flex;align-items:center;gap:8px;"><div style="width:24px;height:3px;background:#ef4444;border-radius:2px;"></div><span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.5)':'rgba(180,210,245,0.6)'};letter-spacing:2px;">SLOWEST</span></div>
          <div style="display:flex;align-items:center;gap:8px;"><div style="width:24px;height:3px;background:#93c5fd;border-radius:2px;"></div><span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.5)':'rgba(180,210,245,0.6)'};letter-spacing:2px;">NORMAL</span></div>
        </div>`}
    </div>`;

    // Poll obstacle count every 5 seconds while overlay is open
if (window._raObstacleInterval) clearInterval(window._raObstacleInterval);
window._raObstacleInterval = setInterval(async () => {
  if (!document.getElementById('robot-analytics-overlay') ||
      document.getElementById('robot-analytics-overlay').style.display === 'none') {
    clearInterval(window._raObstacleInterval);
    return;
  }
  if (!getAccessToken()) return;
  try {
    const [ordersRes, obsRes, estopRes] = await Promise.all([
        fetch(API_BASE + '/api/orders/all', { headers: authHeaders({ 'Content-Type': 'application/json' }) }),
        fetch(API_BASE + '/api/robot-stats/obstacle', { headers: authHeaders({ 'Content-Type': 'application/json' }) }),
        fetch(API_BASE + '/api/robot-stats/estop', { headers: authHeaders({ 'Content-Type': 'application/json' }) })
    ]);
    const orders = ordersRes.ok ? (await ordersRes.json()).orders || [] : [];
    if (!ordersRes.ok) return;
    const od = obsRes.ok ? await obsRes.json() : {};
    const ed = estopRes.ok ? await estopRes.json() : {};
    const deliveredOrders = orders.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at);
    if (deliveredOrders.length === 0) return;
    const pollDeliveryTimes = deliveredOrders.map(o => (new Date(o.delivered_at) - new Date(o.placed_at)) / 1000);
    const dispatched = orders.filter(o => (o.dispatch_count || 0) > 0 || ['dispatched','delivering','delivered'].includes(o.status));
    const avgDelivery = pollDeliveryTimes.length ? Math.round(pollDeliveryTimes.reduce((a,b)=>a+b,0) / pollDeliveryTimes.length) : null;
    const setCard = (cls, val) => { const el = document.querySelector('#ra-body .' + cls); if (el) el.textContent = val; };
    setCard('ra-card-dispatches',  dispatched.length);
    setCard('ra-card-avgdelivery', avgDelivery ? avgDelivery + 's' : '—');
    setCard('ra-card-battery',     raData.batteryUsed ? raData.batteryUsed.toFixed(1) + '%' : '—');
    setCard('ra-card-estops',      ed.estop_events?.length || 0);
    setCard('ra-card-obstacles',   od.obstacles_avoided || 0);
  } catch {}
}, 2000);

}

function raShowBarDetail(i, t, runNum, avg, min, max) {
  const isLight = document.body.classList.contains('light-mode');
  const existing = document.getElementById('ra-bar-detail');
  if (existing) existing.remove();

  const status = t === min ? '🟢 FASTEST RUN' : t === max ? '🔴 SLOWEST RUN' : Math.abs(t - avg) < avg * 0.1 ? '🔵 NEAR AVERAGE' : t > avg ? '🟡 ABOVE AVERAGE' : '🟢 BELOW AVERAGE';

  const detail = document.createElement('div');
  detail.id = 'ra-bar-detail';
  detail.style.cssText = `margin-top:20px;background:${isLight?'linear-gradient(160deg,rgba(30,100,200,0.08),rgba(30,100,200,0.04))':'linear-gradient(160deg,rgba(96,165,250,0.08),rgba(30,60,120,0.3))'};border:1px solid ${isLight?'rgba(30,100,200,0.25)':'rgba(96,165,250,0.35)'};border-left:4px solid #60A5FA;padding:24px 32px;display:grid;grid-template-columns:auto 1fr auto;gap:32px;align-items:center;`;
  detail.innerHTML = `
    <div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:4px;color:#60A5FA;text-transform:uppercase;margin-bottom:6px;">RUN #${runNum + 1}</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:56px;color:#60A5FA;line-height:1;">${t.toFixed(0)}<span style="font-size:24px;">s</span></div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:${isLight?'rgba(20,8,0,0.5)':'rgba(180,210,245,0.6)'};margin-top:6px;letter-spacing:2px;">${status}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
      ${[
        ['vs Average', avg ? (t - avg > 0 ? '+' : '') + (t - avg).toFixed(0) + 's' : '—', t > avg ? '#ef4444' : '#4ADE80'],
        ['vs Fastest', min ? '+' + (t - min).toFixed(0) + 's' : '—', '#60A5FA'],
        ['vs Slowest', max ? (t - max).toFixed(0) + 's' : '—', '#4ADE80'],
      ].map(([l,v,c]) => `
        <div style="background:${isLight?'rgba(30,100,200,0.06)':'rgba(96,165,250,0.06)'};border:1px solid ${isLight?'rgba(30,100,200,0.15)':'rgba(96,165,250,0.15)'};padding:14px 18px;">
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:${isLight?'rgba(20,8,0,0.5)':'rgba(180,210,245,0.5)'};text-transform:uppercase;margin-bottom:6px;">${l}</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:${c};letter-spacing:1px;">${v}</div>
        </div>`).join('')}
    </div>
    <button onclick="document.getElementById('ra-bar-detail').remove()" style="background:none;border:1px solid ${isLight?'rgba(30,100,200,0.2)':'rgba(96,165,250,0.2)'};color:${isLight?'rgba(20,8,0,0.4)':'rgba(180,210,245,0.4)'};font-size:16px;cursor:pointer;padding:8px 12px;align-self:flex-start;">✕</button>`;

  const chart = document.querySelector('#ra-body > div:last-child');
  if (chart) chart.appendChild(detail);
}
function closeRobotAnalyticsOverlay() {
  const el = document.getElementById('robot-analytics-overlay');
  if (el) el.style.display = 'none';
  document.body.style.overflow = '';
  if (window._raObstacleInterval) clearInterval(window._raObstacleInterval);
}

window.addEventListener('beforeunload', () => {
  if (raData.dispatches > 0 || raData.batteryUsed > 0) {
    navigator.sendBeacon(API_BASE + '/api/robot-stats/session', JSON.stringify({
      battery_start: raData.batteryReadings[0] || null,
      battery_end:   raData.lastBattery,
      battery_used:  raData.batteryUsed,
      dispatches:    raData.dispatches,
      obstacles_avoided: raData.obstaclesAvoided
    }));
  }
});