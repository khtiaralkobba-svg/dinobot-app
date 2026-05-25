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
    await Promise.all([
      fetch(API_BASE + '/api/robot-stats/obstacle', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ obstacles_avoided: raData.obstaclesAvoided })
      }),
      fetch(API_BASE + '/api/robot-stats/obstacle-event', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ triggered_at: new Date().toISOString() })
      })
    ]);
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
          <div style="display:flex;align-items:center;gap:12px;position:relative;">
            <button id="ra-calendar-btn" onclick="raOpenCalendar()" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:rgba(251,185,36,0.06);border:1px solid rgba(251,185,36,0.3);color:#FBB924;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:3px;cursor:pointer;clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);transition:all 0.2s;">📅 CALENDAR</button>
            <button onclick="closeRobotAnalyticsOverlay()" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.4);color:#ef4444;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:3px;cursor:pointer;clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.18)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'">✕ CLOSE</button>
          </div>
        </div>
      </div>
    </div>
    <div id="ra-body" style="padding:32px 48px 80px;display:flex;flex-direction:column;gap:20px;">
      <div style="text-align:center;padding:80px;font-family:'Share Tech Mono',monospace;font-size:12px;letter-spacing:3px;color:rgba(251,185,36,0.6);">⬡ LOADING LIVE DATA...</div>
    </div>`;

  // Fetch real data
  let orders = [];
  try {
    const res = await fetch(API_BASE + '/api/orders/all', { headers: authHeaders({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }) });
    if (res.status === 401) {
      showToast('⚠ Session expired — please log in again');
      closeRobotAnalyticsOverlay();
      doLogout();
      return;
    }
    if (res.ok) { const data = await res.json(); orders = data.orders || []; }
    window._raAllOrders = orders;
  } catch { showToast('⬡ Using session data — backend unavailable'); }
  // Compute stats from real orders
  const delivered = orders.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at);
  const deliveryTimes = delivered.map(o => (new Date(o.delivered_at) - new Date(o.placed_at)) / 1000);
  const dispatched = orders.filter(o => o.status === 'delivered');
  let estops = raData.estopEvents;
  let totalObstaclesAvoided = raData.obstaclesAvoided;
  try {
    const obsRes = await fetch(API_BASE + '/api/robot-stats/obstacle', { headers: authHeaders() });
    if (obsRes.ok) {
        const od = await obsRes.json();
        totalObstaclesAvoided = od.obstacles_avoided || raData.obstaclesAvoided;
        window._raTotalObstacles = totalObstaclesAvoided;
    }
    } catch {}
try {
  const estopRes = await fetch(API_BASE + '/api/robot-stats/estop', { headers: authHeaders() });
  if (estopRes.ok) { const ed = await estopRes.json(); estops = ed.estop_events?.length || 0; window._raEstopEvents = ed.estop_events || []; }
  window._raTotalEstops = estops;
} catch {}

try {
  const obsEvRes = await fetch(API_BASE + '/api/robot-stats/obstacle-event', { headers: authHeaders() });
  if (obsEvRes.ok) { const od2 = await obsEvRes.json(); window._raObstacleEvents = od2.obstacle_events || []; }
} catch {}

let totalManualOverrides = 0;
try {
  const manualRes = await fetch(API_BASE + '/api/robot-stats/manual', { headers: authHeaders() });
  if (manualRes.ok) { const md = await manualRes.json(); totalManualOverrides = md.manual_overrides?.length || 0; }
} catch {}
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
        ['Total Dispatches', dispatched.length, 'all time', '#FBB924', 'dispatches'],
        ['Avg Delivery Time', avgDelivery ? avgDelivery+'s' : '—', 'placed → delivered', '#4ADE80', 'delivery'],
        ['E-Stop Events', estops, 'this session', '#ef4444', 'estops'],
        ['Obstacles Avoided', totalObstaclesAvoided, 'all time + session', '#C084FC', 'obstacles'],
        ['Performance History', recentTimes.length+'  runs', 'last 20 deliveries', '#60A5FA', 'history'],
      ].map(([lbl,val,sub,color,type]) => `
        <div onclick="raShowCardChart('${type}')" id="ra-card-${type}" style="background:${isLight?'#e8f4fd':'linear-gradient(160deg,#071828,#061422)'};border:1px solid ${isLight?'rgba(30,100,200,0.2)':'rgba(251,185,36,0.15)'};padding:20px 22px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor='${color}';this.style.transform='translateY(-2px)'" onmouseout="if(window._raActiveCard!=='${type}'){this.style.borderColor='${isLight?'rgba(30,100,200,0.2)':'rgba(251,185,36,0.15)'}';this.style.transform='translateY(0)'}">
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
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:#FBB924;text-transform:uppercase;margin-bottom:20px;border-bottom:1px solid rgba(251,185,36,0.15);padding-bottom:10px;">⬡ Robot Status</div>
        ${[
          ['Avg Obstacles / Session', totalObstaclesAvoided && dispatched.length ? (totalObstaclesAvoided / dispatched.length).toFixed(1) : '—'],
          ['Avg E-Stops / Session', estops && dispatched.length ? (estops / dispatched.length).toFixed(1) : '—'],
          ['Avg Manual Overrides / Session', totalManualOverrides && dispatched.length ? (totalManualOverrides / dispatched.length).toFixed(1) : '—'],
['Current Speed', raData.avgSpeed ? raData.avgSpeed + ' units/s' : '—'],
        ].map(([l,v]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid ${isLight?'rgba(30,100,200,0.1)':'rgba(255,255,255,0.05)'}">
            <span style="font-family:'Share Tech Mono',monospace;font-size:13px;color:${isLight?'rgba(20,8,0,0.7)':'var(--text-dim)'};letter-spacing:2px;">${l}</span>
            <span style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:${isLight?'#1C0F00':'var(--text)'};letter-spacing:1px;">${v}</span>
          </div>`).join('')}
      </div>
    </div>

    <!-- Bar chart -->
    <div id="ra-chart-section" style="background:${isLight?'#e8f4fd':'linear-gradient(160deg,rgba(10,25,60,0.98),rgba(5,15,40,0.98))'};border:1px solid ${isLight?'rgba(30,100,200,0.2)':'rgba(96,165,250,0.2)'};padding:40px 48px;">
      
      <!-- Filter bar -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:28px;flex-wrap:wrap;">
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:rgba(180,210,245,0.4);margin-right:8px;">FILTER:</div>
        ${['today','week','month','all'].map(f => `
          <button onclick="raFilterChart('${f}')" id="ra-filter-${f}" style="padding:6px 16px;background:${f==='all'?'rgba(96,165,250,0.15)':'rgba(96,165,250,0.04)'};border:1px solid ${f==='all'?'rgba(96,165,250,0.5)':'rgba(96,165,250,0.15)'};color:${f==='all'?'#60A5FA':'rgba(180,210,245,0.4)'};font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);">${f==='today'?'TODAY':f==='week'?'THIS WEEK':f==='month'?'THIS MONTH':'ALL TIME'}</button>`).join('')}
          
      </div>

      <div id="ra-chart-inner" style="display:flex;flex-direction:column;gap:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:36px;">
          <div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:#60A5FA;text-transform:uppercase;margin-bottom:6px;">⬡ Performance History</div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:3px;color:${isLight?'#1C0F00':'#ffffff'};">DELIVERY TIMES — LAST ${recentTimes.length} RUNS</div>
          </div>
          <div style="display:flex;align-items:center;gap:16px;">
            <button onclick="raResetToDefault()" style="padding:8px 18px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.3);color:#60A5FA;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);">↺ DEFAULT VIEW</button>
            <div style="text-align:right;">
              <div style="font-family:'Bebas Neue',sans-serif;font-size:48px;color:#60A5FA;line-height:1;">${deliveryTimes.length}</div>
              <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.5)':'rgba(180,210,245,0.8)'};">TOTAL RUNS</div>
            </div>
          </div>
        </div>
        <div id="ra-bars-container">
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
              <div onclick="raShowBarDetail(${i}, ${t}, ${deliveryTimes.length - recentTimes.length + i}, ${avgDelivery||0}, ${minDelivery||0}, ${maxDelivery||0}, '${valColor}')" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;cursor:pointer;">
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
        </div>
      </div>
    </div>\``;

    // Poll obstacle count every 2 seconds while overlay is open
if (window._raObstacleInterval) clearInterval(window._raObstacleInterval);
window._raObstacleInterval = setInterval(async () => {
  if (!document.getElementById('robot-analytics-overlay') ||
      document.getElementById('robot-analytics-overlay').style.display === 'none') {
    clearInterval(window._raObstacleInterval);
    return;
  }
  if (!getAccessToken()) {
    clearInterval(window._raObstacleInterval);
    return;
  }
  try {
    const [ordersRes, obsRes, estopRes] = await Promise.all([
      fetch(API_BASE + '/api/orders/all', { headers: authHeaders({ 'Cache-Control': 'no-cache' }) }),
      fetch(API_BASE + '/api/robot-stats/obstacle', { headers: authHeaders() }),
      fetch(API_BASE + '/api/robot-stats/estop', { headers: authHeaders() })
    ]);
    if (ordersRes.status === 401) {
      clearInterval(window._raObstacleInterval);
      showToast('⚠ Session expired — please log in again');
      closeRobotAnalyticsOverlay();
      doLogout();
      return;
    }
    const orders = ordersRes.ok ? (await ordersRes.json()).orders || [] : [];
const od = obsRes.ok ? await obsRes.json() : {};
const ed = estopRes.ok ? await estopRes.json() : {};
const delivered = orders.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at);
const deliveryTimes = delivered.map(o => (new Date(o.delivered_at) - new Date(o.placed_at)) / 1000);
const dispatched = orders.filter(o => o.status === 'delivered');
const avgDelivery = deliveryTimes.length ? Math.round(deliveryTimes.reduce((a,b)=>a+b,0)/deliveryTimes.length) : null;
window._raAllOrders = orders;
const setCard = (cls, val) => { const el = document.querySelector('#ra-body .' + cls); if (el) el.textContent = val; };
if (!window._raCalendarFilter) {
  setCard('ra-card-dispatches', dispatched.length);
  setCard('ra-card-avgdelivery', avgDelivery ? avgDelivery + 's' : '—');
  setCard('ra-card-estops', ed.estop_events?.length || 0);
  const fetchedObstacles = od.obstacles_avoided || raData.obstaclesAvoided || 0;
window._raTotalObstacles = fetchedObstacles;
setCard('ra-card-obstacles', fetchedObstacles);
  setCard('ra-card-history', deliveryTimes.length + '  runs');
}
setCard('ra-card-battery', raData.batteryUsed ? raData.batteryUsed.toFixed(1) + '%' : '—');
  } catch {}
}, 2000);

}

function raShowBarDetail(i, t, runNum, avg, min, max, barColor) {
  const isLight = document.body.classList.contains('light-mode');
  const existing = document.getElementById('ra-bar-detail');
  if (existing) existing.remove();

  const isFastest = t === min;
  const isSlowest = t === max;
  const isNearAvg = avg && Math.abs(t - avg) < avg * 0.1;
  const isAboveAvg = t > avg;

  const statusLabel = isFastest ? 'FASTEST RUN' : isSlowest ? 'SLOWEST RUN' : isNearAvg ? 'NEAR AVERAGE' : isAboveAvg ? 'ABOVE AVERAGE' : 'BELOW AVERAGE';
  const statusColor = isFastest ? '#4ADE80' : isSlowest ? '#ef4444' : isNearAvg ? '#60A5FA' : isAboveAvg ? '#FBB924' : '#4ADE80';
  const accentColor = barColor || (isFastest ? '#4ADE80' : isSlowest ? '#ef4444' : '#3b82f6');
  function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
const hex = barColor || accentColor;
const bgGradient = isLight ? '#e8f4fd' : `linear-gradient(135deg,${hexToRgba(hex, 0.15)},${hexToRgba(hex, 0.05)})`;

  const perfPct = avg ? Math.round((1 - (t - min) / (max - min + 1)) * 100) : 50;

  const detail = document.createElement('div');
  detail.id = 'ra-bar-detail';
  detail.style.cssText = `margin-top:24px;`;
  detail.innerHTML = `
    <div style="background:${bgGradient};border:1px solid ${isLight?'rgba(30,100,200,0.2)':'rgba(96,165,250,0.15)'};overflow:hidden;">
      
      <!-- Top accent bar -->
      <div style="height:3px;background:linear-gradient(to right,${accentColor},${accentColor}80,transparent);"></div>

      <div style="padding:32px 40px;display:grid;grid-template-columns:280px 1fr;gap:40px;align-items:start;">
        
        <!-- LEFT: Main metric -->
        <div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:${isLight?'rgba(20,8,0,0.4)':'rgba(180,210,245,0.35)'};text-transform:uppercase;margin-bottom:16px;">⬡ RUN #${runNum + 1} ANALYSIS</div>
          
          <div style="font-family:'Bebas Neue',sans-serif;font-size:88px;color:${accentColor};line-height:0.85;letter-spacing:2px;margin-bottom:4px;">${t.toFixed(0)}<span style="font-size:32px;opacity:0.6;">s</span></div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:${isLight?'rgba(20,8,0,0.4)':'rgba(180,210,245,0.35)'};margin-bottom:20px;">DELIVERY DURATION</div>

          <!-- Status badge -->
          <div style="display:inline-flex;align-items:center;gap:10px;padding:8px 16px;background:${statusColor}15;border:1px solid ${statusColor}35;clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);margin-bottom:24px;">
            <div style="width:7px;height:7px;border-radius:50%;background:${statusColor};box-shadow:0 0 8px ${statusColor};animation:blink 2s ease-in-out infinite;"></div>
            <span style="font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:3px;color:${statusColor};text-transform:uppercase;">${statusLabel}</span>
          </div>

          <!-- Performance bar -->
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:2px;color:${isLight?'rgba(20,8,0,0.4)':'rgba(180,210,245,0.35)'};">PERFORMANCE SCORE</span>
              <span style="font-family:'Bebas Neue',sans-serif;font-size:14px;color:${statusColor};">${perfPct}%</span>
            </div>
            <div style="height:4px;background:${isLight?'rgba(30,100,200,0.1)':'rgba(96,165,250,0.1)'};border-radius:2px;overflow:hidden;">
              <div style="height:100%;width:${perfPct}%;background:linear-gradient(to right,${accentColor}80,${accentColor});border-radius:2px;transition:width 0.8s ease;"></div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Comparison stats -->
        <div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:${isLight?'rgba(20,8,0,0.4)':'rgba(180,210,245,0.35)'};text-transform:uppercase;margin-bottom:16px;">⬡ COMPARATIVE METRICS</div>
          
          <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px;">
            ${[
              ['VS SESSION AVERAGE', avg ? (t - avg > 0 ? '+' : '') + (t - avg).toFixed(0) + 's' : '—', t > avg ? '#ef4444' : '#4ADE80', t > avg ? '▲ slower' : '▼ faster', avg ? avg.toFixed(0) + 's avg' : ''],
              ['VS FASTEST RUN', min ? '+' + (t - min).toFixed(0) + 's' : '—', '#60A5FA', 'gap from best', min ? min.toFixed(0) + 's best' : ''],
              ['VS SLOWEST RUN', max ? (t - max).toFixed(0) + 's' : '—', '#4ADE80', 'gap from worst', max ? max.toFixed(0) + 's worst' : ''],
            ].map(([l, v, c, hint, ref]) => `
              <div style="display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center;padding:14px 18px;background:${isLight?'rgba(30,100,200,0.04)':'rgba(96,165,250,0.03)'};border:1px solid ${isLight?'rgba(30,100,200,0.08)':'rgba(96,165,250,0.07)'};">
                <div>
                  <div style="font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:3px;color:${isLight?'rgba(20,8,0,0.4)':'rgba(180,210,245,0.35)'};text-transform:uppercase;margin-bottom:2px;">${l}</div>
                  <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.3)':'rgba(180,210,245,0.25)'};">${hint}</div>
                </div>
                <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.3)':'rgba(180,210,245,0.25)'};">${ref}</div>
                <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:${c};letter-spacing:1px;text-align:right;">${v}</div>
              </div>`).join('')}
          </div>

          <!-- Close button -->
          <div style="display:flex;justify-content:flex-end;">
            <button onclick="document.getElementById('ra-bar-detail').remove()" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:3px;cursor:pointer;clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='rgba(239,68,68,0.06)'">✕ DISMISS</button>
          </div>
        </div>
      </div>
    </div>`;

  const chart = document.getElementById('ra-chart-section');
if (chart) chart.appendChild(detail);
}
function closeRobotAnalyticsOverlay() {
  const el = document.getElementById('robot-analytics-overlay');
  if (el) el.style.display = 'none';
  document.body.style.overflow = '';
  if (window._raObstacleInterval) clearInterval(window._raObstacleInterval);
}

function raResetToDefault() {
  window._raActiveCard = null;
  window._raCalendarFilter = null;
_raCalendarDate = { year: new Date().getFullYear(), month: new Date().getMonth(), day: null, mode: 'day' };

// Reset calendar button label
const calBtn = document.getElementById('ra-calendar-btn');
if (calBtn) calBtn.textContent = '📅 CALENDAR';

// Restore original stat cards
const allOrders = window._raAllOrders || [];
const _delivered = allOrders.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at);
const _times = _delivered.map(o => (new Date(o.delivered_at) - new Date(o.placed_at)) / 1000);
const _dispatched = allOrders.filter(o => o.status === 'delivered');
const _avg = _times.length ? Math.round(_times.reduce((a,b)=>a+b,0)/_times.length) : null;
const setCard = (cls, val) => { const el = document.querySelector('#ra-body .' + cls); if (el) el.textContent = val; };
setCard('ra-card-dispatches', _dispatched.length);
setCard('ra-card-avgdelivery', _avg ? _avg + 's' : '—');
setCard('ra-card-history', _times.length + '  runs');
setCard('ra-card-obstacles', window._raTotalObstacles || 0);
setCard('ra-card-estops', window._raTotalEstops || 0);
  document.querySelectorAll('[id^="ra-card-"]').forEach(c => {
    c.style.transform = 'translateY(0)';
    c.style.borderColor = 'rgba(251,185,36,0.15)';
  });
  const chartEl = document.getElementById('ra-chart-section');
  if (!chartEl) return;
  
  const isLight = document.body.classList.contains('light-mode');
  const orders = window._raAllOrders || [];
  const delivered = orders.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at);
  const deliveryTimes = delivered.map(o => (new Date(o.delivered_at) - new Date(o.placed_at)) / 1000);
  const recentTimes = deliveryTimes.slice(-20);
  const maxT = deliveryTimes.length ? Math.max(...deliveryTimes) : 1;
  const avgDelivery = deliveryTimes.length ? Math.round(deliveryTimes.reduce((a,b)=>a+b,0)/deliveryTimes.length) : null;
  const minDelivery = deliveryTimes.length ? Math.round(Math.min(...deliveryTimes)) : null;
  const maxDelivery = deliveryTimes.length ? Math.round(Math.max(...deliveryTimes)) : null;

  chartEl.style.opacity = '0';
  chartEl.style.transition = 'opacity 0.3s ease';

  setTimeout(() => {
    chartEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:28px;flex-wrap:wrap;">
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:rgba(180,210,245,0.4);margin-right:8px;">FILTER:</div>
        ${['today','week','month','all'].map(f => `
          <button onclick="raFilterChart('${f}')" id="ra-filter-${f}" style="padding:6px 16px;background:${f==='all'?'rgba(96,165,250,0.15)':'rgba(96,165,250,0.04)'};border:1px solid ${f==='all'?'rgba(96,165,250,0.5)':'rgba(96,165,250,0.15)'};color:${f==='all'?'#60A5FA':'rgba(180,210,245,0.4)'};font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);">${f==='today'?'TODAY':f==='week'?'THIS WEEK':f==='month'?'THIS MONTH':'ALL TIME'}</button>`).join('')}
      </div>
      <div id="ra-chart-inner" style="display:flex;flex-direction:column;gap:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:36px;">
          <div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:#60A5FA;text-transform:uppercase;margin-bottom:6px;">⬡ Performance History</div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:3px;color:#ffffff;">DELIVERY TIMES — LAST ${recentTimes.length} RUNS</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:48px;color:#60A5FA;line-height:1;">${deliveryTimes.length}</div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(180,210,245,0.8);">TOTAL RUNS</div>
          </div>
        </div>
        <div id="ra-bars-container">
          ${recentTimes.length === 0 ? `<div style="text-align:center;padding:48px 0;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:3px;color:rgba(180,210,245,0.3);">⬡ NO DELIVERED ORDERS YET</div>` : `
          <div style="display:flex;align-items:flex-end;gap:10px;height:220px;">
            ${recentTimes.map((t, i) => {
              const pct = maxT > 0 ? (t/maxT)*100 : 0;
              const barH = Math.max(4,(pct/100)*200);
              const delay = (i*0.06).toFixed(2);
              const isAvg = avgDelivery && Math.abs(t-avgDelivery) < avgDelivery*0.1;
              const barColor = isAvg ? 'linear-gradient(to top,#1d4ed8,#60A5FA,#bae6fd)' : t===minDelivery ? 'linear-gradient(to top,#15803d,#4ADE80)' : t===maxDelivery ? 'linear-gradient(to top,#991b1b,#ef4444)' : 'linear-gradient(to top,#2563eb,#93c5fd)';
              const valColor = t===minDelivery ? '#4ADE80' : t===maxDelivery ? '#ef4444' : '#60A5FA';
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;">
                <div style="font-family:'Bebas Neue',sans-serif;font-size:13px;color:${valColor};animation:valPop 0.4s ease both;animation-delay:${delay}s;">${t.toFixed(0)}s</div>
                <div style="width:100%;height:${barH}px;background:${barColor};animation:barRise 0.6s cubic-bezier(0.34,1.56,0.64,1) both;animation-delay:${delay}s;border-radius:2px 2px 0 0;box-shadow:0 0 12px rgba(96,165,250,0.4);"></div>
                <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(180,210,245,0.6);">R${deliveryTimes.length-recentTimes.length+i+1}</div>
              </div>`;
            }).join('')}
          </div>`}
        </div>
      </div>`;
    chartEl.style.opacity = '1';
    chartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

function raShowCardChart(type) {
  const isLight = document.body.classList.contains('light-mode');
  const chartEl = document.getElementById('ra-chart-section');
  if (!chartEl) return;

  if (window._raActiveCard === type) {
    window._raActiveCard = null;
    document.querySelectorAll('[id^="ra-card-"]').forEach(c => {
      c.style.transform = 'translateY(0)';
      c.style.borderColor = isLight ? 'rgba(30,100,200,0.2)' : 'rgba(251,185,36,0.15)';
    });
    const chartEl2 = document.getElementById('ra-chart-section');
    if (chartEl2) {
      chartEl2.style.opacity = '0';
      setTimeout(() => {
        chartEl2.style.opacity = '1';
        chartEl2.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
    return;
  }

  window._raActiveCard = type;

  document.querySelectorAll('[id^="ra-card-"]').forEach(c => {
    c.style.transform = 'translateY(0)';
    c.style.borderColor = isLight ? 'rgba(30,100,200,0.2)' : 'rgba(251,185,36,0.15)';
  });
  const colors = { dispatches:'#FBB924', delivery:'#4ADE80', battery:'#60A5FA', estops:'#ef4444', obstacles:'#C084FC' };
  const activeCard = document.getElementById('ra-card-' + type);
  if (activeCard) {
    activeCard.style.borderColor = colors[type];
    activeCard.style.transform = 'translateY(-4px)';
  }

  chartEl.style.transition = 'opacity 0.3s ease';
  chartEl.style.opacity = '0';

  setTimeout(() => {
    const color = colors[type];
    const titles = {
  dispatches: 'DISPATCHES PER DAY — LAST 20 DAYS',
  delivery:   'DELIVERY TIMES — LAST 20 RUNS',
  battery:    'BATTERY READINGS — THIS SESSION',
  estops:     'E-STOP EVENTS — ALL TIME',
  obstacles:  'OBSTACLES AVOIDED — ALL TIME',
  history:    'PERFORMANCE HISTORY — LAST 20 RUNS'
};

    const allOrders = window._raAllOrders || [];
    const cal = window._raCalendarFilter;
    let bars = [];
    let label = '';

    if (type === 'delivery') {
      let delivered = allOrders.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at);
      if (cal) {
        delivered = delivered.filter(o => {
          const d = new Date(o.placed_at);
          if (cal.day) {
            const start = new Date(cal.year, cal.month, cal.day);
            const end = new Date(cal.year, cal.month, cal.day + 20);
            return d >= start && d <= end;
          }
          return d.getFullYear() === cal.year && d.getMonth() === cal.month;
        });
      }
      bars = delivered.slice(0, 20).map(o => ({
        val: Math.round((new Date(o.delivered_at) - new Date(o.placed_at)) / 1000),
        label: 's'
      }));
      label = 's';

    } else if (type === 'dispatches') {
      const byDay = {};
      let dispatchOrders = allOrders.filter(o => o.status === 'delivered');
      if (cal) {
        dispatchOrders = dispatchOrders.filter(o => {
          const d = new Date(o.placed_at);
          if (cal.day) {
            const start = new Date(cal.year, cal.month, cal.day);
            const end = new Date(cal.year, cal.month, cal.day + 20);
            return d >= start && d <= end;
          }
          return d.getFullYear() === cal.year && d.getMonth() === cal.month;
        });
      }
      dispatchOrders.forEach(o => {
        const day = new Date(o.placed_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
        byDay[day] = (byDay[day] || 0) + 1;
      });
      bars = Object.entries(byDay).slice(-20).map(([day, count]) => ({ val: count, label: day }));

    } else if (type === 'battery') {
      bars = raData.batteryReadings.slice(-20).map(b => ({ val: b, label: '%' }));
      label = '%';

    } else if (type === 'estops') {
      const estopEvents = window._raEstopEvents || [];
      if (cal && estopEvents.length > 0) {
        const filtered = estopEvents.filter(e => {
          const d = new Date(e.triggered_at);
          if (cal.day) return d.getFullYear() === cal.year && d.getMonth() === cal.month && d.getDate() === cal.day;
          return d.getFullYear() === cal.year && d.getMonth() === cal.month;
        });
        bars = filtered.length > 0 ? [{ val: filtered.length, label: 'selected period' }] : [{ val: 0, label: 'none' }];
      } else {
        bars = [{ val: window._raTotalEstops || 0, label: 'total' }];
      }

    } else if (type === 'obstacles') {
  const obstacleEvents = window._raObstacleEvents || [];
  const trueTotal = window._raTotalObstacles || raData.obstaclesAvoided || 0;
  if (cal) {
    if (obstacleEvents.length > 0) {
      const filtered = obstacleEvents.filter(e => {
        const d = new Date(e.triggered_at);
        if (cal.day) return d.getFullYear() === cal.year && d.getMonth() === cal.month && d.getDate() === cal.day;
        return d.getFullYear() === cal.year && d.getMonth() === cal.month;
      });
      bars = [{ val: filtered.length, label: filtered.length > 0 ? 'selected period' : 'none' }];
    } else {
      // No timestamped events to filter by — show 0 bar
      bars = [{ val: 0, label: 'no data' }];
  }
  } else {
    bars = [{ val: trueTotal, label: 'total' }];
  }
    } else if (type === 'history') {
      const allOrders = window._raAllOrders || [];
      let delivered = allOrders.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at);
      if (cal) {
        delivered = delivered.filter(o => {
          const d = new Date(o.placed_at);
          if (cal.day) {
            const start = new Date(cal.year, cal.month, cal.day);
            const end = new Date(cal.year, cal.month, cal.day + 20);
            return d >= start && d <= end;
          }
          return d.getFullYear() === cal.year && d.getMonth() === cal.month;
        });
      }
      const points = delivered.slice(-20).map((o, i) => ({
        val: Math.round((new Date(o.delivered_at) - new Date(o.placed_at)) / 1000),
        label: 'R' + (delivered.length - 20 + i + 1)
      }));
      const maxVal = Math.max(...points.map(p => p.val), 1);
      const minVal = Math.min(...points.map(p => p.val));
      const avgVal = Math.round(points.reduce((a, b) => a + b.val, 0) / points.length);
      chartEl.innerHTML = `
        <div style="padding:40px 48px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:28px;flex-wrap:wrap;">
  <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:rgba(180,210,245,0.4);margin-right:8px;">FILTER:</div>
  ${['today','week','month','all'].map(f => `
    <button onclick="raFilterChart('${f}')" id="ra-filter-${f}" style="padding:6px 16px;background:${f==='all'?'rgba(96,165,250,0.15)':'rgba(96,165,250,0.04)'};border:1px solid ${f==='all'?'rgba(96,165,250,0.5)':'rgba(96,165,250,0.15)'};color:${f==='all'?'#60A5FA':'rgba(180,210,245,0.4)'};font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);">${f==='today'?'TODAY':f==='week'?'THIS WEEK':f==='month'?'THIS MONTH':'ALL TIME'}</button>`).join('')}
</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:36px;">
            <div>
              <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:#60A5FA;text-transform:uppercase;margin-bottom:6px;">⬡ PERFORMANCE HISTORY — LAST 20 RUNS</div>
              <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:3px;color:#ffffff;">${points.length} DATA POINTS</div>
            </div>
            <div style="display:flex;gap:8px;">
              <button onclick="raResetToDefault()" style="padding:8px 18px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.3);color:#60A5FA;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);">↺ DEFAULT VIEW</button>
              <button onclick="raShowCardChart('history')" style="padding:8px 18px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;">✕ RESET</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px;">
            ${[
              ['FASTEST', minVal + 's', '#4ADE80'],
              ['AVERAGE', avgVal + 's', '#60A5FA'],
              ['SLOWEST', maxVal + 's', '#ef4444'],
            ].map(([l,v,c]) => `
              <div style="padding:14px 20px;background:rgba(96,165,250,0.04);border:1px solid rgba(96,165,250,0.08);border-top:2px solid ${c};">
                <div style="font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:3px;color:rgba(180,210,245,0.4);margin-bottom:6px;">${l}</div>
                <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:${c};letter-spacing:2px;">${v}</div>
              </div>`).join('')}
          </div>
          <div style="position:relative;height:180px;margin-bottom:24px;">
            <svg width="100%" height="100%" viewBox="0 0 1000 180" preserveAspectRatio="none" style="overflow:visible;">
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#60A5FA" stop-opacity="0.3"/>
                  <stop offset="100%" stop-color="#60A5FA" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <line x1="0" y1="${((maxVal-avgVal)/(maxVal-minVal+1))*160+10}" x2="1000" y2="${((maxVal-avgVal)/(maxVal-minVal+1))*160+10}" stroke="#FBB924" stroke-width="1" stroke-dasharray="6,4" opacity="0.4"/>
              <path d="M${points.map((p,i) => `${(i/(points.length-1))*1000},${((maxVal-p.val)/(maxVal-minVal+1))*160+10}`).join(' L')} L1000,170 L0,170 Z" fill="url(#lineGrad)"/>
              <polyline points="${points.map((p,i) => `${(i/(points.length-1))*1000},${((maxVal-p.val)/(maxVal-minVal+1))*160+10}`).join(' ')}" fill="none" stroke="#60A5FA" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
              ${points.map((p,i) => {
                const x = (i/(points.length-1))*1000;
                const y = ((maxVal-p.val)/(maxVal-minVal+1))*160+10;
                const c = p.val === minVal ? '#4ADE80' : p.val === maxVal ? '#ef4444' : '#60A5FA';
               return `<circle cx="${x}" cy="${y}" r="5" fill="${c}" stroke="#020b1a" stroke-width="2"/>
        <rect x="${x-18}" y="${y-28}" width="36" height="16" fill="rgba(2,11,26,0.8)" rx="2"/>
        <text x="${x}" y="${y-17}" text-anchor="middle" font-family="Bebas Neue" font-size="12" fill="${c}">${p.val}s</text>`;
              }).join('')}
            </svg>
          </div>
          <div style="display:flex;justify-content:space-between;">
            ${points.filter((_,i) => i%4===0 || i===points.length-1).map(p => `
              <div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:rgba(180,210,245,0.4);letter-spacing:1px;">${p.label}</div>`).join('')}
          </div>
        </div>`;
      chartEl.style.opacity = '1';
      chartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (bars.length === 0) {
      chartEl.innerHTML = `
        <div style="padding:40px 48px;">
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:${color};text-transform:uppercase;margin-bottom:6px;">⬡ ${titles[type]}</div>
          <div style="text-align:center;padding:48px 0;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:3px;color:rgba(180,210,245,0.3);">⬡ NO DATA YET</div>
        </div>`;
    } else {
      const maxVal = Math.max(...bars.map(b => b.val), 1);
      chartEl.innerHTML = `
        <div style="padding:40px 48px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:28px;flex-wrap:wrap;">
  <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:rgba(180,210,245,0.4);margin-right:8px;">FILTER:</div>
  ${['today','week','month','all'].map(f => `
    <button onclick="raFilterChart('${f}')" id="ra-filter-${f}" style="padding:6px 16px;background:${f==='all'?'rgba(96,165,250,0.15)':'rgba(96,165,250,0.04)'};border:1px solid ${f==='all'?'rgba(96,165,250,0.5)':'rgba(96,165,250,0.15)'};color:${f==='all'?'#60A5FA':'rgba(180,210,245,0.4)'};font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);">${f==='today'?'TODAY':f==='week'?'THIS WEEK':f==='month'?'THIS MONTH':'ALL TIME'}</button>`).join('')}
</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:36px;">
            <div>
              <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:${color};text-transform:uppercase;margin-bottom:6px;">⬡ ${titles[type]}</div>
              <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:3px;color:${isLight?'#1C0F00':'#ffffff'};">${bars.length} DATA POINTS</div>
            </div>
            <div style="display:flex;gap:8px;">
              <button onclick="raResetToDefault()" style="padding:8px 18px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.3);color:#60A5FA;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);">↺ DEFAULT VIEW</button>
              <button onclick="raShowCardChart('${type}')" style="padding:8px 18px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;">✕ RESET</button>
            </div>
          </div>
          <div style="display:flex;align-items:flex-end;gap:4px;height:220px;overflow:hidden;">
            ${bars.map((b, i) => {
              const pct = (b.val / maxVal) * 100;
              const barH = Math.max(8, (pct / 100) * 200);
              const delay = (i * 0.06).toFixed(2);
              return `
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;">
                  <div style="font-family:'Bebas Neue',sans-serif;font-size:13px;color:${color};line-height:1;animation:valPop 0.4s ease both;animation-delay:${delay}s;">${b.val}${label}</div>
                  <div style="width:100%;height:${barH}px;background:linear-gradient(to top,${color}80,${color});transform-origin:bottom;animation:barRise 0.6s cubic-bezier(0.34,1.56,0.64,1) both;animation-delay:${delay}s;border-radius:2px 2px 0 0;box-shadow:0 0 12px ${color}40;"></div>
                  <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.5)':'rgba(180,210,245,0.6)'};letter-spacing:1px;">${b.label || (i+1)}</div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    chartEl.style.opacity = '1';
    chartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

function raFilterChart(filter) {
  const isLight = document.body.classList.contains('light-mode');
  
  // Update button styles
  ['today','week','month','all'].forEach(f => {
    const btn = document.getElementById('ra-filter-' + f);
    if (!btn) return;
    btn.style.background = f === filter ? 'rgba(96,165,250,0.15)' : 'rgba(96,165,250,0.04)';
    btn.style.borderColor = f === filter ? 'rgba(96,165,250,0.5)' : 'rgba(96,165,250,0.15)';
    btn.style.color = f === filter ? '#60A5FA' : 'rgba(180,210,245,0.4)';
  });

  const allOrders = window._raAllOrders || [];
  const now = new Date();
  
  let filtered = allOrders.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at);
  
  if (filter === 'today') {
    filtered = filtered.filter(o => new Date(o.placed_at).toDateString() === now.toDateString());
  } else if (filter === 'week') {
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(o => new Date(o.placed_at) >= weekAgo);
  } else if (filter === 'month') {
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(o => new Date(o.placed_at) >= monthAgo);
  }

  const times = filtered.map(o => (new Date(o.delivered_at) - new Date(o.placed_at)) / 1000);
  const recentTimes = times.slice(-20);
  const maxT = times.length ? Math.max(...times) : 1;
  const avgDelivery = times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : null;
  const minDelivery = times.length ? Math.round(Math.min(...times)) : null;
  const maxDelivery = times.length ? Math.round(Math.max(...times)) : null;

  const container = document.getElementById('ra-bars-container');
  if (!container) {
  raResetToDefault();
  return;
}

  const filterLabel = filter === 'today' ? 'TODAY' : filter === 'week' ? 'THIS WEEK' : filter === 'month' ? 'THIS MONTH' : 'ALL TIME';

  container.style.opacity = '0';
  container.style.transition = 'opacity 0.3s ease';

  setTimeout(() => {
    if (recentTimes.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:48px 0;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:3px;color:rgba(180,210,245,0.3);">⬡ NO DELIVERIES ${filterLabel}</div>`;
    } else {
      container.innerHTML = `
        <div style="display:flex;align-items:flex-end;gap:10px;height:220px;position:relative;">
          ${recentTimes.map((t, i) => {
            const pct = maxT > 0 ? (t / maxT) * 100 : 0;
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
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;">
                <div style="font-family:'Bebas Neue',sans-serif;font-size:13px;color:${valColor};line-height:1;animation:valPop 0.4s ease both;animation-delay:${delay}s;">${t.toFixed(0)}s</div>
                <div style="width:100%;height:${barH}px;background:${barColor};transform-origin:bottom;animation:barRise 0.6s cubic-bezier(0.34,1.56,0.64,1) both;animation-delay:${delay}s;border-radius:2px 2px 0 0;box-shadow:0 0 12px rgba(96,165,250,0.4);"></div>
                <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(180,210,245,0.6);letter-spacing:1px;">R${times.length - recentTimes.length + i + 1}</div>
              </div>`;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:16px;border-top:1px solid rgba(96,165,250,0.1);">
          <div style="display:flex;gap:16px;">
            <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(180,210,245,0.5);">AVG: ${avgDelivery}s</span>
            <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:#4ADE80;">FASTEST: ${minDelivery}s</span>
            <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:#ef4444;">SLOWEST: ${maxDelivery}s</span>
          </div>
          <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(180,210,245,0.4);">${times.length} TOTAL RUNS ${filterLabel}</span>
        </div>`;
    }
    container.style.opacity = '1';
  }, 300);
}
const setCard = (cls, val) => { const el = document.querySelector('#ra-body .' + cls); if (el) el.textContent = val; };
const filteredDispatched = filtered.filter(o => o.status === 'delivered');
const avgFiltered = times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : null;
setCard('ra-card-dispatches', filteredDispatched.length);
setCard('ra-card-avgdelivery', avgFiltered ? avgFiltered + 's' : '—');
setCard('ra-card-history', times.length + '  runs');
setCard('ra-card-obstacles', filter === 'all' ? (window._raTotalObstacles || 0) : '—');
setCard('ra-card-estops', filter === 'all' ? (window._raTotalEstops || 0) : '—');

let _raCalendarDate = { year: new Date().getFullYear(), month: new Date().getMonth(), day: null, mode: 'day' };

function raOpenCalendar() {
  const existing = document.getElementById('ra-calendar-popup');
  if (existing) { existing.remove(); return; }
  raRenderCalendar();

  setTimeout(() => {
    function raCalendarOutsideClick(e) {
      const popup = document.getElementById('ra-calendar-popup');
      const btn = document.getElementById('ra-calendar-btn');
      if (popup && !popup.contains(e.target) && e.target !== btn) {
        popup.remove();
        document.removeEventListener('click', raCalendarOutsideClick);
      }
    }
    document.addEventListener('click', raCalendarOutsideClick);
  }, 0);
}

function raRenderCalendar() {
  const existing = document.getElementById('ra-calendar-popup');
  if (existing) existing.remove();

  const isLight = document.body.classList.contains('light-mode');
  const { year, month, mode } = _raCalendarDate;
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const popup = document.createElement('div');
  popup.id = 'ra-calendar-popup';
  popup.style.cssText = `position:absolute;z-index:9999;background:#061422;border:1px solid rgba(96,165,250,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.5);min-width:320px;`;

  if (mode === 'month') {
    // Month picker
    popup.innerHTML = `
      <div style="padding:16px 20px;border-bottom:1px solid rgba(96,165,250,0.1);display:flex;align-items:center;justify-content:space-between;">
        <button onclick="_raCalendarDate.year--;raRenderCalendar()" style="background:none;border:none;color:#60A5FA;cursor:pointer;font-size:16px;">◀</button>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:3px;color:#60A5FA;cursor:pointer;" onclick="_raCalendarDate.mode='year';raRenderCalendar()">${year}</div>
        <button onclick="_raCalendarDate.year++;raRenderCalendar()" style="background:none;border:none;color:#60A5FA;cursor:pointer;font-size:16px;">▶</button>
      </div>
      <div style="padding:16px 20px;">
        <div style="font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:3px;color:rgba(180,210,245,0.4);margin-bottom:12px;">SELECT MONTH</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
          ${months.map((m, i) => `
            <button onclick="_raCalendarDate.month=${i};_raCalendarDate.mode='day';_raCalendarDate.day=null;raRenderCalendar();raApplyCalendarFilter()" 
              style="padding:10px;background:${i===month?'rgba(96,165,250,0.2)':'rgba(96,165,250,0.04)'};border:1px solid ${i===month?'rgba(96,165,250,0.5)':'rgba(96,165,250,0.1)'};color:${i===month?'#60A5FA':'rgba(180,210,245,0.6)'};font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;">
              ${m}
            </button>`).join('')}
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid rgba(96,165,250,0.1);display:flex;justify-content:flex-end;">
        <button onclick="document.getElementById('ra-calendar-popup').remove()" style="padding:6px 14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-family:'Share Tech Mono',monospace;font-size:9px;cursor:pointer;">✕ CLOSE</button>
      </div>`;

  } else if (mode === 'year') {
    // Year picker
    const startYear = year - 4;
    const years = Array.from({length: 9}, (_, i) => startYear + i);
    popup.innerHTML = `
      <div style="padding:16px 20px;border-bottom:1px solid rgba(96,165,250,0.1);display:flex;align-items:center;justify-content:space-between;">
        <button onclick="_raCalendarDate.year-=9;raRenderCalendar()" style="background:none;border:none;color:#60A5FA;cursor:pointer;font-size:16px;">◀</button>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:3px;color:#60A5FA;">${startYear} — ${startYear+8}</div>
        <button onclick="_raCalendarDate.year+=9;raRenderCalendar()" style="background:none;border:none;color:#60A5FA;cursor:pointer;font-size:16px;">▶</button>
      </div>
      <div style="padding:16px 20px;">
        <div style="font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:3px;color:rgba(180,210,245,0.4);margin-bottom:12px;">SELECT YEAR</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
          ${years.map(y => `
            <button onclick="_raCalendarDate.year=${y};_raCalendarDate.mode='month';raRenderCalendar()" 
              style="padding:10px;background:${y===year?'rgba(96,165,250,0.2)':'rgba(96,165,250,0.04)'};border:1px solid ${y===year?'rgba(96,165,250,0.5)':'rgba(96,165,250,0.1)'};color:${y===year?'#60A5FA':'rgba(180,210,245,0.6)'};font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;">
              ${y}
            </button>`).join('')}
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid rgba(96,165,250,0.1);display:flex;justify-content:flex-end;">
        <button onclick="document.getElementById('ra-calendar-popup').remove()" style="padding:6px 14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-family:'Share Tech Mono',monospace;font-size:9px;cursor:pointer;">✕ CLOSE</button>
      </div>`;

  } else {
    // Day picker
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    // Get days that have orders
    const allOrders = window._raAllOrders || [];
    const orderDays = new Set(allOrders.filter(o => {
      const d = new Date(o.placed_at);
      return d.getFullYear() === year && d.getMonth() === month && o.status === 'delivered';
    }).map(o => new Date(o.placed_at).getDate()));

    popup.innerHTML = `
      <div style="padding:16px 20px;border-bottom:1px solid rgba(96,165,250,0.1);display:flex;align-items:center;justify-content:space-between;">
        <button onclick="if(_raCalendarDate.month===0){_raCalendarDate.month=11;_raCalendarDate.year--;}else{_raCalendarDate.month--;};raRenderCalendar()" style="background:none;border:none;color:#60A5FA;cursor:pointer;font-size:16px;">◀</button>
        <div style="display:flex;gap:12px;align-items:center;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:3px;color:#ffffff;cursor:pointer;" onclick="_raCalendarDate.mode='month';raRenderCalendar()">${fullMonths[month]}</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:3px;color:#60A5FA;cursor:pointer;" onclick="_raCalendarDate.mode='year';raRenderCalendar()">${year}</div>
        </div>
        <button onclick="if(_raCalendarDate.month===11){_raCalendarDate.month=0;_raCalendarDate.year++;}else{_raCalendarDate.month++;};raRenderCalendar()" style="background:none;border:none;color:#60A5FA;cursor:pointer;font-size:16px;">▶</button>
      </div>
      <div style="padding:16px 20px;">
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:8px;">
          ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `
            <div style="font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:1px;color:rgba(180,210,245,0.3);text-align:center;padding:4px;">${d}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">
          ${days.map(d => d === null 
            ? `<div></div>`
            : `<button onclick="_raCalendarDate.day=${d};raRenderCalendar();raApplyCalendarFilter()" 
                style="padding:8px 4px;background:${d===_raCalendarDate.day?'rgba(96,165,250,0.3)':orderDays.has(d)?'rgba(96,165,250,0.08)':'transparent'};border:1px solid ${d===_raCalendarDate.day?'rgba(96,165,250,0.6)':orderDays.has(d)?'rgba(96,165,250,0.2)':'transparent'};color:${d===_raCalendarDate.day?'#60A5FA':orderDays.has(d)?'rgba(180,210,245,0.9)':'rgba(180,210,245,0.3)'};font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:1px;cursor:pointer;transition:all 0.2s;position:relative;">
                ${d}
                ${orderDays.has(d) ? `<div style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:4px;height:4px;background:#60A5FA;border-radius:50%;"></div>` : ''}
              </button>`).join('')}
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid rgba(96,165,250,0.1);display:flex;align-items:center;justify-content:space-between;">
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(180,210,245,0.4);">
          ${_raCalendarDate.day ? `SELECTED: ${fullMonths[month]} ${_raCalendarDate.day}, ${year}` : 'CLICK DAY OR MONTH/YEAR ABOVE'}
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="_raCalendarDate.day=null;raApplyCalendarFilter()" style="padding:6px 14px;background:rgba(251,185,36,0.06);border:1px solid rgba(251,185,36,0.3);color:#FBB924;font-family:'Share Tech Mono',monospace;font-size:9px;cursor:pointer;">MONTH VIEW</button>
          <button onclick="document.getElementById('ra-calendar-popup').remove()" style="padding:6px 14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-family:'Share Tech Mono',monospace;font-size:9px;cursor:pointer;">✕ CLOSE</button>
        </div>
      </div>`;
  }

  // Position popup
  const calBtn = document.getElementById('ra-calendar-btn');
  const filterBar = calBtn?.parentElement;
  if (filterBar) {
    filterBar.style.position = 'relative';
    filterBar.appendChild(popup);
    popup.style.top = '70px';
    popup.style.right = '160px';
    popup.style.left = 'auto';
    popup.style.position = 'fixed';
  }
}

function raApplyCalendarFilter() {
  const { year, month, day } = _raCalendarDate;
  window._raCalendarFilter = { year, month, day };
  const isLight = document.body.classList.contains('light-mode');
  const allOrders = window._raAllOrders || [];
  const fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  let filtered = allOrders.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at);
  let chartTitle = '';
  let groupByDay = false;

  if (day) {
    // Specific day
    filtered = filtered.filter(o => {
      const d = new Date(o.placed_at);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
    chartTitle = `${fullMonths[month]} ${day}, ${year}`;
  } else {
    // Whole month
    filtered = filtered.filter(o => {
      const d = new Date(o.placed_at);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    chartTitle = `${fullMonths[month]} ${year}`;
    groupByDay = true;
  }

  const container = document.getElementById('ra-bars-container');
  
  // If a card chart is active, just re-render it with the new filter
  if (window._raActiveCard) {
    const activeType = window._raActiveCard;
    window._raActiveCard = null;
    raShowCardChart(activeType);
    // Update stat cards
    const calFiltered2 = allOrders.filter(o => {
      if (!o.placed_at) return false;
      const d = new Date(o.placed_at);
      if (day) return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
      return d.getFullYear() === year && d.getMonth() === month;
    });
    const calTimes2 = calFiltered2.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at).map(o => (new Date(o.delivered_at) - new Date(o.placed_at)) / 1000);
    const calAvg2 = calTimes2.length ? Math.round(calTimes2.reduce((a,b)=>a+b,0)/calTimes2.length) : null;
    const setCard2 = (cls, val) => { const el = document.querySelector('#ra-body .' + cls); if (el) el.textContent = val; };
    setCard2('ra-card-dispatches', calFiltered2.filter(o => o.status === 'delivered').length);
    setCard2('ra-card-avgdelivery', calAvg2 ? calAvg2 + 's' : '—');
    return;
  }

  if (!container) {
  raResetToDefault();
  return;
}

  // Reset filter buttons
  ['today','week','month','all'].forEach(f => {
    const btn = document.getElementById('ra-filter-' + f);
    if (!btn) return;
    btn.style.background = 'rgba(96,165,250,0.04)';
    btn.style.borderColor = 'rgba(96,165,250,0.15)';
    btn.style.color = 'rgba(180,210,245,0.4)';
  });

  container.style.opacity = '0';
  container.style.transition = 'opacity 0.3s ease';

  setTimeout(() => {
    let bars = [];
    if (groupByDay) {
      const byDay = {};
      filtered.forEach(o => {
        const d = new Date(o.placed_at).getDate();
        if (!byDay[d]) byDay[d] = [];
        byDay[d].push((new Date(o.delivered_at) - new Date(o.placed_at)) / 1000);
      });
      bars = Object.entries(byDay).sort((a,b) => a[0]-b[0]).map(([d, times]) => ({
        val: Math.round(times.reduce((a,b)=>a+b,0)/times.length),
        label: d,
        count: times.length
      }));
    } else {
      bars = filtered.slice(-20).map((o, i) => ({
        val: Math.round((new Date(o.delivered_at) - new Date(o.placed_at)) / 1000),
        label: 'R' + (i+1),
        count: 1
      }));
    }

    if (bars.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:48px 0;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:3px;color:rgba(180,210,245,0.3);">⬡ NO DELIVERIES FOR ${chartTitle.toUpperCase()}</div>`;
    } else {
      const maxVal = Math.max(...bars.map(b => b.val), 1);
      const minVal = Math.min(...bars.map(b => b.val));
      const avgVal = Math.round(bars.reduce((a,b) => a+b.val, 0) / bars.length);

      container.innerHTML = `
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:#60A5FA;margin-bottom:16px;">⬡ ${chartTitle.toUpperCase()} · ${bars.length} ${groupByDay?'DAYS':'DELIVERIES'} · AVG ${avgVal}s</div>
        <div style="display:flex;align-items:flex-end;gap:4px;height:220px;overflow:hidden;">
          ${bars.map((b, i) => {
            const pct = (b.val / maxVal) * 100;
            const barH = Math.max(4, (pct / 100) * 200);
            const delay = (i * 0.04).toFixed(2);
            const barColor = b.val === minVal
              ? 'linear-gradient(to top,#15803d,#4ADE80)'
              : b.val === maxVal
                ? 'linear-gradient(to top,#991b1b,#ef4444)'
                : 'linear-gradient(to top,#2563eb,#93c5fd)';
            const valColor = b.val === minVal ? '#4ADE80' : b.val === maxVal ? '#ef4444' : '#60A5FA';
            return `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;">
                <div style="font-family:'Bebas Neue',sans-serif;font-size:13px;color:${valColor};line-height:1;animation:valPop 0.4s ease both;animation-delay:${delay}s;">${b.val}s</div>
                <div style="width:100%;height:${barH}px;background:${barColor};transform-origin:bottom;animation:barRise 0.6s cubic-bezier(0.34,1.56,0.64,1) both;animation-delay:${delay}s;border-radius:2px 2px 0 0;box-shadow:0 0 12px rgba(96,165,250,0.4);"></div>
                <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(180,210,245,0.6);letter-spacing:1px;">${b.label}</div>
              </div>`;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:16px;border-top:1px solid rgba(96,165,250,0.1);">
          <div style="display:flex;gap:16px;">
            <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:#4ADE80;">FASTEST: ${minVal}s</span>
            <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(180,210,245,0.5);">AVG: ${avgVal}s</span>
            <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:#ef4444;">SLOWEST: ${maxVal}s</span>
          </div>
          <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(180,210,245,0.4);">${filtered.length} TOTAL DELIVERIES</span>
        </div>`;
    }
    container.style.opacity = '1';
    if (window._raActiveCard) {
      const activeType = window._raActiveCard;
      window._raActiveCard = null;
      raShowCardChart(activeType);
    }
  }, 300);

  // Update stat cards based on calendar filter
  const calFiltered = allOrders.filter(o => {
    if (!o.placed_at) return false;
    const d = new Date(o.placed_at);
    if (day) {
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    }
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const calDelivered = calFiltered.filter(o => o.status === 'delivered' && o.placed_at && o.delivered_at);
  const calTimes = calDelivered.map(o => (new Date(o.delivered_at) - new Date(o.placed_at)) / 1000);
  const calAvg = calTimes.length ? Math.round(calTimes.reduce((a,b)=>a+b,0)/calTimes.length) : null;
  const calDispatched = calFiltered.filter(o => o.status === 'delivered');

  const setCard = (cls, val) => { const el = document.querySelector('#ra-body .' + cls); if (el) el.textContent = val; };
  setCard('ra-card-dispatches', calDispatched.length);
  setCard('ra-card-avgdelivery', calAvg ? calAvg + 's' : '—');
  setCard('ra-card-history', calDelivered.length + '  runs');
setCard('ra-card-obstacles', '—');
setCard('ra-card-estops', '—');
const calBtn = document.getElementById('ra-calendar-btn');
const fullMonths2 = ['January','February','March','April','May','June','July','August','September','October','November','December'];
if (calBtn) calBtn.textContent = day ? `📅 ${fullMonths2[month].slice(0,3).toUpperCase()} ${day}` : `📅 ${fullMonths2[month].slice(0,3).toUpperCase()} ${year}`;
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