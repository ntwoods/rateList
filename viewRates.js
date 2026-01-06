// viewRates.js
const API_URL = "https://script.google.com/macros/s/AKfycbyaIUmvKpAp1h7moft2bBKiYQDulSOyw6TJ6blf0gP97qC78yTvAGPHeXfGsgEb8oX-/exec";

/* ========= Helpers ========= */
const $ = (sel) => document.querySelector(sel);
const norm = (v) => String(v ?? "").trim().toLowerCase();

function showToast(msg, type = "success") {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 1800);
}

function showPageLoader(show) {
  $("#pageLoader")?.classList.toggle("hide", !show);
}

function setBtnLoading(btn, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.classList.toggle("loading", isLoading);
}

function safeFetch(url, opts) {
  return fetch(url, opts);
}

function isMobile() {
  return window.innerWidth <= 920;
}

function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ========= State ========= */
let LAST_DATA = null;
let FILTERS_BOUND = false;

/* ========= Init: load dealers ========= */
async function init() {
  try {
    showPageLoader(true);
    const res = await safeFetch(`${API_URL}?action=getInitialData`);
    const data = await res.json();
    if (!data.ok) throw new Error("Init failed");

    const dl = document.getElementById("dealersList");
    if (dl) {
      dl.innerHTML = "";
      (data.dealers || []).forEach((v) => {
        const o = document.createElement("option");
        o.value = v;
        dl.appendChild(o);
      });
    }
  } catch (err) {
    console.error(err);
    showToast("Error loading data", "error");
  } finally {
    showPageLoader(false);
  }
}

/* ========= Load dealer rates ========= */
async function loadDealerRates() {
  const dealer = $("#dealerSelect")?.value?.trim();
  if (!dealer) return showToast("Select dealer", "error");

  const btn = $("#getDataBtn");
  try {
    setBtnLoading(btn, true);
    showPageLoader(true);

    const res = await safeFetch(
      `${API_URL}?action=getDealerRates&dealer=${encodeURIComponent(dealer)}`
    );
    const d = await res.json();
    if (!d.ok) throw new Error("Bad dealer data");

    LAST_DATA = d;
    $("#ratesArea")?.classList.remove("hide");
    renderRatesView(d);
    applyFilters(); // apply current filter selection
  } catch (err) {
    console.error(err);
    showToast("Error loading dealer data", "error");
  } finally {
    setBtnLoading(btn, false);
    showPageLoader(false);
  }
}

/* ========= Filters ========= */
function bindFiltersOnce() {
  if (FILTERS_BOUND) return;
  const catSel = $("#filterCategory");
  const prodSel = $("#filterProduct");
  if (!catSel || !prodSel) return;

  FILTERS_BOUND = true;

  catSel.addEventListener("change", () => {
    fillProductOptions();
    applyFilters();
  });

  prodSel.addEventListener("change", () => {
    applyFilters();
  });
}

function fillCategoryOptions() {
  const catSel = $("#filterCategory");
  if (!catSel || !LAST_DATA) return;

  const current = catSel.value || "";
  const cats = Array.from(
    new Set((LAST_DATA.products || []).map((p) => p.category).filter(Boolean))
  ).sort((a, b) => String(a).localeCompare(String(b)));

  catSel.innerHTML =
    `<option value="">All</option>` +
    cats
      .map((c) => `<option value="${String(c).replaceAll('"', "&quot;")}">${c}</option>`)
      .join("");

  if (current && cats.includes(current)) catSel.value = current;
}

function fillProductOptions() {
  const catSel = $("#filterCategory");
  const prodSel = $("#filterProduct");
  if (!prodSel || !LAST_DATA) return;

  const selectedCat = catSel?.value || "";
  const current = prodSel.value || "";

  const base = selectedCat
    ? (LAST_DATA.products || []).filter((p) => norm(p.category) === norm(selectedCat))
    : (LAST_DATA.products || []);

  const prods = Array.from(new Set(base.map((p) => p.product).filter(Boolean)))
    .sort((a, b) => String(a).localeCompare(String(b)));

  prodSel.innerHTML =
    `<option value="">All</option>` +
    prods
      .map((p) => `<option value="${String(p).replaceAll('"', "&quot;")}">${p}</option>`)
      .join("");

  if (current && prods.includes(current)) prodSel.value = current;
  else if (current) prodSel.value = "";
}

function applyFilters() {
  const cat = $("#filterCategory")?.value || "";
  const prod = $("#filterProduct")?.value || "";

  // Cards
  document.querySelectorAll(".product-card").forEach((card) => {
    const ok =
      (!cat || norm(card.dataset.category) === norm(cat)) &&
      (!prod || norm(card.dataset.product) === norm(prod));
    card.style.display = ok ? "" : "none";
  });

  // Table rows
  const table = $("#ratesTable")?.querySelector("table");
  if (table) {
    table.querySelectorAll("tbody tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td");
      const rowCat = tds[0]?.textContent ?? "";
      const rowProd = tds[1]?.textContent ?? "";
      const ok =
        (!cat || norm(rowCat) === norm(cat)) &&
        (!prod || norm(rowProd) === norm(prod));
      tr.style.display = ok ? "" : "none";
    });
  }
}

/* ========= Responsive renderer ========= */
function renderRatesView(data) {
  if (isMobile()) {
    $("#ratesTableWrap")?.classList.add("hide");
    $("#ratesCards")?.classList.remove("hide");
    renderCards(data);
  } else {
    $("#ratesCards")?.classList.add("hide");
    $("#ratesTableWrap")?.classList.remove("hide");
    renderTable(data);
  }

  bindFiltersOnce();
  fillCategoryOptions();
  fillProductOptions();
}

/* ========= Field formatting ========= */
function formatCd(cell) {
  if (!cell) return "—";
  const t = cell.cdType;
  const v = cell.cdValue;
  if (!t && !v) return "—";
  if (t === "CD Included") return v ? `CD Included (${v})` : "CD Included";
  if (t && v) return `${t} (${v})`;
  return t || v || "—";
}

function cellStackHtml(cell) {
  if (!cell) return `<div class="cell-empty">—</div>`;

  const rate = cell.rate ?? "—";
  const term = cell.term ? `${cell.term}d` : "—";
  const gst = cell.gstType || "—";
  const freight = cell.freight || "—";
  const cd = formatCd(cell);
  const brand = cell.brand || "—";

  return `
    <div class="cell-stack">
      <div class="cell-line cell-rate"><span class="cell-key">Rate</span><span class="cell-val">${rate}</span></div>
      <div class="cell-line"><span class="cell-key">Term</span><span class="cell-val">${term}</span></div>
      <div class="cell-line"><span class="cell-key">GST</span><span class="cell-val">${gst}</span></div>
      <div class="cell-line"><span class="cell-key">Freight</span><span class="cell-val">${freight}</span></div>
      <div class="cell-line"><span class="cell-key">CD</span><span class="cell-val">${cd}</span></div>
      <div class="cell-line"><span class="cell-key">Brand</span><span class="cell-val">${brand}</span></div>
    </div>
  `;
}

/* ========= Cards (mobile) ========= */
function renderCards(data) {
  const cards = $("#ratesCards");
  if (!cards) return;
  cards.innerHTML = "";

  const hasWef = Array.isArray(data.wefDates) && data.wefDates.length > 0;

  (data.products || []).forEach((p) => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.dataset.category = p.category;
    card.dataset.product = p.product;

    const header = document.createElement("div");
    header.className = "product-header";
    header.innerHTML = `
      <div class="product-title">${p.product}</div>
      <div class="product-meta">${p.category} • ${p.size}</div>
    `;
    card.appendChild(header);

    const past = document.createElement("div");
    past.className = "past-rates";
    past.innerHTML = `<div class="past-title">Past Rates</div>`;

    if (hasWef) {
      data.wefDates.forEach((wef) => {
        const key = `${p.product}||${p.category}||${p.size}`;
        const cell = data.rates?.[wef]?.[key];

        const block = document.createElement("div");
        block.className = "wef-block";
        block.innerHTML = `
          <div class="wef-date">${wef}</div>
          <div class="wef-body">${cellStackHtml(cell)}</div>
        `;
        past.appendChild(block);
      });
    } else {
      const line = document.createElement("div");
      line.className = "past-item";
      line.textContent = "No previous rates found.";
      past.appendChild(line);
    }

    card.appendChild(past);
    cards.appendChild(card);
  });
}

/* ========= Table (desktop) ========= */
function renderTable(data) {
  const wrap = $("#ratesTable");
  if (!wrap) return;
  wrap.innerHTML = "";

  const tbl = document.createElement("table");

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  ["Category", "Product", "Size"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });

  (data.wefDates || []).forEach((wef) => {
    const th = document.createElement("th");
    th.textContent = wef;
    trh.appendChild(th);
  });

  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement("tbody");

  (data.products || []).forEach((p) => {
    const tr = document.createElement("tr");

    const tdCat = document.createElement("td");
    tdCat.textContent = p.category;
    tr.appendChild(tdCat);

    const tdProd = document.createElement("td");
    tdProd.textContent = p.product;
    tr.appendChild(tdProd);

    const tdSize = document.createElement("td");
    tdSize.textContent = p.size;
    tr.appendChild(tdSize);

    (data.wefDates || []).forEach((wef) => {
      const key = `${p.product}||${p.category}||${p.size}`;
      const cell = data.rates?.[wef]?.[key];

      const td = document.createElement("td");
      td.className = "wef-cell";
      td.innerHTML = cellStackHtml(cell);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
}

/* ========= Resize: re-render ========= */
window.addEventListener(
  "resize",
  debounce(() => {
    if (!LAST_DATA) return;
    renderRatesView(LAST_DATA);
    applyFilters();
  }, 200)
);

/* ========= Boot ========= */
init();
