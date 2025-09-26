// viewRates.js
const API_URL = "https://script.google.com/macros/s/AKfycbyaIUmvKpAp1h7moft2bBKiYQDulSOyw6TJ6blf0gP97qC78yTvAGPHeXfGsgEb8oX-/exec";

/* Helpers */
const $ = (sel) => document.querySelector(sel);
function showToast(msg, type='success'){
  const t = $('#toast'); if(!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(()=>t.classList.remove('show'),1800);
}
function showPageLoader(show){ $('#pageLoader')?.classList.toggle('hide', !show); }
function safeFetch(url, opts){ return fetch(url, opts); }
function isMobile(){ return window.innerWidth <= 920; }

/* Init: load dealers */
async function init(){
  try{
    showPageLoader(true);
    const res = await safeFetch(`${API_URL}?action=getInitialData`);
    const data = await res.json();
    if(!data.ok) throw new Error("Init failed");
    const dl = document.getElementById("dealersList");
    dl.innerHTML = "";
    (data.dealers||[]).forEach(v=>{
      const o=document.createElement("option"); o.value=v; dl.appendChild(o);
    });
  }catch(err){
    console.error(err); showToast("Error loading data",'error');
  }finally{ showPageLoader(false); }
}

/* Load dealer rates */
async function loadDealerRates(){
  const dealer = $('#dealerSelect').value.trim();
  if(!dealer) return showToast("Select dealer","error");
  const btn = $('#getDataBtn');
  try{
    btn.disabled=true; showPageLoader(true);
    const res = await safeFetch(`${API_URL}?action=getDealerRates&dealer=${encodeURIComponent(dealer)}`);
    const d = await res.json();
    if(!d.ok) throw new Error("Bad dealer data");
    renderRatesView(d);
    $('#ratesArea').classList.remove('hide');
  }catch(err){
    console.error(err); showToast("Error loading dealer data","error");
  }finally{
    btn.disabled=false; showPageLoader(false);
  }
}

/* Responsive renderer */
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

  // Filters
  const catSel = $('#filterCategory');
  const prodSel = $('#filterProduct');
  if(catSel && prodSel){
    catSel.innerHTML = '<option value="">All</option>';
    prodSel.innerHTML = '<option value="">All</option>';
    const cats=[...new Set((data.products||[]).map(p=>p.category))];
    const prods=[...new Set((data.products||[]).map(p=>p.product))];
    cats.forEach(c=>{ let o=document.createElement('option');o.value=c;o.textContent=c;catSel.appendChild(o); });
    prods.forEach(p=>{ let o=document.createElement('option');o.value=p;o.textContent=p;prodSel.appendChild(o); });
    const applyFilters=()=>{
      const fCat=catSel.value, fProd=prodSel.value;
      document.querySelectorAll('.product-card').forEach(card=>{
        const show = (!fCat || fCat===card.dataset.category) && (!fProd || fProd===card.dataset.product);
        card.style.display = show ? "" : "none";
      });
    };
    catSel.onchange=applyFilters; prodSel.onchange=applyFilters;
  }
}

/* Cards (mobile) - only past rates */
function renderCards(data){
  const cards=$('#ratesCards'); cards.innerHTML="";
  const hasWef = Array.isArray(data.wefDates)&&data.wefDates.length>0;

  (data.products||[]).forEach(p=>{
    const card=document.createElement('div'); card.className='product-card';
    card.dataset.category=p.category; card.dataset.product=p.product;

    const header=document.createElement('div'); header.className='product-header';
    header.innerHTML=`<div class="product-title">${p.product}</div>
                      <div class="product-meta">${p.category} • ${p.size}</div>`;
    card.appendChild(header);

    const past=document.createElement('div'); past.className='past-rates';
    past.innerHTML='<div>Past Rates</div>';
    if(hasWef){
      data.wefDates.forEach(wef=>{
        const key=`${p.product}||${p.category}||${p.size}`;
        const cell=data.rates?.[wef]?.[key];
        const line=document.createElement('div'); line.className='past-item';
        if(cell){
          const cdTxt = cell.cdType
            ? (cell.cdType==="CD Included"
              ? `${cell.cdType}${cell.cdValue ? ` (${cell.cdValue})` : ''}`
              : cell.cdType)
            : '—';
          line.innerHTML=`${wef} → <span class="rate-highlight">Rate: ${cell.rate??'—'}</span>
                          | Term: ${cell.term?cell.term+'d':'—'} 
                          | Brand: ${cell.brand||'—'}
                          | GST: ${cell.gstType||'—'} 
                          | Freight: ${cell.freight||'—'} 
                          | CD: ${cdTxt}`;
        }else line.textContent=`${wef} → —`;
        past.appendChild(line);
      });
    }else{
      past.innerHTML+='<div class="past-item">No previous rates found.</div>';
    }
    card.appendChild(past);
    cards.appendChild(card);
  });
}

/* Table (desktop) - only past rates */
function renderTable(data){
  const wrap=$('#ratesTable'); wrap.innerHTML="";
  const tbl=document.createElement('table');
  const thead=document.createElement('thead');
  const tr=document.createElement('tr');
  ['Category','Product','Size'].forEach(h=>{let th=document.createElement('th');th.textContent=h;tr.appendChild(th);});
  (data.wefDates||[]).forEach(wef=>{
    let th=document.createElement('th'); th.textContent=wef; tr.appendChild(th);
  });
  thead.appendChild(tr); tbl.appendChild(thead);

  const tbody=document.createElement('tbody');
  (data.products||[]).forEach(p=>{
    const tr=document.createElement('tr');
    [p.category,p.product,p.size].forEach(v=>{let td=document.createElement('td');td.textContent=v;tr.appendChild(td);});
    (data.wefDates||[]).forEach(wef=>{
      const key=`${p.product}||${p.category}||${p.size}`;
      const cell=data.rates?.[wef]?.[key];
      let td=document.createElement('td'); td.className="rate-col";
      td.textContent=cell?cell.rate??'—':'—';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
}

/* Boot */
init();
