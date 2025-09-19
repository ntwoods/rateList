// Replace with your GAS WebApp URL
const API_URL = "https://script.google.com/macros/s/AKfycbyaIUmvKpAp1h7moft2bBKiYQDulSOyw6TJ6blf0gP97qC78yTvAGPHeXfGsgEb8oX-/exec";

// Fetch initial data (GET is safe, no need for no-cors)
async function init(){
  try {
    const res = await fetch(`${API_URL}?action=getInitialData`);
    const data = await res.json();
    if(!data.ok){ alert("Error loading data"); return; }
    fillOptions("dealerSelect", data.dealers);
    fillOptions("prodCategory", data.categories);
  } catch(err){
    alert("Error loading data: " + err.message);
  }
}

function fillOptions(id,arr){
  const sel=document.getElementById(id);
  sel.innerHTML="";
  const def=document.createElement("option");
  def.value=""; def.textContent="-- select --";
  sel.appendChild(def);
  arr.forEach(v=>{
    const o=document.createElement("option"); o.value=v; o.textContent=v;
    sel.appendChild(o);
  });
}

// Add dealer/category/product (POST → no-cors → then refresh via GET)
async function addDealer(){
  const name=document.getElementById("dealerName").value.trim();
  if(!name){ alert("Enter dealer name"); return; }
  await fetch(API_URL, {
    method: "POST", mode: "no-cors",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ action:"addDealer", name })
  });

  document.getElementById("dealerName").value="";
  init(); // refresh list
}

async function addCategory(){
  const name=document.getElementById("categoryName").value.trim();
  if(!name){ alert("Enter category name"); return; }
  await fetch(API_URL, {
    method: "POST", mode: "no-cors",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ action:"addCategory", name })
  });

  document.getElementById("categoryName").value="";
  init();
}

async function addProduct(){
  const product=document.getElementById("prodName").value.trim();
  const category=document.getElementById("prodCategory").value;
  const size=document.getElementById("prodSize").value.trim();
  if(!product||!category||!size){ alert("Fill all fields"); return; }
  await fetch(API_URL, {
    method: "POST", mode: "no-cors",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({action:"addProduct", product, category, size})
  });
  document.getElementById("prodName").value="";
  document.getElementById("prodSize").value="";
  init();
}

// Load dealer rates (GET)
async function loadDealerRates(){
  const dealer=document.getElementById("dealerSelect").value;
  if(!dealer){ alert("Select dealer"); return; }
  const res=await fetch(`${API_URL}?action=getDealerRates&dealer=${encodeURIComponent(dealer)}`);
  const d=await res.json();
  if(!d.ok){ alert("Error loading dealer data"); return; }
  renderRatesTable(d);
  document.getElementById("ratesArea").style.display="block";
}

function renderRatesTable(data){
  const wrap=document.getElementById("ratesTable"); wrap.innerHTML="";
  const tbl=document.createElement("table");
  const head=document.createElement("tr");
  ["Category","Product","Size",...data.wefDates,"New Rate","Item Term"].forEach(h=>{
    const th=document.createElement("th"); th.textContent=h; head.appendChild(th);
  });
  tbl.appendChild(head);

  data.products.forEach((p,idx)=>{
    const tr=document.createElement("tr");
    [p.category,p.product,p.size].forEach(v=>{
      const td=document.createElement("td"); td.textContent=v; tr.appendChild(td);
    });
    data.wefDates.forEach(wef=>{
      const td=document.createElement("td");
      const key=`${p.product}||${p.category}||${p.size}`;
      const cell=(data.rates[wef]&&data.rates[wef][key])?data.rates[wef][key]:null;
      td.textContent=cell?`${cell.rate} | ${cell.term}d`:"—";
      tr.appendChild(td);
    });
    const tdNew=document.createElement("td");
    tdNew.innerHTML=`<input type="number" id="rate_${idx}"/>`; tr.appendChild(tdNew);
    const tdTerm=document.createElement("td");
    tdTerm.innerHTML=`<select id="term_${idx}" disabled><option>15</option><option>30</option></select>`;
    tr.appendChild(tdTerm);
    tbl.appendChild(tr);
  });
  wrap.appendChild(tbl);

  document.getElementById("applyTerm").onchange=(e)=>{
    const enable=e.target.value==="per-item";
    data.products.forEach((_,i)=>{
      document.getElementById(`term_${i}`).disabled=!enable;
    });
  };
  wrap.dataset.products=JSON.stringify(data.products);
}

// Save rates (POST → no-cors → then re-fetch with GET)
async function submitNewRates(){
  const dealer=document.getElementById("dealerSelect").value;
  const wef=document.getElementById("wefInput").value;
  const applyTerm=document.getElementById("applyTerm").value;
  const globalTerm=document.getElementById("termSelect").value;
  const products=JSON.parse(document.getElementById("ratesTable").dataset.products||"[]");
  const items=[];
  products.forEach((p,i)=>{
    const rate=document.getElementById(`rate_${i}`).value;
    if(rate){
      const term=applyTerm==="per-item"?document.getElementById(`term_${i}`).value:null;
      items.push({...p,rate:Number(rate),term});
    }
  });
  await fetch(API_URL, {
    method: "POST", mode: "no-cors",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({action:"saveRates", payload:{dealer,wefDate:wef,applyTerm,globalTerm,items}})
  });
  loadDealerRates();
}

// Init on page load
init();
