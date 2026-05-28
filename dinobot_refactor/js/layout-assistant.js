/* ══════════════════════════════════════════════════════════
   layout-assistant.js — AI Layout Assistant for Manager
══════════════════════════════════════════════════════════ */

let layoutAssistantOpen = false;
let layoutChatHistory   = [];
let layoutOptions       = [];
let selectedLayoutIdx   = null;

function openLayoutAssistant() {
  const panel = document.getElementById('layout-assistant-panel');
  if (!panel) return;
  layoutAssistantOpen = true;
  panel.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (layoutChatHistory.length === 0) {
    layoutAddMessage('bot', "Hey! I'm your AI Layout Assistant 🗺️\n\nI'll help you design the perfect floor plan. I'll ask a few questions, then generate 3 layout options with table positions and obstacle placements.\n\nLet's start — how many tables do you need?");
  }
  setTimeout(() => document.getElementById('layout-chat-input')?.focus(), 100);
}

function closeLayoutAssistant() {
  const panel = document.getElementById('layout-assistant-panel');
  if (!panel) return;
  layoutAssistantOpen = false;
  panel.style.display = 'none';
  document.body.style.overflow = '';
}

function layoutAddMessage(role, text) {
  const messages = document.getElementById('layout-chat-messages');
  if (!messages) return;
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:4px;animation:fadeInUp 0.3s ease;align-items:' + (role === 'bot' ? 'flex-start' : 'flex-end') + ';';
  const isLight = document.body.classList.contains('light-mode');
  const bubble = document.createElement('div');
  bubble.style.cssText = 'padding:10px 14px;font-family:Rajdhani,sans-serif;font-size:14px;line-height:1.5;max-width:90%;white-space:pre-wrap;' +
    (role === 'bot'
      ? `background:${isLight?'#dceef8':'rgba(5,22,65,0.7)'};border:1px solid var(--border);border-left:2px solid var(--orange);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);color:var(--text);`
      : `background:${isLight?'rgba(255,107,26,0.1)':'rgba(255,107,26,0.12)'};border:1px solid var(--border-bright);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);color:var(--text);`);
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function layoutShowTyping() {
  const messages = document.getElementById('layout-chat-messages');
  if (!messages) return;
  const el = document.createElement('div');
  el.id = 'layout-typing';
  const isLightTyping = document.body.classList.contains('light-mode');
  el.style.cssText = `display:flex;align-items:center;gap:6px;padding:10px 14px;background:${isLightTyping?'#dceef8':'rgba(5,22,65,0.7)'};border:1px solid var(--border);border-left:2px solid var(--orange);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);width:fit-content;`;
  el.innerHTML = '<span style="width:6px;height:6px;background:var(--orange);border-radius:50%;animation:typingDot 1.2s ease-in-out infinite;"></span><span style="width:6px;height:6px;background:var(--orange);border-radius:50%;animation:typingDot 1.2s ease-in-out infinite;animation-delay:0.2s;"></span><span style="width:6px;height:6px;background:var(--orange);border-radius:50%;animation:typingDot 1.2s ease-in-out infinite;animation-delay:0.4s;"></span>';
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function layoutHideTyping() {
  document.getElementById('layout-typing')?.remove();
}

/* ── Extract layouts from AI reply no matter the format ─── */
function extractLayouts(text) {
  // Find every [ and try to parse a JSON array from there
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '[') continue;
    // Find the matching closing ]
    let depth = 0, j = i;
    while (j < text.length) {
      if (text[j] === '[') depth++;
      else if (text[j] === ']') { depth--; if (depth === 0) break; }
      j++;
    }
    try {
      const parsed = JSON.parse(text.slice(i, j + 1));
      if (Array.isArray(parsed) && parsed.length >= 2 && parsed[0] && parsed[0].tables) {
        return parsed.slice(0, 3);
      }
    } catch(e) {}
  }
  return null;
}

/* ── Remove all JSON from text for display ──────────────── */
function stripJSON(text) {
  // Cut everything from the first [ that starts a JSON array
  const idx = text.search(/\[\s*\{/);
  if (idx > 0) return text.slice(0, idx).trim();
  if (idx === 0) return '';
  return text.trim();
}

async function sendLayoutMessage() {
  const input = document.getElementById('layout-chat-input');
  const text  = input?.value?.trim();
  if (!text) return;
  input.value = '';

  layoutAddMessage('user', text);
  layoutChatHistory.push({ role: 'user', content: text });
  layoutShowTyping();

  try {
    const response = await fetch(API_BASE + '/api/groq', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message: layoutChatHistory, system: buildLayoutSystemPrompt() })
    });

    const data     = await response.json();
    const rawReply = data?.reply || 'Sorry, try again!';
    layoutHideTyping();

    const extracted = extractLayouts(rawReply);

    if (extracted) {
      layoutOptions = extracted;
      selectedLayoutIdx = null;
      const cleanText = stripJSON(rawReply);
      if (cleanText) layoutAddMessage('bot', cleanText);
      layoutAddMessage('bot', 'Here are your ' + extracted.length + ' layout options — click PREVIEW to see it, then APPLY to use it on your live map.');
      renderLayoutOptions();
    } else {
      layoutAddMessage('bot', rawReply);
    }

    // Update step indicator based on conversation progress
    const userMsgs = layoutChatHistory.filter(m => m.role === 'user').length;
    if (userMsgs >= 1) updateLayoutStep(2);
    if (userMsgs >= 2) updateLayoutStep(3);
    if (userMsgs >= 3) updateLayoutStep(4);
    if (userMsgs >= 4) updateLayoutStep(5);

    layoutChatHistory.push({ role: 'assistant', content: rawReply });
    if (layoutChatHistory.length > 20) layoutChatHistory = layoutChatHistory.slice(-20);

  } catch(err) {
    layoutHideTyping();
    layoutAddMessage('bot', 'Connection issue — please try again.');
    console.error('[LayoutAssistant]', err);
  }
}

function renderLayoutOptions() {
  const container = document.getElementById('layout-options-container');
  if (!container || layoutOptions.length === 0) return;

  // Hide empty state, update title
  const emptyState = document.getElementById('la-empty-state');
  if (emptyState) emptyState.style.display = 'none';
  const rightTitle = document.getElementById('la-right-title');
  if (rightTitle) rightTitle.textContent = layoutOptions.length + ' Layouts Generated — Choose One';
  rightTitle.style.color = 'var(--orange)';

  // Mark step 5 active
  updateLayoutStep(5);

  // Remove old cards
  document.querySelectorAll('.la-card').forEach(c => c.remove());

  layoutOptions.forEach((layout, idx) => {
    const card = document.createElement('div');
    card.className = 'la-card';
    card.id = 'layout-card-' + idx;

    const preview = document.createElement('canvas');
    preview.width = 480; preview.height = 200;
    preview.style.cssText = 'display:block;width:100%;border-bottom:1px solid rgba(255,255,255,0.04);';
    drawLayoutPreview(preview, layout);

    const header = document.createElement('div');
    header.className = 'la-card-header';
    header.innerHTML =
      '<div>' +
        '<div class="la-card-name">' + (layout.name || 'Layout ' + (idx+1)) + '</div>' +
        '<div class="la-card-meta">' + layout.tables.length + ' TABLES · ' + (layout.obstacles?.length || 0) + ' OBSTACLES</div>' +
      '</div>' +
      '<div style="font-family:Bebas Neue,sans-serif;font-size:32px;color:rgba(255,107,26,0.2);letter-spacing:2px;">0' + (idx+1) + '</div>';

    const desc = document.createElement('div');
    desc.className = 'la-card-desc';
    desc.textContent = layout.description || '';

    const actions = document.createElement('div');
    actions.className = 'la-card-actions';
    actions.innerHTML =
      '<button class="la-card-preview-btn" onclick="previewLayout(' + idx + ')">👁 PREVIEW ON MAP</button>' +
      '<button class="la-card-apply-btn" onclick="applyLayout(' + idx + ')">✓ APPLY THIS LAYOUT</button>';

    card.appendChild(preview);
    card.appendChild(header);
    card.appendChild(desc);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

function updateLayoutStep(stepNum) {
  document.querySelectorAll('.la-step').forEach(s => {
    const n = parseInt(s.dataset.step);
    s.classList.remove('la-step-active', 'la-step-done');
    if (n < stepNum) s.classList.add('la-step-done');
    else if (n === stepNum) s.classList.add('la-step-active');
  });
}

function drawLayoutPreview(canvas, layout) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const isLight = document.body.classList.contains('light-mode');
  ctx.fillStyle = isLight ? '#e8f4fd' : '#020b1a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = isLight ? 'rgba(30,100,200,0.1)' : 'rgba(5,22,65,0.9)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < W; i += 20) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke(); }
  for (let j = 0; j < H; j += 20) { ctx.beginPath(); ctx.moveTo(0,j); ctx.lineTo(W,j); ctx.stroke(); }
  const jx = 0.42*W, jy = 0.5*H;
  ctx.strokeStyle = 'rgba(255,107,26,0.15)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(dockX*W, dockY*H); ctx.lineTo(jx, jy); ctx.stroke();
  layout.tables.forEach(t => { ctx.beginPath(); ctx.moveTo(jx,jy); ctx.lineTo(t.x*W,t.y*H); ctx.stroke(); });
  ctx.setLineDash([]);
  ctx.fillStyle = '#16a34a'; ctx.shadowColor = '#16a34a'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(dockX*W, dockY*H, 5, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#4ADE80'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
  ctx.fillText('DOCK', dockX*W, dockY*H + 13);
  layout.tables.forEach(t => {
    ctx.fillStyle = '#60A5FA'; ctx.shadowColor = '#60A5FA'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(t.x*W, t.y*H, 5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(220,232,248,0.9)'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('T'+t.id, t.x*W, t.y*H + 13);
  });
  (layout.obstacles || []).forEach(o => {
    ctx.fillStyle = 'rgba(239,68,68,0.35)'; ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 3;
    ctx.beginPath(); ctx.arc(o.x*W, o.y*H, 4, 0, Math.PI*2);
    ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  });
}

function previewLayout(idx) {
  selectedLayoutIdx = idx;
  const layout = layoutOptions[idx];
  document.querySelectorAll('.la-card').forEach((c, i) => {
    c.classList.toggle('selected', i === idx);
  });
  showToast('Previewing: ' + layout.name + ' — click APPLY THIS LAYOUT to use it');
}

function applyLayout(idx) {
  const layout = layoutOptions[idx];
  if (!layout) return;
  tables.length = 0;
  layout.tables.forEach(t => tables.push({ id: t.id, x: t.x, y: t.y }));
  saveTables(); rebuildDispatchButtons(); rebuildStudentTableGrid();
  if (layout.obstacles && layout.obstacles.length > 0) {
    obstacles.length = 0;
    layout.obstacles.forEach(o => {
      const def = OBSTACLE_TYPES[o.type] || OBSTACLE_TYPES.barrier;
      obstacles.push({ x: o.x, y: o.y, type: o.type || 'barrier', r: def.radius });
    });
    syncObstaclesToRobot(); updateObstacleCount();
  }
  closeLayoutAssistant();
  showToast('Layout "' + layout.name + '" applied — ' + layout.tables.length + ' tables set!');
  addActivity('dot-system', 'AI layout <strong>' + layout.name + '</strong> applied — ' + layout.tables.length + ' tables');
  layoutChatHistory = []; layoutOptions = []; selectedLayoutIdx = null;
  const messages = document.getElementById('layout-chat-messages');
  if (messages) messages.innerHTML = '';
  const container = document.getElementById('layout-options-container');
  if (container) { container.style.display = 'none'; container.innerHTML = ''; }
}

function buildLayoutSystemPrompt() {
  return 'You are an AI floor layout assistant for Dinobot, a campus dining robot system.\n' +
    'Chat with the manager and collect info. Ask ONE question at a time:\n' +
    '1. How many tables?\n' +
    '2. Room shape and size?\n' +
    '3. Any fixed obstacles?\n' +
    '4. Dining style?\n\n' +
    'After collecting info, generate 3 layouts. Output ONLY a JSON array like this:\n' +
    '[{"name":"Name","description":"Desc","tables":[{"id":1,"x":0.55,"y":0.18}],"obstacles":[{"x":0.3,"y":0.3,"type":"barrier"}]},{"name":"Name2","description":"Desc2","tables":[{"id":1,"x":0.4,"y":0.3}],"obstacles":[]},{"name":"Name3","description":"Desc3","tables":[{"id":1,"x":0.6,"y":0.5}],"obstacles":[]}]\n\n' +
    'Rules: x and y between 0-1. Dock at x:0.08,y:0.5 — avoid it. Tables: x 0.20-0.95, y 0.10-0.90. Generate exactly the number of tables requested. Make each layout different. If the manager said no obstacles or none, set obstacles:[] for all layouts. Otherwise 2-5 obstacles each.\n' +
    'ONLY output the JSON array when generating. No explanation. No markdown.';
}

function resetLayoutAssistant() {
  layoutChatHistory = []; layoutOptions = []; selectedLayoutIdx = null;
  const messages = document.getElementById('layout-chat-messages');
  if (messages) messages.innerHTML = '';
  const container = document.getElementById('layout-options-container');
  if (container) { container.style.display = 'none'; container.innerHTML = ''; }
  layoutAddMessage('bot', 'Fresh start! How many tables do you need in your dining area?');
}