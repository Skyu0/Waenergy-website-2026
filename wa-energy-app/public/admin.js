/* ===== WA Energy — admin panel logic ===== */
const adminState = { users: [], expanded: {}, details: {} };

function $(sel){ return document.querySelector(sel); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function showToast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>t.classList.remove('show'), 2800);
}

async function api(path, options){
  const res = await fetch('/api/admin' + path, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if(!res.ok){
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    throw err;
  }
  return data;
}

async function adminLogin(){
  const username = $('#adminUser').value.trim();
  const password = $('#adminPass').value;
  const errEl = $('#loginError');
  errEl.style.display = 'none';
  try{
    await api('/login', { method:'POST', body: JSON.stringify({ username, password }) });
    await enterPanel();
  }catch(err){
    errEl.textContent = err.message || 'Login failed.';
    errEl.style.display = 'block';
  }
}
async function adminLogout(){
  try{ await api('/logout', { method:'POST' }); }catch{}
  $('#panelView').style.display = 'none';
  $('#loginView').style.display = 'flex';
}

async function enterPanel(){
  $('#loginView').style.display = 'none';
  $('#panelView').style.display = 'block';
  await loadUsers();
}

async function loadUsers(){
  try{
    const { users } = await api('/users');
    adminState.users = users;
    renderSummary();
    renderTable();
  }catch(err){
    showToast(err.message || 'Could not load users.');
  }
}

function renderSummary(){
  const users = adminState.users;
  const totalWzn = users.reduce((a,u)=>a+u.wznBalance, 0);
  const totalReferrals = users.reduce((a,u)=>a+u.referralsMade, 0);
  const totalCartItems = users.reduce((a,u)=>a+u.cartItemCount, 0);
  $('#adminSummary').innerHTML = `
    <div class="admin-stat"><span>Registered Users</span><b>${users.length}</b></div>
    <div class="admin-stat"><span>Total WZN in circulation</span><b>${totalWzn.toLocaleString()}</b></div>
    <div class="admin-stat"><span>Successful Referrals</span><b>${totalReferrals}</b></div>
    <div class="admin-stat"><span>Users with items in cart</span><b>${users.filter(u=>u.cartItemCount>0).length}</b></div>
  `;
}

function renderTable(){
  const body = $('#usersTableBody');
  if(!adminState.users.length){
    body.innerHTML = `<tr><td colspan="8" class="admin-empty" style="padding:30px 16px">No users have signed up yet.</td></tr>`;
    return;
  }
  body.innerHTML = adminState.users.map(u => `
    <tr class="user-row" onclick="toggleUserRow(${u.id})">
      <td>
        <div class="admin-name">${esc(u.name)}</div>
        <div class="admin-email">${esc(u.email)}${u.phone ? ' · '+esc(u.phone) : ''}</div>
      </td>
      <td>${u.propertyType==='business' ? 'Business' : (u.propertyType==='house' ? 'House' : '—')}</td>
      <td><span class="wzn-pill">${u.wznBalance.toLocaleString()} WZN</span></td>
      <td><span class="ref-pill">${esc(u.referralCode || '—')}</span></td>
      <td>${u.referredBy ? esc(u.referredBy.name) : '—'}</td>
      <td>${u.referralsMade} ${u.referralWznEarned ? `<span style="color:var(--ink-soft);font-size:12px">(+${u.referralWznEarned} WZN)</span>` : ''}</td>
      <td>${u.cartItemCount} item${u.cartItemCount===1?'':'s'} ${u.cartTotalQty ? `<span style="color:var(--ink-soft);font-size:12px">(qty ${u.cartTotalQty})</span>` : ''}</td>
      <td>${new Date(u.createdAt).toLocaleDateString()}</td>
    </tr>
    <tr class="admin-detail-row" id="detail-${u.id}" style="display:none"><td colspan="8"></td></tr>
  `).join('');
}

async function toggleUserRow(id){
  const row = document.getElementById('detail-'+id);
  const isOpen = row.style.display !== 'none';
  if(isOpen){ row.style.display = 'none'; return; }

  row.style.display = 'table-row';
  const cell = row.querySelector('td');
  cell.innerHTML = `<div class="admin-loading">Loading details\u2026</div>`;

  try{
    const data = await api(`/users/${id}`);
    cell.innerHTML = renderUserDetail(data);
  }catch(err){
    cell.innerHTML = `<div class="admin-loading">Could not load details.</div>`;
  }
}

function renderUserDetail(data){
  const { user, cart, orders, grants, referrals } = data;
  const appliances = Object.entries(user.appliances||{}).filter(([k,v])=>Number(v)>0);

  const cartHtml = cart.length ? cart.map(c=>`
    <div class="row"><span>${esc(c.name)} (x${c.qty})</span><span>${esc(c.category)}</span></div>
  `).join('') : `<p class="admin-empty">Cart is empty.</p>`;

  const ordersHtml = orders.length ? orders.map(o=>`
    <div class="row"><span>#${o.id} \u2014 ${esc(o.kind)}</span><span>${esc(o.status)}</span></div>
  `).join('') : `<p class="admin-empty">No orders yet.</p>`;

  const appliancesHtml = appliances.length ? appliances.map(([k,v])=>`
    <div class="row"><span>${esc(k)}</span><span>${v}</span></div>
  `).join('') : `<p class="admin-empty">No appliance data.</p>`;

  const referralsHtml = referrals.length ? referrals.map(r=>`
    <div class="row"><span>${esc(r.referred_name)}</span><span>+${r.amount} WZN</span></div>
  `).join('') : `<p class="admin-empty">Hasn't referred anyone yet.</p>`;

  const grantsHtml = grants.length ? grants.map(g=>`
    <div class="row"><span>${g.amount>0?'+':''}${g.amount} WZN${g.note?' — '+esc(g.note):''}</span><span>${new Date(g.created_at).toLocaleDateString()}</span></div>
  `).join('') : `<p class="admin-empty">No manual WZN sent yet.</p>`;

  return `
    <div class="admin-detail">
      <div>
        <h4>Appliances</h4>
        <div class="admin-detail-list">${appliancesHtml}</div>
        <h4 style="margin-top:20px">Referrals Made</h4>
        <div class="admin-detail-list">${referralsHtml}</div>
      </div>
      <div>
        <h4>Cart</h4>
        <div class="admin-detail-list">${cartHtml}</div>
        <h4 style="margin-top:20px">Orders</h4>
        <div class="admin-detail-list">${ordersHtml}</div>
      </div>
      <div>
        <h4>Send WZN Tokens</h4>
        <p style="font-size:13px;color:var(--ink-soft)">Positive amount adds tokens, negative deducts.</p>
        <div class="grant-form">
          <input type="number" id="grantAmount-${user.id}" placeholder="e.g. 500">
          <input type="text" class="note" id="grantNote-${user.id}" placeholder="Note (optional)">
          <button onclick="sendGrant(${user.id})">Send</button>
        </div>
        <h4 style="margin-top:20px">WZN Grant History</h4>
        <div class="admin-detail-list">${grantsHtml}</div>
      </div>
    </div>
  `;
}

async function sendGrant(userId){
  const amountEl = document.getElementById(`grantAmount-${userId}`);
  const noteEl = document.getElementById(`grantNote-${userId}`);
  const amount = parseInt(amountEl.value, 10);
  if(!amount){ showToast('Enter a non-zero amount'); return; }
  try{
    await api(`/users/${userId}/wzn`, { method:'POST', body: JSON.stringify({ amount, note: noteEl.value.trim() }) });
    showToast(`${amount>0?'Sent':'Deducted'} ${Math.abs(amount)} WZN`);
    await loadUsers();
    const row = document.getElementById('detail-'+userId);
    if(row) row.style.display = 'none'; // collapse; admin can reopen to see updated history
  }catch(err){
    showToast(err.message || 'Could not send tokens.');
  }
}

function handleLoginKeydown(e){ if(e.key==='Enter') adminLogin(); }

(async function init(){
  document.getElementById('adminUser').addEventListener('keydown', handleLoginKeydown);
  document.getElementById('adminPass').addEventListener('keydown', handleLoginKeydown);
  try{
    const { isAdmin } = await api('/me');
    if(isAdmin) await enterPanel();
  }catch{ /* not logged in, stay on login view */ }
})();
