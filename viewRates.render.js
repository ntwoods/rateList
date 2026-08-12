/* ========= Cards ========= */
function renderCards(data) {
  const cards = $("#ratesCards");
  if (!cards) return [];
  cards.innerHTML = "";
  cards.classList.toggle("product-grid", !isMobile());

  const rows = [];
  const frag = document.createDocumentFragment();
  const viewWefs = Array.isArray(data.wefDates) ? data.wefDates : [];

  getRenderProducts_(data).forEach((p) => {
    const key = toProductKey(p);
    const meta = getProductMeta_(data, key);
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

    const header = document.createElement("div");
    header.className = "product-header";
    header.innerHTML = `
      <div>
        <div class="product-title">${escHtml(p.product || "")}</div>
        <div class="product-meta">${escHtml(p.category || "")} &gt; ${escHtml(p.size || "")}</div>
      </div>
      <div class="badge-row">
        <div class="badge">${showWef ? `WEF ${escHtml(showWef)}` : "WEF --"}</div>
        ${markOldRate ? `<div class="badge old-rate-badge">Old Rate</div>` : ""}
      </div>`;
    card.appendChild(header);

    const normalRate = showCell ? formatValue(showCell.rate) : NO_VALUE_TEXT;
    const hasDealerGola = !!data._hasGola;
    const golaRate = showCell ? formatGolaPrice(showCell.rate, showCell.golaAddPrice ?? showCell.golaAdd ?? showCell.gola) : NO_VALUE_TEXT;
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
          </div>` : ""}
      </div>
      <div class="divider"></div>
      <div class="attr-block">${renderKVBlock(attrs)}</div>`;
    card.appendChild(current);

    if (data._wefMode !== "single" && meta?.hasAnyRate) {
      const details = makeHistoryDetails_(p, key, showWef, data);
      if (details) card.appendChild(details);
    }

    frag.appendChild(card);
    rows.push({
      el: card,
      categoryNorm: norm(p.category),
      productNorm: norm(p.product),
      searchNorm: norm(`${p.category || ""} ${p.product || ""} ${p.size || ""}`)
    });
  });

  cards.appendChild(frag);
  return rows;
}

/* ========= Tables ========= */
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
  getRenderProducts_(data).forEach((p) => {
    const key = toProductKey(p);
    const tr = document.createElement("tr");
    [p.category || "", p.product || "", p.size || ""].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });

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
      searchNorm: norm(`${p.category || ""} ${p.product || ""} ${p.size || ""}`)
    });
  });

  tbody.appendChild(frag);
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  return rows;
}

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
  getRenderProducts_(data).forEach((p) => {
    const tr = document.createElement("tr");
    [p.category || "", p.product || "", p.size || ""].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });

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
      searchNorm: norm(`${p.category || ""} ${p.product || ""} ${p.size || ""}`)
    });
  });

  tbody.appendChild(frag);
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  return rows;
}

/* ========= Resize ========= */
window.addEventListener("resize", debounce(() => {
  const mobileNow = isMobile();
  if (!LAST_DATA || mobileNow === LAST_IS_MOBILE) return;
  LAST_IS_MOBILE = mobileNow;
  renderRatesView(getViewData());
  applyFilters();
}, 200));

/* ========= Boot ========= */
init();
