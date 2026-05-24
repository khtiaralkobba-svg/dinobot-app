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
};

function raTrackDispatch() { raData.dispatches++; raData._dispatchStart = Date.now(); }
function raTrackDelivery() {
  if (raData._dispatchStart) {
    raData.deliveryTimes.push((Date.now() - raData._dispatchStart) / 1000);
    raData._dispatchStart = null;
  }
}
function raTrackEStop() { raData.estopEvents++; }
function raTrackBattery(pct) {
  raData.batteryReadings.push(pct);
  if (raData.lastBattery !== null && pct < raData.lastBattery) {
    raData.batteryUsed += raData.lastBattery - pct;
  }
  raData.lastBattery = pct;
}
function raTrackSpeed(speed) { raData.avgSpeed = speed; }

function openRobotAnalyticsOverlay() {
  let el = document.getElementById('robot-analytics-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'robot-analytics-overlay';
    document.body.appendChild(el);
  }
  const isLight = document.body.classList.contains('light-mode');
  const avgDelivery = raData.deliveryTimes.length
    ? Math.round(raData.deliveryTimes.reduce((a,b)=>a+b,0) / raData.deliveryTimes.length)
    : null;
  const minDelivery = raData.deliveryTimes.length ? Math.round(Math.min(...raData.deliveryTimes)) : null;
  const maxDelivery = raData.deliveryTimes.length ? Math.round(Math.max(...raData.deliveryTimes)) : null;
  const avgBat = raData.batteryReadings.length
    ? Math.round(raData.batteryReadings.reduce((a,b)=>a+b,0) / raData.batteryReadings.length)
    : null;

  el.style.cssText = `display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;overflow-y:auto;background:${isLight?'#f4faff':'#020b1a'};z-index:9500;`;

  el.innerHTML = `
    <!-- Top bar -->
    <div style="position:relative;z-index:2;padding:80px 48px 40px;border-bottom:1px solid rgba(251,185,36,0.2);background:${isLight?'linear-gradient(160deg,rgba(255,106,0,0.06) 0%,transparent 60%)':'linear-gradient(160deg,rgba(40,30,5,0.45) 0%,transparent 60%)'};flex-shrink:0;">
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

    <!-- Body -->
    <div style="padding:32px 48px 80px;display:flex;flex-direction:column;gap:20px;">

      <!-- Stat cards -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        ${[
          ['Total Dispatches', raData.dispatches, 'this session', '#FBB924'],
          ['Avg Delivery Time', avgDelivery ? avgDelivery+'s' : '—', 'per order', '#4ADE80'],
          ['Battery Used', raData.batteryUsed ? raData.batteryUsed.toFixed(1)+'%' : '—', 'total drain', '#60A5FA'],
          ['E-Stop Events', raData.estopEvents, 'emergency stops', '#ef4444'],
        ].map(([lbl,val,sub,color]) => `
          <div style="background:${isLight?'#e8f4fd':'linear-gradient(160deg,#071828,#061422)'};border:1px solid ${isLight?'rgba(30,100,200,0.2)':'rgba(251,185,36,0.15)'};padding:20px 22px;">
            <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:${isLight?'rgba(20,8,0,0.7)':'var(--text-dim)'};text-transform:uppercase;margin-bottom:8px;">${lbl}</div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:36px;letter-spacing:2px;color:${color};line-height:1;">${val}</div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${isLight?'rgba(20,8,0,0.5)':'var(--text-dim)'};letter-spacing:1px;margin-top:4px;">${sub}</div>
          </div>`).join('')}
      </div>

      <!-- Delivery time breakdown -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:${isLight?'#e8f4fd':'linear-gradient(160deg,rgba(10,25,60,0.98),rgba(5,15,40,0.98))'};border:1px solid ${isLight?'rgba(30,100,200,0.2)':'rgba(251,185,36,0.2)'};padding:28px 32px;">
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:#FBB924;text-transform:uppercase;margin-bottom:20px;border-bottom:1px solid rgba(251,185,36,0.15);padding-bottom:10px;">⬡ Delivery Time Breakdown</div>
          ${[
            ['Average', avgDelivery ? avgDelivery+'s' : '—'],
            ['Fastest', minDelivery ? minDelivery+'s' : '—'],
            ['Slowest', maxDelivery ? maxDelivery+'s' : '—'],
            ['Total Deliveries', raData.deliveryTimes.length],
          ].map(([l,v]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid ${isLight?'rgba(30,100,200,0.1)':'rgba(255,255,255,0.05)'} ">
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

      <!-- No data state -->
      ${raData.dispatches === 0 ? `
        <div style="text-align:center;padding:48px;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:3px;color:${isLight?'rgba(20,8,0,0.5)':'var(--text-dim)'};">
          ⬡ NO DATA YET — DISPATCH THE ROBOT TO START TRACKING
        </div>` : ''}
    </div>`;

  document.body.style.overflow = 'hidden';
}

function closeRobotAnalyticsOverlay() {
  const el = document.getElementById('robot-analytics-overlay');
  if (el) el.style.display = 'none';
  document.body.style.overflow = '';
}