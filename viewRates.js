// viewRates.js
const API_URL = "https://script.google.com/macros/s/AKfycbyaIUmvKpAp1h7moft2bBKiYQDulSOyw6TJ6blf0gP97qC78yTvAGPHeXfGsgEb8oX-/exec";

/* ========= Helpers ========= */
const $ = (sel) => document.querySelector(sel);
const norm = (v) => String(v ?? "").trim().toLowerCase();

function escHtml(v) {
  const s = String(v ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === "";
}

/* ========= State ========= */
let LAST_DATA = null;
let FILTERS_BOUND = false;

// UI state
let VIEW_MODE = "compact"; // compact | matrix
let WEF_MODE = "latest";   // latest | all | yyyy-mm-dd
let SEARCH_Q = "";
let HIDE_NO_RATE = false;

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

    // default: latest WEF + compact
    VIEW_MODE = $("#viewMode")?.value || "compact";
    WEF_MODE = $("#filterWef")?.value || "latest";

    $("#ratesArea")?.classList.remove("hide");
    fillCategoryOptions();
    fillProductOptions();
    fillWefOptions();

    renderRatesView(getViewData());
    applyFilters();
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
  const search = $("#searchInput");
  const wefSel = $("#filterWef");
  const viewSel = $("#viewMode");

  if (!catSel || !prodSel || !search || !wefSel || !viewSel) return;
  FILTERS_BOUND = true;

  catSel.addEventListener("change", () => {
    fillProductOptions();
    applyFilters();
  });

  prodSel.addEventListener("change", () => {
    applyFilters();
  });

  search.addEventListener(
    "input",
    debounce(() => {
      SEARCH_Q = search.value || "";
      applyFilters();
    }, 180)
  );

  wefSel.addEventListener("change", () => {
    WEF_MODE = wefSel.value || "latest";
    fillWefOptions(); // keep selection stable if list changes
    renderRatesView(getViewData());
    applyFilters();
  });

  viewSel.addEventListener("change", () => {
    VIEW_MODE = viewSel.value || "compact";
    renderRatesView(getViewData());
    applyFilters();
  });

  // Hide items with no rates (toggle)
  const noRateBtn = $("#toggleNoRate");
  if (noRateBtn) {
    const sync = () => {
      noRateBtn.classList.toggle("active", HIDE_NO_RATE);
      noRateBtn.textContent = HIDE_NO_RATE ? "Show no-rate" : "Hide no-rate";
    };
    sync();
    noRateBtn.addEventListener("click", () => {
      HIDE_NO_RATE = !HIDE_NO_RATE;
      sync();
      applyFilters();
    });
  }
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
      .map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`)
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
      .map((p) => `<option value="${escHtml(p)}">${escHtml(p)}</option>`)
      .join("");

  if (current && prods.includes(current)) prodSel.value = current;
  else if (current) prodSel.value = "";
}

function fillWefOptions() {
  const wefSel = $("#filterWef");
  if (!wefSel || !LAST_DATA) return;

  const all = Array.isArray(LAST_DATA.wefDates) ? LAST_DATA.wefDates : [];
  const current = WEF_MODE || wefSel.value || "latest";

  const opts = [];
  opts.push(`<option value="latest">Latest only</option>`);
  opts.push(`<option value="all">All history</option>`);
  if (all.length) {
    opts.push(`<option value="" disabled>──────────</option>`);
    all.slice().reverse().forEach((d) => {
      opts.push(`<option value="${escHtml(d)}">${escHtml(d)}</option>`);
    });
  }

  wefSel.innerHTML = opts.join("");
  if (current && (current === "latest" || current === "all" || all.includes(current))) {
    wefSel.value = current;
  } else {
    wefSel.value = "latest";
    WEF_MODE = "latest";
  }
}

function setResultCount(n) {
  const el = $("#resultCount");
  if (el) el.textContent = `${n} item(s)`;
}

function applyFilters() {
  const cat = $("#filterCategory")?.value || "";
  const prod = $("#filterProduct")?.value || "";
  const q = norm(SEARCH_Q);

  let visible = 0;

  // Cards
  document.querySelectorAll(".product-card").forEach((card) => {
    const ok =
      (!cat || norm(card.dataset.category) === norm(cat)) &&
      (!prod || norm(card.dataset.product) === norm(prod)) &&
      (!q || norm(card.dataset.search || "").includes(q)) &&
      (!HIDE_NO_RATE || card.dataset.hasRate === "1");

    card.style.display = ok ? "" : "none";
    if (ok) visible++;
  });

  // Table rows (matrix)
  const table = $("#ratesTable")?.querySelector("table");
  if (table) {
    visible = 0;
    table.querySelectorAll("tbody tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td");
      const rowCat = tds[0]?.textContent ?? "";
      const rowProd = tds[1]?.textContent ?? "";
      const rowSize = tds[2]?.textContent ?? "";
      const hay = `${rowCat} ${rowProd} ${rowSize}`;

      const ok =
        (!cat || norm(rowCat) === norm(cat)) &&
        (!prod || norm(rowProd) === norm(prod)) &&
        (!q || norm(hay).includes(q)) &&
        (!HIDE_NO_RATE || tr.dataset.hasRate === "1");

      tr.style.display = ok ? "" : "none";
      if (ok) visible++;
    });
  }

  setResultCount(visible);
}

/* ========= ViewData (WEF filter) ========= */
function getViewData() {
  if (!LAST_DATA) return null;

  const all = Array.isArray(LAST_DATA.wefDates) ? LAST_DATA.wefDates : [];
  if (!all.length) return { ...LAST_DATA, _wefMode: "none", _wefAll: [] };

  // NOTE:
  // - For Latest-only mode, we DO NOT shrink wefDates to one global date.
  //   We compute latest WEF per-item from _wefAll, so items with older latest still show.
  // - For All-history mode, we keep all dates.
  // - For a specific WEF date, we show that one date only.

  if (WEF_MODE === "latest") {
    return { ...LAST_DATA, wefDates: all, _wefMode: "latest", _wefAll: all };
  }
  if (WEF_MODE === "all") {
    return { ...LAST_DATA, wefDates: all, _wefMode: "all", _wefAll: all };
  }
  // specific date
  return { ...LAST_DATA, wefDates: [WEF_MODE], _wefMode: "single", _wefAll: all, _selectedWef: WEF_MODE };
}

/* ========= Responsive renderer ========= */
function renderRatesView(data) {
  if (!data) return;

  bindFiltersOnce();
  fillCategoryOptions();
  fillProductOptions();
  fillWefOptions();

  const wantsMatrix = VIEW_MODE === "matrix" && !isMobile();

  if (wantsMatrix) {
    $("#ratesTableWrap")?.classList.remove("hide");
    $("#ratesCards")?.classList.add("hide");
    if (data._wefMode === "latest") renderTableLatest(data);
    else renderTable(data);
  } else {
    $("#ratesTableWrap")?.classList.add("hide");
    $("#ratesCards")?.classList.remove("hide");
    renderCards(data);
  }
}

/* ========= Field formatting ========= */
function toNumber_(v) {
  if (v === 0) return 0;
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function formatNumber_(n) {
  const rounded = Math.round(n * 1000) / 1000;
  const s = String(rounded);
  return s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function getGolaExpression(cell) {
  if (!cell) return "";
  const rateNum = toNumber_(cell.rate);
  const golaNum = toNumber_(cell.golaAddPrice ?? cell.golaAdd ?? cell.gola);
  if (rateNum === null || golaNum === null) return "";
  const total = rateNum + golaNum;
  return `${formatNumber_(rateNum)} + ${formatNumber_(golaNum)} = ${formatNumber_(total)}`;
}

function formatTerm(cell) {
  if (!cell) return "—";
  if (isBlank(cell.term)) return "—";
  return `${cell.term}d`;
}

// CD concept:
// - if cell present AND cd is blank -> show "Net Rates"
// - if cell present AND cd has value (e.g. 5%) -> show that
// - if cell missing -> "—"
function formatCd(cell) {
  if (!cell) return "—";
  const raw = (cell.cdValue !== undefined ? cell.cdValue : (cell.cd !== undefined ? cell.cd : ""));
  return isBlank(raw) ? "Net Rates" : String(raw).trim();
}

function pickText(v, fallback = "—") {
  if (v === 0) return "0";
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

function cellStackHtml(cell, opts = {}) {
  if (!cell) return `<div class="cell-empty">—</div>`;
  const showGola = !!opts.showGola;

  const rate = pickText(cell.rate, "—");
  const term = formatTerm(cell);
  const gst = pickText(cell.gstType, "—");
  const freight = pickText(cell.freight, "—");
  const cd = formatCd(cell);
  const brand = pickText(cell.brand, "—");
  const golaExpr = showGola ? getGolaExpression(cell) : "";

  return `
    <div class="cell-stack">
      <div class="cell-line cell-rate"><span class="cell-key">Rate</span><span class="cell-val">${escHtml(rate)}</span></div>
      <div class="cell-line"><span class="cell-key">Term</span><span class="cell-val">${escHtml(term)}</span></div>
      <div class="cell-line"><span class="cell-key">GST</span><span class="cell-val">${escHtml(gst)}</span></div>
      <div class="cell-line"><span class="cell-key">Freight</span><span class="cell-val">${escHtml(freight)}</span></div>
      <div class="cell-line"><span class="cell-key">CD</span><span class="cell-val">${escHtml(cd)}</span></div>
      <div class="cell-line"><span class="cell-key">Brand</span><span class="cell-val">${escHtml(brand)}</span></div>
      ${golaExpr ? `<div class="cell-line"><span class="cell-key">Gola Service Price</span><span class="cell-val gola-price">${escHtml(golaExpr)}</span></div>` : ""}
    </div>
  `;
}

function pillsHtml(cell) {
  if (!cell) return `<div class="pills"><span class="pill"><span class="k">Rate</span><span class="v">—</span></span></div>`;

  const term = formatTerm(cell);
  const gst = pickText(cell.gstType, "—");
  const freight = pickText(cell.freight, "—");
  const cd = formatCd(cell);
  const brand = pickText(cell.brand, "—");

  return `
    <div class="pills">
      <span class="pill"><span class="k">Term</span><span class="v">${escHtml(term)}</span></span>
      <span class="pill gst"><span class="k">GST</span><span class="v">${escHtml(gst)}</span></span>
      <span class="pill"><span class="k">Freight</span><span class="v">${escHtml(freight)}</span></span>
      <span class="pill cd"><span class="k">CD</span><span class="v">${escHtml(cd)}</span></span>
      <span class="pill brand"><span class="k">Brand</span><span class="v">${escHtml(brand)}</span></span>
    </div>
  `;
}


/* ========= Rate discovery helpers ========= */
function hasRateCell(cell) {
  return !!(cell && !isBlank(cell.rate));
}

function listWefsWithRate(data, key) {
  const all = Array.isArray(data._wefAll) ? data._wefAll : (Array.isArray(data.wefDates) ? data.wefDates : []);
  return all.filter((wef) => hasRateCell(data.rates?.[wef]?.[key]));
}

function findLatestForKey(data, key) {
  const all = Array.isArray(data._wefAll) ? data._wefAll : (Array.isArray(data.wefDates) ? data.wefDates : []);
  for (let i = all.length - 1; i >= 0; i--) {
    const wef = all[i];
    const cell = data.rates?.[wef]?.[key];
    if (hasRateCell(cell)) return { wef, cell };
  }
  return null;
}

/* ========= Cards (Compact) ========= */
function renderCards(data) {
  const cards = $("#ratesCards");
  if (!cards) return;
  cards.innerHTML = "";

  // grid on desktop
  cards.classList.toggle("product-grid", !isMobile());

  const viewWefs = Array.isArray(data.wefDates) ? data.wefDates : [];
  const allWefs = Array.isArray(data._wefAll) ? data._wefAll : viewWefs;

  (data.products || []).forEach((p) => {
    const key = `${p.product}||${p.category}||${p.size}`;

    // hasRate must be computed across ALL dates (so Hide no-rate works even on specific WEF view)
    const wefsWithRate = listWefsWithRate({ ...data, _wefAll: allWefs }, key);
    const hasAnyRate = wefsWithRate.length > 0;

    // Determine which cell/date to show in the main card
    let showWef = "";
    let showCell = null;
    let modeLabel = "Latest";

    if (data._wefMode === "single") {
      // show only the selected WEF, but still keep hasAnyRate from full history
      showWef = (data._selectedWef || viewWefs[0] || "").trim();
      showCell = showWef ? data.rates?.[showWef]?.[key] : null;
      modeLabel = showWef ? "Selected" : "No rates";
    } else {
      // latest/all: show per-item latest WEF (this is what you asked for)
      const latest = findLatestForKey({ ...data, _wefAll: allWefs }, key);
      showWef = latest?.wef || "";
      showCell = latest?.cell || null;
      modeLabel = showWef ? "Latest" : "No rates";
    }

    const card = document.createElement("div");
    card.className = "product-card";
    card.dataset.category = p.category || "";
    card.dataset.product = p.product || "";
    card.dataset.size = p.size || "";
    card.dataset.search = `${p.category || ""} ${p.product || ""} ${p.size || ""}`;
    card.dataset.hasRate = hasAnyRate ? "1" : "0";

    const header = document.createElement("div");
    header.className = "product-header";
    header.innerHTML = `
      <div>
        <div class="product-title">${escHtml(p.product || "")}</div>
        <div class="product-meta">${escHtml(p.category || "")} • ${escHtml(p.size || "")}</div>
      </div>
      <div class="badge">${showWef ? `WEF ${escHtml(showWef)}` : "WEF —"}</div>
    `;
    card.appendChild(header);

    // current block
    const current = document.createElement("div");
    current.className = "current";
    const rateText = showCell ? pickText(showCell.rate, "—") : "—";
    const hasRate = hasRateCell(showCell);
    const golaExpr = getGolaExpression(showCell);
    const priceLine = hasRate ? `<div class="price-line">Price: ${escHtml(rateText)}</div>` : "";
    const golaLine = golaExpr ? `<div class="gola-line gola-price">Gola Service Price: ${escHtml(golaExpr)}</div>` : "";
    current.innerHTML = `
      <div class="current-top">
        <div class="${rateText === "—" ? "rate-empty" : "rate-big"}">${escHtml(rateText)}</div>
        <div class="muted">${escHtml(modeLabel)}</div>
      </div>
      ${priceLine}
      ${golaLine}
      ${pillsHtml(showCell)}
    `;
    card.appendChild(current);

    // History:
    // - In latest/all mode, show other WEFs where rate exists for this item
    // - In single mode, keep history hidden to match "only that WEF" view
    if (data._wefMode !== "single" && hasAnyRate) {
      const others = wefsWithRate.filter((d) => d !== showWef).slice().reverse(); // newest first
      if (others.length) {
        const details = document.createElement("details");
        details.className = "history";
        details.innerHTML = `<summary>History (${others.length})</summary>`;

        const body = document.createElement("div");
        body.className = "history-body";

        others.forEach((wef) => {
          const cell = data.rates?.[wef]?.[key];
          const row = document.createElement("div");
          row.className = "history-row";
          row.innerHTML = `
            <div class="history-date">${escHtml(wef)}</div>
            ${cellStackHtml(cell, { showGola: true })}
          `;
          body.appendChild(row);
        });

        details.appendChild(body);
        card.appendChild(details);
      }
    }

    cards.appendChild(card);
  });
}

/* ========= Table (Matrix) ========= */
function renderTable(data) {
  const wrap = $("#ratesTable");
  if (!wrap) return;
  wrap.innerHTML = "";

  const tbl = document.createElement("table");
  const thead = document.createElement("thead");
  const headTop = document.createElement("tr");
  const headSub = document.createElement("tr");
  headSub.className = "sub";

  const wefs = Array.isArray(data.wefDates) ? data.wefDates : [];
  const hasWefs = wefs.length > 0;

  ["Category", "Product", "Size"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    th.rowSpan = hasWefs ? 2 : 1;
    headTop.appendChild(th);
  });

  wefs.forEach((wef) => {
    const thGroup = document.createElement("th");
    thGroup.textContent = wef;
    thGroup.colSpan = 2;
    headTop.appendChild(thGroup);

    const thRate = document.createElement("th");
    thRate.textContent = "Rate";
    headSub.appendChild(thRate);

    const thGola = document.createElement("th");
    thGola.textContent = "Gola Service Price";
    headSub.appendChild(thGola);
  });

  thead.appendChild(headTop);
  if (hasWefs) thead.appendChild(headSub);
  tbl.appendChild(thead);

  const tbody = document.createElement("tbody");

  (data.products || []).forEach((p) => {
    const tr = document.createElement("tr");

    const tdCat = document.createElement("td");
    tdCat.textContent = p.category || "";
    tr.appendChild(tdCat);

    const tdProd = document.createElement("td");
    tdProd.textContent = p.product || "";
    tr.appendChild(tdProd);

    const tdSize = document.createElement("td");
    tdSize.textContent = p.size || "";
    tr.appendChild(tdSize);

    wefs.forEach((wef) => {
      const key = `${p.product}||${p.category}||${p.size}`;
      const cell = data.rates?.[wef]?.[key];

      const tdRate = document.createElement("td");
      tdRate.className = "wef-cell";
      tdRate.innerHTML = cellStackHtml(cell);
      tr.appendChild(tdRate);

      const tdGola = document.createElement("td");
      tdGola.className = "gola-cell";
      const golaExpr = getGolaExpression(cell);
      tdGola.innerHTML = golaExpr ? `<div class="gola-price">${escHtml(golaExpr)}</div>` : "";
      tr.appendChild(tdGola);
    });

    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
}


/* ========= Table (Latest per-item) ========= */
function cellStackHtmlWithWef(wef, cell) {
  if (!cell) return `<div class="cell-stack"><div class="cell-line"><span class="cell-key">WEF</span><span class="cell-val">—</span></div><div class="cell-empty">—</div></div>`;
  return `
    <div class="cell-stack">
      <div class="cell-line"><span class="cell-key">WEF</span><span class="cell-val">${escHtml(wef || "—")}</span></div>
      ${cellStackHtml(cell, { showGola: true })}
    </div>
  `;
}

function renderTableLatest(data) {
  const wrap = $("#ratesTable");
  if (!wrap) return;
  wrap.innerHTML = "";

  const tbl = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  ["Category", "Product", "Size", "Latest"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });

  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement("tbody");
  const allWefs = Array.isArray(data._wefAll) ? data._wefAll : (Array.isArray(data.wefDates) ? data.wefDates : []);

  (data.products || []).forEach((p) => {
    const tr = document.createElement("tr");

    // used by Hide no-rate toggle (computed across ALL WEFs)
    const keyAny = `${p.product}||${p.category}||${p.size}`;
    const hasAnyRate = allWefs.some((w) => hasRateCell(data.rates?.[w]?.[keyAny]));
    tr.dataset.hasRate = hasAnyRate ? "1" : "0";

    const tdCat = document.createElement("td");
    tdCat.textContent = p.category || "";
    tr.appendChild(tdCat);

    const tdProd = document.createElement("td");
    tdProd.textContent = p.product || "";
    tr.appendChild(tdProd);

    const tdSize = document.createElement("td");
    tdSize.textContent = p.size || "";
    tr.appendChild(tdSize);

    const td = document.createElement("td");
    td.className = "wef-cell";

    const latest = findLatestForKey({ ...data, _wefAll: allWefs }, keyAny);
    td.innerHTML = cellStackHtmlWithWef(latest?.wef || "", latest?.cell || null);

    tr.appendChild(td);
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
    renderRatesView(getViewData());
    applyFilters();
  }, 200)
);

/* ========= Boot ========= */
init();
