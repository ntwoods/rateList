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
  // Wrap fetch with a timeout for better UX on flaky networks
  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), 20000);
  return fetch(url, {...opts, signal: controller.signal}).finally(()=>clearTimeout(id));
}

/* -------------------------- Init (GET) -------------------------- */
async function init(){
  try{
    showPageLoader(true);
    const res = await safeFetch(`${API_URL}?action=getInitialData`);
    const data = await res.json();
    if(!data.ok){ throw new Error('Initial data not ok'); }
    fillOptions("dealerSelect", data.dealers);
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
  sel.innerHTML = "";
  const def = document.createElement("option");
  def.value = ""; def.textContent = "-- select --";
  sel.appendChild(def);
  (arr||[]).forEach(v=>{
    const o = document.createElement("option"); o.value=v; o.textContent=v;
    sel.appendChild(o);
  });
}

/* ---------------- Add dealer/category/product (POST) ------------- */
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
  const dealer = document.getElementById("dealerSelect").value;
  if(!dealer){ return showToast('Select dealer','error'); }
  const btn = $('#getDataBtn');
  try{
    setLoading(btn, true);
    const res = await safeFetch(`${API_URL}?action=getDealerRates&dealer=${encodeURIComponent(dealer)}`);
    const d = await res.json();
    if(!d.ok){ throw new Error('Dealer data not ok'); }
    renderRatesTable(d);
    document.getElementById("ratesArea").classList.remove('hide');
    showToast('Data loaded');
  }catch(err){
    console.error(err); showToast('Error loading dealer data','error');
  }finally{ setLoading(btn, false); }
}

/* ------- Render table with split WEF columns (Rate | Payment Term) ------- */
function renderRatesTable(data){
  const wrap = document.getElementById("ratesTable");
  wrap.innerHTML = "";
  const tbl = document.createElement("table");
  const thead = document.createElement('thead');
  const headTop = document.createElement('tr');
  const headSub = document.createElement('tr'); headSub.className='sub';

  // Static headers (span two rows)
  ;['Category','Product','Size'].forEach(text=>{
    const th = document.createElement('th');
    th.textContent = text; th.rowSpan = 2; headTop.appendChild(th);
  });

  // For each WEF date -> one group header (colspan=2) and subheaders Rate / Payment Term
  (data.wefDates||[]).forEach(wef=>{
    const thGroup = document.createElement('th');
    thGroup.textContent = wef; thGroup.colSpan = 2; headTop.appendChild(thGroup);

    const thRate = document.createElement('th'); thRate.textContent = 'Rate'; headSub.appendChild(thRate);
    const thTerm = document.createElement('th'); thTerm.textContent = 'Payment Term'; headSub.appendChild(thTerm);
  });

  // New inputs headers
  const thNew = document.createElement('th'); thNew.textContent='New Rate'; thNew.rowSpan=2; headTop.appendChild(thNew);
  const thItemTerm = document.createElement('th'); thItemTerm.textContent='Item Term'; thItemTerm.rowSpan=2; headTop.appendChild(thItemTerm);

  thead.appendChild(headTop); thead.appendChild(headSub); tbl.appendChild(thead);

  const tbody = document.createElement('tbody');

  (data.products||[]).forEach((p, idx)=>{
    const tr = document.createElement('tr');
    [p.category, p.product, p.size].forEach(v=>{
      const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
    });

    (data.wefDates||[]).forEach(wef=>{
      const key = `${p.product}||${p.category}||${p.size}`;
      const cell = (data.rates && data.rates[wef] && data.rates[wef][key]) ? data.rates[wef][key] : null;

      const tdRate = document.createElement('td');
      const tdTerm = document.createElement('td');

      if(cell){
        tdRate.textContent = cell.rate ?? '—';
        tdTerm.textContent = (cell.term ? `${cell.term} d` : '—');
      }else{
        tdRate.textContent = '—';
        tdTerm.textContent = '—';
      }
      tr.appendChild(tdRate); tr.appendChild(tdTerm);
    });

    const tdNew = document.createElement('td');
    tdNew.innerHTML = `<input type="number" id="rate_${idx}" inputmode="decimal" placeholder="0"/>`;
    tr.appendChild(tdNew);

    const tdTerm = document.createElement('td');
    tdTerm.innerHTML = `<select id="term_${idx}" disabled><option>15</option><option>30</option></select>`;
    tr.appendChild(tdTerm);

    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
  wrap.appendChild(tbl);

  document.getElementById("applyTerm").onchange = (e)=>{
    const enable = e.target.value === "per-item";
    (data.products||[]).forEach((_, i)=>{
      const el = document.getElementById(`term_${i}`);
      if(el) el.disabled = !enable;
    });
  };
  wrap.dataset.products = JSON.stringify(data.products||[]);
}

/* ---------------------- Save rates (POST) ----------------------- */
async function submitNewRates(){
  const dealer = document.getElementById("dealerSelect").value;
  const wef = document.getElementById("wefInput").value;
  const applyTerm = document.getElementById("applyTerm").value;
  const globalTerm = document.getElementById("termSelect").value;
  const products = JSON.parse(document.getElementById("ratesTable").dataset.products||"[]");

  const btn = $('#saveRatesBtn');
  const items = [];
  products.forEach((p,i)=>{
    const rateEl = document.getElementById(`rate_${i}`);
    const rate = rateEl && rateEl.value ? Number(rateEl.value) : null;
    if(rate !== null && !Number.isNaN(rate)){
      const term = applyTerm === 'per-item' ? (document.getElementById(`term_${i}`).value) : null;
      items.push({...p, rate, term});
    }
  });

  if(!dealer){ return showToast('Select dealer','error'); }
  if(!wef){ return showToast('Enter new W.E.F','error'); }
  if(items.length===0){ return showToast('Enter at least one new rate','error'); }

  try{
    setLoading(btn, true);
    await safeFetch(API_URL, {
      method: "POST", mode: "no-cors",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ action:"saveRates", payload:{ dealer, wefDate: wef, applyTerm, globalTerm, items }})
    });
    showToast('Rates saved');
    loadDealerRates();
  }catch(err){ showToast('Failed to save rates','error'); }
  finally{ setLoading(btn, false); }
}

// Init on page load
init();
