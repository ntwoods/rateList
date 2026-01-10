// Replace with your GAS WebApp URL
const API_URL = "https://script.google.com/macros/s/AKfycbyaIUmvKpAp1h7moft2bBKiYQDulSOyw6TJ6blf0gP97qC78yTvAGPHeXfGsgEb8oX-/exec";

/* -------------------------- UX helpers -------------------------- */
const $ = (sel) => document.querySelector(sel);
function setLoading(btnEl, loading){
  if(!btnEl) return;
  btnEl.classList.toggle('loading', !!loading);
  btnEl.disabled = !!loading;
}
function showToast(message, type='success'){
  const t = $('#toast');
  if(!t) return;
  t.textContent = message;
  t.className = `toast ${type} show`;
  setTimeout(()=>{ t.classList.remove('show'); }, 1800);
}
function showPageLoader(show){
  const pl = $('#pageLoader');
  if(!pl) return;
  pl.classList.toggle('hide', !show);
}
function safeFetch(url, opts){
  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), 20000);
  return fetch(url, {...opts, signal: controller.signal}).finally(()=>clearTimeout(id));
}
function isMobile(){ return window.innerWidth <= 920; }
function trimStr(v){ return String(v ?? "").trim(); }
function parseNumberInput(v){
  if(v === 0) return 0;
  const s = trimStr(v);
  if(!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}
function isRateFilled(v){ return trimStr(v) !== ""; }

function escHtml(v){
  const s = String(v ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isValidRate(val){
  if(val === null || val === undefined) return false;
  const s = String(val).trim();
  if(!s || s === "—") return false;
  const n = Number(s);
  if(!Number.isNaN(n) && n === 0) return false;
  return true;
}

function formatValue(val){
  if(val === 0) return "0";
  const s = String(val ?? "").trim();
  return s && s !== "—" ? s : "—";
}

function formatNumber_(n){
  const rounded = Math.round(n * 1000) / 1000;
  const s = String(rounded);
  return s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function formatGolaPrice(base, add){
  if(!isValidRate(base) || !isValidRate(add)) return "—";
  const baseNum = Number(base);
  const addNum = Number(add);
  if(Number.isNaN(baseNum) || Number.isNaN(addNum)) return "—";
  const total = baseNum + addNum;
  return `${formatNumber_(baseNum)} + ${formatNumber_(addNum)} = ${formatNumber_(total)}`;
}

function formatTermValue(val){
  const s = formatValue(val);
  if(s === "—") return s;
  return s.endsWith("d") ? s : `${s}d`;
}

function formatCd(cell){
  if(!cell) return "—";
  const raw = cell.cdValue !== undefined ? cell.cdValue : (cell.cd !== undefined ? cell.cd : "");
  const cleaned = formatValue(raw);
  return cleaned === "—" ? "Net Rates" : cleaned;
}

function extractLatestRecord(item, data){
  if(!data || !item) return { wef: "", cell: null };
  const allWefs = Array.isArray(data.wefDates) ? data.wefDates : [];
  const key = `${item.product}||${item.category}||${item.size}`;
  for(let i = allWefs.length - 1; i >= 0; i--){
    const wef = allWefs[i];
    const cell = data.rates?.[wef]?.[key];
    if(cell && isValidRate(cell.rate)) return { wef, cell };
  }
  return { wef: "", cell: null };
}

function itemHasAnyRate(item, data){
  if(!data || !item) return false;
  const allWefs = Array.isArray(data.wefDates) ? data.wefDates : [];
  const key = `${item.product}||${item.category}||${item.size}`;
  return allWefs.some((wef)=>isValidRate(data.rates?.[wef]?.[key]?.rate));
}

function renderKVBlock(attrs){
  const rows = Array.isArray(attrs)
    ? attrs
    : Object.entries(attrs || {}).map(([k,v])=>({k,v}));
  const body = rows.map(({k,v})=>{
    return `<div class="kv-row"><span class="k">${escHtml(k)}</span><span class="v">${escHtml(formatValue(v))}</span></div>`;
  }).join("");
  return `<div class="kv">${body}</div>`;
}

function renderLatestNormalCell(item, data){
  const latest = extractLatestRecord(item, data);
  const cell = latest.cell;
  const attrs = [
    { k:"WEF", v: formatValue(latest.wef) },
    { k:"Rate", v: formatValue(cell?.rate) },
    { k:"Term", v: formatTermValue(cell?.term) },
    { k:"GST", v: formatValue(cell?.gstType) },
    { k:"Freight", v: formatValue(cell?.freight) },
    { k:"CD", v: cell ? formatCd(cell) : "—" },
    { k:"Brand", v: formatValue(cell?.brand) }
  ];
  return renderKVBlock(attrs);
}

function renderLatestGolaCell(item, data){
  const latest = extractLatestRecord(item, data);
  const cell = latest.cell;
  const golaExpr = cell
    ? formatGolaPrice(cell.rate, cell.golaAddPrice ?? cell.golaAdd ?? cell.gola)
    : "—";
  const attrs = [
    { k:"WEF", v: formatValue(latest.wef) },
    { k:"Rate", v: golaExpr },
    { k:"Term", v: formatTermValue(cell?.term) },
    { k:"GST", v: formatValue(cell?.gstType) },
    { k:"Freight", v: formatValue(cell?.freight) },
    { k:"CD", v: cell ? formatCd(cell) : "—" },
    { k:"Brand", v: formatValue(cell?.brand) }
  ];
  return renderKVBlock(attrs);
}

function renderWefCell(cell){
  const attrs = [
    { k:"Rate", v: formatValue(cell?.rate) },
    { k:"Term", v: formatTermValue(cell?.term) },
    { k:"GST", v: formatValue(cell?.gstType) },
    { k:"Freight", v: formatValue(cell?.freight) },
    { k:"CD", v: cell ? formatCd(cell) : "—" },
    { k:"Brand", v: formatValue(cell?.brand) }
  ];
  return renderKVBlock(attrs);
}

/* -------------------------- Init (GET) -------------------------- */
async function init(){
  try{
    showPageLoader(true);
    const res = await safeFetch(`${API_URL}?action=getInitialData`);
    const data = await res.json();
    if(!data.ok){ throw new Error('Initial data not ok'); }
    // Dealer datalist
    fillOptionsDatalist("dealersList", data.dealers);
    // Product categories for Add Product
    fillOptions("prodCategory", data.categories);
  }catch(err){
    console.error(err);
    showToast("Error loading data", 'error');
  }finally{
    showPageLoader(false);
  }
}
function fillOptions(id, arr){
  const sel = document.getElementById(id);
  if(!sel) return;
  sel.innerHTML = "";
  const def = document.createElement("option");
  def.value = ""; def.textContent = "-- select --";
  sel.appendChild(def);
  (arr||[]).forEach(v=>{
    const o = document.createElement("option"); o.value=v; o.textContent=v;
    sel.appendChild(o);
  });
}
function fillOptionsDatalist(id, arr){
  const dl = document.getElementById(id);
  if(!dl) return;
  dl.innerHTML = "";
  (arr||[]).forEach(v=>{
    const o = document.createElement("option"); o.value=v; dl.appendChild(o);
  });
}

/* --------------------- Add dealer/category/product/brand (POST) -------------------- */
async function addDealer(){
  const btn = $('#dealerAddBtn');
  const name = document.getElementById("dealerName").value.trim();
  if(!name){ return showToast('Enter dealer name','error'); }
  try{
    setLoading(btn, true);
    await safeFetch(API_URL, {
      method: "POST", mode: "no-cors",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ action:"addDealer", name })
    });
    document.getElementById("dealerName").value="";
    showToast('Dealer added');
    init();
  }catch(err){
    showToast('Failed to add dealer','error');
  }finally{ setLoading(btn, false); }
}

async function addCategory(){
  const btn = $('#categoryAddBtn');
  const name = document.getElementById("categoryName").value.trim();
  if(!name){ return showToast('Enter category name','error'); }
  try{
    setLoading(btn, true);
    await safeFetch(API_URL, {
      method: "POST", mode: "no-cors",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ action:"addCategory", name })
    });
    document.getElementById("categoryName").value="";
    showToast('Category added');
    init();
  }catch(err){ showToast('Failed to add category','error'); }
  finally{ setLoading(btn, false); }
}

async function addBrand(){
  const btn = $('#brandAddBtn');
  const name = document.getElementById("brandName").value.trim();
  if(!name){ return showToast('Enter brand name','error'); }
  try{
    setLoading(btn, true);
    await safeFetch(API_URL, {
      method: "POST", mode: "no-cors",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ action:"addBrand", name })
    });
    document.getElementById("brandName").value="";
    showToast('Brand added');
  }catch(err){ showToast('Failed to add brand','error'); }
  finally{ setLoading(btn, false); }
}

async function addProduct(){
  const btn = $('#productAddBtn');
  const product = document.getElementById("prodName").value.trim();
  const category = document.getElementById("prodCategory").value;
  const size = document.getElementById("prodSize").value.trim();
  if(!product||!category||!size){ return showToast('Fill all product fields','error'); }
  try{
    setLoading(btn, true);
    await safeFetch(API_URL, {
      method: "POST", mode: "no-cors",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ action:"addProduct", product, category, size })
    });
    document.getElementById("prodName").value="";
    document.getElementById("prodSize").value="";
    showToast('Product added');
    init();
  }catch(err){ showToast('Failed to add product','error'); }
  finally{ setLoading(btn, false); }
}

/* ---------------------- Load dealer rates (GET) ------------------ */
async function loadDealerRates(){
  const dealerInput = document.getElementById("dealerSelect");
  const dealer = dealerInput.value.trim();
  if(!dealer){ return showToast('Select dealer','error'); }
  const btn = $('#getDataBtn');
  try{
    setLoading(btn, true);
    const res = await safeFetch(`${API_URL}?action=getDealerRates&dealer=${encodeURIComponent(dealer)}`);
    const d = await res.json();
    if(!d.ok){ throw new Error('Dealer data not ok'); }
    if (Array.isArray(d.wefDates)) {
      d.wefDates = d.wefDates.filter(Boolean).sort((a,b)=>a.localeCompare(b));
    }
    // Store products for submit
    const wrap = document.getElementById("ratesTable");
    wrap.dataset.products = JSON.stringify(d.products||[]);
    // Render responsive
    renderRatesView(d);
    document.getElementById("ratesArea").classList.remove('hide');
    showToast('Data loaded');
  }catch(err){
    console.error(err); showToast('Error loading dealer data','error');
  }finally{ setLoading(btn, false); }
}

/* -------------------- Responsive rendering switch -------------------- */
function renderRatesView(data){
  if(isMobile()){
    $('#ratesTableWrap')?.classList.add('hide');
    $('#ratesCards')?.classList.remove('hide');
    renderCards(data);
    // Populate filter dropdowns
    const catSel = $('#filterCategory');
    const prodSel = $('#filterProduct');
    if(catSel && prodSel){
      // Reset
      catSel.innerHTML = '<option value="">All</option>';
      prodSel.innerHTML = '<option value="">All</option>';
    
      const cats = [...new Set((data.products||[]).map(p=>p.category))];
      const prods = [...new Set((data.products||[]).map(p=>p.product))];
    
      cats.forEach(c=>{
        const o=document.createElement('option'); o.value=c; o.textContent=c; catSel.appendChild(o);
      });
      prods.forEach(p=>{
        const o=document.createElement('option'); o.value=p; o.textContent=p; prodSel.appendChild(o);
      });
    
      const applyFilters = ()=>{
        const fCat = catSel.value;
        const fProd = prodSel.value;
        const cards = document.querySelectorAll('.product-card');
        cards.forEach(card=>{
          const cat = card.dataset.category;
          const prod = card.dataset.product;
          const show = (!fCat || fCat===cat) && (!fProd || fProd===prod);
          card.style.display = show ? '' : 'none';
        });
      };
      catSel.onchange = applyFilters;
      prodSel.onchange = applyFilters;
    }

  }else{
    $('#ratesCards')?.classList.add('hide');
    $('#ratesTableWrap')?.classList.remove('hide');
    renderTable(data);
    // Populate filter dropdowns
    const catSel = $('#filterCategory');
    const prodSel = $('#filterProduct');
    if(catSel && prodSel){
      // Reset
      catSel.innerHTML = '<option value="">All</option>';
      prodSel.innerHTML = '<option value="">All</option>';
    
      const cats = [...new Set((data.products||[]).map(p=>p.category))];
      const prods = [...new Set((data.products||[]).map(p=>p.product))];
    
      cats.forEach(c=>{
        const o=document.createElement('option'); o.value=c; o.textContent=c; catSel.appendChild(o);
      });
      prods.forEach(p=>{
        const o=document.createElement('option'); o.value=p; o.textContent=p; prodSel.appendChild(o);
      });
    
      const applyFilters = ()=>{
        const fCat = catSel.value;
        const fProd = prodSel.value;
        const rows = document.querySelectorAll('#ratesTable table tbody tr');
        rows.forEach(row=>{
          const cat = row.dataset.category;
          const prod = row.dataset.product;
          const show = (!fCat || fCat===cat) && (!fProd || fProd===prod);
          row.style.display = show ? '' : 'none';
        });
      };
      catSel.onchange = applyFilters;
      prodSel.onchange = applyFilters;
    }
    
  }
}

/* ------------------------- Desktop: table -------------------------- */
function renderTable(data){
  const wrap = document.getElementById("ratesTable");
  wrap.innerHTML = "";
  const tbl = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const wefs = Array.isArray(data.wefDates) ? data.wefDates : [];
  const hasWef = wefs.length > 0;

  ["Category","Product","Size"].forEach(text=>{
    const th = document.createElement("th"); th.textContent = text; headRow.appendChild(th);
  });

  const thLatest = document.createElement("th");
  thLatest.textContent = "Latest (Normal)";
  thLatest.className = "latest-col";
  headRow.appendChild(thLatest);

  const thGola = document.createElement("th");
  thGola.textContent = "Latest (Gola Service Price)";
  thGola.className = "gola-col";
  headRow.appendChild(thGola);

  const thNew = document.createElement("th");
  thNew.textContent = "New Rate";
  thNew.className = "new-rate-col";
  headRow.appendChild(thNew);

  thead.appendChild(headRow);
  tbl.appendChild(thead);

  const tbody = document.createElement("tbody");
  (data.products||[]).forEach((p,idx)=>{
    const tr = document.createElement("tr");
    tr.dataset.category = p.category;
    tr.dataset.product = p.product;
    [p.category,p.product,p.size].forEach(v=>{
      const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
    });

    const tdLatest = document.createElement("td");
    tdLatest.className = "wef-cell latest-col";
    tdLatest.innerHTML = renderLatestNormalCell(p, data);
    tr.appendChild(tdLatest);

    const tdGola = document.createElement("td");
    tdGola.className = "wef-cell gola-col";
    tdGola.innerHTML = renderLatestGolaCell(p, data);
    tr.appendChild(tdGola);

    const tdNew = document.createElement("td");
    tdNew.className = "new-rate-cell";
    tdNew.innerHTML = `
      <div class="kv new-rate">
        <div class="kv-row"><span class="k">Rate</span><span class="v"><input type="number" id="rate_${idx}" inputmode="decimal" placeholder="0"/></span></div>
        <div class="kv-row"><span class="k">Term</span><span class="v"><select id="term_${idx}" disabled><option>15</option><option>30</option></select></span></div>
        <div class="kv-row"><span class="k">Brand</span><span class="v"><input type="text" id="brand_${idx}" placeholder="Brand (optional)"/></span></div>
        <div class="kv-row"><span class="k">GST</span><span class="v"><select id="gst_${idx}" disabled><option value="Paid">Paid</option><option value="Extra">Extra</option></select></span></div>
        <div class="kv-row"><span class="k">Freight</span><span class="v"><input type="text" id="freight_${idx}" list="freightList" placeholder="Freight" disabled/></span></div>
        <div class="kv-row"><span class="k">CD</span><span class="v"><input type="text" id="cd_${idx}" placeholder="CD (blank = Net Rates)" disabled/></span></div>
        <div class="kv-row"><span class="k">Gola Add</span><span class="v"><input type="number" id="gola_${idx}" inputmode="decimal" step="any" placeholder="Gola add price" class="gola-input" disabled/></span></div>
      </div>
    `;
    tr.appendChild(tdNew);

    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(tbl);

  if(!hasWef){
    const banner = document.createElement("div");
    banner.textContent = "No previous rates found - you are entering first-time rates.";
    banner.className = "muted";
    wrap.prepend(banner);
  }

  wireGlobalToggles(data);
}
/* ------------------------- Mobile: cards -------------------------- */
function renderCards(data){
  const cards = $('#ratesCards');
  cards.innerHTML = "";

  const hasWef = Array.isArray(data.wefDates) && data.wefDates.length > 0;

  (data.products||[]).forEach((p, idx)=>{
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.category = p.category;
    card.dataset.product = p.product;
    // Header
    const header = document.createElement('div');
    header.className = 'product-header';
    const title = document.createElement('div');
    title.className = 'product-title';
    title.textContent = `${p.product}`;
    const meta = document.createElement('div');
    meta.className = 'product-meta';
    meta.textContent = `${p.category} • ${p.size}`;
    header.appendChild(title);
    header.appendChild(meta);
    card.appendChild(header);

    // Latest rate
    const past = document.createElement('div');
    past.className = 'past-rates';
    const pastTitle = document.createElement('div');
    pastTitle.textContent = 'Latest Rate';
    past.appendChild(pastTitle);

    if(hasWef){
      const latest = extractLatestRecord(p, data);
      const cell = latest.cell;
      if(cell){
        const attrs = [
          { k:"WEF", v: formatValue(latest.wef) },
          { k:"Rate", v: formatValue(cell?.rate) },
          { k:"Term", v: formatTermValue(cell?.term) },
          { k:"GST", v: formatValue(cell?.gstType) },
          { k:"Freight", v: formatValue(cell?.freight) },
          { k:"CD", v: cell ? formatCd(cell) : "—" },
          { k:"Brand", v: formatValue(cell?.brand) }
        ];
        const block = document.createElement('div');
        block.className = 'past-item';
        block.innerHTML = renderKVBlock(attrs);
        past.appendChild(block);
      }else{
        const empty = document.createElement('div');
        empty.className = 'past-item';
        empty.textContent = 'No previous rates found.';
        past.appendChild(empty);
      }
    }else{
      const empty = document.createElement('div');
      empty.className = 'past-item';
      empty.textContent = 'No previous rates found.';
      past.appendChild(empty);
    }
    card.appendChild(past);

    // New inputs (compact)
    const fresh = document.createElement('div');
    fresh.className = 'product-new';

    const rate = document.createElement('input');
    rate.type = 'number';
    rate.placeholder = 'New Rate';
    rate.id = `rate_${idx}`;
    fresh.appendChild(rate);

    const brand = document.createElement('input');
    brand.type = 'text';
    brand.placeholder = 'Brand (optional)';
    brand.id = `brand_${idx}`;
    fresh.appendChild(brand);

    // Hidden unless per-item enabled
    const termSel = document.createElement('select');
    termSel.id = `term_${idx}`;
    termSel.disabled = true;
    termSel.innerHTML = `<option>15</option><option>30</option>`;
    fresh.appendChild(termSel);

    const gstSel = document.createElement('select');
    gstSel.id = `gst_${idx}`;
    gstSel.disabled = true;
    gstSel.innerHTML = `<option value="Paid">Paid</option><option value="Extra">Extra</option>`;
    fresh.appendChild(gstSel);

    const freightInput = document.createElement('input');
    freightInput.type = 'text';
    freightInput.placeholder = 'Freight';
    freightInput.id = `freight_${idx}`;
    freightInput.disabled = true;
    freightInput.setAttribute('list','freightList');
    fresh.appendChild(freightInput);

    const cdInput = document.createElement('input');
    cdInput.type = 'text';
    cdInput.placeholder = 'CD (blank = Net Rates)';
    cdInput.id = `cd_${idx}`;
    cdInput.disabled = true;
    fresh.appendChild(cdInput);

    const golaInput = document.createElement('input');
    golaInput.type = 'number';
    golaInput.placeholder = 'Gola add price';
    golaInput.id = `gola_${idx}`;
    golaInput.inputMode = 'decimal';
    golaInput.step = 'any';
    golaInput.disabled = true;
    golaInput.className = 'gola-input';
    fresh.appendChild(golaInput);

    card.appendChild(fresh);
    cards.appendChild(card);
  });

  // sync per-item enable/disable with globals
  wireGlobalToggles(data);
}

/* ----------------- Per-item enablement mirroring globals ---------------- */
function wireGlobalToggles(data){
  const products = JSON.parse(document.getElementById("ratesTable").dataset.products||"[]");

  const applyTermEl = $("#applyTerm");
  const globalTermEl = $("#termSelect");
  const applyGstEl = $("#applyGst");
  const globalGstEl = $("#gstGlobal");
  const applyFreightEl = $("#applyFreight");
  const globalFreightEl = $("#freightGlobal");
  const applyCdEl = $("#applyCd");
  const globalCdEl = $("#cdGlobal");
  const applyGolaEl = $("#applyGola");
  const globalGolaEl = $("#golaGlobal");

  applyTermEl.onchange=(e)=>{
    const enable=e.target.value==="per-item";
    const globalVal=globalTermEl.value;
    (products||[]).forEach((_,i)=>{
      const el=document.getElementById(`term_${i}`);
      if(el){ el.disabled=!enable; if(!enable) el.value=globalVal; }
    });
  };
  globalTermEl.onchange=(e)=>{
    const globalVal=e.target.value;
    if($("#applyTerm").value==="all"){
      (products||[]).forEach((_,i)=>{
        const el=document.getElementById(`term_${i}`);
        if(el) el.value=globalVal;
      });
    }
  };

  applyGstEl.onchange=(e)=>{
    const enable=e.target.value==="per-item";
    const globalVal=globalGstEl.value;
    (products||[]).forEach((_,i)=>{
      const el=document.getElementById(`gst_${i}`);
      if(el){ el.disabled=!enable; if(!enable) el.value=globalVal; }
    });
  };
  globalGstEl.onchange=(e)=>{
    const globalVal=e.target.value;
    if($("#applyGst").value==="all"){
      (products||[]).forEach((_,i)=>{
        const el=document.getElementById(`gst_${i}`);
        if(el) el.value=globalVal;
      });
    }
  };

  applyFreightEl.onchange=(e)=>{
    const enable = e.target.value==="per-item";
    const globalVal = (globalFreightEl.value || "").trim();
    (products||[]).forEach((_,i)=>{
      const el = document.getElementById(`freight_${i}`);
      if(!el) return;
      el.disabled = !enable;
      if(!enable){
        el.value = globalVal;
      }else{
        // don't overwrite user's per-item edits
        if(!el.value) el.value = globalVal;
      }
    });
  };
  globalFreightEl.oninput=(e)=>{
    const globalVal = (e.target.value || "").trim();
    if($("#applyFreight").value==="all"){
      (products||[]).forEach((_,i)=>{
        const el=document.getElementById(`freight_${i}`);
        if(el) el.value=globalVal;
      });
    }
  };

  applyCdEl.onchange=(e)=>{
    const enable = e.target.value==="per-item";
    const globalVal = (globalCdEl.value || "").trim();
    (products||[]).forEach((_,i)=>{
      const el = document.getElementById(`cd_${i}`);
      if(!el) return;
      el.disabled = !enable;
      if(!enable){
        el.value = globalVal;
      }else{
        if(!el.value) el.value = globalVal;
      }
    });
  };
  globalCdEl.oninput=(e)=>{
    const globalVal = (e.target.value || "").trim();
    if($("#applyCd").value==="all"){
      (products||[]).forEach((_,i)=>{
        const el=document.getElementById(`cd_${i}`);
        if(el) el.value=globalVal;
      });
    }
  };

  const syncGolaForIndex = (i)=>{
    if(!applyGolaEl || !globalGolaEl) return;
    const golaEl = document.getElementById(`gola_${i}`);
    if(!golaEl) return;
    const rateEl = document.getElementById(`rate_${i}`);
    const ratePresent = rateEl && isRateFilled(rateEl.value);
    const perItem = applyGolaEl.value === "per-item";
    const globalVal = trimStr(globalGolaEl.value);

    golaEl.classList.toggle('hide', !perItem);

    if(!ratePresent){
      golaEl.value = "";
      golaEl.disabled = true;
      return;
    }

    if(perItem){
      golaEl.disabled = false;
      if(!trimStr(golaEl.value) && globalVal){
        golaEl.value = globalVal;
      }
    }else{
      golaEl.value = globalVal;
      golaEl.disabled = true;
    }
  };

  if(applyGolaEl && globalGolaEl){
    applyGolaEl.onchange=()=>{
      (products||[]).forEach((_,i)=>syncGolaForIndex(i));
    };
    globalGolaEl.oninput=()=>{
      if(applyGolaEl.value==="all"){
        (products||[]).forEach((_,i)=>syncGolaForIndex(i));
      }
    };
  }

  (products||[]).forEach((_,i)=>{
    const rateEl = document.getElementById(`rate_${i}`);
    if(rateEl){
      rateEl.addEventListener('input', ()=>syncGolaForIndex(i));
    }
  });

  // Initialize current state once
  applyTermEl.onchange({target:applyTermEl});
  applyGstEl.onchange({target:applyGstEl});
  applyFreightEl.onchange({target:applyFreightEl});
  applyCdEl.onchange({target:applyCdEl});
  if(applyGolaEl) applyGolaEl.onchange({target:applyGolaEl});
}

/* --------------------------- Submit --------------------------- */
async function submitNewRates(){
  const dealer=document.getElementById("dealerSelect").value.trim();
  const wef=document.getElementById("wefInput").value;
  const applyTerm=document.getElementById("applyTerm").value;
  const globalTerm=document.getElementById("termSelect").value;
  const applyGst=document.getElementById("applyGst").value;
  const globalGst=document.getElementById("gstGlobal").value;
  const applyFreight=document.getElementById("applyFreight").value;
  const globalFreight=(document.getElementById("freightGlobal").value||"").trim();
  const applyCd=document.getElementById("applyCd").value;
  const globalCd=(document.getElementById("cdGlobal").value||"").trim();
  const applyGola=document.getElementById("applyGola").value;
  const globalGola=parseNumberInput(document.getElementById("golaGlobal").value);

  const products=JSON.parse(document.getElementById("ratesTable").dataset.products||"[]");
  const btn=$('#saveRatesBtn');
  const items=[];
  products.forEach((p,i)=>{
    const rateEl=document.getElementById(`rate_${i}`);
    const rate=rateEl&&rateEl.value?Number(rateEl.value):null;
    if(rate!==null&&!Number.isNaN(rate)){
      const term=applyTerm==='per-item'?document.getElementById(`term_${i}`).value:null;
      const brandEl=document.getElementById(`brand_${i}`);
      const brand = brandEl && brandEl.value ? brandEl.value.trim() : "";
      const gstEl=document.getElementById(`gst_${i}`);
      const gstType = applyGst==='per-item' && gstEl ? gstEl.value : null;

      const frEl=document.getElementById(`freight_${i}`);
      const freight = applyFreight==='per-item' && frEl ? (frEl.value||"").trim() : null;

      const cdEl=document.getElementById(`cd_${i}`);
      const cdValue = applyCd==='per-item' && cdEl ? (cdEl.value||"").trim() : null;

      const golaEl=document.getElementById(`gola_${i}`);
      const golaAddPrice = applyGola==='per-item'
        ? parseNumberInput(golaEl ? golaEl.value : null)
        : globalGola;

      items.push({...p,rate,term,brand,gstType,freight,cdValue,golaAddPrice});
    }
  });

  if(!dealer) return showToast('Select dealer','error');
  if(!wef) return showToast('Enter new W.E.F','error');
  if(items.length===0) return showToast('Enter at least one new rate','error');

  try{
    setLoading(btn,true);
    await safeFetch(API_URL,{
      method:"POST",mode:"no-cors",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        action:"saveRates",
        payload:{dealer,wefDate:wef,applyTerm,globalTerm,applyGst,globalGst,applyFreight,globalFreight,applyCd,globalCd,applyGola,globalGola,items}
      })
    });
    showToast('Rates saved');
    loadDealerRates();
  }catch(err){showToast('Failed to save rates','error');}
  finally{setLoading(btn,false);}
}

/* --------------------------- Boot --------------------------- */
window.addEventListener('resize', ()=>{
  const ratesArea = $('#ratesArea');
  if(ratesArea && !ratesArea.classList.contains('hide')){
    // Re-render current view responsively on resize
    const products=JSON.parse(document.getElementById("ratesTable").dataset.products||"[]");
    if(products.length){
      const dealer = document.getElementById("dealerSelect").value.trim();
      // Avoid refetch; reuse last rendered data by reading from DOM cache if available
      // Simpler: just click Fetch again programmatically is noisy; so skip.
      // Instead, keep lastData in memory:
    }
  }
});
let __lastData = null;
async function loadDealerRates(){
  const dealerInput = document.getElementById("dealerSelect");
  const dealer = dealerInput.value.trim();
  if(!dealer){ return showToast('Select dealer','error'); }
  const btn = $('#getDataBtn');
  try{
    setLoading(btn, true);
    const res = await safeFetch(`${API_URL}?action=getDealerRates&dealer=${encodeURIComponent(dealer)}`);
    const d = await res.json();
    if(!d.ok){ throw new Error('Dealer data not ok'); }
    if (Array.isArray(d.wefDates)) {
      d.wefDates = d.wefDates.filter(Boolean).sort((a,b)=>a.localeCompare(b));
    }
    document.getElementById("ratesTable").dataset.products = JSON.stringify(d.products||[]);
    __lastData = d;
    renderRatesView(d);
    document.getElementById("ratesArea").classList.remove('hide');
    showToast('Data loaded');
  }catch(err){
    console.error(err); showToast('Error loading dealer data','error');
  }finally{ setLoading(btn, false); }
}
// re-render view (no refetch) when rotating/resizing
// window.addEventListener('orientationchange', ()=>{ if(__lastData) renderRatesView(__lastData); });
// window.addEventListener('resize', ()=>{ if(__lastData) renderRatesView(__lastData); });

init();
