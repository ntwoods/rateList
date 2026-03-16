// viewRates.js
const API_URL = "https://script.google.com/macros/s/AKfycbzazzIRUjj-G39MAfRWx5fb0SXsP8OAu14nuzUa_tpX4Sj7Q1a2ZopHHh3tj47x_Plx0g/exec";

const VIEW_INIT_ACTION = "getViewInitialData";
const VIEW_RATES_ACTION = "getViewDealerRates";
const LEGACY_INIT_ACTION = "getInitialData";
const LEGACY_RATES_ACTION = "getDealerRates";

const DEFAULT_VIEW_MODE = "compact";
const DEFAULT_WEF_MODE = "latest";
const DEFAULT_HIDE_NO_RATE = true;
const OLD_RATE_CUTOFF = new Date(2026, 2, 15); // 16-03-2026
const NO_VALUE_TEXT = "—";

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

function fetchJson(url) {
  return safeFetch(url).then((res) => res.json());
}

function parseWefDateSafe(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return createValidDate_(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    return createValidDate_(Number(match[3]), Number(match[2]), Number(match[1]));
  }

  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return null;
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

function createValidDate_(year, month, day) {
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

function isOldRateWef(wef) {
  const d = parseWefDateSafe(wef);
  if (!d) return false;
  return d.getTime() < OLD_RATE_CUTOFF.getTime();
}

function toProductKey(item) {
  return `${item?.product || ""}||${item?.category || ""}||${item?.size || ""}`;
}

function isValidRate(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).trim();
  if (!s || s === NO_VALUE_TEXT) return false;
  const n = Number(s);
  if (!Number.isNaN(n) && n === 0) return false;
  return true;
}

function hasRateCell(cell) {
  return !!(cell && isValidRate(cell.rate));
}

function hasGolaCell(cell) {
  const add = cell?.golaAddPrice ?? cell?.golaAdd ?? cell?.gola;
  return isValidRate(cell?.rate) && isValidRate(add);
}

function formatValue(val) {
  if (val === 0) return "0";
  const s = String(val ?? "").trim();
  return s && s !== NO_VALUE_TEXT ? s : NO_VALUE_TEXT;
}

function formatNumber_(n) {
  const rounded = Math.round(n * 1000) / 1000;
  const s = String(rounded);
  return s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function formatGolaPrice(base, add) {
  if (!isValidRate(base) || !isValidRate(add)) return NO_VALUE_TEXT;
  const baseNum = Number(base);
  const addNum = Number(add);
  if (Number.isNaN(baseNum) || Number.isNaN(addNum)) return NO_VALUE_TEXT;
  const total = baseNum + addNum;
  return `${formatNumber_(baseNum)} + ${formatNumber_(addNum)} = ${formatNumber_(total)}`;
}

function formatTermValue(val) {
  const s = formatValue(val);
  if (s === NO_VALUE_TEXT) return s;
  return s.endsWith("d") ? s : `${s}d`;
}

function formatCd(cell) {
  if (!cell) return NO_VALUE_TEXT;
  const raw = cell.cdValue !== undefined ? cell.cdValue : (cell.cd !== undefined ? cell.cd : "");
  const cleaned = formatValue(raw);
  return cleaned === NO_VALUE_TEXT ? "Net Rates" : cleaned;
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

function cellStackHtml(cell, opts = {}) {
  if (!cell) return `<div class="cell-empty">${NO_VALUE_TEXT}</div>`;

  const showGola = !!opts.showGola;
  const rate = formatValue(cell.rate);
  const term = formatTermValue(cell.term);
  const gst = formatValue(cell.gstType);
  const freight = formatValue(cell.freight);
  const cd = formatCd(cell);
  const brand = formatValue(cell.brand);
  const golaExpr = showGola
    ? formatGolaPrice(cell.rate, cell.golaAddPrice ?? cell.golaAdd ?? cell.gola)
    : NO_VALUE_TEXT;

  return `
    <div class="cell-stack">
      <div class="cell-line cell-rate"><span class="cell-key">Rate</span><span class="cell-val">${escHtml(rate)}</span></div>
      <div class="cell-line"><span class="cell-key">Term</span><span class="cell-val">${escHtml(term)}</span></div>
      <div class="cell-line"><span class="cell-key">GST</span><span class="cell-val">${escHtml(gst)}</span></div>
      <div class="cell-line"><span class="cell-key">Freight</span><span class="cell-val">${escHtml(freight)}</span></div>
      <div class="cell-line"><span class="cell-key">CD</span><span class="cell-val">${escHtml(cd)}</span></div>
      <div class="cell-line"><span class="cell-key">Brand</span><span class="cell-val">${escHtml(brand)}</span></div>
      ${golaExpr !== NO_VALUE_TEXT ? `<div class="cell-line"><span class="cell-key">Gola Service Price</span><span class="cell-val gola-price golaGreen">${escHtml(golaExpr)}</span></div>` : ""}
    </div>
  `;
}

function getGolaExpression(cell) {
  if (!cell) return "";
  const expr = formatGolaPrice(cell.rate, cell.golaAddPrice ?? cell.golaAdd ?? cell.gola);
  return expr === NO_VALUE_TEXT ? "" : expr;
}

/* ========= State ========= */
let LAST_DATA = null;
let FILTERS_BOUND = false;
let ACTIVE_RENDER_ROWS = [];
let FILTER_INDEX = { categories: [], productsByCategory: new Map(), allProducts: [] };
let VIEW_DATA_CACHE = { source: null, mode: "", data: null };

let VIEW_MODE = DEFAULT_VIEW_MODE; // compact | matrix
let WEF_MODE = DEFAULT_WEF_MODE;   // latest | all | yyyy-mm-dd
let SEARCH_Q = "";
let HIDE_NO_RATE = false;

/* ========= Init ========= */
async function init() {
  try {
    showPageLoader(true);

    let data = await fetchJson(`${API_URL}?action=${VIEW_INIT_ACTION}`);
    if (!data?.ok) {
      data = await fetchJson(`${API_URL}?action=${LEGACY_INIT_ACTION}`);
    }
    if (!data?.ok) throw new Error("Init failed");

    const dl = document.getElementById("dealersList");
    if (dl) {
      dl.innerHTML = "";
      (data.dealers || []).forEach((v) => {
        const o = document.createElement("option");
        o.value = v;
        dl.appendChild(o);
      });
    }

    bindFiltersOnce();
  } catch (err) {
    console.error(err);
    showToast("Error loading data", "error");
  } finally {
    showPageLoader(false);
  }
}

function syncNoRateButton() {
  const noRateBtn = $("#toggleNoRate");
  if (!noRateBtn) return;
  noRateBtn.classList.toggle("active", HIDE_NO_RATE);
  noRateBtn.textContent = HIDE_NO_RATE ? "Show no-rate" : "Hide no-rate";
}

function applyManualViewDefaults() {
  VIEW_MODE = DEFAULT_VIEW_MODE;
  WEF_MODE = DEFAULT_WEF_MODE;
  HIDE_NO_RATE = DEFAULT_HIDE_NO_RATE;

  const viewSel = $("#viewMode");
  if (viewSel) viewSel.value = VIEW_MODE;

  const wefSel = $("#filterWef");
  if (wefSel) wefSel.value = WEF_MODE;

  syncNoRateButton();
}

function captureCurrentModesFromUI() {
  VIEW_MODE = $("#viewMode")?.value || VIEW_MODE || DEFAULT_VIEW_MODE;
  WEF_MODE = $("#filterWef")?.value || WEF_MODE || DEFAULT_WEF_MODE;
}

/* ========= Load dealer rates ========= */
async function loadDealerRates(opts = {}) {
  const silent = !!opts.silent;
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

    let d = await fetchJson(
      `${API_URL}?action=${VIEW_RATES_ACTION}&dealer=${encodeURIComponent(dealer)}`
    );

    if (!d?.ok) {
      d = await fetchJson(
        `${API_URL}?action=${LEGACY_RATES_ACTION}&dealer=${encodeURIComponent(dealer)}`
      );
    }

    if (!d?.ok) throw new Error("Bad dealer data");

    LAST_DATA = normalizeDealerData_(d);
    VIEW_DATA_CACHE = { source: null, mode: "", data: null };
    buildFilterIndex();

    if (silent) {
      captureCurrentModesFromUI();
    } else {
      applyManualViewDefaults();
    }

    $("#ratesArea")?.classList.remove("hide");

    fillCategoryOptions();
    fillProductOptions();
    fillWefOptions();
    syncNoRateButton();

    renderRatesView(getViewData());
    applyFilters();

    if (!silent) startAutoRefresh_();
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

function normalizeDealerData_(raw) {
  return {
    ...raw,
    products: Array.isArray(raw.products) ? raw.products : [],
    wefDates: Array.isArray(raw.wefDates) ? raw.wefDates : [],
    rates: raw.rates || {}
  };
}

function startAutoRefresh_() {
  const AUTO_REFRESH_MS = 20000;

  if (loadDealerRates._autoId) clearInterval(loadDealerRates._autoId);

  loadDealerRates._autoId = setInterval(() => {
    if (loadDealerRates._isAutoFetching) return;

    const dealerNow = $("#dealerSelect")?.value?.trim();
    if (!dealerNow) return;

    loadDealerRates._isAutoFetching = true;
    loadDealerRates({ silent: true })
      .catch(() => {})
      .finally(() => {
        loadDealerRates._isAutoFetching = false;
      });
  }, AUTO_REFRESH_MS);

  if (!loadDealerRates._cleanupBound) {
    loadDealerRates._cleanupBound = true;
    window.addEventListener("beforeunload", () => {
      if (loadDealerRates._autoId) clearInterval(loadDealerRates._autoId);
    });
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
  const noRateBtn = $("#toggleNoRate");

  if (!catSel || !prodSel || !search || !wefSel || !viewSel || !noRateBtn) return;

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
    WEF_MODE = wefSel.value || DEFAULT_WEF_MODE;
    renderRatesView(getViewData());
    applyFilters();
  });

  viewSel.addEventListener("change", () => {
    VIEW_MODE = viewSel.value || DEFAULT_VIEW_MODE;
    renderRatesView(getViewData());
    applyFilters();
  });

  noRateBtn.addEventListener("click", () => {
    HIDE_NO_RATE = !HIDE_NO_RATE;
    syncNoRateButton();
    applyFilters();
  });

  syncNoRateButton();
}

function buildFilterIndex() {
  const products = LAST_DATA?.products || [];
  const categorySet = new Set();
  const productsByCategory = new Map();
  const allProducts = new Set();

  products.forEach((p) => {
    const category = String(p.category || "").trim();
    const product = String(p.product || "").trim();
    if (category) categorySet.add(category);
    if (product) allProducts.add(product);

    const catKey = norm(category);
    if (!productsByCategory.has(catKey)) productsByCategory.set(catKey, new Set());
    if (product) productsByCategory.get(catKey).add(product);
  });

  FILTER_INDEX = {
    categories: Array.from(categorySet).sort((a, b) => a.localeCompare(b)),
    productsByCategory,
    allProducts: Array.from(allProducts).sort((a, b) => a.localeCompare(b))
  };
}

function fillCategoryOptions() {
  const catSel = $("#filterCategory");
  if (!catSel) return;

  const current = catSel.value || "";
  const cats = FILTER_INDEX.categories;

  catSel.innerHTML =
    `<option value="">All</option>` +
    cats.map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join("");

  if (current && cats.includes(current)) {
    catSel.value = current;
  } else if (current) {
    catSel.value = "";
  }
}

function fillProductOptions() {
  const catSel = $("#filterCategory");
  const prodSel = $("#filterProduct");
  if (!prodSel) return;

  const selectedCat = String(catSel?.value || "").trim();
  const current = prodSel.value || "";

  let products = FILTER_INDEX.allProducts;
  if (selectedCat) {
    const perCat = FILTER_INDEX.productsByCategory.get(norm(selectedCat));
    products = perCat ? Array.from(perCat).sort((a, b) => a.localeCompare(b)) : [];
  }

  prodSel.innerHTML =
    `<option value="">All</option>` +
    products.map((p) => `<option value="${escHtml(p)}">${escHtml(p)}</option>`).join("");

  if (current && products.includes(current)) {
    prodSel.value = current;
  } else if (current) {
    prodSel.value = "";
  }
}

function fillWefOptions() {
  const wefSel = $("#filterWef");
  if (!wefSel || !LAST_DATA) return;

  const all = Array.isArray(LAST_DATA.wefDates) ? LAST_DATA.wefDates : [];
  const current = WEF_MODE || wefSel.value || DEFAULT_WEF_MODE;

  const opts = [
    `<option value="latest">Latest only</option>`,
    `<option value="all">All history</option>`
  ];

  if (all.length) {
    opts.push(`<option value="" disabled>----------</option>`);
    all.slice().reverse().forEach((d) => {
      opts.push(`<option value="${escHtml(d)}">${escHtml(d)}</option>`);
    });
  }

  wefSel.innerHTML = opts.join("");

  if (current && (current === "latest" || current === "all" || all.includes(current))) {
    wefSel.value = current;
    WEF_MODE = current;
  } else {
    wefSel.value = DEFAULT_WEF_MODE;
    WEF_MODE = DEFAULT_WEF_MODE;
  }
}

function setResultCount(n) {
  const el = $("#resultCount");
  if (el) el.textContent = `${n} item(s)`;
}

function applyFilters() {
  const cat = norm($("#filterCategory")?.value || "");
  const prod = norm($("#filterProduct")?.value || "");
  const q = norm(SEARCH_Q);

  let visible = 0;

  for (const row of ACTIVE_RENDER_ROWS) {
    const ok =
      (!cat || row.categoryNorm === cat) &&
      (!prod || row.productNorm === prod) &&
      (!q || row.searchNorm.includes(q)) &&
      (!HIDE_NO_RATE || row.hasRate);

    row.el.style.display = ok ? "" : "none";
    if (ok) visible++;
  }

  setResultCount(visible);
}

/* ========= ViewData (WEF filter + derived indexes) ========= */
function getViewData() {
  if (!LAST_DATA) return null;

  if (
    VIEW_DATA_CACHE.source === LAST_DATA &&
    VIEW_DATA_CACHE.mode === WEF_MODE &&
    VIEW_DATA_CACHE.data
  ) {
    return VIEW_DATA_CACHE.data;
  }

  const all = Array.isArray(LAST_DATA.wefDates) ? LAST_DATA.wefDates : [];
  let data;

  if (!all.length) {
    data = { ...LAST_DATA, _wefMode: "none", _wefAll: [] };
  } else if (WEF_MODE === "latest") {
    data = { ...LAST_DATA, wefDates: all, _wefMode: "latest", _wefAll: all };
  } else if (WEF_MODE === "all") {
    data = { ...LAST_DATA, wefDates: all, _wefMode: "all", _wefAll: all };
  } else {
    data = {
      ...LAST_DATA,
      wefDates: [WEF_MODE],
      _wefMode: "single",
      _wefAll: all,
      _selectedWef: WEF_MODE
    };
  }

  data._derived = buildDerivedData_(data);
  data._hasGola = data._derived.hasDealerGola;

  VIEW_DATA_CACHE = { source: LAST_DATA, mode: WEF_MODE, data };
  return data;
}

function buildDerivedData_(data) {
  const products = Array.isArray(data.products) ? data.products : [];
  const allWefs = Array.isArray(data._wefAll)
    ? data._wefAll
    : (Array.isArray(data.wefDates) ? data.wefDates : []);

  const productMeta = {};
  let hasDealerGola = false;

  products.forEach((item) => {
    const key = toProductKey(item);
    const wefsWithRate = [];

    let latestWef = "";
    let latestCell = null;
    let hasAnyRate = false;

    for (let i = 0; i < allWefs.length; i++) {
      const wef = allWefs[i];
      const cell = data.rates?.[wef]?.[key];

      if (!hasDealerGola && hasGolaCell(cell)) {
        hasDealerGola = true;
      }

      if (hasRateCell(cell)) {
        hasAnyRate = true;
        wefsWithRate.push(wef);
        latestWef = wef;
        latestCell = cell;
      }
    }

    productMeta[key] = {
      hasAnyRate,
      wefsWithRate,
      latestWef,
      latestCell
    };
  });

  return { productMeta, hasDealerGola };
}

function getProductMeta_(data, key) {
  return data?._derived?.productMeta?.[key] || null;
}

function extractLatestRecord(item, data = LAST_DATA) {
  if (!data || !item) return { wef: "", cell: null };

  const meta = getProductMeta_(data, toProductKey(item));
  if (meta) {
    return {
      wef: meta.latestWef || "",
      cell: meta.latestCell || null
    };
  }

  return { wef: "", cell: null };
}

function itemHasAnyRate(item, data = LAST_DATA) {
  if (!data || !item) return false;
  const meta = getProductMeta_(data, toProductKey(item));
  return !!meta?.hasAnyRate;
}

function listWefsWithRate(data, key) {
  const meta = getProductMeta_(data, key);
  return meta ? meta.wefsWithRate.slice() : [];
}

/* ========= Responsive renderer ========= */
function renderRatesView(data) {
  if (!data) return;

  bindFiltersOnce();

  const wantsMatrix = VIEW_MODE === "matrix" && !isMobile();

  if (wantsMatrix) {
    $("#ratesTableWrap")?.classList.remove("hide");
    $("#ratesCards")?.classList.add("hide");
    ACTIVE_RENDER_ROWS = data._wefMode === "latest" ? renderTableLatest(data) : renderTable(data);
  } else {
    $("#ratesTableWrap")?.classList.add("hide");
    $("#ratesCards")?.classList.remove("hide");
    ACTIVE_RENDER_ROWS = renderCards(data);
  }
}

/* ========= Latest-cell renderers ========= */
function renderLatestNormalCell(item, data = LAST_DATA) {
  const latest = extractLatestRecord(item, data);
  const cell = latest.cell;

  const attrs = [
    { k: "WEF", v: formatValue(latest.wef) },
    { k: "Rate", v: formatValue(cell?.rate) },
    { k: "Term", v: formatTermValue(cell?.term) },
    { k: "GST", v: formatValue(cell?.gstType) },
    { k: "Freight", v: formatValue(cell?.freight) },
    { k: "CD", v: cell ? formatCd(cell) : NO_VALUE_TEXT },
    { k: "Brand", v: formatValue(cell?.brand) }
  ];

  return renderKVBlock(attrs);
}

function renderLatestGolaCell(item, data = LAST_DATA) {
  const latest = extractLatestRecord(item, data);
  const cell = latest.cell;

  const golaExpr = cell
    ? formatGolaPrice(cell.rate, cell.golaAddPrice ?? cell.golaAdd ?? cell.gola)
    : NO_VALUE_TEXT;

  const attrs = [
    { k: "WEF", v: formatValue(latest.wef) },
    { k: "Rate", v: golaExpr },
    { k: "Term", v: formatTermValue(cell?.term) },
    { k: "GST", v: formatValue(cell?.gstType) },
    { k: "Freight", v: formatValue(cell?.freight) },
    { k: "CD", v: cell ? formatCd(cell) : NO_VALUE_TEXT },
    { k: "Brand", v: formatValue(cell?.brand) }
  ];

  return renderKVBlock(attrs);
}

/* ========= Cards (Compact) ========= */
function renderCards(data) {
  const cards = $("#ratesCards");
  if (!cards) return [];

  cards.innerHTML = "";
  cards.classList.toggle("product-grid", !isMobile());

  const rows = [];
  const frag = document.createDocumentFragment();
  const viewWefs = Array.isArray(data.wefDates) ? data.wefDates : [];

  (data.products || []).forEach((p) => {
    const key = toProductKey(p);
    const meta = getProductMeta_(data, key);

    const hasAnyRate = !!meta?.hasAnyRate;
    const wefsWithRate = meta?.wefsWithRate || [];

    let showWef = "";
    let showCell = null;
    let modeLabel = "Latest";

    if (data._wefMode === "single") {
      showWef = (data._selectedWef || viewWefs[0] || "").trim();
      showCell = showWef ? data.rates?.[showWef]?.[key] : null;
      modeLabel = showWef ? "Selected" : "No rates";
    } else {
      showWef = meta?.latestWef || "";
      showCell = meta?.latestCell || null;
      modeLabel = showWef ? "Latest" : "No rates";
    }

    const markOldRate = hasRateCell(showCell) && isOldRateWef(showWef);

    const card = document.createElement("div");
    card.className = `product-card${markOldRate ? " old-rate-card" : ""}`;
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
      <div class="badge-row">
        <div class="badge">${showWef ? `WEF ${escHtml(showWef)}` : "WEF --"}</div>
        ${markOldRate ? `<div class="badge old-rate-badge">Old Rate</div>` : ""}
      </div>
    `;
    card.appendChild(header);

    const normalRate = showCell ? formatValue(showCell.rate) : NO_VALUE_TEXT;
    const hasDealerGola = !!data._hasGola;
    const golaRate = showCell
      ? formatGolaPrice(showCell.rate, showCell.golaAddPrice ?? showCell.golaAdd ?? showCell.gola)
      : NO_VALUE_TEXT;

    const attrs = [
      { k: "WEF", v: formatValue(showWef) },
      { k: "Term", v: formatTermValue(showCell?.term) },
      { k: "GST", v: formatValue(showCell?.gstType) },
      { k: "Freight", v: formatValue(showCell?.freight) },
      { k: "CD", v: showCell ? formatCd(showCell) : NO_VALUE_TEXT },
      { k: "Brand", v: formatValue(showCell?.brand) }
    ];

    const current = document.createElement("div");
    current.className = "current";
    current.innerHTML = `
      <div class="latest-split ${hasDealerGola ? "" : "single"}">
        <div class="latest-block">
          <div class="price-label">Normal</div>
          <div class="priceBig ${normalRate === NO_VALUE_TEXT ? "price-empty" : ""}">${escHtml(normalRate)}</div>
          <div class="muted">${escHtml(modeLabel)}</div>
        </div>
        ${hasDealerGola ? `
          <div class="latest-block">
            <div class="price-label">Gola Service Price</div>
            <div class="priceBig ${golaRate === NO_VALUE_TEXT ? "price-empty" : "gola-price golaGreen"}">${escHtml(golaRate)}</div>
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

    frag.appendChild(card);

    rows.push({
      el: card,
      categoryNorm: norm(p.category),
      productNorm: norm(p.product),
      searchNorm: norm(`${p.category || ""} ${p.product || ""} ${p.size || ""}`),
      hasRate: hasAnyRate
    });
  });

  cards.appendChild(frag);
  return rows;
}

/* ========= Table (Matrix) ========= */
function renderTable(data) {
  const wrap = $("#ratesTable");
  if (!wrap) return [];

  wrap.innerHTML = "";

  const rows = [];
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
  const frag = document.createDocumentFragment();

  (data.products || []).forEach((p) => {
    const key = toProductKey(p);
    const hasAnyRate = !!getProductMeta_(data, key)?.hasAnyRate;

    const tr = document.createElement("tr");
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

    wefs.forEach((wef) => {
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

    frag.appendChild(tr);

    rows.push({
      el: tr,
      categoryNorm: norm(p.category),
      productNorm: norm(p.product),
      searchNorm: norm(`${p.category || ""} ${p.product || ""} ${p.size || ""}`),
      hasRate: hasAnyRate
    });
  });

  tbody.appendChild(frag);
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);

  return rows;
}

/* ========= Table (Latest per-item) ========= */
function renderTableLatest(data) {
  const wrap = $("#ratesTable");
  if (!wrap) return [];

  wrap.innerHTML = "";

  const rows = [];
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
  const frag = document.createDocumentFragment();

  (data.products || []).forEach((p) => {
    const key = toProductKey(p);
    const hasAnyRate = !!getProductMeta_(data, key)?.hasAnyRate;

    const tr = document.createElement("tr");
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

    frag.appendChild(tr);

    rows.push({
      el: tr,
      categoryNorm: norm(p.category),
      productNorm: norm(p.product),
      searchNorm: norm(`${p.category || ""} ${p.product || ""} ${p.size || ""}`),
      hasRate: hasAnyRate
    });
  });

  tbody.appendChild(frag);
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);

  return rows;
}

/* ========= Resize ========= */
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
