/* ══════════════════════════════════════════════════════════
   menu-management.js — Manager menu overlay
══════════════════════════════════════════════════════════ */

async function openMenuOverlay() {
  const el = document.getElementById('menu-overlay');
  el.style.display = 'flex';
  el.style.background = document.body.classList.contains('light-mode') ? '#f0f4f8' : '#020b1a';
  document.body.style.overflow = 'hidden';
  await renderMenuOverlay();
}

function closeMenuOverlay() {
  const el = document.getElementById('menu-overlay');
  el.style.display = 'none';
  document.body.style.overflow = '';
}

async function renderMenuOverlay() {
  const body = document.getElementById('menu-overlay-body');
  body.innerHTML = `<div style="text-align:center;padding:80px;font-family:'Share Tech Mono',monospace;font-size:12px;letter-spacing:3px;color:rgba(74,222,128,0.6);">⬡ LOADING MENU...</div>`;

  let items = [];
  try {
    const res = await fetch(API_BASE + '/api/menu', { headers: authHeaders() });
    const data = await res.json();
    items = data.items || [];
  } catch {
    showToast('✗ Failed to load menu');
    return;
  }

  const cats = [...new Set(items.map(i => i.cat))];

  body.innerHTML = `
    <!-- AI Advisor button -->
    <button onclick="openAiMenuOverlay()" style="width:100%;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;padding:20px 28px;background:linear-gradient(160deg,rgba(5,40,20,0.6),rgba(2,15,10,0.8));border:1px solid rgba(74,222,128,0.3);cursor:pointer;clip-path:polygon(12px 0%,100% 0%,calc(100% - 12px) 100%,0% 100%);transition:all 0.2s;" onmouseover="this.style.borderColor='#4ADE80'" onmouseout="this.style.borderColor='rgba(74,222,128,0.3)'">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="display:flex;align-items:center;gap:4px;">
          <div style="width:40px;height:46px;background:#4ADE80;clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);display:flex;align-items:center;justify-content:center;font-size:18px;">🤖</div>
          <div style="font-size:20px;animation:nomnom 0.6s ease-in-out infinite alternate;">🍔</div>
        </div>
        <div style="text-align:left;">
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(74,222,128,0.7);letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;">⬡ AI Powered</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px;color:var(--text);line-height:1;">AI MENU ADVISOR</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text-dim);letter-spacing:1px;margin-top:2px;">Get AI recommendations · Add directly to menu</div>
        </div>
      </div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:3px;color:#4ADE80;">OPEN →</div>
    </button>

    <!-- Add new item form -->
    <div style="background:var(--card-bg,rgba(10,25,60,0.98));border:1px solid rgba(74,222,128,0.2);padding:28px 32px;position:relative;">
      <div style="position:absolute;top:-11px;left:24px;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;text-transform:uppercase;padding:2px 12px;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);background:var(--bg,#030f20);color:rgba(74,222,128,0.6);border:1px solid rgba(74,222,128,0.15);">⬡ ADD NEW ITEM</div>
      <div style="display:grid;grid-template-columns:80px 1fr 1fr 1fr 100px auto;gap:12px;align-items:end;margin-top:8px;">
        <div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:6px;">EMOJI</div>
          <input id="new-item-emoji" type="text" class="form-input" placeholder="🍔" style="text-align:center;font-size:20px;">
        </div>
        <div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:6px;">NAME</div>
          <input id="new-item-name" type="text" class="form-input" placeholder="Item name">
        </div>
        <div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:6px;">DESCRIPTION</div>
          <input id="new-item-desc" type="text" class="form-input" placeholder="Short description">
        </div>
        <div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:6px;">CATEGORY</div>
          <select id="new-item-cat" class="form-input" style="background:var(--card-bg);color:var(--text);">
            <option value="Mains">Mains</option>
<option value="Sides">Sides</option>
<option value="Drinks">Drinks</option>
<option value="Desserts">Desserts</option>
<option value="Combos">Combos</option>
          </select>
        </div>
        <div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:6px;">PRICE ($)</div>
          <input id="new-item-price" type="number" step="0.01" min="0" class="form-input" placeholder="0.00">
        </div>
        <button onclick="addMenuItem()" style="padding:12px 20px;background:rgba(74,222,128,0.12);border:1px solid rgba(74,222,128,0.4);color:#4ADE80;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:3px;cursor:pointer;clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);transition:all 0.2s;white-space:nowrap;" onmouseover="this.style.background='rgba(74,222,128,0.22)'" onmouseout="this.style.background='rgba(74,222,128,0.12)'">+ ADD</button>
      </div>
    </div>

    <!-- Menu items by category -->
    ${cats.map(cat => `
      <div style="background:var(--card-bg,rgba(10,25,60,0.98));border:1px solid rgba(74,222,128,0.15);padding:28px 32px;position:relative;">
        <div style="position:absolute;top:-11px;left:24px;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:5px;text-transform:uppercase;padding:2px 12px;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);background:var(--bg,#030f20);color:rgba(74,222,128,0.6);border:1px solid rgba(74,222,128,0.15);">⬡ ${cat}</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
          ${items.filter(i => i.cat === cat).map(item => `
            <div id="menu-item-row-${item.id}" style="display:grid;grid-template-columns:50px 1fr 2fr 100px auto;gap:16px;align-items:center;padding:14px 18px;background:var(--card-bg,rgba(5,15,40,0.5));border:1px solid rgba(74,222,128,0.15);">
              <div style="font-size:24px;text-align:center;">${item.emoji}</div>
              <div>
                <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--text);letter-spacing:2px;">${item.name}</div>
                <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text-dim);letter-spacing:1px;margin-top:2px;">${item.description || ''}</div>
              </div>
              <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text-dim);letter-spacing:1px;">${item.cat}</div>
              <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#4ADE80;letter-spacing:1px;">$${Number(item.price).toFixed(2)}</div>
              <div style="display:flex;gap:8px;">
                <button onclick="editMenuItem('${item.id}', '${item.name}', '${item.emoji}', '${item.cat}', '${(item.description||'').replace(/'/g,"\\'")}', ${item.price})" style="padding:8px 14px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.3);color:#60A5FA;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(96,165,250,0.18)'" onmouseout="this.style.background='rgba(96,165,250,0.08)'">EDIT</button>
                <button onclick="deleteMenuItem('${item.id}', '${item.name}')" style="padding:8px 14px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.18)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'">DELETE</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

async function addMenuItem() {
  const emoji = document.getElementById('new-item-emoji').value.trim();
  const name  = document.getElementById('new-item-name').value.trim();
  const desc  = document.getElementById('new-item-desc').value.trim();
  const cat   = document.getElementById('new-item-cat').value;
  const price = parseFloat(document.getElementById('new-item-price').value);

  if (!emoji || !name || !price) { showToast('✗ Emoji, name and price are required'); return; }

  const id = 'm' + Date.now();
  try {
    const res = await fetch(API_BASE + '/api/menu', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id, cat, emoji, name, description: desc, price })
    });
    if (!res.ok) throw new Error('Failed');
    showToast('✓ ' + name + ' added to menu');
    await loadMenuItems();
    await renderMenuOverlay();
  } catch {
    showToast('✗ Failed to add item');
  }
}

async function deleteMenuItem(id, name) {
  if (!confirm(`Remove "${name}" from the menu?`)) return;
  try {
    const res = await fetch(API_BASE + '/api/menu/' + id, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed');
    showToast('✓ ' + name + ' removed from menu');
    await loadMenuItems();
    await renderMenuOverlay();
  } catch {
    showToast('✗ Failed to remove item');
  }
}

function editMenuItem(id, name, emoji, cat, desc, price) {
  const row = document.getElementById('menu-item-row-' + id);
  if (!row) return;
  row.innerHTML = `
    <input id="edit-emoji-${id}" type="text" class="form-input" value="${emoji}" style="text-align:center;font-size:20px;padding:8px;">
    <input id="edit-name-${id}" type="text" class="form-input" value="${name}" style="padding:8px;">
    <input id="edit-desc-${id}" type="text" class="form-input" value="${desc}" style="padding:8px;">
    <input id="edit-price-${id}" type="number" step="0.01" class="form-input" value="${price}" style="padding:8px;">
    <div style="display:flex;gap:8px;">
      <button onclick="saveMenuItem('${id}')" style="padding:8px 14px;background:rgba(74,222,128,0.12);border:1px solid rgba(74,222,128,0.4);color:#4ADE80;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;">SAVE</button>
      <button onclick="renderMenuOverlay()" style="padding:8px 14px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;">CANCEL</button>
    </div>
  `;
}

async function saveMenuItem(id) {
  const emoji = document.getElementById('edit-emoji-' + id).value.trim();
  const name  = document.getElementById('edit-name-'  + id).value.trim();
  const desc  = document.getElementById('edit-desc-'  + id).value.trim();
  const price = parseFloat(document.getElementById('edit-price-' + id).value);

  if (!emoji || !name || !price) { showToast('✗ All fields required'); return; }

  try {
    const res = await fetch(API_BASE + '/api/menu/' + id, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ emoji, name, description: desc, price })
    });
    if (!res.ok) throw new Error('Failed');
    showToast('✓ ' + name + ' updated');
    await loadMenuItems();
    await renderMenuOverlay();
  } catch {
    showToast('✗ Failed to update item');
  }
}