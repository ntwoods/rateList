/***** CONFIG *****/
const SPREADSHEET_ID = '1IdPgAMZ8HYr9r3NsYZLKrzI4GChL1TKjoZnyr_9PdYI';
const SHEETS = {
  DEALERS: 'Dealers',
  CATEGORIES: 'Categories',
  BRANDS: 'Brands',
  PRODUCTS: 'Products',
  RATES: 'Rates'
};

const RATE_HEADERS = {
  dealer: ['dealer'],
  category: ['category'],
  product: ['product'],
  size: ['size'],
  wef: ['wef', 'w.e.f', 'wef date', 'effective date'],
  rate: ['rate'],
  term: ['term', 'payment term'],
  brand: ['brand'],
  gst: ['gst term', 'gst type', 'gst'],
  freight: ['freight'],
  cd: ['cd'],
  gola: ['gola add price', 'gola_add_price', 'additional price for gola', 'gola additional price', 'gola price'],
  savedOn: ['saved on', 'savedon', 'saved']
};

const RATE_DEFAULT_INDEXES = {
  dealer: 1,
  category: 2,
  product: 3,
  size: 4,
  wef: 5,
  rate: 6,
  term: 7,
  brand: 8,
  gst: 9,
  freight: 10,
  cd: 11,
  savedOn: 12,
  gola: 13
};

const CACHE_TTL = {
  MASTER: 21600,
  LATEST: 21600,
  HISTORY: 1800,
  PRODUCT_HISTORY: 3600
};
const CACHE_CHUNK_SIZE = 80000;
const PROP_KEYS = {
  DEALERS_VERSION: 'VIEW_RATES_DEALERS_VERSION',
  PRODUCTS_VERSION: 'VIEW_RATES_PRODUCTS_VERSION',
  DEALER_VERSION_PREFIX: 'VIEW_RATES_DEALER_VERSION::'
};

let _SPREADSHEET = null;

/***** SHARED HELPERS *****/
function ss() {
  if (!_SPREADSHEET) _SPREADSHEET = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _SPREADSHEET;
}

function getSheet_(name) {
  return ss().getSheetByName(name);
}

function getOrCreateSheet_(name) {
  const spreadsheet = ss();
  const sheet = spreadsheet.getSheetByName(name);
  return sheet || spreadsheet.insertSheet(name);
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function now_() { return new Date(); }

function normalizeTerm_(t) {
  if (!t) return 15;
  const str = String(t).trim();
  return str.startsWith('30') ? 30 : 15;
}

function toYMD_(d) {
  if (!d) return '';
  try {
    return Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } catch (e) {
    return '';
  }
}

function parseDateOnly_(val) {
  if (!val) return new Date();
  try {
    const parts = String(val).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  } catch (e) {
    return new Date();
  }
}

function productKey_(product, category, size) {
  return String(product || '') + '||' + String(category || '') + '||' + String(size || '');
}

function normalizeHeader_(v) {
  return String(v || '').trim().toLowerCase();
}

function findHeaderIndex_(headers, names) {
  for (var i = 0; i < headers.length; i++) {
    if (names.indexOf(headers[i]) !== -1) return i + 1;
  }
  return null;
}

function getRowVal_(row, idx) {
  if (!idx) return '';
  return row[idx - 1];
}

function preserveZeroOrBlank_(val) {
  if (val === 0) return 0;
  return val || '';
}

function normalizeNumberOrBlank_(val) {
  if (val === 0) return 0;
  if (val === null || val === undefined) return '';
  var str = String(val).trim();
  if (!str) return '';
  var num = Number(str);
  return isNaN(num) ? '' : num;
}

function isValidRate_(val) {
  if (val === null || val === undefined) return false;
  const str = String(val).trim();
  if (!str || str === '—') return false;
  const num = Number(str);
  return isNaN(num) || num !== 0;
}

/***** SAFE RANGE HELPERS *****/
function safeGetValues(sheet, startRow, startCol, numRows, numCols) {
  if (!sheet || numRows <= 0 || numCols <= 0) return [];
  try {
    return sheet.getRange(startRow, startCol, numRows, numCols).getValues();
  } catch (e) {
    return [];
  }
}

function getSheetColumnValues_(sheet, colIndex) {
  if (!sheet) return [];
  const totalRows = Math.max(0, sheet.getLastRow() - 1);
  if (!totalRows) return [];
  return safeGetValues(sheet, 2, colIndex, totalRows, 1)
    .flat()
    .filter(function (v) { return String(v).trim() !== ''; });
}

/***** VERSION + CACHE HELPERS *****/
function scriptProps_() {
  return PropertiesService.getScriptProperties();
}

function readVersion_(key) {
  return scriptProps_().getProperty(key) || '0';
}

function bumpVersion_(key) {
  const next = String(Date.now());
  scriptProps_().setProperty(key, next);
  return next;
}

function dealerVersionKey_(dealer) {
  return PROP_KEYS.DEALER_VERSION_PREFIX + hashKey_(dealer);
}

function getDealerVersion_(dealer) {
  return readVersion_(dealerVersionKey_(dealer));
}

function bumpDealerVersion_(dealer) {
  return bumpVersion_(dealerVersionKey_(dealer));
}

function hashKey_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''));
  return bytes.map(function (b) {
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function cacheStem_(type, dealer, extra) {
  const dealerPart = dealer ? hashKey_(dealer) : 'global';
  return ['vr3', type, dealerPart, extra || '0'].join(':');
}

function cachePutJson_(key, obj, ttlSeconds) {
  try {
    const json = JSON.stringify(obj);
    const gz = Utilities.gzip(Utilities.newBlob(json, 'application/json')).getBytes();
    const encoded = Utilities.base64EncodeWebSafe(gz);
    const chunks = [];
    for (let i = 0; i < encoded.length; i += CACHE_CHUNK_SIZE) {
      chunks.push(encoded.slice(i, i + CACHE_CHUNK_SIZE));
    }

    const cache = CacheService.getScriptCache();
    const payload = {};
    payload[key + ':meta'] = String(chunks.length);
    chunks.forEach(function (chunk, idx) {
      payload[key + ':c:' + idx] = chunk;
    });
    cache.putAll(payload, ttlSeconds || CACHE_TTL.MASTER);
  } catch (e) {
    console.warn('Cache write skipped:', e && e.message ? e.message : e);
  }
}

function cacheGetJson_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const meta = cache.get(key + ':meta');
    if (!meta) return null;
    const count = Number(meta);
    if (!count || count < 1 || count > 100) return null;

    const keys = [];
    for (let i = 0; i < count; i++) keys.push(key + ':c:' + i);
    const values = cache.getAll(keys);
    let encoded = '';
    for (let i = 0; i < keys.length; i++) {
      if (!values[keys[i]]) return null;
      encoded += values[keys[i]];
    }

    const bytes = Utilities.base64DecodeWebSafe(encoded);
    const json = Utilities.ungzip(Utilities.newBlob(bytes)).getDataAsString();
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}
