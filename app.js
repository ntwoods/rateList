// Replace with your GAS WebApp URL
const API_URL = "https://script.google.com/macros/s/AKfycb.../exec";

// Fetch initial data
async function init(){
  const res = await fetch(`${API_URL}?action=getInitialData`);
  const data = await res.json();
  if(!data.ok){alert("Error loading data");return;}
  fillOptions("dealerSelect", data.dealers);
  fillOptions("prodCategory", data.categories);
}
function fillOptions(id,arr){
  const sel=document.getElementById(id); sel.innerHTML="";
  arr.forEach(v=>{
    const o=document.createElement("option"); o.value=v;o.textContent=v; sel.appendChild(o);
  });
}

// Add dealer/category/product
async function addDealer(){
  const name=document.getElementById("dealerName").value;
  const res=await fetch(API_URL,{method:"POST",body:JSON.stringify({action:"addDealer",name})});
  const d=await res.json();
  document.getElementById("dealerMsg").textContent=d.message|| (d.created?"Added":"Exists");
  init();
}
async function addCategory(){
  const name=document.getElementById("categoryName").value;
  const res=await fetch(API_URL,{method:"POST",body:JSON.stringify({action:"addCategory",name})});
  const d=await res.json();
  document.getElementById("categoryMsg").textContent=d.message|| (d.created?"Added":"Exists");
  init();
}
async function addProduct(){
  const product=document.getElementById("prodName").value;
  const category=document.getElementById("prodCategory").value;
  const size=document.getElementById("prodSize").value;
  const res=await fetch(API_URL,{method:"POST",body:JSON.stringify({action:"addProduct",product,category,size})});
  const d=await res.json();
  document.getElementById("productMsg").textContent=d.message|| (d.created?"Added":"Exists");
  init();
}

// Load dealer rates
async function loadDealerRates(){
  const dealer=document.getElementById("dealerSelect").value;
  const res=await fetch(`${API_URL}?action=getDealerRates&dealer=${encodeURIComponent(dealer)}`);
  const d=await res.json();
  if(!d.ok){alert("Error");return;}
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

// Save rates
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
  const res=await fetch(API_URL,{method:"POST",body:JSON.stringify({action:"saveRates",payload:{dealer,wefDate:wef,applyTerm,globalTerm,items}})});
  const d=await res.json();
  document.getElementById("saveMsg").textContent=`Saved ${d.inserted}, Skipped ${d.skipped}`;
  loadDealerRates();
}

// Init
init();
