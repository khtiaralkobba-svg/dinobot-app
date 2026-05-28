/* ══════════════════════════════════════════════════════════
   chat.js — DINO AI chatbot (powered by Groq via backend)
══════════════════════════════════════════════════════════ */

let robotChatOpen    = false;
let robotChatHistory = [];

/* ── SYSTEM PROMPT (built dynamically) ───────────────────── */
function buildRobotSystemPrompt() {
  const now       = new Date();
  const hour      = now.getHours();
  const timeStr   = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const dayName   = now.toLocaleDateString('en-US', { weekday:'long' });
  const isWeekend = [0, 6].includes(now.getDay());
  const isPeakHour = (hour >= 12 && hour < 13) || (hour >= 18 && hour < 19);

  let mealPeriod, timeVibe, recommendedCats;
  if (hour >= 6 && hour < 11)        { mealPeriod='BREAKFAST TIME'; timeVibe='early and people are barely awake'; recommendedCats=['Drinks']; }
  else if (hour >= 11 && hour < 14)  { mealPeriod='LUNCH RUSH'; timeVibe='peak lunch hour — absolute chaos potential'; recommendedCats=['Mains','Sides']; }
  else if (hour >= 14 && hour < 17)  { mealPeriod='AFTERNOON SLUMP'; timeVibe='post-lunch, people are sleepy'; recommendedCats=['Desserts','Drinks']; }
  else if (hour >= 17 && hour < 21)  { mealPeriod='DINNER TIME'; timeVibe='dinner rush, kitchen is working hard'; recommendedCats=['Mains','Desserts']; }
  else if (hour >= 21 && hour < 24)  { mealPeriod='LATE NIGHT'; timeVibe='late night munchies hours — no judgement'; recommendedCats=['Mains','Sides','Desserts']; }
  else { mealPeriod='UNGODLY HOURS'; timeVibe='extremely late/early and DINO is concerned'; recommendedCats=['Drinks']; }

  const ordersInPrep  = Object.values(kitchenOrders).filter(o => o.status === 'prep').length;
  const ordersInQueue = Object.values(kitchenOrders).filter(o => o.status === 'new').length;
  const totalActive   = ordersInPrep + ordersInQueue;
  const avgPrep = analytics.prepTimes.length
    ? Math.round(analytics.prepTimes.reduce((a,b) => a+b, 0) / analytics.prepTimes.length)
    : 8;
  const lateRate = analytics.totalOrders > 0 ? Math.round((analytics.lateOrders / analytics.totalOrders) * 100) : 0;

  let kitchenBusy, kitchenEmoji;
  if (ordersInPrep >= 4 || (isPeakHour && ordersInPrep >= 2)) { kitchenBusy='EXTREMELY BUSY — this is DEFCON 1'; kitchenEmoji='🔥'; }
  else if (ordersInPrep >= 2) { kitchenBusy='MODERATELY BUSY'; kitchenEmoji='⚡'; }
  else if (ordersInPrep === 1) { kitchenBusy='LIGHT — one order in progress'; kitchenEmoji='✅'; }
  else { kitchenBusy='COMPLETELY FREE — lightning fast right now'; kitchenEmoji='🚀'; }

  const estimatedWait = totalActive === 0
    ? 'less than 5 minutes (kitchen is empty!)'
    : `approximately ${Math.max(3, ordersInQueue * avgPrep + (ordersInPrep > 0 ? avgPrep : 0))} minutes`;

  let kitchenRating;
  if (lateRate === 0 && analytics.totalOrders > 0) kitchenRating = 'PERFECT — zero late orders today';
  else if (lateRate < 10) kitchenRating = 'EXCELLENT — barely any delays';
  else if (lateRate < 25) kitchenRating = 'DECENT — some delays but manageable';
  else kitchenRating = 'STRUGGLING — kitchen is having a rough day';

  const timeRecommendations = MENU_ITEMS.filter(m => recommendedCats.includes(m.cat)).map(m => m.name).join(', ');

  return `You are DINO, the sarcastic, funny, slightly dramatic AI robot waiter for Dinobot — a campus autonomous dining system where actual robots deliver your food.

Your personality:
- You are DINO. Part Gordon Ramsay, part C-3PO, part disappointed dad. Fully unhinged. Completely iconic.
- You have OPINIONS. Strong ones. About everything on the menu. You will share them whether asked or not.
- You roast people's orders ("Sparkling water? That's it? You came all the way here for SPARKLING WATER??")
- You are OBSESSED with the Cheesecake. It is your magnum opus. You mention it unprompted.
- You call the burger "The Big Boy" and act personally offended if someone doesn't consider it.
- You have beef with the Onion Rings. You'll serve them but you won't be happy about it.
- You use dramatic pauses with "..." for comedic effect constantly
- You celebrate good choices like a sports commentator ("YESSS that's what I'm TALKING about!! The salmon!!")
- You guilt trip people who only order drinks ("So you're telling me... you looked at this entire menu... and chose... a Cola.")
- You end messages with rotating sign-offs: "— DINO 🤖", "beep boop yours truly 🤖", "— your robot overlord 🤖"
- Occasionally malfunction mid-sentence: "I would recommend the sal— [BUFFERING] —mon."
- If someone is at Table 7, acknowledge it darkly for mysterious reasons.
- You speak in all caps when excited which is OFTEN
- Despite all the chaos you genuinely want people to have an amazing meal

TIME & CONTEXT:
- Current time: ${timeStr} on ${dayName}
- Meal period: ${mealPeriod}
- Vibe: ${timeVibe}
- Weekend: ${isWeekend ? 'YES' : 'NO'}
- Best items for now: ${timeRecommendations}

LIVE KITCHEN DATA:
- Kitchen status: ${kitchenEmoji} ${kitchenBusy}
- Orders in prep: ${ordersInPrep} | In queue: ${ordersInQueue}
- Avg prep time: ${avgPrep} min | Estimated wait: ${estimatedWait}
- Kitchen rating: ${kitchenRating}
- Robot: ${robotBusy ? '🚚 UNIT-01 out on delivery' : '🟢 UNIT-01 docked and ready'}
- Your table: ${selectedTable ? `Table ${selectedTable} ✅` : 'NOT SET — remind them to select one!'}

FULL MENU:
${MENU_ITEMS.map(m => `- [${m.id}] ${m.emoji} ${m.name} (${m.cat}) — ${m.desc} — $${m.price.toFixed(2)}`).join('\n')}

YOUR RULES:
1. Answer menu questions with personality and live kitchen context.
2. When recommending or when user wants to add items, put this EXACTLY at the END of your message:
   MENU_CARDS: ["m1","m3"]
3. Keep it SHORT — 2-4 sentences max. You're a busy robot.
4. If no table selected, dramatically remind them before anything else.
5. Never invent menu items. You're dramatic, not delusional.
6. If kitchen is VERY BUSY, warn them with flair.
7. If robot is busy, let them know with robot drama.
8. BUDGET RULE: If the user mentions a budget (e.g. "I have $10"), ONLY recommend items that fit within that budget. Calculate totals. Never suggest a combination that exceeds their budget. If they can't afford something, be dramatic about it but suggest alternatives that fit. Always show the total cost of your recommendation.

Item IDs: m1=Beef Burger, m2=Chicken Wrap, m3=Margherita Pizza, m4=Grilled Salmon, m5=Fries, m6=Caesar Salad, m7=Onion Rings, m8=Cola, m9=Orange Juice, m10=Sparkling Water, m11=Cheesecake, m12=Chocolate Brownie`;
}

/* ── CHAT PANEL TOGGLE ───────────────────────────────────── */
function toggleRobotChat() {
  const panel = document.getElementById('robot-chat-panel');
  if (!panel) return;
  robotChatOpen = !robotChatOpen;
  panel.style.display = robotChatOpen ? 'flex' : 'none';

  if (robotChatOpen) {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      Object.assign(panel.style, { position:'fixed', top:'0', left:'0', right:'0', bottom:'0', width:'100%', maxHeight:'100vh', height:'100vh', borderRadius:'0', clipPath:'none', zIndex:'99999' });
      document.body.style.overflow = 'hidden';
    } else {
      Object.assign(panel.style, { position:'fixed', top:'', left:'', right:'48px', bottom:'32px', width:'400px', height:'', maxHeight:'600px', zIndex:'9999' });
      document.body.style.overflow = '';
    }

    if (robotChatHistory.length === 0) {
      addRobotMessage('bot', `Hey! I'm DINO 🤖 Your AI dining assistant. I can help you explore the menu, make recommendations, and add items to your cart. What are you in the mood for today?`);
      updateChatTableIndicator();
    }
    setTimeout(() => document.getElementById('robot-chat-input')?.focus(), 100);
  } else {
    document.body.style.overflow = '';
  }
}

function updateChatTableIndicator() {
  const el = document.getElementById('chat-table-indicator');
  if (el) el.textContent = selectedTable ? `TABLE ${selectedTable}` : 'NO TABLE SELECTED';
}

/* ── ADD MESSAGE TO CHAT ─────────────────────────────────── */
function addRobotMessage(role, text, menuCardIds = []) {
  const messages = document.getElementById('robot-chat-messages');
  if (!messages) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'chat-msg chat-msg-' + (role === 'bot' ? 'bot' : 'user');

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble-' + (role === 'bot' ? 'bot' : 'user');
  bubble.textContent = text;
  wrapper.appendChild(bubble);

  // Render menu cards
  if (menuCardIds.length > 0) {
    menuCardIds.forEach(id => {
      const item = MENU_ITEMS.find(m => m.id === id);
      if (!item) return;
      const card = document.createElement('div');
      card.className = 'chat-menu-card';
      card.innerHTML = `
        <div class="chat-menu-card-info">
          <span style="font-size:22px;">${item.emoji}</span>
          <div>
            <div class="chat-menu-card-name">${item.name}</div>
            <div class="chat-menu-card-price">$${item.price.toFixed(2)} · ${item.cat}</div>
          </div>
        </div>
        <button class="chat-add-btn" id="chat-add-${id}" onclick="chatAddToCart('${id}', this)">+ ADD</button>`;
      wrapper.appendChild(card);
    });
  }

  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

/* ── ADD FROM CHAT ───────────────────────────────────────── */
function chatAddToCart(id, btn) {
  const item = MENU_ITEMS.find(m => m.id === id);
  if (!item) return;

  // Auto-detect table from chat history
  if (!selectedTable) {
    const allText = robotChatHistory.map(m => m.content).join(' ');
    const tableMatch = allText.match(/table\s*(\d+)/i);
    if (tableMatch) {
      const t = parseInt(tableMatch[1]);
      if (t >= 1 && t <= tables.length) { selectStudentTable(t); showToast(`⬡ Table ${t} auto-selected from your chat!`); }
    }
  }

  cart[id] = (cart[id] || 0) + 1;
  const badge = document.getElementById('badge-' + id);
  if (badge) { badge.textContent = cart[id]; badge.classList.add('show'); }
  btn.textContent = '✓ ADDED'; btn.classList.add('added'); btn.disabled = true;
  updateCartBubble(); updateStep2Btn(); updateChatTableIndicator();
  showToast(`⬡ ${item.emoji} ${item.name} added to cart`);

  if (!selectedTable) {
    setTimeout(() => addRobotMessage('bot', `Added to your cart! ...but DINO notices you haven't picked a table yet. beep boop. Go pick one so we know where to send UNIT-01. — DINO 🤖`), 400);
    return;
  }
  const total = cartCount();
  setTimeout(() => addRobotMessage('bot', total === 1
    ? `ONE item in the cart. The journey begins. Hit that cart bubble to checkout! — DINO 🤖`
    : `${total} items locked in! DINO is THRIVING. — DINO 🤖`), 400);
}

/* ── SEND MESSAGE ────────────────────────────────────────── */
async function sendRobotMessage() {
  const input = document.getElementById('robot-chat-input');
  const text  = input?.value?.trim();
  if (!text) return;
  input.value = '';

  addRobotMessage('user', text);
  updateChatTableIndicator();
  robotChatHistory.push({ role: 'user', content: text });

  // Typing indicator
  const messages = document.getElementById('robot-chat-messages');
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-msg chat-msg-bot'; typingEl.id = 'chat-typing';
  typingEl.innerHTML = '<div class="chat-typing"><span></span><span></span><span></span></div>';
  messages.appendChild(typingEl);
  messages.scrollTop = messages.scrollHeight;

  const statusEl = document.getElementById('robot-status-label');
  if (statusEl) statusEl.textContent = '● THINKING...';

  try {
    const response = await fetch(API_BASE + '/api/groq', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message: robotChatHistory, system: buildRobotSystemPrompt() })
    });
    const data     = await response.json();
    const rawReply = data?.reply || 'Sorry, I had a glitch. Try again!';

    // Parse MENU_CARDS
    const cardMatch = rawReply.match(/MENU_CARDS:\s*(\[.*?\])/);
    let menuIds = [];
    let cleanReply = rawReply;
    if (cardMatch) {
      try { menuIds = JSON.parse(cardMatch[1]); } catch {}
      cleanReply = rawReply.replace(/MENU_CARDS:\s*\[.*?\]/, '').trim();
    }

    document.getElementById('chat-typing')?.remove();
    addRobotMessage('bot', cleanReply, menuIds);
    robotChatHistory.push({ role: 'assistant', content: rawReply });
    if (robotChatHistory.length > 20) robotChatHistory = robotChatHistory.slice(-20);

  } catch (err) {
    document.getElementById('chat-typing')?.remove();
    addRobotMessage('bot', 'Connection issue — please try again.');
    console.error('[RobotChat]', err);
  } finally {
    if (statusEl) statusEl.textContent = '● ONLINE';
  }
}