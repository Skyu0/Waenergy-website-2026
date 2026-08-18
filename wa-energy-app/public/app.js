/* ===== WA Energy — frontend app (talks to the real backend API) ===== */
const state = {
  user: null,            // logged-in user from /api/auth/me, or null
  cart: [],               // [{productId, qty, name, image, category, badge}]
  categories: [],
  plans: {},              // keyed by plan key
  planOrder: [],
  services: [],
  testimonials: [],
  faqs: [],
  config: { waPhone: '', company: {}, underPlan: [] },

  currentCat: 'all',
  currentProduct: null,
  currentRelated: [],
  currentPlan: null,
  chatHistory: [],

  signup: { step: 1, propertyType: null, name:'', email:'', phone:'', password:'',
    appliances: { TVs:0, ACs:0, Fridges:0, Fans:0, 'Washing Machines':0, Freezers:0, 'Water Pumps':0, Computers:0 } },
};

const APPLIANCE_KEYS = Object.keys(state.signup.appliances);

function $(sel, ctx){ return (ctx||document).querySelector(sel); }
function $all(sel, ctx){ return Array.from((ctx||document).querySelectorAll(sel)); }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function catName(id){ const c = state.categories.find(x=>x.id===id); return c ? c.name : id; }

async function api(path, options){
  const res = await fetch('/api' + path, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if(!res.ok){
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
const apiGet = (path) => api(path);
const apiPost = (path, body) => api(path, { method:'POST', body: JSON.stringify(body||{}) });
const apiPatch = (path, body) => api(path, { method:'PATCH', body: JSON.stringify(body||{}) });
const apiDelete = (path) => api(path, { method:'DELETE' });

function showToast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>t.classList.remove('show'), 2800);
}

/* ---------------- View routing ---------------- */
function showView(name){
  $all('.view').forEach(v=>v.classList.remove('active'));
  const v = document.getElementById('view-'+name);
  if(v) v.classList.add('active');
  window.scrollTo(0,0);
  $all('.nav-links').forEach(n=>n.classList.remove('open'));
  updateNav();
}
function goHome(){ showView('home'); }
function goProducts(catId){
  state.currentCat = catId || 'all';
  shopPage = 1;
  renderProducts();
  showView('products');
}
async function goProductDetail(id){
  try{
    const { product, related } = await apiGet(`/products/${encodeURIComponent(id)}`);
    state.currentProduct = product;
    state.currentRelated = related;
    renderProductDetail();
    showView('product-detail');
  }catch(err){
    showToast(err.message || 'Could not load that product.');
  }
}
function goPlan(planKey){
  state.currentPlan = planKey;
  renderPlan();
  showView('plan');
}
function goSignup(){ showView('signup'); renderSignupStep(); }
function goLogin(){ showView('login'); }
async function goDashboard(){
  if(!state.user){ goLogin(); return; }
  try{
    const { orders } = await apiGet('/orders/mine');
    state.myOrders = orders;
  }catch{ state.myOrders = []; }
  renderDashboard();
  showView('dashboard');
}

/* ---------------- Nav ---------------- */
function updateNav(){
  const authArea = $('#nav-auth-area');
  const cartCount = state.cart.reduce((a,c)=>a+c.qty,0);
  $all('.cart-count').forEach(el=>{ el.textContent = cartCount; el.style.display = cartCount ? 'flex':'none'; });
  if(state.user){
    authArea.innerHTML = `
      <div class="wzn-chip"><span class="dot">W</span> ${state.user.wznBalance.toLocaleString()} WZN</div>
      <button class="avatar" onclick="goDashboard()" title="${esc(state.user.name)}">${esc(state.user.name[0].toUpperCase())}</button>
    `;
  } else {
    authArea.innerHTML = `
      <button class="btn btn-outline btn-sm" onclick="goLogin()">Log In</button>
      <button class="btn btn-primary btn-sm" onclick="goSignup()">Sign Up</button>
    `;
  }
}
function toggleMobileNav(){ $('#navLinks').classList.toggle('open'); }

/* ---------------- Services "Read More" ---------------- */
function toggleService(idx){
  const el = document.getElementById('svc-'+idx);
  el.classList.toggle('open');
  const btn = el.querySelector('.svc-read');
  btn.textContent = el.classList.contains('open') ? 'Show Less' : 'Read More';
}

/* ---------------- Products listing ---------------- */
const PAGE_SIZE = 12;
let shopPage = 1;
async function renderProducts(){
  const grid = $('#productGrid');
  const sort = $('#sortSelect') ? $('#sortSelect').value : 'default';
  $('#activeFilters').innerHTML = state.currentCat==='all' ? '' :
    `<div class="chip">${esc(catName(state.currentCat))} <button onclick="goProducts('all')">\u00d7</button></div>`;

  grid.innerHTML = `<p style="grid-column:1/-1;color:var(--ink-soft);padding:30px 0">Loading products\u2026</p>`;
  let data;
  try{
    data = await apiGet(`/products?category=${encodeURIComponent(state.currentCat)}&page=${shopPage}&pageSize=${PAGE_SIZE}&sort=${sort}`);
  }catch(err){
    grid.innerHTML = `<p style="grid-column:1/-1;color:var(--ink-soft);padding:30px 0">Couldn't load products right now.</p>`;
    return;
  }
  shopPage = data.page;
  const start = data.total ? (data.page-1)*data.pageSize+1 : 0;
  const end = Math.min(data.page*data.pageSize, data.total);
  $('#shopCount').textContent = `Showing ${start}\u2013${end} of ${data.total} results`;

  grid.innerHTML = data.products.map(p => `
    <div class="product-card" onclick="goProductDetail('${p.id}')">
      <div class="product-media">
        <span class="pill pill-${p.badge}">${p.badge}</span>
        <img src="${p.images[0]}" alt="${esc(p.name)}" loading="lazy">
      </div>
      <div class="product-body">
        <span class="product-cat">${esc(catName(p.cat))}</span>
        <h4>${esc(p.name)}</h4>
        <p>${esc(p.desc)}</p>
        <button class="product-quote" onclick="event.stopPropagation();requestQuote('${esc(p.name)}')">Request a Quote</button>
      </div>
    </div>
  `).join('') || `<p style="grid-column:1/-1;color:var(--ink-soft);padding:30px 0">No products in this category yet.</p>`;

  $('#pagination').innerHTML = data.totalPages<=1 ? '' : Array.from({length:data.totalPages},(_,i)=>i+1).map(n=>`
    <button class="${n===shopPage?'active':''}" onclick="shopGoPage(${n})">${n}</button>
  `).join('');
}
function shopGoPage(n){
  shopPage = n;
  renderProducts();
  $('#productGrid').scrollIntoView({block:'start'});
}

/* ---------------- Product detail ---------------- */
let pdQty = 1;
let pdGalleryIdx = 0;
function renderProductDetail(){
  pdQty = 1;
  pdGalleryIdx = 0;
  const p = state.currentProduct;
  $('#pdBreadcrumb').innerHTML = `<a href="#" onclick="goHome();return false;">Home</a> / <a href="#" onclick="goProducts('${p.cat}');return false;">${esc(catName(p.cat))}</a> / ${esc(p.name)}`;
  $('#pdCat').textContent = catName(p.cat);
  $('#pdName').textContent = p.name;
  $('#pdBadge').innerHTML = `<span class="pill pill-${p.badge}">${p.badge}</span>`;
  $('#pdDesc').textContent = p.desc;
  $('#pdQty').textContent = pdQty;
  $('#pdSpecs').innerHTML = `<table><thead><tr><th>Feature</th><th>Detail</th></tr></thead><tbody>` +
    Object.entries(p.specs).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') + `</tbody></table>`;
  renderGallery();
  renderRelated();
}
function renderGallery(){
  const imgs = state.currentProduct.images;
  $('#pdImg').src = imgs[pdGalleryIdx];
  const arrows = imgs.length>1 ? `
    <button class="pd-nav pd-nav-prev" onclick="pdGalleryNav(-1)" aria-label="Previous image">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <button class="pd-nav pd-nav-next" onclick="pdGalleryNav(1)" aria-label="Next image">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>` : '';
  $('#pdNavArrows').innerHTML = arrows;
  $('#pdThumbs').style.display = imgs.length>1 ? 'flex' : 'none';
  $('#pdThumbs').innerHTML = imgs.length>1 ? imgs.map((src,i)=>`
    <button class="pd-thumb ${i===pdGalleryIdx?'active':''}" onclick="pdGallerySelect(${i})">
      <img src="${src}" alt="View ${i+1}">
    </button>`).join('') : '';
}
function pdGalleryNav(delta){
  const imgs = state.currentProduct.images;
  pdGalleryIdx = (pdGalleryIdx + delta + imgs.length) % imgs.length;
  renderGallery();
}
function pdGallerySelect(i){ pdGalleryIdx = i; renderGallery(); }

function renderRelated(){
  const rel = state.currentRelated;
  const wrap = $('#pdRelated');
  if(!rel.length){ wrap.innerHTML=''; return; }
  wrap.innerHTML = `<h3 style="margin:50px 0 20px;font-size:20px">Related Products</h3><div class="product-grid">` +
    rel.map(r=>`
      <div class="product-card" onclick="goProductDetail('${r.id}')">
        <div class="product-media"><span class="pill pill-${r.badge}">${r.badge}</span><img src="${r.images[0]}" alt="${esc(r.name)}"></div>
        <div class="product-body">
          <span class="product-cat">${esc(catName(r.cat))}</span>
          <h4>${esc(r.name)}</h4>
          <p>${esc(r.desc)}</p>
          <button class="product-quote" onclick="event.stopPropagation();requestQuote('${esc(r.name)}')">Request a Quote</button>
        </div>
      </div>`).join('') + `</div>`;
}
function pdQtyChange(delta){
  pdQty = Math.max(1, pdQty+delta);
  $('#pdQty').textContent = pdQty;
}
async function addToCart(){
  if(!state.user){ showToast('Please log in to add items to your cart'); goLogin(); return; }
  const p = state.currentProduct;
  try{
    const { items } = await apiPost('/cart', { productId: p.id, qty: pdQty });
    state.cart = items;
    updateNav();
    showToast(`Added ${pdQty} \u00d7 ${p.name} to cart`);
  }catch(err){
    showToast(err.message || 'Could not add to cart.');
  }
}
function requestQuote(name){
  const msg = encodeURIComponent(`Hi WA Energy, I'd like a quote for: ${name}`);
  window.open(`https://wa.me/${state.config.waPhone}?text=${msg}`, '_blank');
}

/* ---------------- Plans ---------------- */
function renderPlan(){
  const key = state.currentPlan;
  const plan = state.plans[key];
  if(!plan) return;
  $('#planBreadcrumb').innerHTML = `<a href="#" onclick="goHome();return false;">Home</a> / Recommendation / ${esc(plan.name)}`;
  $('#planImg').src = plan.image;
  $('#planName').textContent = plan.name;
  $('#planSpecs').innerHTML = plan.specs.map(s=>`<li><img src="/assets/rec_plan.png" alt="">${esc(s)}</li>`).join('');
  $('#planSuitable').innerHTML = `<b>Suitable for:</b> ${esc(plan.suitable)}`;
  $('#capGrid').innerHTML = plan.capacity.map(c=>`
    <div class="cap-item"><div class="ic">${capIcon(c)}</div><span>${esc(c)}</span></div>
  `).join('');
  $('#underPlan').innerHTML = state.config.underPlan.map(u=>`
    <div class="under-item"><img src="${u.icon}" alt=""><h4>${esc(u.title)}</h4><p>${esc(u.text)}</p></div>
  `).join('');
  $('#planSwitch').innerHTML = state.planOrder.map(k=>`
    <button class="${k===key?'active':''}" onclick="goPlan('${k}')">${esc(state.plans[k].name)}</button>
  `).join('');
}
function capIcon(label){
  const l = label.toLowerCase();
  const svg = (path)=>`<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  if(l.includes('light')||l.includes('bulb')) return svg('<circle cx="12" cy="9" r="6"/><path d="M9 21h6M10 17h4"/>');
  if(l.includes('fan')) return svg('<circle cx="12" cy="12" r="1.6"/><path d="M12 12c0-4 2-7 5-7s2 5-1 7c3 1 5 4 3 7s-6-1-7-4c-1 3-4 6-7 4s0-6 3-7c-3-2-4-6-1-7s5 3 5 7z"/>');
  if(l.includes('tv')) return svg('<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M9 21h6M12 17v4"/>');
  if(l.includes('ac')||l.includes('inverter ac')) return svg('<rect x="3" y="6" width="18" height="7" rx="1.5"/><path d="M6 17l1-4M11 17l1-4M16 17l1-4"/>');
  if(l.includes('washing')) return svg('<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6h.01M11 6h.01"/>');
  if(l.includes('fridge')||l.includes('refrigerator')) return svg('<rect x="6" y="2" width="12" height="20" rx="1.5"/><path d="M6 10h12M9 5v3M9 14v4"/>');
  if(l.includes('freezer')) return svg('<rect x="4" y="6" width="16" height="14" rx="1.5"/><path d="M4 11h16M9 8v2M9 14v3"/>');
  if(l.includes('microwave')) return svg('<rect x="3" y="6" width="18" height="12" rx="1.5"/><rect x="6" y="9" width="8" height="6" rx="1"/><circle cx="18" cy="12" r="1"/>');
  if(l.includes('blender')) return svg('<path d="M8 3h8l-1 8H9L8 3z"/><path d="M8 11h8l-1 9H9l-1-9z"/>');
  if(l.includes('water pump')||l.includes('pump')) return svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>');
  if(l.includes('water dispenser')||l.includes('dispenser')) return svg('<path d="M9 2h6v6l3 4v10H6V12l3-4V2z"/><path d="M6 12h12"/>');
  if(l.includes('phone')) return svg('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>');
  if(l.includes('computer')) return svg('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>');
  if(l.includes('printer')) return svg('<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M6 17h12v4H6z"/>');
  if(l.includes('laptop')) return svg('<rect x="4" y="4" width="16" height="10" rx="1.5"/><path d="M2 18h20l-2-4H4l-2 4z"/>');
  return svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>');
}

/* ---------------- Recommendation engine ---------------- */
async function detectLocation(){
  if(!state.user){
    showToast('Please sign up first so we can tailor your recommendation to your appliance usage');
    goSignup();
    return;
  }
  const btn = $('#detectBtn');
  const status = $('#recoStatus');
  btn.disabled = true;
  btn.textContent = 'Detecting\u2026';
  status.textContent = 'Requesting your location permission\u2026';
  try{
    const pos = await new Promise((res,rej)=>{
      if(!navigator.geolocation) return rej(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(res, rej, {timeout:8000});
    });
    const {latitude, longitude} = pos.coords;
    status.textContent = 'Location found. Fetching live weather data\u2026';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,cloud_cover&daily=sunshine_duration&timezone=auto`;
    const r = await fetch(url);
    const data = await r.json();
    const temp = data.current?.temperature_2m ?? 29;
    const cloud = data.current?.cloud_cover ?? 20;
    const sunSecs = data.daily?.sunshine_duration?.[0] ?? 30000;
    const sunHours = Math.round((sunSecs/3600)*10)/10;
    finishRecommendation({temp, sunHours, cloud, located:true});
  }catch(err){
    status.textContent = 'Couldn\u2019t access your location \u2014 showing an estimate based on typical Nigerian sun hours instead.';
    finishRecommendation({temp:31, sunHours:6.2, cloud:25, located:false});
  }finally{
    btn.disabled = false;
    btn.textContent = 'Detect My Location';
  }
}
function finishRecommendation({temp, sunHours, cloud, located}){
  const status = $('#recoStatus');
  status.textContent = located ? 'Using your current location and live weather data.' : status.textContent;

  // The plans are mainly differentiated by how many ACs they support (Basic/
  // Essential: none, Standard: 1, Premium: 2, Business: 3, Mega: 6+), so AC
  // count drives the main tier. Other appliances only matter for choosing
  // between Basic and Essential when there's no AC at all.
  const app = state.user?.appliances || {};
  const isBusiness = state.user?.propertyType === 'business';
  const ac = Number(app.ACs || 0);

  const lightScore =
    Number(app.TVs||0)*1 + Number(app.Fans||0)*1 + Number(app.Computers||0)*1 +
    Number(app.Fridges||0)*2 + Number(app.Freezers||0)*2 +
    Number(app['Washing Machines']||0)*2 + Number(app['Water Pumps']||0)*2 +
    (isBusiness ? 3 : 0);

  const hasAnyData = !!state.user && (ac>0 || lightScore>0 ||
    Object.values(app).some(v=>Number(v)>0));

  let planKey;
  if(!hasAnyData){
    planKey = 'basic'; // no signup data yet — start light, recommend signing up for a tailored plan
  } else if(ac===0){
    planKey = lightScore<=2 ? 'basic' : 'essential';
  } else if(ac===1){
    planKey = 'standard';
  } else if(ac===2){
    planKey = 'premium';
  } else if(ac<=5){
    planKey = 'business';
  } else {
    planKey = 'mega';
  }

  const plan = state.plans[planKey];
  const kwMatch = plan ? plan.specs[0].match(/[\d.]+/) : null;
  const kwEstimate = kwMatch ? kwMatch[0] : '-';

  $('#recoResults').style.display='grid';
  $('#recoResults').innerHTML = `
    <div class="reco-tile"><img src="/assets/rec_temp.png"><b>${Math.round(temp)}\u00b0C</b><span>Local Temp</span></div>
    <div class="reco-tile"><img src="/assets/rec_sun.png"><b>${sunHours}h</b><span>Sun Peak Hours</span></div>
    <div class="reco-tile"><div style="width:38px;height:38px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 2A4 4 0 0 0 6 19h11.5z"/></svg></div><b>${cloud}%</b><span>Cloud Cover</span></div>
    <div class="reco-tile"><img src="/assets/rec_kw.png"><b>${kwEstimate}kW</b><span>Est. Load</span></div>
    <div class="reco-tile"><img src="/assets/rec_battery.png"><b>${plan ? plan.specs[1].split(' ')[0] : '-'}</b><span>Battery Size</span></div>
  `;
  $('#recoPlanCard').style.display='flex';
  $('#recoPlanCard').innerHTML = `
    <div class="l"><span>Suggested Plan</span><b>${esc(plan ? plan.name : '')}</b></div>
    <button class="btn btn-accent" onclick="goPlan('${planKey}')">View Plan Details \u2192</button>
  `;
}

/* ---------------- Signup ---------------- */
function renderSignupStep(){
  const s = state.signup;
  $all('.step-dot').forEach((d,i)=>d.classList.toggle('on', i < s.step));
  $all('.signup-step').forEach(el=>el.style.display='none');
  $('#signupStep'+s.step).style.display='block';
}
function signupNext(){
  const s = state.signup;
  if(s.step===1){
    const name = $('#suName').value.trim();
    const email = $('#suEmail').value.trim();
    const phone = $('#suPhone').value.trim();
    const pass = $('#suPass').value;
    if(!name||!email||!pass){ showToast('Please fill in your name, email and password'); return; }
    if(pass.length<6){ showToast('Password must be at least 6 characters'); return; }
    Object.assign(s,{name,email,phone,password:pass});
  }
  if(s.step===2 && !s.propertyType){ showToast('Please select House or Business'); return; }
  s.step = Math.min(3, s.step+1);
  renderSignupStep();
}
function signupBack(){
  state.signup.step = Math.max(1, state.signup.step-1);
  renderSignupStep();
}
function selectPropertyType(type){
  state.signup.propertyType = type;
  $all('.radio-card[data-ptype]').forEach(c=>c.classList.toggle('sel', c.dataset.ptype===type));
}
function applianceChange(key, delta){
  const s = state.signup;
  s.appliances[key] = Math.max(0, Number(s.appliances[key]||0)+delta);
  $('#count-'+key.replace(/\s+/g,'')).textContent = s.appliances[key];
}
async function completeSignup(){
  const s = state.signup;
  try{
    const { user } = await apiPost('/auth/signup', {
      name: s.name, email: s.email, phone: s.phone,
      propertyType: s.propertyType, appliances: s.appliances, password: s.password,
      ref: state.pendingReferral || undefined,
    });
    state.user = user;
    state.cart = [];
    state.pendingReferral = null;
    updateNav();
    showToast(`Welcome to WA Energy! ${user.wznBalance.toLocaleString()} WZN credited to your account.`);
    goDashboard();
  }catch(err){
    showToast(err.message || 'Could not create your account.');
  }
}

/* ---------------- Login ---------------- */
async function doLogin(){
  const email = $('#liEmail').value.trim();
  const password = $('#liPass').value;
  if(!email || !password){ showToast('Please enter your email and password'); return; }
  try{
    const { user } = await apiPost('/auth/login', { email, password });
    state.user = user;
    await refreshCart();
    updateNav();
    showToast('Welcome back, '+user.name+'!');
    goDashboard();
  }catch(err){
    showToast(err.message || 'Login failed.');
  }
}
async function logout(){
  try{ await apiPost('/auth/logout'); }catch{}
  state.user = null;
  state.cart = [];
  updateNav();
  goHome();
}

/* ---------------- Dashboard ---------------- */
function renderDashboard(){
  const u = state.user;
  $('#dashName').textContent = u.name.split(' ')[0];
  $('#dashWzn').textContent = u.wznBalance.toLocaleString()+' WZN';
  $('#dashProfile').innerHTML = `
    <div class="profile-row"><span>Name</span><b>${esc(u.name)}</b></div>
    <div class="profile-row"><span>Email</span><b>${esc(u.email)}</b></div>
    <div class="profile-row"><span>Property Type</span><b>${u.propertyType==='business'?'Business':'House'}</b></div>
    <div class="profile-row"><span>Referral Code</span><b>${esc(u.referralCode||'—')}</b></div>
    ${Object.entries(u.appliances||{}).filter(([k,v])=>Number(v)>0).map(([k,v])=>`<div class="profile-row"><span>${esc(k)}</span><b>${v}</b></div>`).join('')}
  `;
}

/* ---------------- Cart drawer ---------------- */
async function refreshCart(){
  if(!state.user){ state.cart = []; return; }
  try{
    const { items } = await apiGet('/cart');
    state.cart = items;
  }catch{ state.cart = []; }
}
async function openCart(){
  if(!state.user){ showToast('Please log in to view your cart'); goLogin(); return; }
  await refreshCart();
  renderCart();
  updateNav();
  $('#cartOverlay').classList.add('show');
  $('#cartDrawer').classList.add('show');
}
function closeCart(){
  $('#cartOverlay').classList.remove('show');
  $('#cartDrawer').classList.remove('show');
}
function renderCart(){
  const body = $('#cartBody');
  if(!state.cart.length){
    body.innerHTML = `<div class="empty-state">Your cart is empty.<br>Browse products to add items.</div>`;
    $('#cartFoot').style.display='none';
    return;
  }
  $('#cartFoot').style.display='flex';
  body.innerHTML = state.cart.map(c => `
    <div class="cart-row">
      <img src="${c.image}" alt="">
      <div class="info">
        <b>${esc(c.name)}</b>
        <span>Qty: ${c.qty}</span>
        <div class="rm" onclick="removeFromCart('${c.productId}')">Remove</div>
      </div>
    </div>`).join('');
}
async function removeFromCart(productId){
  try{
    const { items } = await apiDelete(`/cart/${encodeURIComponent(productId)}`);
    state.cart = items;
    renderCart();
    updateNav();
  }catch(err){
    showToast(err.message || 'Could not remove item.');
  }
}
async function cartCheckoutWhatsapp(){
  if(!state.cart.length){ showToast('Your cart is empty'); return; }
  try{
    const { whatsappUrl } = await apiPost('/orders', { kind:'quote', fromCart:true });
    window.open(whatsappUrl, '_blank');
    await apiDelete('/cart');
    state.cart = [];
    renderCart();
    updateNav();
  }catch(err){
    showToast(err.message || 'Could not submit your quote request.');
  }
}

/* ---------------- Buy Now modal ---------------- */
function openBuyNow(){
  if(!state.user){ showToast('Please log in to continue'); goLogin(); return; }
  $('#buyNowOptions').style.display = 'block';
  $('#buyNowMessage').style.display = 'none';
  $('#buyNowOverlay').classList.add('show');
}
function closeBuyNow(){ $('#buyNowOverlay').classList.remove('show'); }
function showBuyNowMessage(kind, text){
  $('#buyNowOptions').style.display = 'none';
  const msg = $('#buyNowMessage');
  msg.style.display = 'block';
  msg.className = 'buynow-msg ' + kind;
  $('#buyNowMsgIcon').textContent = kind === 'success' ? '\u2713' : '\u26a0';
  $('#buyNowMsgText').textContent = text;
}
async function useWznToken(){
  const p = state.currentProduct;
  try{
    const result = await apiPost('/orders', { kind:'wzn_attempt', productId: p?.id, qty: pdQty });
    if(result.sufficient){
      state.user.wznBalance = result.wznBalance;
      updateNav();
      showBuyNowMessage('success', 'Purchase confirmed using your WZN Token!');
      setTimeout(closeBuyNow, 1800);
      return;
    }
    showBuyNowMessage('insufficient',
      `Your available balance of ${result.wznBalance.toLocaleString()} WZN is not enough to complete this transaction. Redirecting you to WhatsApp to finish your order\u2026`);
    setTimeout(()=>{
      window.open(result.whatsappUrl, '_blank');
      closeBuyNow();
    }, 1800);
  }catch(err){
    showToast(err.message || 'Could not process that request.');
  }
}
async function buyNowQuote(){
  const p = state.currentProduct;
  try{
    const { whatsappUrl } = await apiPost('/orders', { kind:'quote', productId: p?.id, qty: pdQty });
    window.open(whatsappUrl, '_blank');
    closeBuyNow();
  }catch(err){
    showToast(err.message || 'Could not submit your quote request.');
  }
}

/* ---------------- Track order modal ---------------- */
async function openTrack(){
  $('#trackOverlay').classList.add('show');
  const c = state.config.company || {};
  if(c.lat && c.lon){
    $('#trackMapFrame').src = `https://www.openstreetmap.org/export/embed.html?bbox=${c.lon-0.03}%2C${c.lat-0.02}%2C${c.lon+0.03}%2C${c.lat+0.02}&layer=mapnik&marker=${c.lat}%2C${c.lon}`;
  }

  let latestOrder = null;
  if(state.user){
    try{
      const { orders } = await apiGet('/orders/mine');
      state.myOrders = orders;
      latestOrder = orders[0] || null;
    }catch{ /* ignore */ }
  }

  const placed = !!latestOrder;
  const status = latestOrder ? latestOrder.status : '';
  const processing = ['processing','out_for_delivery','delivered'].includes(status);
  const outForDelivery = ['out_for_delivery','delivered'].includes(status);
  const delivered = status === 'delivered';

  const row = (label, done) => `<div class="track-row"><span class="track-check ${done?'done':'pending'}">${done?'\u2713':''}</span> ${label}</div>`;
  $('#trackList').innerHTML =
    row('Order Placed', placed) + row('Processing', processing) + row('Out for Delivery', outForDelivery) + row('Delivered', delivered);
  $('#trackNote').textContent = placed
    ? 'Delivery status updates once our team confirms and processes your order.'
    : 'You haven\u2019t placed an order yet \u2014 request a quote or check out to start tracking.';
}
function closeTrack(){ $('#trackOverlay').classList.remove('show'); }
function shareLocationWhatsapp(){
  const c = state.config.company || {};
  const mapsUrl = (c.lat && c.lon)
    ? `https://www.google.com/maps?q=${c.lat},${c.lon}`
    : `https://www.google.com/maps/search/${encodeURIComponent(c.address || 'WA Energy')}`;
  const msg = `${c.name || 'WA Energy'} location: ${c.address || ''}\n${mapsUrl}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ---------------- WZN info modal ---------------- */
function openWznInfo(){ $('#wznInfoOverlay').classList.add('show'); }
function closeWznInfo(){ $('#wznInfoOverlay').classList.remove('show'); }

/* ---------------- Referral modal ---------------- */
function openReferral(){
  if(!state.user){ showToast('Please log in to get your referral link'); goLogin(); return; }
  const link = `${window.location.origin}/?ref=${encodeURIComponent(state.user.referralCode)}`;
  $('#referralLinkInput').value = link;
  $('#referralCountStat').textContent = state.user.referralsMade || 0;
  $('#referralEarnedStat').textContent = (state.user.referralWznEarned || 0).toLocaleString();
  $('#referralOverlay').classList.add('show');
}
function closeReferral(){ $('#referralOverlay').classList.remove('show'); }
async function copyReferralLink(){
  const input = $('#referralLinkInput');
  input.select();
  try{
    await navigator.clipboard.writeText(input.value);
    showToast('Referral link copied!');
  }catch{
    document.execCommand('copy');
    showToast('Referral link copied!');
  }
}
function shareReferralWhatsapp(){
  const link = $('#referralLinkInput').value;
  const msg = encodeURIComponent(`Join me on WA Energy and get started with solar! Sign up here: ${link}`);
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}

/* ---------------- FAQ ---------------- */
function toggleFaq(idx){
  document.getElementById('faq-'+idx).classList.toggle('open');
}

/* ---------------- Watt chatbot (server-proxied Claude API) ---------------- */
function toggleChat(){ $('#chatPanel').classList.toggle('show'); }
async function sendChatMessage(){
  const input = $('#chatInput');
  const text = input.value.trim();
  if(!text) return;
  input.value='';
  appendChatMsg('user', text);
  const typingEl = appendChatMsg('bot', 'Typing\u2026');
  try{
    const { reply } = await apiPost('/chat', { message: text, history: state.chatHistory });
    state.chatHistory.push({role:'user', content:text});
    state.chatHistory.push({role:'assistant', content:reply});
    typingEl.textContent = reply;
  }catch(err){
    typingEl.textContent = 'Watt is temporarily unavailable. Please reach us on WhatsApp for quick help!';
  }
}
function appendChatMsg(who, text){
  const body = $('#chatBody');
  const div = document.createElement('div');
  div.className = 'msg '+who;
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  return div;
}
function chatKeydown(e){ if(e.key==='Enter') sendChatMessage(); }

/* ---------------- WhatsApp float ---------------- */
function openWhatsapp(){ window.open(`https://wa.me/${state.config.waPhone}`, '_blank'); }

/* ---------------- Init ---------------- */
async function init(){
  try{
    const [me, categories, plans, services, testimonials, faqs, config] = await Promise.all([
      apiGet('/auth/me'),
      apiGet('/categories'),
      apiGet('/plans'),
      apiGet('/services'),
      apiGet('/testimonials'),
      apiGet('/faqs'),
      apiGet('/config'),
    ]);
    state.user = me.user;
    state.categories = categories;
    state.plans = Object.fromEntries(plans.map(p=>[p.key,p]));
    state.planOrder = plans.map(p=>p.key);
    state.services = services;
    state.testimonials = testimonials;
    state.faqs = faqs;
    state.config = config;
    if(state.user) await refreshCart();
  }catch(err){
    console.error('Failed to load site data', err);
    showToast('Some content failed to load. Please refresh the page.');
  }

  updateNav();
  state.currentPlan = state.planOrder[0] || null;
  if(state.currentPlan) renderPlan();
  buildStaticSections();

  // A referral link (?ref=CODE) should land the visitor straight on the
  // signup page, with the code carried through to the signup request.
  const refParam = new URLSearchParams(window.location.search).get('ref');
  if(refParam && !state.user){
    state.pendingReferral = refParam;
    showToast('You were invited to WA Energy \u2014 sign up to get started!');
    goSignup();
  } else {
    goHome();
  }
  renderProducts();
}
function buildStaticSections(){
  const catHtml = state.categories.map(c=>`
    <div class="cat-card" onclick="goProducts('${c.id}')">
      <img class="ic" src="${c.icon}" alt="${esc(c.name)}">
      <b>${esc(c.name)}</b>
    </div>`).join('') + `
    <div class="cat-card" onclick="goProducts('all')">
      <div class="ic" style="display:flex;align-items:center;justify-content:center;font-size:22px">\u25a6</div>
      <b>All Products</b>
    </div>`;
  $('#catGrid').innerHTML = catHtml;
  $('#catGridShop').innerHTML = catHtml;

  $('#svcGrid').innerHTML = state.services.map((s,i)=>`
    <div class="svc-card" id="svc-${i}">
      <img class="svc-icon" src="${s.icon}" alt="">
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.text)}</p>
      <div class="svc-more"><p>${esc(s.more)}</p></div>
      <button class="svc-read" onclick="toggleService(${i})">Read More</button>
    </div>`).join('');

  $('#testiGrid').innerHTML = state.testimonials.map(t=>`
    <div class="testi-card">
      <div class="stars">${'\u2605'.repeat(t.stars)}${'\u2606'.repeat(5-t.stars)}</div>
      <p>\u201c${esc(t.text)}\u201d</p>
      <div class="testi-who">
        <div class="av">${esc(t.name[0])}</div>
        <div><b>${esc(t.name)}</b><span>${esc(t.state)} State</span></div>
      </div>
    </div>`).join('');

  $('#faqList').innerHTML = state.faqs.map((f,i)=>`
    <div class="faq-item" id="faq-${i}">
      <div class="faq-q" onclick="toggleFaq(${i})"><h4>${esc(f.question)}</h4><img src="/assets/faq_dir.jpg" alt=""></div>
      <div class="faq-a"><p>${esc(f.answer)}</p></div>
    </div>`).join('');

  $('#applianceRows').innerHTML = APPLIANCE_KEYS.map(key=>`
    <div class="appliance-row">
      <span>${esc(key)}</span>
      <div class="stepper-mini">
        <button onclick="applianceChange('${key}',-1)">\u2212</button>
        <span id="count-${key.replace(/\s+/g,'')}">0</span>
        <button onclick="applianceChange('${key}',1)">+</button>
      </div>
    </div>`).join('');
}

document.addEventListener('DOMContentLoaded', init);
