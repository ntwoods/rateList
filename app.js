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
  }else{
    $('#ratesCards')?.classList.add('hide');
    $('#ratesTableWrap')?.classList.remove('hide');
    renderTable(data);
  }
}

/* ------------------------- Desktop: table -------------------------- */
function renderTable(data){
  const wrap = document.getElementById("ratesTable");
  wrap.innerHTML = "";
  const tbl = document.createElement("table");
  const thead = document.createElement('thead');
  const headTop = document.createElement('tr');
  const headSub = document.createElement('tr'); headSub.className='sub';

  ['Category','Product','Size'].forEach(text=>{
    const th = document.createElement('th'); th.textContent = text; th.rowSpan=2; headTop.appendChild(th);
  });

  const hasWef = Array.isArray(data.wefDates) && data.wefDates.length > 0;
  if (hasWef) {
    data.wefDates.forEach(wef=>{
      const thGroup = document.createElement('th'); thGroup.textContent=wef; thGroup.colSpan=6; headTop.appendChild(thGroup);
      const thRate=document.createElement('th'); thRate.textContent='Rate'; thRate.classList.add('rate-col'); headSub.appendChild(thRate);
      const thTerm=document.createElement('th'); thTerm.textContent='Payment Term'; headSub.appendChild(thTerm);
      const thBrand=document.createElement('th'); thBrand.textContent='Brand'; headSub.appendChild(thBrand);
      const thGst=document.createElement('th'); thGst.textContent='GST Type'; headSub.appendChild(thGst);
      const thFre=document.createElement('th'); thFre.textContent='Freight'; headSub.appendChild(thFre);
      const thCd=document.createElement('th'); thCd.textContent='CD'; headSub.appendChild(thCd);
    });
  }

  const thNew=document.createElement('th'); thNew.textContent='New Rate'; thNew.rowSpan=2; thNew.classList.add('rate-col'); headTop.appendChild(thNew);
  const thItemTerm=document.createElement('th'); thItemTerm.textContent='Item Term'; thItemTerm.rowSpan=2; headTop.appendChild(thItemTerm);
  const thItemBrand=document.createElement('th'); thItemBrand.textContent='New Brand (optional)'; thItemBrand.rowSpan=2; headTop.appendChild(thItemBrand);
  const thItemGst=document.createElement('th'); thItemGst.textContent='GST Type'; thItemGst.rowSpan=2; headTop.appendChild(thItemGst);
  const thItemFre=document.createElement('th'); thItemFre.textContent='Freight'; thItemFre.rowSpan=2; headTop.appendChild(thItemFre);
  const thItemCd=document.createElement('th'); thItemCd.textContent='CD (+% if inc.)'; thItemCd.rowSpan=2; headTop.appendChild(thItemCd);

  thead.appendChild(headTop);
  if(hasWef) thead.appendChild(headSub);
  tbl.appendChild(thead);

  const tbody=document.createElement('tbody');
  (data.products||[]).forEach((p,idx)=>{
    const tr=document.createElement('tr');
    [p.category,p.product,p.size].forEach(v=>{
      const td=document.createElement('td'); td.textContent=v; tr.appendChild(td);
    });

    if(hasWef){
      data.wefDates.forEach(wef=>{
        const key=`${p.product}||${p.category}||${p.size}`;
        const cell=data.rates?.[wef]?.[key];
        const tdRate=document.createElement('td'); tdRate.classList.add('rate-col');
        const tdTerm=document.createElement('td');
        const tdBrand=document.createElement('td');
        const tdGst=document.createElement('td');
        const tdFre=document.createElement('td');
        const tdCd=document.createElement('td');
        if(cell){
          tdRate.textContent = (cell.rate ?? '') !== '' ? cell.rate : '—';
          tdTerm.textContent = cell.term ? `${cell.term} d` : '—';
          tdBrand.textContent = cell.brand ? cell.brand : '—';
          tdGst.textContent  = cell.gstType ? cell.gstType : '—';
          tdFre.textContent  = cell.freight || '—';
          tdCd.textContent   = cell.cdType
            ? (cell.cdType==="CD Included"
                ? `${cell.cdType}${cell.cdValue ? ` (${cell.cdValue})` : ''}`
                : cell.cdType)
            : '—';
        }else{
          tdRate.textContent='—';
          tdTerm.textContent='—';
          tdBrand.textContent='—';
          tdGst.textContent='—';
          tdFre.textContent='—';
          tdCd.textContent='—';
        }
        [tdRate,tdTerm,tdBrand,tdGst,tdFre,tdCd].forEach(td=>tr.appendChild(td));
      });
    }

    // New entries
    const tdNew=document.createElement('td');
    tdNew.classList.add("rate-col");
    tdNew.innerHTML=`<input type="number" id="rate_${idx}" inputmode="decimal" placeholder="0"/>`;
    tr.appendChild(tdNew);

    const tdTerm=document.createElement('td');
    tdTerm.innerHTML=`<select id="term_${idx}" disabled><option>15</option><option>30</option></select>`;
    tr.appendChild(tdTerm);

    const tdBrand=document.createElement('td');
    tdBrand.innerHTML=`<input type="text" id="brand_${idx}" placeholder="Brand (optional)"/>`;
    tr.appendChild(tdBrand);

    const tdGst=document.createElement('td');
    tdGst.innerHTML=`<select id="gst_${idx}" disabled>
                       <option value="Paid">Paid</option>
                       <option value="Extra">Extra</option>
                     </select>`;
    tr.appendChild(tdGst);

    const tdFre=document.createElement('td');
    tdFre.innerHTML=`<select id="freight_${idx}" disabled>
                       <option value="Extra">Extra</option>
                       <option value="Half">Half</option>
                       <option value="FOR">FOR</option>
                     </select>`;
    tr.appendChild(tdFre);

    const tdCd=document.createElement('td');
    tdCd.innerHTML=`<select id="cd_${idx}" disabled>
                      <option value="Net Rates">Net Rates</option>
                      <option value="CD Included">CD Included</option>
                    </select>
                    <input type="text" id="cdval_${idx}" placeholder="CD%" style="width:60px;display:none"/>`;
    tr.appendChild(tdCd);

    // Toggle CD% field visibility
    tdCd.querySelector(`#cd_${idx}`).onchange=(e)=>{
      tdCd.querySelector(`#cdval_${idx}`).style.display = e.target.value==="CD Included" ? "inline-block" : "none";
    };

    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(tbl);

  if(!hasWef){
    const banner=document.createElement('div');
    banner.textContent="No previous rates found — you are entering first-time rates.";
    banner.className="muted";
    wrap.prepend(banner);
  }

  // sync per-item enable/disable with globals
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

    // Past rates
    const past = document.createElement('div');
    past.className = 'past-rates';
    const pastTitle = document.createElement('div');
    pastTitle.textContent = 'Past Rates';
    past.appendChild(pastTitle);

    if(hasWef){
      data.wefDates.forEach(wef=>{
        const key=`${p.product}||${p.category}||${p.size}`;
        const cell=data.rates?.[wef]?.[key];
        const line = document.createElement('div');
        line.className = 'past-item';
        if(cell){
          const cdTxt = cell.cdType
            ? (cell.cdType==="CD Included"
                ? `${cell.cdType}${cell.cdValue ? ` (${cell.cdValue})` : ''}`
                : cell.cdType)
            : '—';
          line.textContent = `${wef} → Rate: ${cell.rate ?? '—'} | Term: ${cell.term ? cell.term+'d' : '—'} | Brand: ${cell.brand||'—'} | GST: ${cell.gstType||'—'} | Freight: ${cell.freight||'—'} | CD: ${cdTxt}`;
        }else{
          line.textContent = `${wef} → —`;
        }
        past.appendChild(line);
      });
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

    const freightSel = document.createElement('select');
    freightSel.id = `freight_${idx}`;
    freightSel.disabled = true;
    freightSel.innerHTML = `<option value="Extra">Extra</option><option value="Half">Half</option><option value="FOR">FOR</option>`;
    fresh.appendChild(freightSel);

    const cdWrap = document.createElement('div');
    const cdSel = document.createElement('select');
    cdSel.id = `cd_${idx}`;
    cdSel.disabled = true;
    cdSel.innerHTML = `<option value="Net Rates">Net Rates</option><option value="CD Included">CD Included</option>`;
    const cdVal = document.createElement('input');
    cdVal.type = 'text';
    cdVal.placeholder = 'CD%';
    cdVal.id = `cdval_${idx}`;
    cdVal.style.display = 'none';
    cdSel.onchange = (e)=>{ cdVal.style.display = e.target.value==="CD Included" ? "inline-block" : "none"; };
    cdWrap.appendChild(cdSel); cdWrap.appendChild(cdVal);
    fresh.appendChild(cdWrap);

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
    const enable=e.target.value==="per-item";
    const globalVal=globalFreightEl.value;
    (products||[]).forEach((_,i)=>{
      const el=document.getElementById(`freight_${i}`);
      if(el){ el.disabled=!enable; if(!enable) el.value=globalVal; }
    });
  };
  globalFreightEl.onchange=(e)=>{
    const globalVal=e.target.value;
    if($("#applyFreight").value==="all"){
      (products||[]).forEach((_,i)=>{
        const el=document.getElementById(`freight_${i}`);
        if(el) el.value=globalVal;
      });
    }
  };

  applyCdEl.onchange=(e)=>{
    const enable=e.target.value==="per-item";
    const globalVal=globalCdEl.value;
    (products||[]).forEach((_,i)=>{
      const el=document.getElementById(`cd_${i}`);
      if(el){ el.disabled=!enable; if(!enable) el.value=globalVal; }
    });
  };
  globalCdEl.onchange=(e)=>{
    const globalVal=e.target.value;
    if($("#applyCd").value==="all"){
      (products||[]).forEach((_,i)=>{
        const el=document.getElementById(`cd_${i}`);
        if(el) el.value=globalVal;
      });
    }
  };

  // Initialize current state once
  applyTermEl.onchange({target:applyTermEl});
  applyGstEl.onchange({target:applyGstEl});
  applyFreightEl.onchange({target:applyFreightEl});
  applyCdEl.onchange({target:applyCdEl});
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
  const globalFreight=document.getElementById("freightGlobal").value;
  const applyCd=document.getElementById("applyCd").value;
  const globalCd=document.getElementById("cdGlobal").value;

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
      const freight = applyFreight==='per-item' && frEl ? frEl.value : null;

      const cdSel=document.getElementById(`cd_${i}`);
      const cdType = applyCd==='per-item' && cdSel ? cdSel.value : null;
      const cdVal=document.getElementById(`cdval_${i}`);
      const cdValue = (applyCd==='per-item' && cdSel && cdSel.value==="CD Included" && cdVal) ? cdVal.value : "";

      items.push({...p,rate,term,brand,gstType,freight,cdType,cdValue});
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
        payload:{dealer,wefDate:wef,applyTerm,globalTerm,applyGst,globalGst,applyFreight,globalFreight,applyCd,globalCd,items}
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
