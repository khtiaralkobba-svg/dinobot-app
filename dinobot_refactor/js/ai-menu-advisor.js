/* ══════════════════════════════════════════════════════════
   ai-menu-advisor.js — AI Menu Advisor
══════════════════════════════════════════════════════════ */

let aiMenuHistory = [];
let aiMenuStep = 1;
let aiMenuAnswers = {};

const AI_MENU_QUESTIONS = [
  { step: 1, key: 'cuisine', q: 'What cuisine style are you going for? (e.g. American, Italian, Asian, Mediterranean, or mix?)' },
  { step: 2, key: 'dietary', q: 'Any dietary focus? (e.g. vegetarian options, halal, gluten-free, no restrictions?)' },
  { step: 3, key: 'price',   q: 'What price range per item? (e.g. budget $3-8, mid $8-15, premium $15+?)' },
  { step: 4, key: 'quantity', q: 'How many items do you want me to suggest, and what types? (e.g. 5 mains, 3 sides, 4 drinks, 2 desserts?)' },
];

function openAiMenuOverlay() {
  const el = document.getElementById('ai-menu-overlay');
  el.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (aiMenuHistory.length === 0) {
    startAiMenuConversation();
  }
}

function closeAiMenuOverlay() {
  const el = document.getElementById('ai-menu-overlay');
  el.style.display = 'none';
  document.body.style.overflow = '';
}

function resetAiMenuAdvisor() {
  aiMenuHistory = [];
  aiMenuStep = 1;
  aiMenuAnswers = {};
  document.getElementById('ai-menu-messages').innerHTML = '';
  document.getElementById('ai-menu-options').innerHTML = `
    <div id="ai-menu-empty" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;">
      <div style="font-size:80px;">🍔</div>
      <div style="text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:3px;color:rgba(255,255,255,0.15);margin-bottom:8px;">MENU ITEMS WILL APPEAR HERE</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.08);">Answer the questions on the left to generate recommendations</div>
      </div>
    </div>`;
  document.getElementById('ai-menu-right-title').textContent = 'Waiting for your answers…';
  document.querySelectorAll('#ai-menu-steps .la-step').forEach((s, i) => {
    s.className = 'la-step' + (i === 0 ? ' la-step-active' : '');
  });
  startAiMenuConversation();
}

function startAiMenuConversation() {
  addAiMenuMessage('bot', '🤖 Hey Chef! I\'m your AI Menu Advisor. I\'ll ask you a few quick questions, then generate personalized menu item recommendations for you to add directly to your menu. Let\'s go! 🍔');
  setTimeout(() => askAiMenuQuestion(1), 800);
}

function askAiMenuQuestion(step) {
  const q = AI_MENU_QUESTIONS.find(x => x.step === step);
  if (!q) return;
  aiMenuStep = step;
  updateAiMenuSteps(step);
  setTimeout(() => {
    addAiMenuMessage('bot', q.q);
    document.getElementById('ai-menu-input').focus();
  }, 400);
}

function updateAiMenuSteps(step) {
  document.querySelectorAll('#ai-menu-steps .la-step').forEach(s => {
    const n = parseInt(s.dataset.step);
    s.className = 'la-step' + (n < step ? ' la-step-done' : n === step ? ' la-step-active' : '');
  });
}

function addAiMenuMessage(role, text) {
  const container = document.getElementById('ai-menu-messages');
  const div = document.createElement('div');
  div.style.cssText = role === 'bot'
    ? 'display:flex;gap:10px;align-items:flex-start;'
    : 'display:flex;gap:10px;align-items:flex-start;flex-direction:row-reverse;';
  div.innerHTML = role === 'bot'
    ? `<div style="width:28px;height:28px;background:#4ADE80;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">🤖</div>
       <div style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);padding:10px 14px;font-family:'Rajdhani',sans-serif;font-size:14px;color:var(--text);line-height:1.5;max-width:85%;clip-path:polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%);">${text}</div>`
    : `<div style="width:28px;height:28px;background:rgba(96,165,250,0.2);border:1px solid rgba(96,165,250,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">👤</div>
       <div style="background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);padding:10px 14px;font-family:'Rajdhani',sans-serif;font-size:14px;color:var(--text);line-height:1.5;max-width:85%;clip-path:polygon(8px 0,100% 0,100% 100%,0 100%,0 8px);">${text}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function sendAiMenuMessage() {
  const input = document.getElementById('ai-menu-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addAiMenuMessage('user', text);

  const q = AI_MENU_QUESTIONS.find(x => x.step === aiMenuStep);
  if (q) aiMenuAnswers[q.key] = text;

  if (aiMenuStep < AI_MENU_QUESTIONS.length) {
    askAiMenuQuestion(aiMenuStep + 1);
  } else {
    updateAiMenuSteps(5);
    addAiMenuMessage('bot', '⬡ Perfect! Let me generate your personalized menu recommendations now… 🍳');
    await generateAiMenuItems();
  }
}

async function generateAiMenuItems() {
  const rightTitle = document.getElementById('ai-menu-right-title');
  rightTitle.textContent = 'Generating recommendations…';

  const optionsEl = document.getElementById('ai-menu-options');
  optionsEl.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;">
      <div style="font-size:48px;animation:nomnom 0.6s ease-in-out infinite alternate;">🍔</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:3px;color:rgba(74,222,128,0.6);">⬡ COOKING UP RECOMMENDATIONS...</div>
    </div>`;

  const prompt = `You are a professional restaurant menu consultant AI for a campus dining robot delivery system called Dinobot.

The manager has answered these questions:
- Cuisine style: ${aiMenuAnswers.cuisine || 'not specified'}
- Dietary focus: ${aiMenuAnswers.dietary || 'no restrictions'}
- Price range: ${aiMenuAnswers.price || 'mid range'}
- Quantity and types requested: ${aiMenuAnswers.quantity || '5 items mix'}

Generate exactly the number and types of menu items requested. Return ONLY a valid JSON array, no other text, no markdown, no backticks.

Each item must have these exact fields:
{
  "emoji": "single emoji",
  "name": "item name",
  "description": "short appetizing description under 60 chars",
  "category": "Mains" or "Sides" or "Drinks" or "Desserts",
  "price": number
}

Make items creative, appetizing and appropriate for campus dining. Prices should match the requested range.`;

  try {
    const res = await fetch(API_BASE + '/api/groq', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        system: 'You are a professional restaurant menu consultant. Always respond with valid JSON only, no markdown, no backticks, no extra text.',
        message: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    let items = [];
    try {
      const clean = data.reply.replace(/```json|```/g, '').trim();
      items = JSON.parse(clean);
    } catch {
      addAiMenuMessage('bot', '✗ Sorry, I had trouble generating items. Try again!');
      return;
    }

    rightTitle.textContent = `${items.length} ITEMS GENERATED`;
    addAiMenuMessage('bot', `✓ Done! I generated ${items.length} menu items for you. Click "+ ADD TO MENU" on any item to add it directly! 🎉`);
    renderAiMenuCards(items);
  } catch {
    addAiMenuMessage('bot', '✗ Connection error. Please try again.');
    rightTitle.textContent = 'Error — try again';
  }
}

function renderAiMenuCards(items) {
  const optionsEl = document.getElementById('ai-menu-options');
  optionsEl.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
      ${items.map((item, i) => `
        <div style="background:linear-gradient(135deg,rgba(10,25,60,0.98),rgba(5,15,40,0.98));border:1px solid rgba(74,222,128,0.15);overflow:hidden;transition:all 0.2s;" onmouseover="this.style.borderColor='rgba(74,222,128,0.4)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(74,222,128,0.15)';this.style.transform='translateY(0)'">
          <div style="height:3px;background:linear-gradient(to right,#4ADE80,#4ADE8080,transparent);"></div>
          <div style="padding:20px;">
            <div style="font-size:40px;margin-bottom:12px;">${item.emoji}</div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:3px;color:rgba(74,222,128,0.5);text-transform:uppercase;margin-bottom:4px;">${item.category}</div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#ffffff;letter-spacing:2px;margin-bottom:6px;">${item.name}</div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:rgba(180,210,245,0.5);letter-spacing:1px;margin-bottom:16px;line-height:1.5;">${item.description}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:#4ADE80;letter-spacing:1px;">$${Number(item.price).toFixed(2)}</div>
              <button onclick="addAiGeneratedItem(${i})" id="ai-add-btn-${i}" style="padding:8px 16px;background:rgba(74,222,128,0.12);border:1px solid rgba(74,222,128,0.4);color:#4ADE80;font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:2px;cursor:pointer;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);transition:all 0.2s;" onmouseover="this.style.background='rgba(74,222,128,0.25)'" onmouseout="this.style.background='rgba(74,222,128,0.12)'">+ ADD TO MENU</button>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
  window._aiGeneratedItems = items;
}

async function addAiGeneratedItem(index) {
  const item = window._aiGeneratedItems[index];
  if (!item) return;
  const btn = document.getElementById('ai-add-btn-' + index);
  if (btn) { btn.textContent = 'ADDING...'; btn.disabled = true; }

  const id = 'm' + Date.now() + index;
  try {
    const res = await fetch(API_BASE + '/api/menu', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id,
        cat: item.category,
        emoji: item.emoji,
        name: item.name,
        description: item.description,
        price: item.price
      })
    });
    if (!res.ok) throw new Error('Failed');
    if (btn) {
      btn.textContent = '✓ ADDED';
      btn.style.background = 'rgba(74,222,128,0.25)';
      btn.style.borderColor = '#4ADE80';
      btn.disabled = true;
    }
    await loadMenuItems();
    showToast('✓ ' + item.name + ' added to menu!');
  } catch {
    if (btn) { btn.textContent = '+ ADD TO MENU'; btn.disabled = false; }
    showToast('✗ Failed to add item');
  }
}