/***** ADDING FLOW *****/
function addDealer_(name) {
  if (!name) return { ok: false, error: 'Dealer required' };
  const s = getOrCreateSheet_(SHEETS.DEALERS);
  const all = getSheetColumnValues_(s, 1).map(function (v) { return String(v).toLowerCase(); });
  if (all.indexOf(String(name).toLowerCase()) !== -1) {
    return { ok: true, created: false, message: 'Dealer exists' };
  }
  s.appendRow([name, now_()]);
  bumpVersion_(PROP_KEYS.DEALERS_VERSION);
  return { ok: true, created: true };
}

function addCategory_(name) {
  if (!name) return { ok: false, error: 'Category required' };
  const s = getOrCreateSheet_(SHEETS.CATEGORIES);
  const all = getSheetColumnValues_(s, 1).map(function (v) { return String(v).toLowerCase(); });
  if (all.indexOf(String(name).toLowerCase()) !== -1) {
    return { ok: true, created: false, message: 'Category exists' };
  }
  s.appendRow([name, now_()]);
  return { ok: true, created: true };
}

function addBrand_(name) {
  if (!name) return { ok: false, error: 'Brand required' };
  const s = getOrCreateSheet_(SHEETS.BRANDS);
  const all = getSheetColumnValues_(s, 1).map(function (v) { return String(v).toLowerCase(); });
  if (all.indexOf(String(name).toLowerCase()) !== -1) {
    return { ok: true, created: false, message: 'Brand exists' };
  }
  s.appendRow([name, now_()]);
  return { ok: true, created: true };
}

function addProduct_(prod, cat, size) {
  if (!prod || !cat || !size) return { ok: false, error: 'All fields required' };
  const s = getOrCreateSheet_(SHEETS.PRODUCTS);
  const rows = Math.max(0, s.getLastRow() - 1);
  const vals = safeGetValues(s, 2, 1, rows, 5);
  const exists = vals.some(function (r) {
    return String(r[0]).toLowerCase() === String(prod).toLowerCase() &&
      String(r[1]).toLowerCase() === String(cat).toLowerCase() &&
      String(r[2]).toLowerCase() === String(size).toLowerCase();
  });
  if (exists) return { ok: true, created: false, message: 'Product exists' };
  s.appendRow([prod, cat, size, true, now_()]);
  bumpVersion_(PROP_KEYS.PRODUCTS_VERSION);
  return { ok: true, created: true };
}

/***** SAVE RATES *****/
function saveRates_(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    const dealer = payload.dealer || '';
    const wefDate = payload.wefDate || toYMD_(new Date());
    const applyTerm = payload.applyTerm || 'all';
    const globalTerm = payload.globalTerm || 15;
    const applyGst = payload.applyGst || 'all';
    const globalGst = payload.globalGst || 'Paid';
    const items = payload.items || [];
    const wef = parseDateOnly_(wefDate);
    const wefKey = toYMD_(wef);
    const termAll = normalizeTerm_(globalTerm);
    const applyFreight = payload.applyFreight || 'all';
    const globalFreight = (payload.globalFreight !== undefined ? String(payload.globalFreight).trim() : 'Extra') || 'Extra';
    const applyCd = payload.applyCd || 'all';
    const globalCd = (payload.globalCd !== undefined ? String(payload.globalCd).trim() : '');
    const applyGola = payload.applyGola || 'all';
    const globalGola = payload.globalGola;

    const s = getOrCreateSheet_(SHEETS.RATES);
    const schema = getRatesSchema_(s, { ensureGolaHeader: true });
    const uniqueReadLastCol = Math.max(
      schema.indexes.dealer || 0,
      schema.indexes.product || 0,
      schema.indexes.category || 0,
      schema.indexes.size || 0,
      schema.indexes.wef || 0
    );

    const vals = readDealerRows_(s, schema, String(dealer).trim(), uniqueReadLastCol);
    const existing = new Set();
    vals.forEach(function (r) {
      const exDealer = getRowVal_(r, schema.indexes.dealer);
      const exProduct = getRowVal_(r, schema.indexes.product);
      const exCategory = getRowVal_(r, schema.indexes.category);
      const exSize = getRowVal_(r, schema.indexes.size);
      const exWef = toYMD_(getRowVal_(r, schema.indexes.wef));
      existing.add(exDealer + '||' + exProduct + '||' + exCategory + '||' + exSize + '||' + exWef);
    });

    const toAppend = [];
    let skipped = 0;
    items.forEach(function (it) {
      if (!it || !it.product || !it.category || !it.size || !it.rate) return;
      const key = dealer + '||' + it.product + '||' + it.category + '||' + it.size + '||' + wefKey;
      if (existing.has(key)) {
        skipped++;
        return;
      }

      const term = applyTerm === 'per-item' ? normalizeTerm_(it.term) : termAll;
      const brand = it.brand ? String(it.brand).trim() : '';
      const gstType = applyGst === 'per-item'
        ? (it.gstType ? String(it.gstType).trim() : 'Paid')
        : (String(globalGst).trim() || 'Paid');
      const freight = applyFreight === 'per-item'
        ? (it.freight !== undefined ? String(it.freight).trim() : '')
        : globalFreight;
      const cd = applyCd === 'per-item'
        ? (it.cdValue !== undefined ? String(it.cdValue).trim() : '')
        : globalCd;
      const golaAdd = normalizeNumberOrBlank_(
        it.golaAddPrice !== undefined ? it.golaAddPrice : (applyGola === 'per-item' ? '' : globalGola)
      );

      const row = new Array(schema.lastCol).fill('');
      row[schema.indexes.dealer - 1] = dealer;
      row[schema.indexes.category - 1] = it.category;
      row[schema.indexes.product - 1] = it.product;
      row[schema.indexes.size - 1] = it.size;
      row[schema.indexes.wef - 1] = wef;
      row[schema.indexes.rate - 1] = it.rate;
      row[schema.indexes.term - 1] = term;
      row[schema.indexes.brand - 1] = brand;
      row[schema.indexes.gst - 1] = gstType;
      row[schema.indexes.freight - 1] = freight;
      row[schema.indexes.cd - 1] = cd;
      row[schema.indexes.savedOn - 1] = now_();
      if (schema.indexes.gola) row[schema.indexes.gola - 1] = golaAdd;
      toAppend.push(row);
      existing.add(key);
    });

    if (toAppend.length) {
      s.getRange(s.getLastRow() + 1, 1, toAppend.length, toAppend[0].length).setValues(toAppend);
      bumpDealerVersion_(String(dealer).trim());
    }

    return { ok: true, inserted: toAppend.length, skipped: skipped };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}
