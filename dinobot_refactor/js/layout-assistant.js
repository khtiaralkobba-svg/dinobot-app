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
}

function layoutAddMessage(role, text) {
  const messages = document.getElementById('layout-chat-messages');
  if (!messages) return;
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:4px;animation:fadeInUp 0.3s ease;align-items:' + (role === 'bot' ? 'flex-start' : 'flex-end') + ';';
  const bubble = document.createElement('div');
  bubble.style.cssText = 'padding:10px 14px;font-family:Rajdhani,sans-serif;font-size:14px;line-height:1.5;max-width:90%;white-space:pre-wrap;' +
    (role === 'bot'
      ? 'background:rgba(5,22,65,0.7);border:1px solid var(--border);border-left:2px solid var(--orange);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);color:var(--text);'
      : 'background:rgba(255,107,26,0.12);border:1px solid var(--border-bright);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);color:var(--text);');
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
  el.style.cssText = 'display:flex;align-items:center;gap:6px;padding:10px 14px;background:rgba(5,22,65,0.7);border:1px solid var(--border);border-left:2px solid var(--orange);clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);width:fit-content;';
  el.innerHTML = '<span style="width:6px;height:6px;background:var(--orange);border-radius:50%;animation:typingDot 1.2s ease-in-out infinite;"></span><span style="width:6px;height:6px;background:var(--orange);border-radius:50%;animation:typingDot 1.2s ease-in-out infinite;animation-delay:0.2s;"></span><span style="width:6px;height:6px;background:var(--orange);border-radius:50%;animation:typingDot 1.2s ease-in-out infinite;animation-delay:0.4s;"></span>';
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function layoutHideTyping() {
  document.getElementById('layout-typing')?.remove();
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

    // Try to find LAYOUTS_JSON markers
    const markerMatch = rawReply.match(/LAYOUTS_JSON:\s*([\s\S]*?)\s*END_LAYOUTS/);
    if (markerMatch) {
      try {
        const parsed = JSON.parse(markerMatch[1].trim());
        layoutOptions = parsed; selectedLayoutIdx = null;
        const cleanText = rawReply.replace(/LAYOUTS_JSON:[\s\S]*?END_LAYOUTS/, '').replace(/```[\s\S]*?```/g, '').trim();
        if (cleanText) layoutAddMessage('bot', cleanText);
        layoutAddMessage('bot', 'Here are your 3 layout options — click PREVIEW to see it, then APPLY to use it on your live map.');
        renderLayoutOptions();
      } catch(e) {
        layoutAddMessage('bot', 'I generated layouts but had a formatting issue. Please try again.');
      }
    } else {
      // Fallback: try to find a JSON array anywhere in the reply
      const s = rawReply.indexOf('['), e = rawReply.lastIndexOf(']') + 1;
      if (s !== -1 && e > s + 10) {
        try {
          const parsed = JSON.parse(rawReply.slice(s, e));
          if (Array.isArray(parsed) && parsed[0]?.tables) {
            layoutOptions = parsed; selectedLayoutIdx = null;
            layoutAddMessage('bot', 'Here are your 3 layout options — click PREVIEW to see it, then APPLY to use it on your live map.');
            renderLayoutOptions();
          } else {
            layoutAddMessage('bot', rawReply);
          }
        } catch(e2) {
          layoutAddMessage('bot', rawReply);
        }
      } else {
        layoutAddMessage('bot', rawReply);
      }
    }

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
  container.style.display = 'block';
  container.innerHTML = '<div style="font-family:Share Tech Mono,monospace;font-size:9px;letter-spacing:4px;color:var(--orange);text-transform:uppercase;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border);">⬡ Choose a Layout</div><div style="display:flex;flex-direction:column;gap:10px;" id="layout-cards"></div>';

  const cards = document.getElementById('layout-cards');
  layoutOptions.forEach((layout, idx) => {
    const card = document.createElement('div');
    card.id = 'layout-card-' + idx;
    card.style.cssText = 'padding:14px 16px;background:linear-gradient(160deg,#0d1e36,#0b1828);border:1px solid var(--border);border-left:3px solid var(--border);cursor:pointer;transition:all 0.2s;clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);';

    const preview = document.createElement('canvas');
    preview.width = 240; preview.height = 130;
    preview.style.cssText = 'display:block;margin-bottom:10px;border:1px solid var(--border);width:100%;';
    drawLayoutPreview(preview, layout);

    const info = document.createElement('div');
    info.innerHTML =
      '<div style="font-family:Bebas Neue,sans-serif;font-size:18px;letter-spacing:2px;color:var(--orange);margin-bottom:4px;">' + layout.name + '</div>' +
      '<div style="font-family:Share Tech Mono,monospace;font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:8px;">' + layout.tables.length + ' TABLES · ' + (layout.obstacles?.length || 0) + ' OBSTACLES</div>' +
      '<div style="font-family:Rajdhani,sans-serif;font-size:12px;color:var(--text-dim);line-height:1.5;margin-bottom:10px;">' + layout.description + '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button onclick="previewLayout(' + idx + ')" style="flex:1;padding:8px;background:rgba(255,107,26,0.08);border:1px solid var(--border-bright);color:var(--orange);font-family:Share Tech Mono,monospace;font-size:9px;letter-spacing:2px;cursor:pointer;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);">👁 PREVIEW</button>' +
        '<button onclick="applyLayout(' + idx + ')" style="flex:1;padding:8px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.4);color:#4ADE80;font-family:Share Tech Mono,monospace;font-size:9px;letter-spacing:2px;cursor:pointer;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);">✓ APPLY</button>' +
      '</div>';

    card.appendChild(preview);
    card.appendChild(info);
    cards.appendChild(card);
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
  ctx.fillStyle = '#16a34a'; ctx.shadowColor = '#16a34a'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(dockX * W, dockY * H, 5, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#4ADE80'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
  ctx.fillText('D', dockX * W, dockY * H + 12);
  layout.tables.forEach(t => {
    ctx.fillStyle = '#60A5FA'; ctx.shadowColor = '#60A5FA'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(t.x * W, t.y * H, 5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(220,232,248,0.9)'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('T'+t.id, t.x * W, t.y * H + 12);
  });
  (layout.obstacles || []).forEach(o => {
    ctx.fillStyle = 'rgba(239,68,68,0.4)'; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(o.x * W, o.y * H, 4, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
  });
}

function previewLayout(idx) {
  selectedLayoutIdx = idx;
  const layout = layoutOptions[idx];
  document.querySelectorAll('[id^="layout-card-"]').forEach((c, i) => {
    c.style.borderColor = i === idx ? 'var(--orange)' : 'var(--border)';
    c.style.background  = i === idx ? 'rgba(255,107,26,0.07)' : 'linear-gradient(160deg,#0d1e36,#0b1828)';
  });
  showToast('Previewing: ' + layout.name + ' — click APPLY to use it');
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
      const def = OBSTACLE_TYPES[o.type] || OBSTACLE_TYPES.person;
      obstacles.push({ x: o.x, y: o.y, type: o.type || 'barrier', r: def.radius });
    });
    syncObstaclesToRobot(); updateObstacleCount();
  }
  closeLayoutAssistant();
  showToast('Layout "' + layout.name + '" applied — ' + layout.tables.length + ' tables set!');
  addActivity('dot-system', 'AI layout <strong>' + layout.name + '</strong> applied');
  layoutChatHistory = []; layoutOptions = []; selectedLayoutIdx = null;
  const messages = document.getElementById('layout-chat-messages');
  if (messages) messages.innerHTML = '';
  const container = document.getElementById('layout-options-container');
  if (container) { container.style.display = 'none'; container.innerHTML = ''; }
}

function buildLayoutSystemPrompt() {
  return 'You are an AI floor layout assistant for Dinobot, an autonomous campus dining robot system.\n\n' +
    'Chat with the manager to gather info, then generate 3 layout options.\n\n' +
    'Ask ONE question at a time:\n' +
    '1. How many tables?\n' +
    '2. Room shape/size (small/medium/large, square/rectangular)?\n' +
    '3. Any fixed obstacles (pillars, walls, counters)?\n' +
    '4. Dining style (casual/formal)?\n' +
    'After 3-5 exchanges, generate the layouts.\n\n' +
    'OUTPUT FORMAT - STRICTLY FOLLOW THIS:\n' +
    'Write ONE short sentence, then output the JSON block.\n' +
    'Start the block with exactly: LAYOUTS_JSON:\n' +
    'End the block with exactly: END_LAYOUTS\n' +
    'Example:\n' +
    'Here are 3 layouts for your space!\n' +
    'LAYOUTS_JSON: [{"name":"Ring Layout","description":"Tables around the perimeter","tables":[{"id":1,"x":0.55,"y":0.18}],"obstacles":[{"x":0.3,"y":0.3,"type":"barrier"}]}] END_LAYOUTS\n\n' +
    'COORDINATE RULES:\n' +
    '- x and y are 0 to 1\n' +
    '- Dock is at x:0.08, y:0.5 — never put tables or obstacles here\n' +
    '- Junction at x:0.42, y:0.5 — avoid obstacles here\n' +
    '- Tables: x between 0.15 and 0.95, y between 0.10 and 0.90\n' +
    '- Spread tables evenly, make each layout feel different\n' +
    '- Generate exactly as many tables as requested (max 15)\n' +
    '- Obstacle types: person, kid, stroller, chair, table, bag, cone, robot, barrier, pet, box, trash\n' +
    '- Use 2-6 obstacles per layout\n\n' +
    'NEVER show raw JSON outside the markers. NEVER use markdown code blocks. The JSON is hidden automatically.';
}

function resetLayoutAssistant() {
  layoutChatHistory = []; layoutOptions = []; selectedLayoutIdx = null;
  const messages = document.getElementById('layout-chat-messages');
  if (messages) messages.innerHTML = '';
  const container = document.getElementById('layout-options-container');
  if (container) { container.style.display = 'none'; container.innerHTML = ''; }
  layoutAddMessage('bot', 'Fresh start! How many tables do you need in your dining area?');
}