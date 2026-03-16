// viewRates.js
const API_URL = "https://script.google.com/macros/s/AKfycbybdjvFUnSGOqUeE2RWsqHBHmmC_KXG3JXxLMYH7zVDd8tmZZ3i_cw-SfwFVTaBfmVD/exec";

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

function isValidRate(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).trim();
  if (!s || s === "—") return false;
  const n = Number(s);
  if (!Number.isNaN(n) && n === 0) return false;
  return true;
}

function formatValue(val) {
  if (val === 0) return "0";
  const s = String(val ?? "").trim();
  return s && s !== "—" ? s : "—";
}

function formatNumber_(n) {
  const rounded = Math.round(n * 1000) / 1000;
  const s = String(rounded);
  return s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function formatGolaPrice(base, add) {
  if (!isValidRate(base) || !isValidRate(add)) return "—";
  const baseNum = Number(base);
  const addNum = Number(add);
  if (Number.isNaN(baseNum) || Number.isNaN(addNum)) return "—";
  const total = baseNum + addNum;
  return `${formatNumber_(baseNum)} + ${formatNumber_(addNum)} = ${formatNumber_(total)}`;
}

function formatTermValue(val) {
  const s = formatValue(val);
  if (s === "—") return s;
  return s.endsWith("d") ? s : `${s}d`;
}

function formatCd(cell) {
  if (!cell) return "—";
  const raw = cell.cdValue !== undefined ? cell.cdValue : (cell.cd !== undefined ? cell.cd : "");
  const cleaned = formatValue(raw);
  return cleaned === "—" ? "Net Rates" : cleaned;
}

function extractLatestRecord(item, data = LAST_DATA) {
  if (!data || !item) return { wef: "", cell: null };
  const allWefs = Array.isArray(data._wefAll)
    ? data._wefAll
    : (Array.isArray(data.wefDates) ? data.wefDates : []);
  const key = `${item.product}||${item.category}||${item.size}`;
  for (let i = allWefs.length - 1; i >= 0; i--) {
    const wef = allWefs[i];
    const cell = data.rates?.[wef]?.[key];
    if (cell && isValidRate(cell.rate)) return { wef, cell };
  }
  return { wef: "", cell: null };
}

function itemHasAnyRate(item, data = LAST_DATA) {
  if (!data || !item) return false;
  const allWefs = Array.isArray(data._wefAll)
    ? data._wefAll
    : (Array.isArray(data.wefDates) ? data.wefDates : []);
  const key = `${item.product}||${item.category}||${item.size}`;
  return allWefs.some((wef) => isValidRate(data.rates?.[wef]?.[key]?.rate));
}

function renderKVBlock(attrs) {
  const rows = Array.isArray(attrs)
    ? attrs
    : Object.entries(attrs || {}).map(([k, v]) => ({ k, v }));
  const body = rows
    .map(({ k, v }) => {
      return `<div class="kv-row"><span class="k">${escHtml(k)}</span><span class="v">${escHtml(formatValue(v))}</span></div>`;
    })
    .join("");
  return `<div class="kv">${body}</div>`;
}

function renderLatestNormalCell(item, data = LAST_DATA) {
  const latest = extractLatestRecord(item, data);
  const cell = latest.cell;
  const attrs = [
    { k: "WEF", v: formatValue(latest.wef) },
    { k: "Rate", v: formatValue(cell?.rate) },
    { k: "Term", v: formatTermValue(cell?.term) },
    { k: "GST", v: formatValue(cell?.gstType) },
    { k: "Freight", v: formatValue(cell?.freight) },
    { k: "CD", v: cell ? formatCd(cell) : "—" },
    { k: "Brand", v: formatValue(cell?.brand) }
  ];
  return renderKVBlock(attrs);
}

function renderLatestGolaCell(item, data = LAST_DATA) {
  const latest = extractLatestRecord(item, data);
  const cell = latest.cell;
  const golaExpr = cell
    ? formatGolaPrice(cell.rate, cell.golaAddPrice ?? cell.golaAdd ?? cell.gola)
    : "—";
  const attrs = [
    { k: "WEF", v: formatValue(latest.wef) },
    { k: "Rate", v: golaExpr },
    { k: "Term", v: formatTermValue(cell?.term) },
    { k: "GST", v: formatValue(cell?.gstType) },
    { k: "Freight", v: formatValue(cell?.freight) },
    { k: "CD", v: cell ? formatCd(cell) : "—" },
    { k: "Brand", v: formatValue(cell?.brand) }
  ];
  return renderKVBlock(attrs);
}

function hasGolaCell(cell) {
  const add = cell?.golaAddPrice ?? cell?.golaAdd ?? cell?.gola;
  return isValidRate(cell?.rate) && isValidRate(add);
}

function dealerHasAnyGola(data) {
  if (!data) return false;
  const allWefs = Array.isArray(data._wefAll)
    ? data._wefAll
    : (Array.isArray(data.wefDates) ? data.wefDates : []);
  for (const wef of allWefs) {
    const entries = data.rates?.[wef];
    if (!entries) continue;
    for (const key of Object.keys(entries)) {
      if (hasGolaCell(entries[key])) return true;
    }
  }
  return false;
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

/* ========= Load dealer rates (AUTO REFRESH READY) ========= */
async function loadDealerRates(opts = {}) {
  const silent = !!opts.silent;

  // ---- internal auto-refresh helpers (no extra patches needed) ----
  const AUTO_REFRESH_MS = 20000;

  function startAutoRefresh() {
    // Restart interval cleanly
    if (loadDealerRates._autoId) clearInterval(loadDealerRates._autoId);

    loadDealerRates._autoId = setInterval(() => {
      // prevent overlapping refresh calls
      if (loadDealerRates._isAutoFetching) return;

      const dealerNow = $("#dealerSelect")?.value?.trim();
      if (!dealerNow) return; // no dealer selected

      loadDealerRates._isAutoFetching = true;
      loadDealerRates({ silent: true })
        .catch(() => {}) // silent refresh me errors ignore
        .finally(() => {
          loadDealerRates._isAutoFetching = false;
        });
    }, AUTO_REFRESH_MS);

    // cleanup on unload (optional but nice)
    if (!loadDealerRates._cleanupBound) {
      loadDealerRates._cleanupBound = true;
      window.addEventListener("beforeunload", () => {
        if (loadDealerRates._autoId) clearInterval(loadDealerRates._autoId);
      });
    }
  }

  const dealer = $("#dealerSelect")?.value?.trim();
  if (!dealer) {
    if (!silent) showToast("Select dealer", "error");
    return;
  }

  const btn = $("#getDataBtn");

  try {
    if (!silent) {
      setBtnLoading(btn, true);
      showPageLoader(true);
    }

    const res = await safeFetch(
      `${API_URL}?action=getDealerRates&dealer=${encodeURIComponent(dealer)}`
    );

    const d = await res.json();
    if (!d.ok) throw new Error("Bad dealer data");

    LAST_DATA = d;

    // keep user's current UI selections (and fallback safely)
    VIEW_MODE = $("#viewMode")?.value || VIEW_MODE || "compact";
    WEF_MODE = $("#filterWef")?.value || WEF_MODE || "latest";

    $("#ratesArea")?.classList.remove("hide");

    // (safe) option fills + render
    fillCategoryOptions();
    fillProductOptions();
    fillWefOptions();

    renderRatesView(getViewData());
    applyFilters();

    // auto refresh starts only after a successful manual load
    if (!silent) startAutoRefresh();
  } catch (err) {
    console.error(err);
    if (!silent) showToast("Error loading dealer data", "error");
  } finally {
    if (!silent) {
      setBtnLoading(btn, false);
      showPageLoader(false);
    }
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
  data._hasGola = dealerHasAnyGola(data);

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
function getGolaExpression(cell) {
  if (!cell) return "";
  const expr = formatGolaPrice(cell.rate, cell.golaAddPrice ?? cell.golaAdd ?? cell.gola);
  return expr === "—" ? "" : expr;
}

function cellStackHtml(cell, opts = {}) {
  if (!cell) return `<div class="cell-empty">—</div>`;
  const showGola = !!opts.showGola;

  const rate = formatValue(cell.rate);
  const term = formatTermValue(cell.term);
  const gst = formatValue(cell.gstType);
  const freight = formatValue(cell.freight);
  const cd = formatCd(cell);
  const brand = formatValue(cell.brand);
  const golaExpr = showGola
    ? formatGolaPrice(cell.rate, cell.golaAddPrice ?? cell.golaAdd ?? cell.gola)
    : "—";

  return `
    <div class="cell-stack">
      <div class="cell-line cell-rate"><span class="cell-key">Rate</span><span class="cell-val">${escHtml(rate)}</span></div>
      <div class="cell-line"><span class="cell-key">Term</span><span class="cell-val">${escHtml(term)}</span></div>
      <div class="cell-line"><span class="cell-key">GST</span><span class="cell-val">${escHtml(gst)}</span></div>
      <div class="cell-line"><span class="cell-key">Freight</span><span class="cell-val">${escHtml(freight)}</span></div>
      <div class="cell-line"><span class="cell-key">CD</span><span class="cell-val">${escHtml(cd)}</span></div>
      <div class="cell-line"><span class="cell-key">Brand</span><span class="cell-val">${escHtml(brand)}</span></div>
      ${golaExpr !== "—" ? `<div class="cell-line"><span class="cell-key">Gola Service Price</span><span class="cell-val gola-price golaGreen">${escHtml(golaExpr)}</span></div>` : ""}
    </div>
  `;
}

function pillsHtml(cell, opts = {}) {
  const wef = formatValue(opts.wef);
  const term = cell ? formatTermValue(cell.term) : "—";
  const gst = cell ? formatValue(cell.gstType) : "—";
  const freight = cell ? formatValue(cell.freight) : "—";
  const cd = cell ? formatCd(cell) : "—";
  const brand = cell ? formatValue(cell.brand) : "—";

  return `
    <div class="pills">
      ${wef !== "—" ? `<span class="pill"><span class="k">WEF</span><span class="v">${escHtml(wef)}</span></span>` : ""}
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
  return !!(cell && isValidRate(cell.rate));
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

    const hasAnyRate = itemHasAnyRate(p, { ...data, _wefAll: allWefs });
    const wefsWithRate = listWefsWithRate({ ...data, _wefAll: allWefs }, key);

    let showWef = "";
    let showCell = null;
    let modeLabel = "Latest";

    if (data._wefMode === "single") {
      showWef = (data._selectedWef || viewWefs[0] || "").trim();
      showCell = showWef ? data.rates?.[showWef]?.[key] : null;
      modeLabel = showWef ? "Selected" : "No rates";
    } else {
      const latest = extractLatestRecord(p, { ...data, _wefAll: allWefs });
      showWef = latest.wef || "";
      showCell = latest.cell || null;
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
        <div class="product-meta">${escHtml(p.category || "")} > ${escHtml(p.size || "")}</div>
      </div>
      <div class="badge">${showWef ? `WEF ${escHtml(showWef)}` : "WEF --"}</div>
    `;
    card.appendChild(header);

    const normalRate = showCell ? formatValue(showCell.rate) : "—";
    const hasDealerGola = !!data._hasGola;
    const golaRate = showCell
      ? formatGolaPrice(showCell.rate, showCell.golaAddPrice ?? showCell.golaAdd ?? showCell.gola)
      : "—";
    const attrs = [
      { k: "WEF", v: formatValue(showWef) },
      { k: "Term", v: formatTermValue(showCell?.term) },
      { k: "GST", v: formatValue(showCell?.gstType) },
      { k: "Freight", v: formatValue(showCell?.freight) },
      { k: "CD", v: showCell ? formatCd(showCell) : "—" },
      { k: "Brand", v: formatValue(showCell?.brand) }
    ];

    const current = document.createElement("div");
    current.className = "current";
    current.innerHTML = `
      <div class="latest-split ${hasDealerGola ? "" : "single"}">
        <div class="latest-block">
          <div class="price-label">Normal</div>
          <div class="priceBig ${normalRate === "—" ? "price-empty" : ""}">${escHtml(normalRate)}</div>
          <div class="muted">${escHtml(modeLabel)}</div>
        </div>
        ${hasDealerGola ? `
          <div class="latest-block">
            <div class="price-label">Gola Service Price</div>
            <div class="priceBig ${golaRate === "—" ? "price-empty" : "gola-price golaGreen"}">${escHtml(golaRate)}</div>
          </div>
        ` : ""}
      </div>
      <div class="divider"></div>
      <div class="attr-block">
        ${renderKVBlock(attrs)}
      </div>
    `;
    card.appendChild(current);

    if (data._wefMode !== "single" && hasAnyRate) {
      const others = wefsWithRate.filter((d) => d !== showWef).slice().reverse();
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
  const hasDealerGola = !!data._hasGola;

  ["Category", "Product", "Size"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    th.rowSpan = hasWefs ? 2 : 1;
    headTop.appendChild(th);
  });

  wefs.forEach((wef) => {
    const thGroup = document.createElement("th");
    thGroup.textContent = wef;
    thGroup.colSpan = hasDealerGola ? 2 : 1;
    headTop.appendChild(thGroup);

    const thRate = document.createElement("th");
    thRate.textContent = "Rate";
    headSub.appendChild(thRate);

    if (hasDealerGola) {
      const thGola = document.createElement("th");
      thGola.textContent = "Gola Service Price";
      headSub.appendChild(thGola);
    }
  });

  thead.appendChild(headTop);
  if (hasWefs) thead.appendChild(headSub);
  tbl.appendChild(thead);

  const tbody = document.createElement("tbody");

  (data.products || []).forEach((p) => {
    const tr = document.createElement("tr");
    tr.dataset.hasRate = itemHasAnyRate(p, data) ? "1" : "0";

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

      if (hasDealerGola) {
        const tdGola = document.createElement("td");
        tdGola.className = "gola-cell";
        const golaExpr = getGolaExpression(cell);
        tdGola.innerHTML = golaExpr ? `<div class="gola-price golaGreen">${escHtml(golaExpr)}</div>` : "";
        tr.appendChild(tdGola);
      }
    });

    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
}


/* ========= Table (Latest per-item) ========= */
function cellStackHtmlWithWef(wef, cell, opts = {}) {
  if (!cell) return `<div class="cell-stack"><div class="cell-line"><span class="cell-key">WEF</span><span class="cell-val">--</span></div><div class="cell-empty">--</div></div>`;
  return `
    <div class="cell-stack">
      <div class="cell-line"><span class="cell-key">WEF</span><span class="cell-val">${escHtml(wef || "--")}</span></div>
      ${cellStackHtml(cell, opts)}
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

  ["Category", "Product", "Size"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });

  const hasDealerGola = !!data._hasGola;

  const thLatest = document.createElement("th");
  thLatest.textContent = "Latest (Normal)";
  thLatest.className = "latest-col";
  trh.appendChild(thLatest);

  if (hasDealerGola) {
    const thGola = document.createElement("th");
    thGola.textContent = "Latest (Gola Service Price)";
    thGola.className = "gola-col";
    trh.appendChild(thGola);
  }

  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement("tbody");
  (data.products || []).forEach((p) => {
    const tr = document.createElement("tr");

    tr.dataset.hasRate = itemHasAnyRate(p, data) ? "1" : "0";

    const tdCat = document.createElement("td");
    tdCat.textContent = p.category || "";
    tr.appendChild(tdCat);

    const tdProd = document.createElement("td");
    tdProd.textContent = p.product || "";
    tr.appendChild(tdProd);

    const tdSize = document.createElement("td");
    tdSize.textContent = p.size || "";
    tr.appendChild(tdSize);

    const tdLatest = document.createElement("td");
    tdLatest.className = "wef-cell latest-col";
    tdLatest.innerHTML = renderLatestNormalCell(p, data);
    tr.appendChild(tdLatest);

    if (hasDealerGola) {
      const tdGola = document.createElement("td");
      tdGola.className = "wef-cell gola-col";
      tdGola.innerHTML = renderLatestGolaCell(p, data);
      tr.appendChild(tdGola);
    }

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
