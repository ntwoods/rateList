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

/* -------------------------- Init (GET) -------------------------- */
async function init(){
  try{
    showPageLoader(true);
    const res = await safeFetch(`${API_URL}?action=getInitialData`);
    const data = await res.json();
    if(!data.ok){ throw new Error('Initial data not ok'); }
    fillOptions("dealerSelect", data.dealers);
    fillOptions("prodCategory", data.categories);
    // data.brands available if needed later
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

async function addBrand(){ // existing
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
  const dealer = document.getElementById("dealerSelect").value;
  if(!dealer){ return showToast('Select dealer','error'); }
  const btn = $('#getDataBtn');
  try{
    setLoading(btn, true);
    const res = await safeFetch(`${API_URL}?action=getDealerRates&dealer=${encodeURIComponent(dealer)}`);
    const d = await res.json();
    if(!d.ok){ throw new Error('Dealer data not ok'); }
    // Sort WEF ascending as requested
    if (Array.isArray(d.wefDates)) {
      d.wefDates = d.wefDates.filter(Boolean).sort((a,b)=>a.localeCompare(b));
    }
    renderRatesTable(d);
    document.getElementById("ratesArea").classList.remove('hide');
    showToast('Data loaded');
  }catch(err){
    console.error(err); showToast('Error loading dealer data','error');
  }finally{ setLoading(btn, false); }
}

/* ------------------------- Render table -------------------------- */
function renderRatesTable(data){
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
      const thGroup = document.createElement('th'); thGroup.textContent=wef; thGroup.colSpan=4; headTop.appendChild(thGroup);
      const thRate=document.createElement('th'); thRate.textContent='Rate'; headSub.appendChild(thRate);
      const thTerm=document.createElement('th'); thTerm.textContent='Payment Term'; headSub.appendChild(thTerm);
      const thBrand=document.createElement('th'); thBrand.textContent='Brand'; headSub.appendChild(thBrand);
      const thGst=document.createElement('th'); thGst.textContent='GST Type'; headSub.appendChild(thGst);
      const thFreight=document.createElement('th'); thFreight.textContent='Freight'; headSub.appendChild(thFreight);
      const thCd=document.createElement('th'); thCd.textContent='CD'; headSub.appendChild(thCd);

    });
  }

  const thNew=document.createElement('th'); thNew.textContent='New Rate'; thNew.rowSpan=2; headTop.appendChild(thNew);
  const thItemTerm=document.createElement('th'); thItemTerm.textContent='Item Term'; thItemTerm.rowSpan=2; headTop.appendChild(thItemTerm);
  const thItemBrand=document.createElement('th'); thItemBrand.textContent='New Brand (optional)'; thItemBrand.rowSpan=2; headTop.appendChild(thItemBrand);
  const thItemGst=document.createElement('th'); thItemGst.textContent='GST Type'; thItemGst.rowSpan=2; headTop.appendChild(thItemGst);
  const thFreight = document.createElement('th'); thFreight.textContent = 'Freight'; thFreight.rowSpan = 2; headTop.appendChild(thFreight);
  const thCd = document.createElement('th'); thCd.textContent = 'CD'; thCd.rowSpan = 2; headTop.appendChild(thCd);


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
        const tdRate=document.createElement('td');
        tdRate.classList.add("rate-col");        
        const tdTerm=document.createElement('td');
        const tdBrand=document.createElement('td');
        const tdGst=document.createElement('td');
        if(cell){
          tdRate.textContent = (cell.rate ?? '') !== '' ? cell.rate : '—';
          tdTerm.textContent = cell.term ? `${cell.term} d` : '—';
          tdBrand.textContent = cell.brand ? cell.brand : '—';
          tdGst.textContent  = cell.gstType ? cell.gstType : '—';
        }else{
          tdRate.textContent='—';
          tdTerm.textContent='—';
          tdBrand.textContent='—';
          tdGst.textContent='—';
        }
        tr.appendChild(tdRate); tr.appendChild(tdTerm); tr.appendChild(tdBrand); tr.appendChild(tdGst);
      });
    }

    const tdNew=document.createElement('td');
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
    const tdFreight=document.createElement('td');
    tdFreight.innerHTML=`<select id="freight_${idx}" disabled>
      <option value="Extra">Extra</option>
      <option value="Half">Half</option>
      <option value="FOR">FOR</option>
    </select>`;
    tr.appendChild(tdFreight);
    
    const tdCd=document.createElement('td');
    tdCd.innerHTML=`<select id="cd_${idx}" disabled>
      <option value="Net Rates">Net Rates</option>
      <option value="CD Included">CD Included</option>
    </select>
    <input type="text" id="cdval_${idx}" placeholder="CD%" style="width:60px;display:none"/>`;
    tr.appendChild(tdCd);
    
    // Toggle CD value box visibility
    tdCd.querySelector(`#cd_${idx}`).onchange=(e)=>{
      tdCd.querySelector(`#cdval_${idx}`).style.display = e.target.value==="CD Included" ? "inline-block" : "none";
    };

    

    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
  wrap.appendChild(tbl);

  // Show banner if no historical WEF found
  if(!hasWef){
    const banner=document.createElement('div');
    banner.textContent="No previous rates found — you are entering first-time rates.";
    banner.className="muted";
    wrap.prepend(banner);
  }

  // Toggle per-item enablement mirrors Payment Term logic, now for GST too
  const applyTermEl=document.getElementById("applyTerm");
  const globalTermEl=document.getElementById("termSelect");
  const applyGstEl=document.getElementById("applyGst");
  const globalGstEl=document.getElementById("gstGlobal");

  const applyFreightEl=$("#applyFreight");
  const globalFreightEl=$("#freightGlobal");
  applyFreightEl.onchange=(e)=>{
    const enable=e.target.value==="per-item";
    const globalVal=globalFreightEl.value;
    (data.products||[]).forEach((_,i)=>{
      const el=document.getElementById(`freight_${i}`);
      if(el){ el.disabled=!enable; if(!enable) el.value=globalVal; }
    });
  };
  globalFreightEl.onchange=(e)=>{
    const globalVal=e.target.value;
    if($("#applyFreight").value==="all"){
      (data.products||[]).forEach((_,i)=>{
        const el=document.getElementById(`freight_${i}`);
        if(el) el.value=globalVal;
      });
    }
  };
  
  const applyCdEl=$("#applyCd");
  const globalCdEl=$("#cdGlobal");
  applyCdEl.onchange=(e)=>{
    const enable=e.target.value==="per-item";
    const globalVal=globalCdEl.value;
    (data.products||[]).forEach((_,i)=>{
      const el=document.getElementById(`cd_${i}`);
      if(el){ el.disabled=!enable; if(!enable) el.value=globalVal; }
    });
  };
  globalCdEl.onchange=(e)=>{
    const globalVal=e.target.value;
    if($("#applyCd").value==="all"){
      (data.products||[]).forEach((_,i)=>{
        const el=document.getElementById(`cd_${i}`);
        if(el) el.value=globalVal;
      });
    }
  };
  
  
  applyTermEl.onchange=(e)=>{
    const enable=e.target.value==="per-item";
    const globalVal=globalTermEl.value;
    (data.products||[]).forEach((_,i)=>{
      const el=document.getElementById(`term_${i}`);
      if(el){
        el.disabled=!enable;
        if(!enable) el.value=globalVal;
      }
    });
  };
  globalTermEl.onchange=(e)=>{
    const globalVal=e.target.value;
    if(document.getElementById("applyTerm").value==="all"){
      (data.products||[]).forEach((_,i)=>{
        const el=document.getElementById(`term_${i}`);
        if(el) el.value=globalVal;
      });
    }
  };

  applyGstEl.onchange=(e)=>{
    const enable=e.target.value==="per-item";
    const globalVal=globalGstEl.value;
    (data.products||[]).forEach((_,i)=>{
      const el=document.getElementById(`gst_${i}`);
      if(el){
        el.disabled=!enable;
        if(!enable) el.value=globalVal;
      }
    });
  };
  globalGstEl.onchange=(e)=>{
    const globalVal=e.target.value;
    if(document.getElementById("applyGst").value==="all"){
      (data.products||[]).forEach((_,i)=>{
        const el=document.getElementById(`gst_${i}`);
        if(el) el.value=globalVal;
      });
    }
  };

  // keep products in dataset for submit
  wrap.dataset.products=JSON.stringify(data.products||[]);
}

async function submitNewRates(){
  const dealer=document.getElementById("dealerSelect").value;
  const wef=document.getElementById("wefInput").value;
  const applyTerm=document.getElementById("applyTerm").value;
  const globalTerm=document.getElementById("termSelect").value;
  const applyGst=document.getElementById("applyGst").value;
  const globalGst=document.getElementById("gstGlobal").value;
  const products=JSON.parse(document.getElementById("ratesTable").dataset.products||"[]");
  const applyFreight=$("#applyFreight").value;
  const globalFreight=$("#freightGlobal").value;
  const applyCd=$("#applyCd").value;
  const globalCd=$("#cdGlobal").value;
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
      const freight = applyFreight==='per-item' ? document.getElementById(`freight_${i}`).value : null;
      const cdType = applyCd==='per-item' ? document.getElementById(`cd_${i}`).value : null;
      const cdValue = cdType==="CD Included" ? document.getElementById(`cdval_${i}`).value : "";
      items.push({...p, rate, term, brand, gstType, freight, cdType, cdValue});

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

init();
