/***** MASTER DATA READS *****/
function readActiveProducts_() {
  const version = readVersion_(PROP_KEYS.PRODUCTS_VERSION);
  const cacheKey = cacheStem_('products', '', version);
  const cached = cacheGetJson_(cacheKey);
  if (cached && Array.isArray(cached.products)) {
    return {
      products: cached.products,
      productKeySet: new Set(cached.products.map(function (item) {
        return productKey_(item.product, item.category, item.size);
      }))
    };
  }

  const productSheet = getSheet_(SHEETS.PRODUCTS);
  if (!productSheet) return { products: [], productKeySet: new Set() };

  const totalRows = Math.max(0, productSheet.getLastRow() - 1);
  const rows = safeGetValues(productSheet, 2, 1, totalRows, 5);
  const products = [];
  const productKeySet = new Set();

  rows.forEach(function (r) {
    const active = r[3] === true || String(r[3]).toUpperCase() === 'TRUE';
    if (!active) return;
    const item = { product: r[0], category: r[1], size: r[2], active: true };
    products.push(item);
    productKeySet.add(productKey_(item.product, item.category, item.size));
  });

  cachePutJson_(cacheKey, { products: products }, CACHE_TTL.MASTER);
  return { products: products, productKeySet: productKeySet };
}

function normalizeMatchText_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeSizeKey_(value) {
  return normalizeMatchText_(value).replace(/\s*[x×]\s*/g, 'x');
}

function normalizedProductKey_(product, category, size) {
  return [
    normalizeMatchText_(product),
    normalizeMatchText_(category),
    normalizeSizeKey_(size)
  ].join('||');
}

function buildNormalizedProductLookup_(products) {
  const lookup = {};
  (products || []).forEach(function (item) {
    const normalized = normalizedProductKey_(item.product, item.category, item.size);
    const canonical = productKey_(item.product, item.category, item.size);
    if (!normalized) return;
    if (!Object.prototype.hasOwnProperty.call(lookup, normalized)) {
      lookup[normalized] = canonical;
    } else if (lookup[normalized] !== canonical) {
      lookup[normalized] = null;
    }
  });
  return lookup;
}

function resolveActiveProductKey_(product, category, size, exactKeySet, normalizedLookup) {
  const exact = productKey_(product, category, size);
  if (exactKeySet && exactKeySet.has(exact)) return exact;
  const normalized = normalizedProductKey_(product, category, size);
  return normalizedLookup && normalizedLookup[normalized] ? normalizedLookup[normalized] : '';
}

function getRatesSchema_(sheet, options) {
  const opts = options || {};
  const ensureGolaHeader = opts.ensureGolaHeader !== false;
  var lastCol = sheet.getLastColumn();
  if (lastCol <= 0) {
    return { hasHeader: false, indexes: RATE_DEFAULT_INDEXES, lastCol: RATE_DEFAULT_INDEXES.gola };
  }

  var headerRow = safeGetValues(sheet, 1, 1, 1, lastCol);
  var headers = (headerRow && headerRow[0]) ? headerRow[0] : [];
  var headerNorm = headers.map(normalizeHeader_);
  var matchCount = 0;
  ['dealer', 'category', 'product', 'size', 'wef', 'rate'].forEach(function (k) {
    if (headerNorm.indexOf(k) !== -1) matchCount++;
  });
  var hasHeader = matchCount >= 2;

  if (!hasHeader) {
    return {
      hasHeader: false,
      indexes: RATE_DEFAULT_INDEXES,
      lastCol: Math.max(lastCol, RATE_DEFAULT_INDEXES.gola)
    };
  }

  var indexes = {
    dealer: findHeaderIndex_(headerNorm, RATE_HEADERS.dealer) || RATE_DEFAULT_INDEXES.dealer,
    category: findHeaderIndex_(headerNorm, RATE_HEADERS.category) || RATE_DEFAULT_INDEXES.category,
    product: findHeaderIndex_(headerNorm, RATE_HEADERS.product) || RATE_DEFAULT_INDEXES.product,
    size: findHeaderIndex_(headerNorm, RATE_HEADERS.size) || RATE_DEFAULT_INDEXES.size,
    wef: findHeaderIndex_(headerNorm, RATE_HEADERS.wef) || RATE_DEFAULT_INDEXES.wef,
    rate: findHeaderIndex_(headerNorm, RATE_HEADERS.rate) || RATE_DEFAULT_INDEXES.rate,
    term: findHeaderIndex_(headerNorm, RATE_HEADERS.term) || RATE_DEFAULT_INDEXES.term,
    brand: findHeaderIndex_(headerNorm, RATE_HEADERS.brand) || RATE_DEFAULT_INDEXES.brand,
    gst: findHeaderIndex_(headerNorm, RATE_HEADERS.gst) || RATE_DEFAULT_INDEXES.gst,
    freight: findHeaderIndex_(headerNorm, RATE_HEADERS.freight) || RATE_DEFAULT_INDEXES.freight,
    cd: findHeaderIndex_(headerNorm, RATE_HEADERS.cd) || RATE_DEFAULT_INDEXES.cd,
    savedOn: findHeaderIndex_(headerNorm, RATE_HEADERS.savedOn) || RATE_DEFAULT_INDEXES.savedOn,
    gola: findHeaderIndex_(headerNorm, RATE_HEADERS.gola)
  };

  var effectiveLastCol = Math.max(lastCol, indexes.savedOn || 0);
  if (!indexes.gola) {
    indexes.gola = effectiveLastCol + 1;
    if (ensureGolaHeader) sheet.getRange(1, indexes.gola).setValue('Gola Add Price');
    effectiveLastCol = Math.max(effectiveLastCol, indexes.gola);
  } else {
    effectiveLastCol = Math.max(effectiveLastCol, indexes.gola);
  }

  return { hasHeader: true, indexes: indexes, lastCol: effectiveLastCol };
}

function getViewReadLastCol_(indexes) {
  return Math.max(
    indexes.dealer || 0,
    indexes.category || 0,
    indexes.product || 0,
    indexes.size || 0,
    indexes.wef || 0,
    indexes.rate || 0,
    indexes.term || 0,
    indexes.brand || 0,
    indexes.gst || 0,
    indexes.freight || 0,
    indexes.cd || 0,
    indexes.gola || 0
  );
}

function readDealerRows_(sheet, schema, dealerName, lastCol) {
  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!rowCount) return [];

  const targetDealer = normalizeMatchText_(dealerName);
  if (!targetDealer) return [];

  try {
    const dealerValues = sheet.getRange(2, schema.indexes.dealer, rowCount, 1).getValues();
    const rowNumbers = [];
    dealerValues.forEach(function (row, idx) {
      if (normalizeMatchText_(row[0]) === targetDealer) rowNumbers.push(idx + 2);
    });

    if (!rowNumbers.length) return [];
    const runs = [];
    let start = rowNumbers[0];
    let previous = start;

    for (let i = 1; i < rowNumbers.length; i++) {
      const row = rowNumbers[i];
      if (row === previous + 1) {
        previous = row;
        continue;
      }
      runs.push({ start: start, count: previous - start + 1 });
      start = row;
      previous = row;
    }
    runs.push({ start: start, count: previous - start + 1 });

    const out = [];
    runs.forEach(function (run) {
      const values = safeGetValues(sheet, run.start, 1, run.count, lastCol);
      Array.prototype.push.apply(out, values);
    });
    return out;
  } catch (e) {
    return safeGetValues(sheet, 2, 1, rowCount, lastCol).filter(function (row) {
      return normalizeMatchText_(getRowVal_(row, schema.indexes.dealer)) === targetDealer;
    });
  }
}

function makeRateCell_(row, indexes) {
  const cdVal = preserveZeroOrBlank_(getRowVal_(row, indexes.cd));
  return {
    rate: getRowVal_(row, indexes.rate),
    term: normalizeTerm_(getRowVal_(row, indexes.term)),
    brand: getRowVal_(row, indexes.brand) || '',
    gstType: getRowVal_(row, indexes.gst) || '',
    freight: preserveZeroOrBlank_(getRowVal_(row, indexes.freight)),
    cd: cdVal,
    cdValue: cdVal,
    cdType: '',
    golaAddPrice: preserveZeroOrBlank_(getRowVal_(row, indexes.gola))
  };
}
