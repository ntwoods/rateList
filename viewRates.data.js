/* ========= Init ========= */
function setDealerOptions_(dealers) {
  const dl = $("#dealersList");
  if (!dl) return;
  const frag = document.createDocumentFragment();
  dl.innerHTML = "";
  (dealers || []).forEach((v) => {
    const o = document.createElement("option");
    o.value = v;
    frag.appendChild(o);
  });
  dl.appendChild(frag);
}

function restoreCachedDealers_() {
  try {
    const cached = JSON.parse(localStorage.getItem(DEALER_CACHE_KEY) || "null");
    if (Array.isArray(cached) && cached.length) setDealerOptions_(cached);
  } catch (_) {}
}

function cacheDealers_(dealers) {
  try {
    localStorage.setItem(DEALER_CACHE_KEY, JSON.stringify(dealers || []));
  } catch (_) {}
}

async function init() {
  bindFiltersOnce();
  restoreCachedDealers_();

  try {
    let data = await fetchJson(apiUrl(VIEW_INIT_ACTION));
    if (!data?.ok) data = await fetchJson(apiUrl(LEGACY_INIT_ACTION));
    if (!data?.ok) throw new Error(data?.error || "Init failed");
    const dealers = data.dealers || [];
    setDealerOptions_(dealers);
    cacheDealers_(dealers);
  } catch (err) {
    console.error(err);
    if (!$("#dealersList")?.children?.length) showToast("Error loading data", "error");
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
  const wefSel = $("#filterWef");
  if (viewSel) viewSel.value = VIEW_MODE;
  if (wefSel) wefSel.value = WEF_MODE;
  syncNoRateButton();
}

function captureCurrentModesFromUI() {
  VIEW_MODE = $("#viewMode")?.value || VIEW_MODE || DEFAULT_VIEW_MODE;
  WEF_MODE = $("#filterWef")?.value || WEF_MODE || DEFAULT_WEF_MODE;
}

function normalizeDealerData_(raw) {
  return {
    ...raw,
    products: Array.isArray(raw.products) ? raw.products : [],
    wefDates: Array.isArray(raw.wefDates) ? raw.wefDates : [],
    rates: raw.rates || {},
    historyCounts: raw.historyCounts || {}
  };
}

async function fetchLatestDealerData_(dealer) {
  let data;
  try {
    data = await fetchJson(apiUrl(VIEW_LATEST_ACTION, { dealer }));
  } catch (_) {
    data = null;
  }

  if (data?.ok) return { data, optimized: true };

  data = await fetchJson(apiUrl(VIEW_HISTORY_ACTION, { dealer }));
  if (!data?.ok) data = await fetchJson(apiUrl(LEGACY_RATES_ACTION, { dealer }));
  return { data, optimized: false };
}

async function loadDealerRates(opts = {}) {
  const silent = !!opts.silent;
  const dealer = (opts.dealer || $("#dealerSelect")?.value || "").trim();
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

    const result = await fetchLatestDealerData_(dealer);
    if (!result.data?.ok) throw new Error(result.data?.error || "Bad dealer data");

    ACTIVE_DEALER = dealer;
    ACTIVE_VERSION = String(result.data.version ?? ACTIVE_VERSION ?? "");
    LAST_DATA = normalizeDealerData_(result.data);
    DEALER_HISTORY_DATA = result.optimized ? null : LAST_DATA;
    PRODUCT_HISTORY_CACHE = new Map();
    VIEW_DATA_CACHE = { source: null, mode: "", data: null };

    buildFilterIndex();
    if (silent) captureCurrentModesFromUI();
    else applyManualViewDefaults();

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

async function ensureDealerHistory_() {
  if (DEALER_HISTORY_DATA) return DEALER_HISTORY_DATA;
  if (!ACTIVE_DEALER) return null;
  if (ensureDealerHistory_._promise) return ensureDealerHistory_._promise;

  ensureDealerHistory_._promise = (async () => {
    let data = await fetchJson(apiUrl(VIEW_HISTORY_ACTION, { dealer: ACTIVE_DEALER }));
    if (!data?.ok) data = await fetchJson(apiUrl(LEGACY_RATES_ACTION, { dealer: ACTIVE_DEALER }));
    if (!data?.ok) throw new Error(data?.error || "Unable to load history");
    DEALER_HISTORY_DATA = normalizeDealerData_(data);
    return DEALER_HISTORY_DATA;
  })();

  try {
    return await ensureDealerHistory_._promise;
  } finally {
    ensureDealerHistory_._promise = null;
  }
}

async function loadProductHistory_(item, key) {
  if (PRODUCT_HISTORY_CACHE.has(key)) return PRODUCT_HISTORY_CACHE.get(key);
  if (!ACTIVE_DEALER) return [];

  let records = null;
  try {
    const d = await fetchJson(apiUrl(VIEW_PRODUCT_HISTORY_ACTION, {
      dealer: ACTIVE_DEALER,
      product: item.product || "",
      category: item.category || "",
      size: item.size || ""
    }));
    if (d?.ok && Array.isArray(d.history)) records = d.history;
  } catch (_) {}

  if (!records) {
    const full = await ensureDealerHistory_();
    const metaData = buildDerivedData_(full);
    const wefs = metaData.productMeta?.[key]?.wefsWithRate || [];
    records = wefs.map((wef) => ({ wef, cell: full.rates?.[wef]?.[key] || null }));
  }

  PRODUCT_HISTORY_CACHE.set(key, records);
  return records;
}

/* ========= Auto refresh ========= */
function stopAutoRefresh_() {
  if (loadDealerRates._autoId) {
    clearInterval(loadDealerRates._autoId);
    loadDealerRates._autoId = null;
  }
}

async function checkDealerVersion_() {
  if (!ACTIVE_DEALER || document.hidden || loadDealerRates._isAutoFetching) return;

  if (!VERSION_ENDPOINT_SUPPORTED) {
    loadDealerRates._isAutoFetching = true;
    try { await loadDealerRates({ silent: true, dealer: ACTIVE_DEALER }); }
    finally { loadDealerRates._isAutoFetching = false; }
    return;
  }

  try {
    const d = await fetchJson(apiUrl(VIEW_VERSION_ACTION, { dealer: ACTIVE_DEALER }));
    if (!d?.ok) {
      VERSION_ENDPOINT_SUPPORTED = false;
      restartAutoRefresh_(LEGACY_REFRESH_MS);
      return;
    }

    const nextVersion = String(d.version ?? "");
    if (ACTIVE_VERSION && nextVersion && nextVersion === ACTIVE_VERSION) return;
    if (!ACTIVE_VERSION && nextVersion) {
      ACTIVE_VERSION = nextVersion;
      return;
    }

    loadDealerRates._isAutoFetching = true;
    try { await loadDealerRates({ silent: true, dealer: ACTIVE_DEALER }); }
    finally { loadDealerRates._isAutoFetching = false; }
  } catch (err) {
    console.warn("Version check failed", err);
  }
}

function restartAutoRefresh_(intervalMs) {
  stopAutoRefresh_();
  loadDealerRates._autoId = setInterval(checkDealerVersion_, intervalMs);
}

function startAutoRefresh_() {
  VERSION_ENDPOINT_SUPPORTED = true;
  restartAutoRefresh_(AUTO_REFRESH_MS);

  if (!loadDealerRates._cleanupBound) {
    loadDealerRates._cleanupBound = true;
    window.addEventListener("beforeunload", stopAutoRefresh_);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && ACTIVE_DEALER) checkDealerVersion_();
    });
  }
}
