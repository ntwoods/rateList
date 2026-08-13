/***** API ENTRY POINTS *****/
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = params.action || '';
    return jsonOutput_(routeGetAction_(action, params));
  } catch (err) {
    return jsonOutput_({ ok: false, error: err.message || 'Unexpected error' });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOutput_({ ok: false, error: 'Missing request body' });
    }
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOutput_({ ok: false, error: 'Invalid JSON body' });
    }
    const action = body.action || '';
    return jsonOutput_(routePostAction_(action, body));
  } catch (err) {
    return jsonOutput_({ ok: false, error: err.message || 'Unexpected error' });
  }
}

function routeGetAction_(action, params) {
  switch (action) {
    case 'getViewInitialData':
      return getViewInitialData_();
    case 'getViewDealerLatest':
      return getViewDealerLatest_(params.dealer || '');
    case 'getViewDealerRates':
      return getViewDealerRates_(params.dealer || '');
    case 'getViewProductHistory':
      return getViewProductHistory_(params.dealer || '', params.product || '', params.category || '', params.size || '');
    case 'getViewDealerVersion':
      return getViewDealerVersion_(params.dealer || '');
    case 'getInitialData':
      return getInitialData_();
    case 'getDealerRates':
      return getDealerRates_(params.dealer || '');
    default:
      return { ok: false, error: 'Unknown GET action' };
  }
}

function routePostAction_(action, body) {
  switch (action) {
    case 'addDealer': return addDealer_(body.name);
    case 'addCategory': return addCategory_(body.name);
    case 'addBrand': return addBrand_(body.name);
    case 'addProduct': return addProduct_(body.product, body.category, body.size);
    case 'saveRates': return saveRates_(body.payload || {});
    default: return { ok: false, error: 'Unknown POST action' };
  }
}

/***** VIEWING FLOW *****/
function getViewInitialData_() {
  const dealersVersion = readVersion_(PROP_KEYS.DEALERS_VERSION);
  const cacheKey = cacheStem_('dealers', '', dealersVersion);
  const cached = cacheGetJson_(cacheKey);
  if (cached && Array.isArray(cached.dealers)) return { ok: true, dealers: cached.dealers };

  const dealersSheet = getSheet_(SHEETS.DEALERS);
  const dealers = getSheetColumnValues_(dealersSheet, 1);
  cachePutJson_(cacheKey, { dealers: dealers }, CACHE_TTL.MASTER);
  return { ok: true, dealers: dealers };
}

function getViewDealerVersion_(dealer) {
  const dealerName = String(dealer || '').trim();
  if (!dealerName) return { ok: false, error: 'Dealer is required' };
  return { ok: true, version: getDealerVersion_(dealerName) };
}

function getViewDealerLatest_(dealer) {
  const dealerName = String(dealer || '').trim();
  if (!dealerName) return { ok: false, error: 'Dealer is required' };

  const version = getDealerVersion_(dealerName);
  const productsVersion = readVersion_(PROP_KEYS.PRODUCTS_VERSION);
  const cacheKey = cacheStem_('latest', dealerName, version + ':' + productsVersion);
  const cached = cacheGetJson_(cacheKey);
  if (cached && cached.ok) return cached;

  const activeProductsData = readActiveProducts_();
  const products = activeProductsData.products;
  const activeProductKeys = activeProductsData.productKeySet;
  const normalizedProductLookup = buildNormalizedProductLookup_(products);
  const ratesSheet = getSheet_(SHEETS.RATES);
  if (!ratesSheet || ratesSheet.getLastRow() <= 1) {
    const empty = { ok: true, products: products, wefDates: [], rates: {}, historyCounts: {}, version: version };
    cachePutJson_(cacheKey, empty, CACHE_TTL.LATEST);
    return empty;
  }

  const schema = getRatesSchema_(ratesSheet, { ensureGolaHeader: false });
  const readLastCol = getViewReadLastCol_(schema.indexes);
  const rows = readDealerRows_(ratesSheet, schema, dealerName, readLastCol);
  const wefSet = new Set();
  const historyCounts = {};
  const latestByKey = {};
  let hasDealerGola = false;

  rows.forEach(function (row) {
    const product = getRowVal_(row, schema.indexes.product);
    const category = getRowVal_(row, schema.indexes.category);
    const size = getRowVal_(row, schema.indexes.size);
    const key = resolveActiveProductKey_(product, category, size, activeProductKeys, normalizedProductLookup);
    if (!key) return;

    const wef = toYMD_(getRowVal_(row, schema.indexes.wef));
    if (!wef) return;
    wefSet.add(wef);

    const rate = getRowVal_(row, schema.indexes.rate);
    const gola = getRowVal_(row, schema.indexes.gola);
    if (isValidRate_(rate)) {
      historyCounts[key] = (historyCounts[key] || 0) + 1;
      if (isValidRate_(gola)) hasDealerGola = true;
      if (!latestByKey[key] || wef >= latestByKey[key].wef) {
        latestByKey[key] = { wef: wef, cell: makeRateCell_(row, schema.indexes) };
      }
    }
  });

  const rates = {};
  Object.keys(latestByKey).forEach(function (key) {
    const latest = latestByKey[key];
    if (!rates[latest.wef]) rates[latest.wef] = {};
    rates[latest.wef][key] = latest.cell;
  });

  const payload = {
    ok: true,
    products: products,
    wefDates: Array.from(wefSet).sort(function (a, b) { return a.localeCompare(b); }),
    rates: rates,
    historyCounts: historyCounts,
    hasDealerGola: hasDealerGola,
    version: version
  };
  cachePutJson_(cacheKey, payload, CACHE_TTL.LATEST);
  return payload;
}

function getViewDealerRates_(dealer) {
  const dealerName = String(dealer || '').trim();
  if (!dealerName) return { ok: false, error: 'Dealer is required' };

  const version = getDealerVersion_(dealerName);
  const productsVersion = readVersion_(PROP_KEYS.PRODUCTS_VERSION);
  const cacheKey = cacheStem_('history', dealerName, version + ':' + productsVersion);
  const cached = cacheGetJson_(cacheKey);
  if (cached && cached.ok) return cached;

  const activeProductsData = readActiveProducts_();
  const products = activeProductsData.products.slice();
  const activeProductKeys = activeProductsData.productKeySet;
  const normalizedProductLookup = buildNormalizedProductLookup_(products);
  const ratesSheet = getSheet_(SHEETS.RATES);
  if (!ratesSheet || ratesSheet.getLastRow() <= 1) {
    return { ok: true, products: products, wefDates: [], rates: {}, historyCounts: {}, version: version };
  }

  const schema = getRatesSchema_(ratesSheet, { ensureGolaHeader: false });
  const readLastCol = getViewReadLastCol_(schema.indexes);
  const rows = readDealerRows_(ratesSheet, schema, dealerName, readLastCol);
  const wefSet = new Set();
  const ratesByWef = {};
  const historyCounts = {};
  const historicalKeyByNormalized = {};

  rows.forEach(function (row) {
    const product = getRowVal_(row, schema.indexes.product);
    const category = getRowVal_(row, schema.indexes.category);
    const size = getRowVal_(row, schema.indexes.size);
    const rate = getRowVal_(row, schema.indexes.rate);
    let key = resolveActiveProductKey_(product, category, size, activeProductKeys, normalizedProductLookup);

    if (!key) {
      if (!isValidRate_(rate)) return;
      const normalizedKey = normalizedProductKey_(product, category, size);
      if (!normalizedKey || !String(product || '').trim()) return;
      key = historicalKeyByNormalized[normalizedKey];
      if (!key) {
        key = productKey_(product, category, size);
        historicalKeyByNormalized[normalizedKey] = key;
        products.push({ product: product, category: category, size: size, active: false, historical: true });
      }
    }

    const wef = toYMD_(getRowVal_(row, schema.indexes.wef));
    if (!wef) return;
    wefSet.add(wef);
    if (!ratesByWef[wef]) ratesByWef[wef] = {};
    ratesByWef[wef][key] = makeRateCell_(row, schema.indexes);
    if (isValidRate_(rate)) historyCounts[key] = (historyCounts[key] || 0) + 1;
  });

  const payload = {
    ok: true,
    products: products,
    wefDates: Array.from(wefSet).sort(function (a, b) { return a.localeCompare(b); }),
    rates: ratesByWef,
    historyCounts: historyCounts,
    version: version
  };
  cachePutJson_(cacheKey, payload, CACHE_TTL.HISTORY);
  return payload;
}

function getViewProductHistory_(dealer, product, category, size) {
  const dealerName = String(dealer || '').trim();
  const normalizedKey = normalizedProductKey_(product, category, size);
  if (!dealerName || !product || !category || !size) {
    return { ok: false, error: 'Dealer, product, category and size are required' };
  }

  const version = getDealerVersion_(dealerName);
  const cacheKey = cacheStem_('product-history', dealerName, version + ':' + hashKey_(normalizedKey));
  const cached = cacheGetJson_(cacheKey);
  if (cached && cached.ok) return cached;

  const ratesSheet = getSheet_(SHEETS.RATES);
  if (!ratesSheet || ratesSheet.getLastRow() <= 1) return { ok: true, history: [] };

  const schema = getRatesSchema_(ratesSheet, { ensureGolaHeader: false });
  const readLastCol = getViewReadLastCol_(schema.indexes);
  const rows = readDealerRows_(ratesSheet, schema, dealerName, readLastCol);
  const historyRows = [];

  rows.forEach(function (row, idx) {
    const rowKey = normalizedProductKey_(
      getRowVal_(row, schema.indexes.product),
      getRowVal_(row, schema.indexes.category),
      getRowVal_(row, schema.indexes.size)
    );
    if (rowKey !== normalizedKey) return;
    const wef = toYMD_(getRowVal_(row, schema.indexes.wef));
    if (!wef || !isValidRate_(getRowVal_(row, schema.indexes.rate))) return;
    historyRows.push({ wef: wef, cell: makeRateCell_(row, schema.indexes), seq: idx });
  });

  historyRows.sort(function (a, b) {
    const byDate = a.wef.localeCompare(b.wef);
    return byDate || (a.seq - b.seq);
  });
  const history = historyRows.map(function (item) {
    return { wef: item.wef, cell: item.cell };
  });
  const payload = { ok: true, history: history, version: version };
  cachePutJson_(cacheKey, payload, CACHE_TTL.PRODUCT_HISTORY);
  return payload;
}

/***** LEGACY ENDPOINTS *****/
function getInitialData_() {
  const viewInit = getViewInitialData_();
  const categoriesSheet = getSheet_(SHEETS.CATEGORIES);
  const brandsSheet = getSheet_(SHEETS.BRANDS);
  const activeProductsData = readActiveProducts_();
  return {
    ok: true,
    dealers: viewInit.dealers,
    categories: getSheetColumnValues_(categoriesSheet, 1),
    brands: getSheetColumnValues_(brandsSheet, 1),
    products: activeProductsData.products
  };
}

function getDealerRates_(dealer) {
  return getViewDealerRates_(dealer);
}
