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
  prodSel.addEventListener("change", applyFilters);
  search.addEventListener("input", debounce(() => {
    SEARCH_Q = search.value || "";
    applyFilters();
  }, 180));

  wefSel.addEventListener("change", async () => {
    const nextMode = wefSel.value || DEFAULT_WEF_MODE;
    WEF_MODE = nextMode;
    if (nextMode !== "latest" && !DEALER_HISTORY_DATA) {
      try {
        showPageLoader(true);
        await ensureDealerHistory_();
      } catch (err) {
        console.error(err);
        showToast("Error loading rate history", "error");
        WEF_MODE = DEFAULT_WEF_MODE;
        wefSel.value = DEFAULT_WEF_MODE;
      } finally {
        showPageLoader(false);
      }
    }
    VIEW_DATA_CACHE = { source: null, mode: "", data: null };
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
    renderRatesView(getViewData());
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
  catSel.innerHTML = `<option value="">All</option>` + cats.map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join("");
  catSel.value = current && cats.includes(current) ? current : "";
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
  prodSel.innerHTML = `<option value="">All</option>` + products.map((p) => `<option value="${escHtml(p)}">${escHtml(p)}</option>`).join("");
  prodSel.value = current && products.includes(current) ? current : "";
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
    all.slice().reverse().forEach((d) => opts.push(`<option value="${escHtml(d)}">${escHtml(d)}</option>`));
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
    const ok = (!cat || row.categoryNorm === cat) &&
      (!prod || row.productNorm === prod) &&
      (!q || row.searchNorm.includes(q));
    row.el.style.display = ok ? "" : "none";
    if (ok) visible++;
  }
  setResultCount(visible);
}

/* ========= View data ========= */
function buildDerivedData_(data) {
  const products = Array.isArray(data?.products) ? data.products : [];
  const allWefs = Array.isArray(data?._wefAll) ? data._wefAll : (Array.isArray(data?.wefDates) ? data.wefDates : []);
  const productMeta = {};
  let hasDealerGola = !!data?.hasDealerGola;

  products.forEach((item) => {
    const key = toProductKey(item);
    const wefsWithRate = [];
    let latestWef = "";
    let latestCell = null;

    for (let i = 0; i < allWefs.length; i++) {
      const wef = allWefs[i];
      const cell = data.rates?.[wef]?.[key];
      if (!hasDealerGola && hasGolaCell(cell)) hasDealerGola = true;
      if (hasRateCell(cell)) {
        wefsWithRate.push(wef);
        latestWef = wef;
        latestCell = cell;
      }
    }

    const historyCount = Number(data.historyCounts?.[key] || wefsWithRate.length || 0);
    productMeta[key] = {
      hasAnyRate: !!latestCell,
      wefsWithRate,
      latestWef,
      latestCell,
      historyCount
    };
  });

  return { productMeta, hasDealerGola };
}

function getViewData() {
  if (!LAST_DATA) return null;
  const source = WEF_MODE === "latest" ? LAST_DATA : (DEALER_HISTORY_DATA || LAST_DATA);

  if (VIEW_DATA_CACHE.source === source && VIEW_DATA_CACHE.mode === WEF_MODE && VIEW_DATA_CACHE.data) {
    return VIEW_DATA_CACHE.data;
  }

  const all = Array.isArray(source.wefDates) ? source.wefDates : [];
  let data;
  if (!all.length) {
    data = { ...source, _wefMode: "none", _wefAll: [] };
  } else if (WEF_MODE === "latest") {
    data = { ...source, wefDates: all, _wefMode: "latest", _wefAll: all };
  } else if (WEF_MODE === "all") {
    data = { ...source, wefDates: all, _wefMode: "all", _wefAll: all };
  } else {
    data = { ...source, wefDates: [WEF_MODE], _wefMode: "single", _wefAll: all, _selectedWef: WEF_MODE };
  }

  data._derived = buildDerivedData_(data);
  data._hasGola = data._derived.hasDealerGola;
  VIEW_DATA_CACHE = { source, mode: WEF_MODE, data };
  return data;
}

function getProductMeta_(data, key) {
  return data?._derived?.productMeta?.[key] || null;
}

function getRenderProducts_(data) {
  const products = data?.products || [];
  if (!HIDE_NO_RATE) return products;
  return products.filter((p) => !!getProductMeta_(data, toProductKey(p))?.hasAnyRate);
}

function extractLatestRecord(item, data = LAST_DATA) {
  const meta = getProductMeta_(data, toProductKey(item));
  return { wef: meta?.latestWef || "", cell: meta?.latestCell || null };
}

/* ========= Responsive renderer ========= */
function renderRatesView(data) {
  if (!data) return;
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

function renderLatestNormalCell(item, data = LAST_DATA) {
  const latest = extractLatestRecord(item, data);
  const cell = latest.cell;
  return renderKVBlock([
    { k: "WEF", v: formatValue(latest.wef) },
    { k: "Rate", v: formatValue(cell?.rate) },
    { k: "Term", v: formatTermValue(cell?.term) },
    { k: "GST", v: formatValue(cell?.gstType) },
    { k: "Freight", v: formatValue(cell?.freight) },
    { k: "CD", v: cell ? formatCd(cell) : NO_VALUE_TEXT },
    { k: "Brand", v: formatValue(cell?.brand) }
  ]);
}

function renderLatestGolaCell(item, data = LAST_DATA) {
  const latest = extractLatestRecord(item, data);
  const cell = latest.cell;
  const golaExpr = cell ? formatGolaPrice(cell.rate, cell.golaAddPrice ?? cell.golaAdd ?? cell.gola) : NO_VALUE_TEXT;
  return renderKVBlock([
    { k: "WEF", v: formatValue(latest.wef) },
    { k: "Rate", v: golaExpr },
    { k: "Term", v: formatTermValue(cell?.term) },
    { k: "GST", v: formatValue(cell?.gstType) },
    { k: "Freight", v: formatValue(cell?.freight) },
    { k: "CD", v: cell ? formatCd(cell) : NO_VALUE_TEXT },
    { k: "Brand", v: formatValue(cell?.brand) }
  ]);
}

function makeHistoryDetails_(item, key, showWef, data) {
  const meta = getProductMeta_(data, key);
  const total = Math.max(0, Number(meta?.historyCount || meta?.wefsWithRate?.length || 0) - (showWef ? 1 : 0));
  if (!total) return null;

  const details = document.createElement("details");
  details.className = "history";
  details.innerHTML = `<summary>History (${total})</summary>`;
  const body = document.createElement("div");
  body.className = "history-body";
  details.appendChild(body);

  details.addEventListener("toggle", async () => {
    if (!details.open || details.dataset.loaded === "1" || details.dataset.loading === "1") return;
    details.dataset.loading = "1";
    body.innerHTML = `<div class="muted">Loading history…</div>`;
    try {
      const history = await loadProductHistory_(item, key);
      const others = history.filter((r) => r.wef && r.wef !== showWef).slice().reverse();
      const frag = document.createDocumentFragment();
      others.forEach(({ wef, cell }) => {
        const row = document.createElement("div");
        row.className = "history-row";
        row.innerHTML = `<div class="history-date">${escHtml(wef)}</div>${cellStackHtml(cell, { showGola: true })}`;
        frag.appendChild(row);
      });
      body.innerHTML = "";
      body.appendChild(frag);
      details.dataset.loaded = "1";
    } catch (err) {
      console.error(err);
      body.innerHTML = `<div class="muted">Unable to load history.</div>`;
    } finally {
      details.dataset.loading = "0";
    }
  });

  return details;
}
