/* ══════════════════════════════════════════════════════════
   map.js — Floor map, table layout, obstacles, robot animation
══════════════════════════════════════════════════════════ */

/* ── ROBOT STATE ─────────────────────────────────────────── */
let eStopActive = false;
let robotState  = 'DOCKED';
let currentTarget = null;
let robotX = 0.08, robotY = 0.5, targetX = 0.08, targetY = 0.5, robotAngle = 0;
let mapAnimFrame = null;
let paused = false;

const dockX = 0.08, dockY = 0.5;

/* ── TABLE LAYOUT ────────────────────────────────────────── */
const DEFAULT_TABLES = [
  {id:1,x:0.55,y:0.18},{id:2,x:0.72,y:0.28},{id:3,x:0.82,y:0.50},{id:4,x:0.72,y:0.72},
  {id:5,x:0.55,y:0.82},{id:6,x:0.38,y:0.82},{id:7,x:0.28,y:0.72},{id:8,x:0.28,y:0.28},
];

function loadTables() {
  try {
    const saved = sessionStorage.getItem('dinobotTableLayout');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch(e) {}
  return DEFAULT_TABLES.map(t => ({...t}));
}

const tables = loadTables();

function saveTables() {
  sessionStorage.setItem('dinobotTableLayout', JSON.stringify(tables));
  fetch(API_BASE + '/api/tables/layout', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ tables })
  }).catch(() => {});
}

function addTable() {
  const maxId = tables.length > 0 ? Math.max(...tables.map(t => t.id)) : 0;
  tables.push({ id: maxId + 1, x: 0.5 + (Math.random() - 0.5) * 0.3, y: 0.5 + (Math.random() - 0.5) * 0.3 });
  saveTables(); rebuildDispatchButtons(); rebuildStudentTableGrid();
  showToast('⬡ Table ' + (maxId + 1) + ' added — drag to position it');
}

function removeTable(id) {
  const idx = tables.findIndex(t => t.id === id);
  if (idx === -1) return;
  if (tables.length <= 1) { showToast('✗ Cannot remove the last table'); return; }
  tables.splice(idx, 1);
  saveTables(); rebuildDispatchButtons(); rebuildStudentTableGrid();
  showToast('⬡ Table ' + id + ' removed');
}

function deleteSelectedTable() {
  if (selectedTableId === null) { showToast('⬡ Click a table on the map first'); return; }
  removeTable(selectedTableId);
  selectedTableId = null;
  updateDeleteBtn();
}

function resetTableLayout() {
  tables.length = 0;
  DEFAULT_TABLES.forEach(def => tables.push({...def}));
  saveTables(); rebuildDispatchButtons(); rebuildStudentTableGrid();
  showToast('⬡ Table layout reset to default');
}

function rebuildDispatchButtons() {
  const grid = document.getElementById('dispatch-btn-grid');
  if (!grid) return;
  grid.innerHTML = tables.map(t => `<button class="dispatch-btn" onclick="dispatch(${t.id})">Table ${t.id}</button>`).join('');
}

function rebuildStudentTableGrid() {
  const grid = document.getElementById('table-grid');
  if (!grid) return;
  grid.innerHTML = '';
  tables.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'table-btn'; btn.id = 'tbtn-' + t.id;
    btn.innerHTML = `<span class="t-num">${t.id}</span><span class="t-label">TABLE</span>`;
    btn.onclick = () => selectStudentTable(t.id);
    grid.appendChild(btn);
  });
}

// Sync table layout across tabs
window.addEventListener('storage', e => {
  if (e.key === 'dinobotTableLayout' && e.newValue) {
    try {
      const updated = JSON.parse(e.newValue);
      if (Array.isArray(updated) && updated.length > 0) {
        tables.length = 0;
        updated.forEach(t => tables.push({...t}));
        rebuildStudentTableGrid();
      }
    } catch(e) {}
  }
});

/* ── EDIT LAYOUT ─────────────────────────────────────────── */
let editLayoutMode = false;
let draggingTable  = null;
let dragOffsetX = 0, dragOffsetY = 0;
let selectedTableId = null;

function toggleEditLayout() {
  editLayoutMode = !editLayoutMode;
  const btn = document.getElementById('edit-layout-btn');
  const canvas = document.getElementById('overlayMap');
  if (editLayoutMode) {
    btn.textContent = '✓ DONE EDITING';
    btn.style.background = 'rgba(74,222,128,0.15)'; btn.style.borderColor = 'rgba(74,222,128,0.6)'; btn.style.color = '#4ADE80';
    if (canvas) canvas.style.cursor = 'crosshair';
    showToast('⬡ Drag tables to reposition them');
  } else {
    btn.textContent = '⬡ EDIT TABLE LAYOUT';
    btn.style.background = ''; btn.style.borderColor = ''; btn.style.color = '';
    if (canvas) canvas.style.cursor = 'default';
  }
}

function updateDeleteBtn() {
  const btn = document.getElementById('delete-table-btn');
  if (!btn) return;
  if (selectedTableId !== null) {
    btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
    btn.textContent = '✕ DELETE TABLE ' + selectedTableId;
  } else {
    btn.style.opacity = '0.4'; btn.style.pointerEvents = 'none';
    btn.textContent = '✕ DELETE SELECTED TABLE';
  }
}

/* ── OBSTACLE SYSTEM ─────────────────────────────────────── */
let obstacles = [];
let obstacleMode = false;
let selectedObstacleType = 'person';
let obstacleDeleteMode = false;

const OBSTACLE_TYPES = {
  person:   { label:'Person',   emoji:'🧍', color:'#ef4444', radius:0.022 },
  kid:      { label:'Kid',      emoji:'🧒', color:'#f97316', radius:0.016 },
  stroller: { label:'Stroller', emoji:'🍼', color:'#a78bfa', radius:0.020 },
  chair:    { label:'Chair',    emoji:'🪑', color:'#60A5FA', radius:0.018 },
  table:    { label:'Table',    emoji:'🪵', color:'#84cc16', radius:0.028 },
  bag:      { label:'Bag',      emoji:'🎒', color:'#fbbf24', radius:0.014 },
  cone:     { label:'Cone',     emoji:'🚧', color:'#fb923c', radius:0.016 },
  robot:    { label:'Bot Unit', emoji:'🤖', color:'#c084fc', radius:0.022 },
  barrier:  { label:'Barrier',  emoji:'🚫', color:'#ef4444', radius:0.030 },
  pet:      { label:'Pet',      emoji:'🐕', color:'#34d399', radius:0.016 },
  box:      { label:'Box',      emoji:'📦', color:'#94a3b8', radius:0.020 },
  trash:    { label:'Trash',    emoji:'🗑️', color:'#6b7280', radius:0.016 },
};

function toggleObstacleMode() {
  obstacleMode = !obstacleMode;
  if (!obstacleMode) obstacleDeleteMode = false;
  const btn    = document.getElementById('obs-mode-btn');
  const row    = document.getElementById('obs-type-row');
  const canvas = document.getElementById('overlayMap');
  if (obstacleMode) {
    btn.classList.add('active'); btn.textContent = '⬡ OBSTACLE MODE ON — CLICK MAP';
    if (row) { row.style.opacity = '1'; row.style.pointerEvents = 'auto'; }
    if (canvas) { canvas.style.cursor = 'crosshair'; canvas.style.pointerEvents = 'auto'; }
    editLayoutMode = false; draggingTable = null;
    const editBtn = document.getElementById('edit-layout-btn');
    if (editBtn) { editBtn.textContent = '⬡ EDIT TABLE LAYOUT'; editBtn.style.background=''; editBtn.style.borderColor=''; editBtn.style.color=''; }
    updateDeleteModeBtn();
  } else {
    btn.classList.remove('active'); btn.textContent = '⬡ PLACE OBSTACLES';
    if (row) { row.style.opacity = '0.35'; row.style.pointerEvents = 'none'; }
    if (canvas) canvas.style.cursor = 'default';
    updateDeleteModeBtn();
  }
  updateObstacleCount();
}

function toggleObstacleDeleteMode() {
  if (!obstacleMode) return;
  obstacleDeleteMode = !obstacleDeleteMode;
  const canvas = document.getElementById('overlayMap');
  const row    = document.getElementById('obs-type-row');
  if (canvas) canvas.style.cursor = obstacleDeleteMode ? 'not-allowed' : 'crosshair';
  if (row) row.style.opacity = obstacleDeleteMode ? '0.3' : '1';
  updateDeleteModeBtn();
  showToast(obstacleDeleteMode ? '⬡ Click any obstacle to delete it' : '⬡ Click map to place obstacle');
}

function updateDeleteModeBtn() {
  const btn = document.getElementById('obs-delete-mode-btn');
  if (!btn) return;
  btn.classList.toggle('active', obstacleDeleteMode);
  btn.textContent = obstacleDeleteMode ? '🗑 DELETE MODE ON — CLICK OBSTACLE' : '🗑 DELETE MODE';
  btn.style.background  = obstacleDeleteMode ? 'rgba(239,68,68,0.18)' : '';
  btn.style.borderColor = obstacleDeleteMode ? '#ef4444' : '';
  btn.style.color       = obstacleDeleteMode ? '#ef4444' : '';
}

function selectObstacleType(type) {
  selectedObstacleType = type;
  document.querySelectorAll('.obs-type-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('obs-btn-' + type)?.classList.add('selected');
}

function placeObstacle(nx, ny) {
  const def = OBSTACLE_TYPES[selectedObstacleType];
  obstacles.push({ x: nx, y: ny, type: selectedObstacleType, r: def.radius });
  syncObstaclesToRobot(); updateObstacleCount();
  showToast('⬡ ' + def.emoji + ' ' + def.label + ' placed');
}

function removeObstacleAt(nx, ny) {
  let closestIdx = -1, closestDist = Infinity;
  obstacles.forEach((o, i) => {
    const dist = Math.sqrt((o.x - nx) ** 2 + (o.y - ny) ** 2);
    if (dist < closestDist) { closestDist = dist; closestIdx = i; }
  });
  if (closestIdx !== -1 && closestDist < 0.06) {
    const removed = obstacles[closestIdx];
    const def = OBSTACLE_TYPES[removed.type] || OBSTACLE_TYPES.person;
    obstacles.splice(closestIdx, 1);
    syncObstaclesToRobot(); updateObstacleCount();
    showToast('⬡ ' + def.emoji + ' ' + def.label + ' removed');
    return true;
  }
  return false;
}

function clearAllObstacles() {
  obstacles = [];
  syncObstaclesToRobot(); updateObstacleCount();
  showToast('⬡ All obstacles cleared');
}

function updateObstacleCount() {
  const el = document.getElementById('obs-count');
  if (el) el.textContent = obstacles.length > 0
    ? obstacles.length + ' obstacle' + (obstacles.length > 1 ? 's' : '') + ' active'
    : 'no obstacles';
}

async function syncObstaclesToRobot() {
  try { sessionStorage.setItem('dinobotObstacles', JSON.stringify(obstacles)); } catch {}
  try {
    const targetId = currentTarget?.id;
    const tableObstacles = tables
      .filter(t => t.id !== targetId)
      .map(t => ({ x: t.x, y: t.y, type: 'table', radius: 0.022 }));
    const allObstacles = [
      ...obstacles.map(o => ({ x:o.x, y:o.y, type:o.type, radius:o.r })),
      ...tableObstacles
    ];
    await fetch(API_BASE + '/api/robot/obstacles', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ obstacles: allObstacles })
    });
  } catch {}
}

/* ── DRAW OBSTACLES ──────────────────────────────────────── */
function drawObstacles(ctx, W, H) {
  obstacles.forEach((o, i) => {
    const def = OBSTACLE_TYPES[o.type] || OBSTACLE_TYPES.person;
    const px = o.x * W, py = o.y * H;
    const r  = o.r * Math.min(W, H);
    const isHovered = obstacleDeleteMode && window._hoveredObstacleIdx === i;

    // Danger ring
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, r + (isHovered ? 10 : 6), 0, Math.PI * 2);
    ctx.strokeStyle = isHovered ? '#ef4444' : def.color;
    ctx.lineWidth = isHovered ? 2.5 : 1;
    ctx.globalAlpha = isHovered ? 0.9 : (0.25 + 0.15 * Math.sin(Date.now() / 400 + i));
    ctx.setLineDash(isHovered ? [] : [4, 3]);
    ctx.stroke(); ctx.setLineDash([]); ctx.restore();

    // Fill
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = isHovered ? '#ef4444' : def.color;
    ctx.globalAlpha = isHovered ? 0.35 : 0.22;
    ctx.fill(); ctx.restore();

    // Border
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.strokeStyle = isHovered ? '#ef4444' : def.color;
    ctx.lineWidth = isHovered ? 2 : 1.5; ctx.globalAlpha = 0.85;
    ctx.stroke(); ctx.restore();

    // Emoji
    ctx.save();
    ctx.font = Math.round(r * 1.25) + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = isHovered ? 0.4 : 1;
    ctx.fillText(def.emoji, px, py); ctx.restore();

    // Delete X overlay
    if (isHovered) {
      ctx.save();
      ctx.font = 'bold ' + Math.round(r * 1.1) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ef4444'; ctx.globalAlpha = 1;
      ctx.fillText('✕', px, py); ctx.restore();
    }

    // Type label
    ctx.save();
    ctx.font = '9px Share Tech Mono,monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = isHovered ? '#ef4444' : def.color; ctx.globalAlpha = 0.85;
    ctx.fillText(isHovered ? 'CLICK TO DELETE' : def.label.toUpperCase(), px, py + r + 11);
    ctx.restore();
  });
}

/* ── ROBOT STATE DISPLAY ─────────────────────────────────── */
function setRobotState(state, label, color) {
  const badge = document.getElementById('robot-state-badge');
  if (!badge) return;
  badge.textContent = '● ' + state; badge.style.color = color; badge.style.borderColor = color; badge.style.background = 'rgba(0,0,0,0.35)';
  document.getElementById('dest-label').textContent = label || '—';
}

/* ── SETUP TABLE DRAG ────────────────────────────────────── */
function setupTableDrag() {
  const canvas = document.getElementById('overlayMap');
  if (!canvas || canvas._dragSetup) return;
  canvas._dragSetup = true;

  function getTableAt(nx, ny) {
    return tables.find(t => Math.sqrt((t.x - nx) ** 2 + (t.y - ny) ** 2) < 0.045) || null;
  }

  // Obstacle click/right-click
  if (!canvas._obstacleSetup) {
    canvas._obstacleSetup = true;

    canvas.addEventListener('click', e => {
      if (!obstacleMode) return;
      e.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      if (obstacleDeleteMode || e.shiftKey) {
        removeObstacleAt(nx, ny) || showToast('⬡ No obstacle there — click closer to one');
      } else {
        placeObstacle(nx, ny);
      }
    });

    canvas.addEventListener('contextmenu', e => {
      if (!obstacleMode) return;
      e.preventDefault(); e.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      removeObstacleAt((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    });
  }

  // Mouse drag
  canvas.addEventListener('mousedown', e => {
    if (obstacleMode) { e.stopPropagation(); return; }
    if (!editLayoutMode) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    draggingTable = getTableAt(nx, ny);
    if (draggingTable) {
      draggingTable._startX = draggingTable.x; draggingTable._startY = draggingTable.y;
      dragOffsetX = draggingTable.x - nx; dragOffsetY = draggingTable.y - ny;
      canvas.style.cursor = 'grabbing'; e.preventDefault();
    }
  });

  canvas.addEventListener('mousemove', e => {
    if (obstacleMode) {
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      if (obstacleDeleteMode) {
        const nearest = obstacles.reduce((best, o, i) => {
          const d = Math.sqrt((o.x - nx) ** 2 + (o.y - ny) ** 2);
          return d < best.d ? { d, i } : best;
        }, { d: Infinity, i: -1 });
        window._hoveredObstacleIdx = nearest.d < 0.06 ? nearest.i : -1;
        canvas.style.cursor = window._hoveredObstacleIdx !== -1 ? 'pointer' : 'not-allowed';
      } else {
        window._hoveredObstacleIdx = -1; canvas.style.cursor = 'crosshair';
      }
      return;
    }
    if (!editLayoutMode) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (draggingTable) {
      draggingTable.x = Math.max(0.05, Math.min(0.97, nx + dragOffsetX));
      draggingTable.y = Math.max(0.05, Math.min(0.95, ny + dragOffsetY));
    } else {
      canvas.style.cursor = getTableAt(nx, ny) ? 'grab' : 'crosshair';
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (obstacleMode) { e.stopPropagation(); return; }
    if (draggingTable) {
      const moved = Math.abs(draggingTable.x - (draggingTable._startX || draggingTable.x)) > 0.01 ||
                    Math.abs(draggingTable.y - (draggingTable._startY || draggingTable.y)) > 0.01;
      if (moved) { saveTables(); showToast('⬡ Table ' + draggingTable.id + ' position saved'); }
      else {
        selectedTableId = (selectedTableId === draggingTable.id) ? null : draggingTable.id;
        updateDeleteBtn();
      }
      draggingTable = null; canvas.style.cursor = editLayoutMode ? 'crosshair' : 'default';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (draggingTable) { saveTables(); draggingTable = null; }
    window._hoveredObstacleIdx = -1;
  });

  // Touch
  canvas.addEventListener('touchstart', e => {
    if (obstacleMode) {
      const rect = canvas.getBoundingClientRect(), t = e.touches[0];
      const nx = (t.clientX - rect.left) / rect.width;
      const ny = (t.clientY - rect.top) / rect.height;
      obstacleDeleteMode ? removeObstacleAt(nx, ny) : placeObstacle(nx, ny);
      e.preventDefault(); return;
    }
    if (!editLayoutMode) return;
    const rect = canvas.getBoundingClientRect(), t = e.touches[0];
    const nx = (t.clientX - rect.left) / rect.width;
    const ny = (t.clientY - rect.top) / rect.height;
    draggingTable = getTableAt(nx, ny);
    if (draggingTable) { dragOffsetX = draggingTable.x - nx; dragOffsetY = draggingTable.y - ny; e.preventDefault(); }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (obstacleMode) { e.preventDefault(); return; }
    if (!draggingTable) return;
    const rect = canvas.getBoundingClientRect(), t = e.touches[0];
    draggingTable.x = Math.max(0.05, Math.min(0.97, (t.clientX - rect.left) / rect.width + dragOffsetX));
    draggingTable.y = Math.max(0.05, Math.min(0.95, (t.clientY - rect.top) / rect.height + dragOffsetY));
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', () => { if (draggingTable) { saveTables(); draggingTable = null; } });
}

/* ── MAIN MAP ANIMATION ──────────────────────────────────── */
function animateMap() {
  const canvas = document.getElementById('overlayMap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;

  if (!paused && !eStopActive) {
    const dx = targetX - robotX, dy = targetY - robotY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > 0.005) {
      const spd = 0.004; robotX += (dx/dist)*spd; robotY += (dy/dist)*spd; robotAngle = Math.atan2(dy, dx);
      if (dist < 0.015 && robotState === 'DISPATCHED' && currentTarget) {
        robotState = 'DELIVERING'; setRobotState('DELIVERING', 'Table ' + currentTarget.id, '#4ADE80');
        document.getElementById('speed-val').textContent = '0 cm/s'; document.getElementById('speed-bar').style.width = '0%';
        raTrackDelivery();
        addActivity('dot-order', `UNIT-01 arrived at <strong>Table ${currentTarget.id}</strong>`);
        setTimeout(() => { if (robotState === 'DELIVERING') recallUnit(); }, 4000);
      }
      if (dist < 0.015 && robotState === 'RETURNING') {
        robotX = dockX; robotY = dockY; robotState = 'DOCKED';
        setRobotState('DOCKED — STANDBY', '—', '#4ADE80');
        document.getElementById('speed-val').textContent = '0 cm/s'; document.getElementById('speed-bar').style.width = '0%';
        document.getElementById('load-val').textContent = 'Empty'; document.getElementById('load-bar').style.width = '0%';
        document.querySelectorAll('.dispatch-btn').forEach(b => b.classList.remove('active'));
        addActivity('dot-robot', 'UNIT-01 <strong>docked</strong>'); currentTarget = null;
      }
    }
  }

  ctx.clearRect(0, 0, W, H);
  const isLight = document.body.classList.contains('light-mode');

  // Grid
  ctx.strokeStyle = isLight ? 'rgba(30,100,200,0.15)' : 'rgba(5,22,65,0.9)'; ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke(); }
  for (let j = 0; j < H; j += 40) { ctx.beginPath(); ctx.moveTo(0,j); ctx.lineTo(W,j); ctx.stroke(); }

  // Route lines
  const jx = 0.42*W, jy = 0.5*H;
  ctx.strokeStyle = isLight ? 'rgba(180,80,0,0.2)' : 'rgba(255,107,26,0.15)'; ctx.lineWidth = 2; ctx.setLineDash([6,6]);
  ctx.beginPath(); ctx.moveTo(dockX*W, dockY*H); ctx.lineTo(jx, jy); ctx.stroke();
  tables.forEach(t => { ctx.beginPath(); ctx.moveTo(jx,jy); ctx.lineTo(t.x*W,t.y*H); ctx.stroke(); });
  ctx.setLineDash([]);

  // Tables
  tables.forEach(t => {
    const tx = t.x*W, ty = t.y*H, isTarget = currentTarget && currentTarget.id === t.id;
    ctx.fillStyle = isTarget ? (isLight?'#7c3aed':'#C084FC') : (isLight?'#1d4ed8':'#60A5FA');
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = isTarget ? 14 : 8;
    ctx.beginPath(); ctx.arc(tx, ty, isTarget ? 9 : 7, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = isLight ? 'rgba(20,8,0,0.7)' : 'rgba(220,232,248,0.8)';
    ctx.font = '10px Share Tech Mono,monospace'; ctx.textAlign = 'center';
    ctx.fillText('T'+t.id, tx, ty+20);
  });

  // Dock
  ctx.fillStyle = '#16a34a'; ctx.shadowColor = '#16a34a'; ctx.shadowBlur = isLight ? 6 : 12;
  ctx.beginPath(); ctx.arc(dockX*W, dockY*H, 8, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = isLight ? 'rgba(20,8,0,0.7)' : 'rgba(74,222,128,0.7)';
  ctx.font = '10px Share Tech Mono,monospace'; ctx.textAlign = 'center';
  ctx.fillText('DOCK', dockX*W, dockY*H+20);

  // Robot
  const rs = 11;
  const navMode = window._robotNavMode || 'NORMAL';
  if (navMode !== 'NORMAL') {
    const ringColor = navMode === 'EMERGENCY' ? '#ef4444' : navMode === 'REJOIN' ? '#C084FC' : '#FBB924';
    ctx.save(); ctx.strokeStyle = ringColor; ctx.lineWidth = 2; ctx.shadowColor = ringColor; ctx.shadowBlur = 16;
    ctx.beginPath();
    for (let i=0;i<6;i++){ const a=(Math.PI/3)*i-Math.PI/2, r=rs+9; i===0?ctx.moveTo(robotX*W+Math.cos(a)*r,robotY*H+Math.sin(a)*r):ctx.lineTo(robotX*W+Math.cos(a)*r,robotY*H+Math.sin(a)*r); }
    ctx.closePath(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = ringColor; ctx.font = 'bold 8px Share Tech Mono,monospace'; ctx.textAlign = 'center';
    ctx.shadowColor = ringColor; ctx.shadowBlur = 6;
    ctx.fillText(navMode, robotX*W, robotY*H - 24); ctx.shadowBlur = 0;
  }

  const risk = window._robotRisk || 0;
  if (risk > 0.05) {
    const barW = 40, barX = robotX*W - barW/2, barY = robotY*H + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(barX, barY, barW, 3);
    const riskColor = risk > 0.7 ? '#ef4444' : risk > 0.3 ? '#FBB924' : '#4ADE80';
    ctx.fillStyle = riskColor; ctx.fillRect(barX, barY, barW * Math.min(risk, 1), 3);
    ctx.fillStyle = 'rgba(220,232,248,0.4)'; ctx.font = '7px Share Tech Mono,monospace';
    ctx.textAlign = 'center'; ctx.fillText('RISK', robotX*W, barY + 10);
  }

  ctx.save(); ctx.translate(robotX*W, robotY*H); ctx.rotate(robotAngle);
  ctx.beginPath();
  for (let i=0;i<6;i++) { const a=(Math.PI/3)*i-Math.PI/2; i===0?ctx.moveTo(Math.cos(a)*rs,Math.sin(a)*rs):ctx.lineTo(Math.cos(a)*rs,Math.sin(a)*rs); }
  ctx.closePath();
  const robotColor = eStopActive?'#ef4444':navMode==='EMERGENCY'?'#ef4444':navMode==='AVOIDANCE'?'#FBB924':'#FF6B1A';
  ctx.fillStyle = robotColor; ctx.shadowColor = robotColor; ctx.shadowBlur = 16;
  ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();

  drawObstacles(ctx, W, H);
  mapAnimFrame = requestAnimationFrame(animateMap);
}

/* ── OVERLAY MAP ─────────────────────────────────────────── */
let overlayMapFrame = null;

function openMapOverlay() {
  document.getElementById('map-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  cancelAnimationFrame(mapAnimFrame); mapAnimFrame = null;
  rebuildDispatchButtons();
  setTimeout(() => { initOverlayMap(); setupTableDrag(); }, 100);
  syncOverlayState();
}

function closeMapOverlay() {
  const el = document.getElementById('map-overlay');
  cancelAnimationFrame(overlayMapFrame); overlayMapFrame = null;
  el.style.animation = 'none'; el.style.opacity = '0'; el.style.transform = 'translateY(32px)'; el.style.transition = 'all 0.3s ease';
  setTimeout(() => {
    el.classList.remove('open'); el.style.animation = ''; el.style.opacity = ''; el.style.transform = ''; el.style.transition = '';
    document.body.style.overflow = '';
    animateMap();
  }, 300);
}

function initOverlayMap() {
  cancelAnimationFrame(overlayMapFrame);
  const canvas = document.getElementById('overlayMap');
  if (!canvas) return;
  const wrap = canvas.parentElement;
  canvas.width = wrap.offsetWidth; canvas.height = wrap.offsetHeight;
  animateOverlayMap();
}

function animateOverlayMap() {
  const canvas = document.getElementById('overlayMap');
  if (!canvas || !document.getElementById('map-overlay').classList.contains('open')) return;
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const isLight = document.body.classList.contains('light-mode');
  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = isLight ? 'rgba(30,100,200,0.15)' : 'rgba(5,22,65,0.9)'; ctx.lineWidth = 1;
  for (let i=0;i<W;i+=40){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,H);ctx.stroke();}
  for (let j=0;j<H;j+=40){ctx.beginPath();ctx.moveTo(0,j);ctx.lineTo(W,j);ctx.stroke();}

  // Route lines
  const jx=0.42*W,jy=0.5*H;
  ctx.strokeStyle=isLight?'rgba(180,80,0,0.25)':'rgba(255,107,26,0.15)'; ctx.lineWidth=2; ctx.setLineDash([6,6]);
  ctx.beginPath();ctx.moveTo(dockX*W,dockY*H);ctx.lineTo(jx,jy);ctx.stroke();
  tables.forEach(t=>{ctx.beginPath();ctx.moveTo(jx,jy);ctx.lineTo(t.x*W,t.y*H);ctx.stroke();});
  ctx.setLineDash([]);

  // Tables
  tables.forEach(t=>{
    const tx=t.x*W,ty=t.y*H,isT=currentTarget&&currentTarget.id===t.id;
    const isDragged=draggingTable&&draggingTable.id===t.id,isSelected=selectedTableId===t.id;
    const r=isDragged?14:isT?10:editLayoutMode?9:7;
    if(editLayoutMode){
      ctx.strokeStyle=isDragged?'#4ADE80':'rgba(74,222,128,0.5)';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
      ctx.beginPath();ctx.arc(tx,ty,r+8,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    }
    ctx.fillStyle=isDragged?'#4ADE80':isSelected?'#ef4444':isT?(isLight?'#7c3aed':'#C084FC'):(isLight?'#1d4ed8':'#60A5FA');
    ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=isDragged?20:isT?16:8;
    ctx.beginPath();ctx.arc(tx,ty,r,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle=isLight?'rgba(20,8,0,0.7)':'rgba(220,232,248,0.8)';
    ctx.font='11px Share Tech Mono,monospace';ctx.textAlign='center';
    ctx.fillText('T'+t.id,tx,ty+r+12);
    if(editLayoutMode&&!isDragged){ctx.fillStyle='rgba(74,222,128,0.6)';ctx.font='9px Share Tech Mono,monospace';ctx.fillText('drag',tx,ty+r+22);}
  });

  // Dock
  ctx.fillStyle='#16a34a';ctx.shadowColor='#16a34a';ctx.shadowBlur=isLight?6:14;
  ctx.beginPath();ctx.arc(dockX*W,dockY*H,9,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle=isLight?'rgba(20,8,0,0.7)':'rgba(74,222,128,0.8)';
  ctx.font='10px Share Tech Mono,monospace';ctx.textAlign='center';
  ctx.fillText('DOCK',dockX*W,dockY*H+22);

  // Robot
  const rs=13;
  ctx.save();ctx.translate(robotX*W,robotY*H);ctx.rotate(robotAngle);
  ctx.beginPath();
  for(let i=0;i<6;i++){const a=(Math.PI/3)*i-Math.PI/2;i===0?ctx.moveTo(Math.cos(a)*rs,Math.sin(a)*rs):ctx.lineTo(Math.cos(a)*rs,Math.sin(a)*rs);}
  ctx.closePath();
  ctx.fillStyle=eStopActive?'#ef4444':'#FF6B1A';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=20;
  ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();

  drawObstacles(ctx,W,H);
  syncOverlayState();
  overlayMapFrame=requestAnimationFrame(animateOverlayMap);
}

function syncOverlayState() {
  [['bat-pct','bat-pct'],['bat-bar','bat-bar'],['speed-val','speed-val'],['speed-bar','speed-bar'],['load-val','load-val'],['load-bar','load-bar']].forEach(([src,dst])=>{
    const s=document.getElementById(src),d=document.getElementById('ov-'+dst);
    if(s&&d){d.textContent=s.textContent;d.style.width=s.style.width;}
  });
  const srcBadge=document.getElementById('robot-state-badge'),dstBadge=document.getElementById('ov-state-badge');
  if(srcBadge&&dstBadge){dstBadge.textContent=srcBadge.textContent;dstBadge.style.color=srcBadge.style.color;dstBadge.style.borderColor=srcBadge.style.borderColor;}
}

/* ── INIT MAP (called after login) ───────────────────────── */
function initMap() {
  try {
    const saved = sessionStorage.getItem('dinobotObstacles');
    if (saved) { obstacles = JSON.parse(saved); updateObstacleCount(); }
  } catch {}

  const container = document.getElementById('map-container');
  const canvas    = document.getElementById('overlayMap');
  if (!canvas || !container) return;
  canvas.width  = container.offsetWidth  || 500;
  canvas.height = container.offsetHeight || 350;
  if (mapAnimFrame) cancelAnimationFrame(mapAnimFrame);
  animateMap();

  robotBusy = true; setAllDispatchButtons(false);
  setRobotState('OFFLINE', '—', '#ef4444');

  if (window._robotPollInterval) clearInterval(window._robotPollInterval);
  window._robotPollInterval = setInterval(async () => {
    try {
      const res  = await fetch(API_BASE + '/api/robot/status', { headers: authHeaders() });
      if (!res.ok) throw new Error('not ready');
      const data = await res.json();

      robotX = data.x_norm; robotY = data.y_norm; robotAngle = data.theta;
      targetX = robotX; targetY = robotY;
      window._robotNavMode = data.nav_mode || 'NORMAL';
      if (data.nav_mode === 'AVOIDANCE' && window._lastNavMode !== 'AVOIDANCE') {
        raTrackObstacleAvoided();
      }
      window._lastNavMode = data.nav_mode || 'NORMAL';
      window._robotRisk    = data.risk || 0;

      document.getElementById('bat-bar').style.width  = data.battery + '%';
      raTrackBattery(data.battery);
      document.getElementById('bat-pct').textContent  = data.battery + '%';
      document.getElementById('speed-val').textContent = data.speed + ' cm/s';
      document.getElementById('speed-bar').style.width = Math.min(data.speed, 100) + '%';
      document.getElementById('load-val').textContent  = data.state === 'IDLE' ? 'Empty' : 'Loaded';
      document.getElementById('load-bar').style.width  = data.state === 'IDLE' ? '0%' : '80%';

      const stateColors  = { 'MOVING_TO_TABLE':'#FBB924','DELIVERING':'#4ADE80','RETURNING':'#60A5FA','IDLE':'#4ADE80' };
      const stateLabels  = { 'MOVING_TO_TABLE':'EN ROUTE','DELIVERING':'DELIVERING','RETURNING':'RETURNING','IDLE':'DOCKED' };
      setRobotState(stateLabels[data.state]||data.state, data.target_table?'Table '+data.target_table:'—', stateColors[data.state]||'#4ADE80');

      if (data.target_table && ['MOVING_TO_TABLE','DELIVERING'].includes(data.state)) {
        if (!currentTarget || currentTarget.id !== data.target_table) {
          currentTarget = tables.find(t => t.id === data.target_table) || null;
          if (currentTarget) { targetX = currentTarget.x; targetY = currentTarget.y; }
          robotState = data.state === 'DELIVERING' ? 'DELIVERING' : 'DISPATCHED';
          syncObstaclesToRobot(); // Re-sync excluding new target table
          document.querySelectorAll('.dispatch-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.dispatch-btn')[data.target_table - 1]?.classList.add('active');
        }
      } else if (data.state === 'RETURNING' && robotState !== 'RETURNING') {
        robotState = 'RETURNING'; targetX = dockX; targetY = dockY; currentTarget = null;
        document.querySelectorAll('.dispatch-btn').forEach(b => b.classList.remove('active'));
      } else if (data.state === 'IDLE') {
        currentTarget = null;
        syncObstaclesToRobot();
        if (robotBusy) {
          robotBusy = false; setAllDispatchButtons(true);
          const toRemove = Object.entries(kitchenOrders).filter(([,o])=>['dispatched','delivering','delivered'].includes(o.status)).map(([ref])=>ref);
          toRemove.forEach(ref => {
            const card = document.getElementById('order-' + ref);
            if (card) { card.style.transition='opacity 0.4s,transform 0.4s';card.style.opacity='0';card.style.transform='translateX(20px)';setTimeout(()=>card.remove(),420); }
            clearInterval(kitchenOrders[ref]?.timerInterval); clearInterval(kitchenOrders[ref]?.waitInterval);
            delete kitchenOrders[ref];
          });
          setTimeout(()=>resortColumns(),450);
          showToast('⬡ Robot back at dock — order complete');
        }
      }

      // Route alarm: 5+ minutes en route
      if (['MOVING_TO_TABLE','DELIVERING'].includes(data.state)) {
        if (!window._routeStartTime) window._routeStartTime = Date.now();
        const routeMins = (Date.now() - window._routeStartTime) / 60000;
        if (routeMins >= 1.5 && !window._routeAlarmFired) {
          window._routeAlarmFired = true;
          showRobotAlarm(); playCritAlert();
          speak('Warning. The robot has been en route for over 5 minutes. Please check Unit 01.', { priority: true });
          addActivity('dot-system', '⚠ <strong>ROBOT DELAY</strong> — Unit-01 en route for 5+ minutes');
        }
      } else { window._routeStartTime = null; window._routeAlarmFired = false; dismissRobotAlarm(); }

      // Sync kitchen robot bar
      const kitchState = document.getElementById('kitch-robot-state');
      const kitchDest  = document.getElementById('kitch-robot-dest');
      const kitchBat   = document.getElementById('kitch-robot-bat');
      if (kitchState) kitchState.textContent = '● ' + (stateLabels[data.state]||data.state);
      if (kitchDest)  kitchDest.textContent  = data.target_table ? 'Table '+data.target_table : '—';
      if (kitchBat)   kitchBat.textContent   = data.battery + '%';

      const isRobotBusy = ['MOVING_TO_TABLE','DELIVERING','RETURNING','RETURNING_TO_DOCK_FOR_DISPATCH'].includes(data.state);
      if (isRobotBusy !== robotBusy) { robotBusy = isRobotBusy; setAllDispatchButtons(!isRobotBusy); }

      document.getElementById('estop-btn').disabled = false;
      document.getElementById('estop-btn').style.opacity = '';
      const resetBtn = document.getElementById('reset-stuck-btn');
      if (resetBtn) { resetBtn.disabled=false;resetBtn.style.opacity='1';resetBtn.style.pointerEvents='auto';resetBtn.style.cursor='pointer'; }

    } catch {
      robotBusy = true; setAllDispatchButtons(false);
      setRobotState('OFFLINE', '—', '#ef4444');
      const resetBtn = document.getElementById('reset-stuck-btn');
      if (resetBtn) { resetBtn.disabled=false;resetBtn.style.opacity='1';resetBtn.style.pointerEvents='auto'; }
    }
  }, 2000);
}