/* ══════════════════════════════════════════════════════════
   layout-assistant.js — AI Layout Assistant for Manager
   Asks questions, generates multiple floor layout options,
   manager picks one and applies it to the live map.
══════════════════════════════════════════════════════════ */

let layoutAssistantOpen = false;
let layoutChatHistory   = [];
let layoutOptions       = [];   // generated layout options
let selectedLayoutIdx   = null; // which option is previewed

/* ── OPEN / CLOSE ────────────────────────────────────────── */
function openLayoutAssistant() {
  const panel = document.getElementById('layout-assistant-panel');
  if (!panel) return;
  layoutAssistantOpen = true;
  panel.style.display = 'flex';
  if (layoutChatHistory.length === 0) {
    layoutAddMessage('bot',
      `Hey! I'm your AI Layout Assistant 🗺️\n\nI'll help you design the perfect floor plan for your dining area. I'll ask you a few questions, then generate 3 layout options with table positions and obstacle placements.\n\nLet's start — how many tables do you need in your dining area?`
    );
  }
  setTimeout(() => document.getElementById('layout-chat-input')?.focus(), 100);
}

function closeLayoutAssistant() {
  const panel = document.getElementById('layout-assistant-panel');
  if (!panel) return;
  layoutAssistantOpen = false;
  panel.style.display = 'none';
}

/* ── ADD MESSAGE TO CHAT ─────────────────────────────────── */
function layoutAddMessage(role, text) {
  const messages = document.getElementById('layout-chat-messages');
  if (!messages) return;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `display:flex;flex-direction:column;gap:4px;animation:fadeInUp 0.3s ease;align-items:${role === 'bot' ? 'flex-start' : 'flex-end'};`;

  const bubble = document.createElement('div');
  bubble.style.cssText = `
    padding:10px 14px;font-family:'Rajdhani',sans-serif;font-size:14px;line-height:1.5;
    max-width:90%;white-space:pre-wrap;
    ${role === 'bot'
      ? 'background:rgba(5,22,65,0.7);border:1px solid var(--border);border-left:2px solid var(--orange);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);color:var(--text);'
      : 'background:rgba(255,107,26,0.12);border:1px solid var(--border-bright);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);color:var(--text);'}
  `;
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

/* ── TYPING INDICATOR ────────────────────────────────────── */
function layoutShowTyping() {
  const messages = document.getElementById('layout-chat-messages');
  if (!messages) return;
  const el = document.createElement('div');
  el.id = 'layout-typing';
  el.style.cssText = 'display:flex;align-items:center;gap:6px;padding:10px 14px;background:rgba(5,22,65,0.7);border:1px solid var(--border);border-left:2px solid var(--orange);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);width:fit-content;';
  el.innerHTML = `
    <span style="width:6px;height:6px;background:var(--orange);border-radius:50%;animation:typingDot 1.2s ease-in-out infinite;"></span>
    <span style="width:6px;height:6px;background:var(--orange);border-radius:50%;animation:typingDot 1.2s ease-in-out infinite;animation-delay:0.2s;"></span>
    <span style="width:6px;height:6px;background:var(--orange);border-radius:50%;animation:typingDot 1.2s ease-in-out infinite;animation-delay:0.4s;"></span>
  `;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function layoutHideTyping() {
  document.getElementById('layout-typing')?.remove();
}

/* ── SEND MESSAGE ────────────────────────────────────────── */
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
      body: JSON.stringify({
        message: layoutChatHistory,
        system: buildLayoutSystemPrompt()
      })
    });

    const data     = await response.json();
    const rawReply = data?.reply || 'Sorry, try again!';

    layoutHideTyping();

    // Check if response contains layout JSON — strip it from chat, show visual cards only
    const layoutMatch = rawReply.match(/LAYOUTS_JSON:\s*([\s\S]*?)\s*END_LAYOUTS/);
    if (layoutMatch) {
      try {
        const parsed = JSON.parse(layoutMatch[1].trim());
        layoutOptions     = parsed;
        selectedLayoutIdx = null;
        // Never show raw JSON — strip it completely
        const cleanText = rawReply
          .replace(/LAYOUTS_JSON:[\s\S]*?END_LAYOUTS/, '')
          .replace(/```[\s\S]*?```/g, '')
          .trim();
        if (cleanText) layoutAddMessage('bot', cleanText);
        layoutAddMessage('bot', 'Here are your 3 layout options below — click PREVIEW to highlight it, then APPLY to set it as your live map.');
        renderLayoutOptions();
      } catch(e) {
        // Fallback: try extracting JSON array directly
        try {
          const s = rawReply.indexOf('['), e2 = rawReply.lastIndexOf(']') + 1;
          if (s !== -1 && e2 > s) {
            const parsed = JSON.parse(rawReply.slice(s, e2));
            layoutOptions = parsed; selectedLayoutIdx = null;
            layoutAddMessage('bot', 'Here are your 3 layout options below — click PREVIEW to highlight it, then APPLY to set it as your live map.');
            renderLayoutOptions();
          } else { layoutAddMessage('bot', rawReply.replace(/LAYOUTS_JSON:[\s\S]*?END_LAYOUTS/,'').trim()); }
        } catch(e3) { layoutAddMessage('bot', rawReply.replace(/LAYOUTS_JSON:[\s\S]*?END_LAYOUTS/,'').trim()); }
      }
    } else {
      layoutAddMessage('bot', rawReply);
    }

    layoutChatHistory.push({ role: 'assistant', content: rawReply });
    if (layoutChatHistory.length > 20) layoutChatHistory = layoutChatHistory.slice(-20);

  } catch(err) {
    layoutHideTyping();
    layoutAddMessage('bot', 'Connection issue — please try again.');
    console.error('[LayoutAssistant]', err);
  }
}

/* ── RENDER LAYOUT OPTIONS ───────────────────────────────── */
function renderLayoutOptions() {
  const container = document.getElementById('layout-options-container');
  if (!container || layoutOptions.length === 0) return;

  container.style.display = 'block';
  container.innerHTML = `
    <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:4px;color:var(--orange);text-transform:uppercase;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border);">
      ⬡ Choose a Layout
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;" id="layout-cards"></div>
  `;

  const cards = document.getElementById('layout-cards');

  layoutOptions.forEach((layout, idx) => {
    const card = document.createElement('div');
    card.id = `layout-card-${idx}`;
    card.style.cssText = `
      padding:14px 16px;background:linear-gradient(160deg,#0d1e36,#0b1828);
      border:1px solid var(--border);border-left:3px solid var(--border);
      cursor:pointer;transition:all 0.2s;clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);
    `;
    card.onmouseenter = () => { if (selectedLayoutIdx !== idx) card.style.borderColor = 'rgba(255,107,26,0.4)'; };
    card.onmouseleave = () => { if (selectedLayoutIdx !== idx) card.style.cssText = card.style.cssText; };

    // Mini map preview
    const preview = document.createElement('canvas');
    preview.width  = 240;
    preview.height = 130;
    preview.style.cssText = 'display:block;margin-bottom:10px;border:1px solid var(--border);width:100%;';
    drawLayoutPreview(preview, layout);

    const info = document.createElement('div');
    info.innerHTML = `
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;color:var(--orange);margin-bottom:4px;">
        ${layout.name}
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:8px;">
        ${layout.tables.length} TABLES · ${layout.obstacles?.length || 0} OBSTACLES
      </div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:12px;color:var(--text-dim);line-height:1.5;margin-bottom:10px;">
        ${layout.description}
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="previewLayout(${idx})" style="flex:1;padding:8px;background:rgba(255,107,26,0.08);border:1px solid var(--border-bright);color:var(--orange);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);transition:all 0.2s;">
          👁 PREVIEW
        </button>
        <button onclick="applyLayout(${idx})" style="flex:1;padding:8px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.4);color:#4ADE80;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);transition:all 0.2s;">
          ✓ APPLY
        </button>
      </div>
    `;

    card.appendChild(preview);
    card.appendChild(info);
    cards.appendChild(card);
  });
}

/* ── DRAW MINI PREVIEW ───────────────────────────────────── */
function drawLayoutPreview(canvas, layout) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const isLight = document.body.classList.contains('light-mode');

  ctx.fillStyle = isLight ? '#e8f4fd' : '#020b1a';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = isLight ? 'rgba(30,100,200,0.1)' : 'rgba(5,22,65,0.9)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < W; i += 20) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke(); }
  for (let j = 0; j < H; j += 20) { ctx.beginPath(); ctx.moveTo(0,j); ctx.lineTo(W,j); ctx.stroke(); }

  // Dock
  ctx.fillStyle = '#16a34a'; ctx.shadowColor = '#16a34a'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(dockX * W, dockY * H, 5, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#4ADE80'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
  ctx.fillText('D', dockX * W, dockY * H + 12);

  // Tables
  layout.tables.forEach(t => {
    ctx.fillStyle = '#60A5FA'; ctx.shadowColor = '#60A5FA'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(t.x * W, t.y * H, 5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(220,232,248,0.9)'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('T'+t.id, t.x * W, t.y * H + 12);
  });

  // Obstacles
  (layout.obstacles || []).forEach(o => {
    ctx.fillStyle = 'rgba(239,68,68,0.4)'; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(o.x * W, o.y * H, 4, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
  });
}

/* ── PREVIEW LAYOUT ON MAP (temporary) ──────────────────── */
function previewLayout(idx) {
  selectedLayoutIdx = idx;
  const layout = layoutOptions[idx];

  // Highlight selected card
  document.querySelectorAll('[id^="layout-card-"]').forEach((c, i) => {
    c.style.borderColor = i === idx ? 'var(--orange)' : 'var(--border)';
    c.style.borderLeftColor = i === idx ? 'var(--orange)' : 'var(--border)';
    c.style.background = i === idx ? 'rgba(255,107,26,0.07)' : 'linear-gradient(160deg,#0d1e36,#0b1828)';
  });

  showToast(`⬡ Previewing: ${layout.name} — click APPLY to use it`);
  layoutAddMessage('bot', `Previewing "${layout.name}" — ${layout.tables.length} tables. Click APPLY to set this as your floor layout, or choose another option.`);
}

/* ── APPLY LAYOUT TO MAP ─────────────────────────────────── */
function applyLayout(idx) {
  const layout = layoutOptions[idx];
  if (!layout) return;

  // Clear and replace tables
  tables.length = 0;
  layout.tables.forEach(t => tables.push({ id: t.id, x: t.x, y: t.y }));
  saveTables();
  rebuildDispatchButtons();
  rebuildStudentTableGrid();

  // Apply obstacles if any
  if (layout.obstacles && layout.obstacles.length > 0) {
    obstacles.length = 0;
    layout.obstacles.forEach(o => {
      const def = OBSTACLE_TYPES[o.type] || OBSTACLE_TYPES.person;
      obstacles.push({ x: o.x, y: o.y, type: o.type || 'barrier', r: def.radius });
    });
    syncObstaclesToRobot();
    updateObstacleCount();
  }

  // Close assistant
  closeLayoutAssistant();

  showToast(`✓ Layout "${layout.name}" applied — ${layout.tables.length} tables set!`);
  addActivity('dot-system', `AI layout <strong>${layout.name}</strong> applied — ${layout.tables.length} tables`);

  // Reset chat for next time
  layoutChatHistory = [];
  layoutOptions     = [];
  selectedLayoutIdx = null;
  const messages = document.getElementById('layout-chat-messages');
  if (messages) messages.innerHTML = '';
  const container = document.getElementById('layout-options-container');
  if (container) { container.style.display = 'none'; container.innerHTML = ''; }
}

/* ── SYSTEM PROMPT ───────────────────────────────────────── */
function buildLayoutSystemPrompt() {
  return `You are an AI floor layout assistant for Dinobot, an autonomous campus dining robot system.

Your job is to have a conversation with the manager and gather information about their dining area, then generate 3 different floor layout options with table positions and obstacle placements.

CONVERSATION FLOW:
1. Ask how many tables they need
2. Ask about the room shape/size (small/medium/large, square/rectangular/L-shaped)
3. Ask about fixed obstacles (walls, pillars, counters, doors, windows)
4. Ask about the dining style (casual/formal, open/intimate)
5. Ask if there are any special requirements (wheelchair access, stage area, bar section, etc.)
6. Once you have enough info (after 3-5 exchanges), generate the layouts

GENERATING LAYOUTS:
When you have enough information, generate exactly 3 layout options. Include this JSON block at the END of your message:

LAYOUTS_JSON: [
  {
    "name": "Layout Name",
    "description": "Brief description of this layout style",
    "tables": [
      {"id": 1, "x": 0.55, "y": 0.18},
      {"id": 2, "x": 0.72, "y": 0.28}
    ],
    "obstacles": [
      {"x": 0.3, "y": 0.3, "type": "barrier"},
      {"x": 0.5, "y": 0.2, "type": "person"}
    ]
  }
] END_LAYOUTS

IMPORTANT RULES FOR COORDINATES:
- x and y are normalized [0,1] values
- The dock (robot base) is ALWAYS at x:0.08, y:0.5 — never place tables or obstacles there
- The junction point is at x:0.42, y:0.5 — avoid placing obstacles exactly here
- Keep tables away from edges: x between 0.15-0.95, y between 0.10-0.90
- Spread tables evenly, don't cluster them all together
- Each layout should feel distinctly different from the others
- Generate as many tables as the manager requested (up to 15)
- Number tables starting from 1
- Obstacle types available: person, kid, stroller, chair, table, bag, cone, robot, barrier, pet, box, trash

OBSTACLE PLACEMENT:
- Place obstacles to represent fixed room features (pillars → barrier, walls → multiple barriers in a line)
- Don't block the path between dock and tables completely
- Suggest 2-6 obstacles per layout based on room complexity

Be conversational, professional but friendly. Ask ONE question at a time. Don't generate layouts until you have at least the number of tables and room size/shape.

CRITICAL: When generating layouts, ONLY output a brief summary sentence before the LAYOUTS_JSON block. Do NOT repeat the JSON as text. Do NOT explain the coordinates. Do NOT show the JSON in a code block. The JSON block will be hidden from the user automatically — they will see visual map previews instead.`;
}

/* ── RESET ASSISTANT ─────────────────────────────────────── */
function resetLayoutAssistant() {
  layoutChatHistory = [];
  layoutOptions     = [];
  selectedLayoutIdx = null;
  const messages = document.getElementById('layout-chat-messages');
  if (messages) messages.innerHTML = '';
  const container = document.getElementById('layout-options-container');
  if (container) { container.style.display = 'none'; container.innerHTML = ''; }
  layoutAddMessage('bot', `Fresh start! How many tables do you need in your dining area?`);
}