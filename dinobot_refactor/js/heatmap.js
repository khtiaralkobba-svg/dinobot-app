/* ══════════════════════════════════════════════════════════
   heatmap.js — Order volume heatmap overlay
══════════════════════════════════════════════════════════ */

const HM_DAYS  = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const HM_HOURS = Array.from({ length: 14 }, (_, i) => i + 8);

let hmCurrentView = 'week';
let hmDatasets    = {};
let hmRefreshTimer = null;
let hmLastDetail  = null;

/* ── DATA GENERATION (fallback) ──────────────────────────── */
function hmGenData(seed) {
  const d = {};
  const peaks    = {8:0.3,9:0.5,10:0.6,11:0.8,12:1.0,13:0.95,14:0.7,15:0.55,16:0.65,17:0.85,18:0.9,19:0.75,20:0.5,21:0.3};
  const dayMult  = {MON:0.7,TUE:0.8,WED:0.9,THU:0.85,FRI:1.0,SAT:0.95,SUN:0.6};
  HM_DAYS.forEach(day => {
    d[day] = {};
    HM_HOURS.forEach(h => {
      const base = Math.round((peaks[h]||0.3) * dayMult[day] * 32 * (0.75 + Math.random()*0.5 + seed*0.01));
      d[day][h] = Math.max(0, base);
    });
  });
  return d;
}

function hmMaxVal(data) {
  let m = 0;
  if (!data) return 0;
  HM_DAYS.forEach(d => {
    if (!data[d]) return;
    HM_HOURS.forEach(h => { const v = data[d][h] ?? data[d][String(h)] ?? 0; if (v > m) m = v; });
  });
  return m;
}

function hmCellColor(val, max) {
  const r = max > 0 ? val / max : 0;
  const isLight = document.body.classList.contains('light-mode');
  if (r === 0)  return isLight ? 'rgba(200,220,240,0.4)' : 'rgba(128,128,128,0.08)';
  if (r < 0.2)  return isLight ? 'rgba(255,107,26,0.15)' : 'rgba(255,107,26,0.12)';
  if (r < 0.4)  return isLight ? 'rgba(255,107,26,0.30)' : 'rgba(255,107,26,0.28)';
  if (r < 0.6)  return isLight ? 'rgba(255,107,26,0.50)' : 'rgba(255,107,26,0.50)';
  if (r < 0.8)  return isLight ? 'rgba(255,107,26,0.70)' : 'rgba(255,107,26,0.70)';
  return isLight ? 'rgba(255,107,26,0.90)' : 'rgba(255,107,26,0.92)';
}

/* ── OVERLAY OPEN / CLOSE ────────────────────────────────── */
async function openHeatmapOverlay() {
  hmCurrentView = 'week';
  const el = document.getElementById('heatmap-overlay');
  el.style.cssText = 'display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;overflow-y:auto;background:#020b1a;z-index:9500;';
  document.body.style.overflow = 'hidden';

  document.getElementById('heatmap-body').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:300px;font-family:'Share Tech Mono',monospace;font-size:12px;letter-spacing:3px;color:rgba(255,107,26,0.6);">
      ⬡ LOADING LIVE DATA...
    </div>`;

  try {
    const res = await fetch(API_BASE + '/api/orders/heatmap', { headers: authHeaders({ 'Content-Type': 'application/json' }) });
    if (res.ok) {
      const data = await res.json();
      hmDatasets = data.heatmap;
    } else throw new Error('Failed');
  } catch {
    hmDatasets = { week: hmGenData(1), month: hmGenData(2), all: hmGenData(3) };
    showToast('⬡ Using simulated data — connect backend for live data');
  }

  hmRenderAll();

  if (hmRefreshTimer) clearInterval(hmRefreshTimer);
  hmRefreshTimer = setInterval(async () => {
    try {
      const res = await fetch(API_BASE + '/api/orders/heatmap', { headers: authHeaders({ 'Content-Type': 'application/json' }) });
      if (res.ok) { const data = await res.json(); hmDatasets = data.heatmap; hmRenderAllNoAnim(); }
    } catch {}
  }, 30000);
}

function closeHeatmapOverlay() {
  const el = document.getElementById('heatmap-overlay');
  el.style.display = 'none'; el.style.flexDirection = '';
  document.body.style.overflow = '';
  if (hmRefreshTimer) { clearInterval(hmRefreshTimer); hmRefreshTimer = null; }
  document.getElementById('heatmap-body').innerHTML = '';
}

/* ── RENDER ──────────────────────────────────────────────── */
function hmRenderAll() {
  const data = hmDatasets[hmCurrentView];
  if (!data) return;

  // Normalise keys
  HM_DAYS.forEach(d => {
    if (!data[d]) data[d] = {};
    HM_HOURS.forEach(h => {
      const strVal = data[d][String(h)];
      data[d][h] = strVal !== undefined ? Number(strVal) : (data[d][h] !== undefined ? Number(data[d][h]) : 0);
    });
  });

  const max = hmMaxVal(data);
  let hourTotals = {};
  HM_HOURS.forEach(h => { hourTotals[h] = 0; });
  HM_DAYS.forEach(d => HM_HOURS.forEach(h => { hourTotals[h] += data[d][h]; }));

  let total = 0, peak = 0, peakLabel = '';
  HM_DAYS.forEach(d => HM_HOURS.forEach(h => {
    total += data[d][h];
    if (data[d][h] > peak) { peak = data[d][h]; peakLabel = `${d} ${h}:00`; }
  }));

  const peakHour     = Object.entries(hourTotals).sort((a,b) => b[1]-a[1])[0];
  const avgPerHour   = Math.round(total / (HM_DAYS.length * HM_HOURS.length));
  const maxHourTotal = Math.max(...Object.values(hourTotals));
  const isLight      = document.body.classList.contains('light-mode');

  const body = document.getElementById('heatmap-body');
  body.innerHTML = `
    <!-- Stats cards -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:100%;">
      ${[
        ['Total Orders', total.toLocaleString(), 'across all hours', '#FF6B1A'],
        ['Peak Single Hour', peak, peakLabel, '#FF6B1A'],
        ['Busiest Hour', peakHour[0]+':00', peakHour[1]+' total orders', '#FF6B1A'],
        ['Avg Per Slot', avgPerHour||'—', 'orders / hour', '#ffffff']
      ].map(([lbl,val,sub,color]) => `
        <div style="background:linear-gradient(160deg,#071828,#061422);border:1px solid var(--border);padding:20px 22px;">
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:rgba(180,210,245,0.7);text-transform:uppercase;margin-bottom:8px;">${lbl}</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:2px;color:${color};line-height:1;">${val}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(180,210,245,0.5);letter-spacing:1px;margin-top:4px;">${sub}</div>
        </div>`).join('')}
    </div>

    <!-- View toggles -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${['week','month','all'].map(v => `
        <button onclick="hmSetView('${v}')" style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;padding:8px 18px;border:1px solid ${v===hmCurrentView?'#FF6B1A':'rgba(255,255,255,0.15)'};background:${v===hmCurrentView?'rgba(255,107,26,0.15)':'rgba(255,255,255,0.03)'};color:${v===hmCurrentView?'#FF6B1A':'rgba(180,210,245,0.8)'};cursor:pointer;text-transform:uppercase;">
          ${v==='week'?'This Week':v==='month'?'This Month':'All Time'}
        </button>`).join('')}
      <div style="flex:1"></div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:rgba(180,210,245,0.6);">CLICK CELL FOR DETAIL</div>
    </div>

    <!-- Grid + Legend -->
    <div style="display:flex;gap:24px;align-items:start;width:100%;">
      <div style="flex:1;min-width:0;">
        <!-- Hour labels -->
        <div style="display:flex;gap:3px;margin-left:44px;margin-bottom:4px;">
          ${HM_HOURS.map(h => `<div style="flex:1;text-align:center;font-family:'Share Tech Mono',monospace;font-size:10px;color:${isLight?'#7c2d00':'rgba(180,210,245,0.8)'};">${h}:00</div>`).join('')}
        </div>
        <!-- Grid rows -->
        ${HM_DAYS.map(day => `
          <div style="display:flex;align-items:center;gap:3px;margin-bottom:3px;">
            <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:${isLight?'#7c2d00':'rgba(180,210,245,0.8)'};width:44px;flex-shrink:0;font-weight:bold;">${day}</div>
            ${HM_HOURS.map(h => {
              const val   = data[day][h];
              const ratio = max > 0 ? val / max : 0;
              const bg    = hmCellColor(val, max);
              const tc    = isLight ? (ratio>0.6?'#ffffff':ratio>0.3?'#7c2d00':'#a0522d') : (ratio>0.5?'#ffffff':'rgba(180,210,245,0.8)');
              return `<div onclick="hmShowDetail('${day}',${h},${val},${max})"
                style="flex:1;height:48px;background:${bg};display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:16px;color:${tc};cursor:pointer;border-radius:2px;border:1px solid ${isLight?'rgba(180,80,0,0.1)':'rgba(0,0,0,0.15)'};text-shadow:${isLight?'none':'0 1px 3px rgba(0,0,0,0.9)'};transition:transform 0.12s;"
                onmouseover="this.style.transform='scale(1.05)';this.style.zIndex='10';this.style.boxShadow='0 4px 12px rgba(255,107,26,0.3)';"
                onmouseout="this.style.transform='';this.style.zIndex='1';this.style.boxShadow='';">${val>0?val:''}</div>`;
            }).join('')}
          </div>`).join('')}
      </div>

      <!-- Legend -->
      <div style="background:linear-gradient(160deg,rgba(10,25,60,0.98),rgba(5,15,40,0.98));border:1px solid rgba(255,107,26,0.3);padding:20px 24px;min-width:200px;flex-shrink:0;">
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:4px;color:#FF6B1A;text-transform:uppercase;margin-bottom:16px;border-bottom:1px solid rgba(255,107,26,0.2);padding-bottom:8px;">⬡ Color Legend</div>
        ${[['rgba(128,128,128,0.08)','0 orders','No activity'],['rgba(255,107,26,0.12)','1–20%','Very low'],['rgba(255,107,26,0.28)','20–40%','Low'],['rgba(255,107,26,0.50)','40–60%','Moderate'],['rgba(255,107,26,0.70)','60–80%','High'],['rgba(255,107,26,0.92)','80–100%','Peak']].map(([c,range,label]) => `
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
            <div style="width:44px;height:28px;background:${c};border:1px solid rgba(255,107,26,0.15);flex-shrink:0;border-radius:2px;"></div>
            <div>
              <div style="font-family:'Bebas Neue',sans-serif;font-size:14px;color:#ffffff;line-height:1;">${label}</div>
              <div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:rgba(255,107,26,0.6);">${range} of peak</div>
            </div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Detail panel -->
    <div id="hm-detail" style="background:linear-gradient(160deg,rgba(10,25,60,0.98),rgba(5,15,40,0.98));border:1px solid rgba(255,107,26,0.4);padding:24px 28px;font-family:'Share Tech Mono',monospace;">
      <div style="font-size:10px;letter-spacing:2px;color:rgba(180,210,245,0.7);">SELECT A CELL TO VIEW DETAIL</div>
    </div>

    <!-- Bar chart -->
    <div style="background:linear-gradient(160deg,rgba(10,25,60,0.98),rgba(5,15,40,0.98));border:1px solid rgba(255,107,26,0.35);padding:40px 48px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:36px;">
        <div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;color:#FF6B1A;text-transform:uppercase;margin-bottom:6px;">⬡ Volume Analysis</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:3px;color:#ffffff;">HOURLY ORDER DISTRIBUTION</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:48px;color:#FF6B1A;line-height:1;">${total.toLocaleString()}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(180,210,245,0.8);">TOTAL ORDERS</div>
        </div>
      </div>
      <div style="display:flex;align-items:flex-end;gap:8px;height:260px;position:relative;">
        ${HM_HOURS.map((h, i) => {
          const v = hourTotals[h];
          const pct = maxHourTotal > 0 ? (v / maxHourTotal) * 100 : 0;
          const barH = Math.max(4, (pct/100)*240);
          const delay = (i * 0.05).toFixed(2);
          const color = pct===100?'linear-gradient(to top,#7c2d00,#FF6B1A,#ffb07a)':pct>80?'linear-gradient(to top,#92340a,#FF6B1A)':pct>60?'linear-gradient(to top,#7c2d00,rgba(255,107,26,0.85))':pct>40?'linear-gradient(to top,rgba(80,30,5,0.9),rgba(255,107,26,0.6))':pct>20?'linear-gradient(to top,rgba(60,20,5,0.8),rgba(255,107,26,0.35))':'linear-gradient(to top,rgba(40,15,5,0.7),rgba(255,107,26,0.18))';
          const valColor = pct===100?'#c94a00':pct>75?'#FF8C3A':pct>40?'#dce8f8':'rgba(180,210,245,0.7)';
          const labelColor = pct===100?'#c94a00':pct>75?'#FF8C3A':'rgba(180,210,245,0.7)';
          return `
          <div class="hm-bar-col" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;position:relative;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:${pct===100?'18px':pct>75?'16px':pct>40?'14px':'13px'};color:${valColor};line-height:1;animation:valPop 0.4s ease both;animation-delay:${delay}s;font-weight:700;">${v}</div>
            <div style="width:100%;height:${barH}px;background:${color};transform-origin:bottom;animation:barRise 0.6s cubic-bezier(0.34,1.56,0.64,1) both;animation-delay:${delay}s;"></div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${labelColor};letter-spacing:1px;white-space:nowrap;font-weight:bold;">${h}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  if (hmLastDetail) {
    setTimeout(() => hmShowDetail(hmLastDetail.day, hmLastDetail.hour, hmLastDetail.val, hmMaxVal(hmDatasets[hmCurrentView])), 50);
  }
}

function hmRenderAllNoAnim() {
  const body = document.getElementById('heatmap-body');
  if (!body) return;
  const data = hmDatasets[hmCurrentView];
  let hourTotals = {};
  HM_HOURS.forEach(h => { hourTotals[h] = 0; });
  HM_DAYS.forEach(d => HM_HOURS.forEach(h => { hourTotals[h] += data[d][h]; }));
  const maxHourTotal = Math.max(...Object.values(hourTotals));
  HM_HOURS.forEach((h, i) => {
    const col = body.querySelectorAll('.hm-bar-col')[i];
    if (!col) return;
    const v   = hourTotals[h];
    const pct = maxHourTotal > 0 ? (v / maxHourTotal) * 100 : 0;
    const barH = Math.max(4, (pct/100)*240);
    const bar = col.querySelector('[style*="animation:barRise"]');
    const val = col.querySelector('[style*="animation:valPop"]');
    if (bar) { bar.style.height = barH + 'px'; bar.style.animation = 'none'; bar.style.transition = 'height 0.4s ease'; }
    if (val) { val.textContent = v; val.style.animation = 'none'; val.style.opacity = '1'; }
  });
}

function hmSetView(view) { hmCurrentView = view; hmRenderAll(); }

function hmShowDetail(day, hour, val, max) {
  hmLastDetail = { day, hour, val, max };
  const data    = hmDatasets[hmCurrentView];
  const ratio   = max > 0 ? val / max : 0;
  const intensity = ratio>0.8?'🔴 PEAK':ratio>0.6?'🟠 BUSY':ratio>0.4?'🟡 MODERATE':'🟢 QUIET';
  const dayTotal  = HM_HOURS.reduce((s,h) => s + data[day][h], 0);
  const pctOfDay  = dayTotal > 0 ? Math.round((val/dayTotal)*100) : 0;
  document.getElementById('hm-detail').innerHTML = `
    <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:3px;color:#FF6B1A;margin-bottom:16px;">${day} — ${hour}:00 TO ${hour+1}:00</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
      ${[['Orders',val,'#FF6B1A'],['% of Day',pctOfDay+'%','#ffffff'],['Day Total',dayTotal,'#ffffff'],['Status',intensity,'#ffffff']].map(([l,v,c]) => `
        <div style="background:rgba(255,107,26,0.06);border:1px solid rgba(255,107,26,0.2);padding:14px 16px;">
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:rgba(180,210,245,0.7);text-transform:uppercase;margin-bottom:8px;">${l}</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:1px;color:${c};line-height:1;">${v}</div>
        </div>`).join('')}
    </div>`;
}