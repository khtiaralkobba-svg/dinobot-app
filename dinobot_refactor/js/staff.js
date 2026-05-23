/* ══════════════════════════════════════════════════════════
   staff.js — Staff management: create, list, enable/disable, delete
══════════════════════════════════════════════════════════ */

const _onlineStaff = new Set();

/* ── OVERLAY ─────────────────────────────────────────────── */
function openStaffOverlay() {
  const el = document.getElementById('staff-overlay');
  el.style.display = 'flex'; el.style.position = 'fixed'; el.style.inset = '0';
  el.style.width = '100vw'; el.style.height = '100vh'; el.style.zIndex = '10000';
  document.body.style.overflow = 'hidden';
  loadStaffList();
}

function closeStaffOverlay() {
  const el = document.getElementById('staff-overlay');
  el.style.opacity = '0'; el.style.transform = 'translateY(32px)'; el.style.transition = 'all 0.3s ease';
  setTimeout(() => {
    el.style.display = 'none'; el.style.opacity = ''; el.style.transform = ''; el.style.transition = '';
    document.body.style.overflow = '';
  }, 300);
}

/* ── PASSWORD GENERATOR ──────────────────────────────────── */
function generateStaffPassword() {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*';
  const getRand = str => str[Math.floor(Math.random() * str.length)];
  const required = [getRand(upper),getRand(upper),getRand(lower),getRand(lower),getRand(numbers),getRand(numbers),getRand(symbols),getRand(symbols)];
  const all = upper + lower + numbers + symbols;
  for (let i=0;i<4;i++) required.push(getRand(all));
  const pwd = required.sort(() => Math.random() - 0.5).join('');
  const input = document.getElementById('staff-password');
  if (input) { input.value = pwd; input.style.borderColor = '#C084FC'; input.style.color = '#C084FC'; setTimeout(() => { input.style.borderColor=''; input.style.color=''; }, 2000); }
  navigator.clipboard?.writeText(pwd)
    .then(() => showToast('⚡ Password generated and copied to clipboard!'))
    .catch(() => showToast('⚡ Password generated — copy it before saving!'));
}

/* ── CREATE ACCOUNT ──────────────────────────────────────── */
async function createStaffAccount() {
  const name     = document.getElementById('staff-name')?.value.trim();
  const username = document.getElementById('staff-username')?.value.trim();
  const password = document.getElementById('staff-password')?.value;
  if (!name || !username || !password) { showToast('✗ Fill in all fields first'); return; }

  const checks = { length: password.length >= 10, upper: /[A-Z]/.test(password), lower: /[a-z]/.test(password), number: /[0-9]/.test(password), symbol: /[!@#$%^&*]/.test(password) };
  const failed = [];
  if (!checks.length)  failed.push('at least 10 characters');
  if (!checks.upper)   failed.push('one uppercase letter');
  if (!checks.lower)   failed.push('one lowercase letter');
  if (!checks.number)  failed.push('one number');
  if (!checks.symbol)  failed.push('one symbol (!@#$%^&*)');

  if (failed.length > 0) {
    const input = document.getElementById('staff-password');
    input.style.borderColor = '#ef4444';
    document.getElementById('pwd-strength-hint')?.remove();
    const hint = document.createElement('div');
    hint.id = 'pwd-strength-hint';
    hint.style.cssText = 'margin-top:6px;padding:10px 14px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.4);border-left:3px solid #ef4444;font-family:Share Tech Mono,monospace;font-size:10px;letter-spacing:1.5px;color:#ef4444;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);';
    const score = 5 - failed.length;
    const barColor = score<=1?'#ef4444':score===2?'#f97316':score===3?'#FBB924':'#4ADE80';
    hint.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span>${score<=1?'🔴 VERY WEAK':score===2?'🟠 WEAK':score===3?'🟡 ALMOST':'🟡 GOOD'}</span>
        <span style="color:var(--text-dim);font-size:9px;">${score}/5 REQUIREMENTS MET</span>
      </div>
      <div style="height:3px;background:rgba(255,255,255,0.06);margin-bottom:10px;overflow:hidden;"><div style="height:100%;width:${(score/5)*100}%;background:${barColor};"></div></div>
      <div style="color:rgba(239,68,68,0.7);font-size:9px;">MISSING: ${failed.map(f=>`<span style="color:#ef4444;">✗ ${f}</span>`).join(' · ')}</div>`;
    const wrapper = input.closest('div');
    if (wrapper) wrapper.after(hint);
    setTimeout(() => { hint.style.opacity='0'; hint.style.transition='opacity 0.3s'; setTimeout(()=>{hint.remove();input.style.borderColor='';},300); }, 4000);
    return;
  }

  document.getElementById('pwd-strength-hint')?.remove();
  try {
    const res = await fetch(API_BASE + '/api/auth/register', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ fullName: name, employeeId: username, password, role: 'kitchen' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create account');
    document.getElementById('staff-name').value = '';
    document.getElementById('staff-username').value = '';
    document.getElementById('staff-password').value = '';
    showToast('✓ Staff account created — ' + username);
    addActivity('dot-system', `New staff account created: <strong>${name}</strong>`);
    loadStaffList();
  } catch (err) { showToast('✗ ' + err.message); }
}

/* ── LOAD STAFF LIST ─────────────────────────────────────── */
async function loadStaffList() {
  const container = document.getElementById('staff-list-table');
  if (!container) return;
  try {
    const res = await fetch(API_BASE + '/api/auth/staff', { headers: authHeaders({ 'Content-Type': 'application/json' }) });
    if (!res.ok) throw new Error('Could not load staff');
    const data  = await res.json();
    const staff = data.staff || data.users || [];

    if (staff.length === 0) {
      container.innerHTML = '<div style="font-family:\'Share Tech Mono\',monospace;font-size:10px;letter-spacing:2px;color:var(--text-dim);padding:16px;text-align:center;">No kitchen staff found</div>';
      return;
    }

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1.5fr 1fr 100px 120px 100px 180px;padding:8px 14px;font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:3px;color:rgba(192,132,252,0.45);text-transform:uppercase;border-bottom:1px solid rgba(192,132,252,0.1);">
        <span>Name</span><span>Username</span><span>Status</span><span>Last Login</span><span>Orders</span><span>Actions</span>
      </div>`;

    staff.forEach(s => {
      const isOnline   = _onlineStaff.has(s.employee_id || s.employeeId || s.id);
      const isDisabled = s.is_disabled || s.disabled || false;
      const lastLogin  = s.last_login ? new Date(s.last_login).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : 'Never';
      const ordersHandled = s.orders_handled || 0;
      const statusBadge = isDisabled
        ? '<span class="staff-badge staff-badge-disabled">DISABLED</span>'
        : isOnline ? '<span class="staff-badge staff-badge-online">● ONLINE</span>'
                   : '<span class="staff-badge staff-badge-offline">OFFLINE</span>';
      const id = s.id || s._id || s.employee_id;
      const toggleBtn = isDisabled
        ? `<button class="staff-action-btn staff-btn-enable"  onclick="toggleStaffStatus('${id}', false)">ENABLE</button>`
        : `<button class="staff-action-btn staff-btn-disable" onclick="toggleStaffStatus('${id}', true)">DISABLE</button>`;
      const row = document.createElement('div');
      row.className = 'staff-row' + (isOnline ? ' online' : '') + (isDisabled ? ' disabled' : '');
      row.style.cssText = 'display:grid;grid-template-columns:1.5fr 1fr 100px 120px 100px 180px;align-items:center;';
      row.innerHTML = `
        <div class="staff-cell">${s.full_name || s.fullName || '—'}</div>
        <div class="staff-cell" style="color:var(--text-dim);">${s.employee_id || s.employeeId || '—'}</div>
        <div class="staff-cell">${statusBadge}</div>
        <div class="staff-cell" style="font-size:9px;color:var(--text-dim);">${lastLogin}</div>
        <div class="staff-cell">${ordersHandled} <span style="color:var(--text-dim);font-size:9px;">orders</span></div>
        <div class="staff-cell" style="display:flex;gap:6px;align-items:center;padding-right:8px;">
          ${toggleBtn}
          <button class="staff-action-btn staff-btn-delete" onclick="deleteStaffAccount('${id}','${(s.full_name||s.fullName||'').replace(/'/g,"\\'")}')">✕ DELETE</button>
        </div>`;
      container.appendChild(row);
    });

    updateOnlineStatusPanel(staff);
  } catch (err) {
    if (container) container.innerHTML = `<div style="font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:2px;color:#ef4444;padding:16px;text-align:center;">✗ ${err.message}</div>`;
  }
}

function updateOnlineStatusPanel(staff) {
  const el = document.getElementById('staff-online-list');
  if (!el) return;
  const online = staff.filter(s => _onlineStaff.has(s.employee_id || s.employeeId || s.id));
  if (online.length === 0) {
    el.innerHTML = '<div style="font-family:\'Share Tech Mono\',monospace;font-size:10px;letter-spacing:2px;color:var(--text-dim);padding:16px;text-align:center;">No staff currently online</div>';
    return;
  }
  el.innerHTML = online.map(s => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(74,222,128,0.04);border:1px solid rgba(74,222,128,0.15);border-left:3px solid #4ADE80;">
      <div style="width:8px;height:8px;background:#4ADE80;border-radius:50%;box-shadow:0 0 8px #4ADE80;animation:blink 2s ease-in-out infinite;flex-shrink:0;"></div>
      <div style="flex:1;">
        <div style="font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:2px;color:#4ADE80;">${s.full_name||s.fullName||'—'}</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:1px;color:var(--text-dim);">${s.employee_id||s.employeeId||''}</div>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:1px;color:rgba(74,222,128,0.6);">KITCHEN</div>
    </div>`).join('');
}

async function toggleStaffStatus(id, disable) {
  try {
    const res = await fetch(API_BASE + '/api/auth/staff/' + id + '/status', {
      method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ disabled: disable })
    });
    if (!res.ok) throw new Error('Failed to update status');
    showToast(disable ? '⬡ Staff account disabled' : '✓ Staff account re-enabled');
    addActivity('dot-system', `Staff account <strong>${disable ? 'disabled' : 'enabled'}</strong>`);
    loadStaffList();
  } catch (err) { showToast('✗ ' + err.message); }
}

async function deleteStaffAccount(id, name) {
  if (!confirm(`Delete account for ${name}? This cannot be undone.`)) return;
  try {
    const res = await fetch(API_BASE + '/api/auth/staff/' + id, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to delete');
    showToast('✓ Account deleted — ' + name);
    addActivity('dot-system', `Staff account <strong>deleted</strong>: ${name}`);
    loadStaffList();
  } catch (err) { showToast('✗ ' + err.message); }
}

/* ── LIVE PASSWORD STRENGTH INDICATOR ───────────────────── */
window.addEventListener('load', () => {
  const pwdInput = document.getElementById('staff-password');
  if (!pwdInput) return;
  pwdInput.addEventListener('input', () => {
    const val = pwdInput.value;
    if (!val) { document.getElementById('pwd-strength-hint')?.remove(); pwdInput.style.borderColor = ''; return; }
    const score = [val.length>=10, /[A-Z]/.test(val), /[a-z]/.test(val), /[0-9]/.test(val), /[!@#$%^&*]/.test(val)].filter(Boolean).length;
    const strengthLabel = score<=1?'🔴 VERY WEAK':score===2?'🟠 WEAK':score===3?'🟡 ALMOST THERE':score===4?'🟡 GOOD':'🟢 STRONG';
    const barColor = score<=1?'#ef4444':score===2?'#f97316':score===3?'#FBB924':score===4?'#FBB924':'#4ADE80';
    const borderColor = score<=2?'#ef4444':score<=4?'#FBB924':'#4ADE80';
    pwdInput.style.borderColor = borderColor;
    let hint = document.getElementById('pwd-strength-hint');
    if (!hint) {
      hint = document.createElement('div'); hint.id = 'pwd-strength-hint';
      hint.style.cssText = 'margin-top:6px;padding:8px 14px;background:rgba(5,20,60,0.6);border:1px solid rgba(255,255,255,0.08);border-left:3px solid;font-family:Share Tech Mono,monospace;font-size:10px;letter-spacing:1.5px;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);transition:all 0.2s;';
      const wrapper = pwdInput.closest('div');
      if (wrapper) wrapper.after(hint);
    }
    hint.style.borderLeftColor = borderColor;
    hint.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:${borderColor};">
        <span>${strengthLabel}</span><span style="color:var(--text-dim);font-size:9px;">${score}/5</span>
      </div>
      <div style="height:3px;background:rgba(255,255,255,0.06);overflow:hidden;">
        <div style="height:100%;width:${(score/5)*100}%;background:${barColor};transition:width 0.3s;"></div>
      </div>`;
  });
});