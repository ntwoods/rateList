// viewRates.js
const API_URL = "https://script.google.com/macros/s/AKfycbzazzIRUjj-G39MAfRWx5fb0SXsP8OAu14nuzUa_tpX4Sj7Q1a2ZopHHh3tj47x_Plx0g/exec";

const VIEW_INIT_ACTION = "getViewInitialData";
const VIEW_LATEST_ACTION = "getViewDealerLatest";
const VIEW_HISTORY_ACTION = "getViewDealerRates";
const VIEW_PRODUCT_HISTORY_ACTION = "getViewProductHistory";
const VIEW_VERSION_ACTION = "getViewDealerVersion";
const LEGACY_INIT_ACTION = "getInitialData";
const LEGACY_RATES_ACTION = "getDealerRates";

const DEFAULT_VIEW_MODE = "compact";
const DEFAULT_WEF_MODE = "latest";
const DEFAULT_HIDE_NO_RATE = true;
const OLD_RATE_CUTOFF = new Date(2026, 2, 29);
const NO_VALUE_TEXT = "—";
const AUTO_REFRESH_MS = 20000;
const LEGACY_REFRESH_MS = 60000;
const DEALER_CACHE_KEY = "rateList:viewRate:dealers:v2";

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
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 1800);
}

function showPageLoader(show) {
  $("#pageLoader")?.classList.toggle("hide", !show);
}

function setBtnLoading(btn, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.classList.toggle("loading", isLoading);
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

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { cache: "no-store", ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function apiUrl(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function parseWefDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return createValidDate_(Number(match[1]), Number(match[2]), Number(match[3]));

  match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) return createValidDate_(Number(match[3]), Number(match[2]), Number(match[1]));

  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return null;
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

function createValidDate_(year, month, day) {
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function isOldRateWef(wef) {
  const d = parseWefDateSafe(wef);
  return !!d && d.getTime() < OLD_RATE_CUTOFF.getTime();
}

function toProductKey(item) {
  return `${item?.product || ""}||${item?.category || ""}||${item?.size || ""}`;
}

function isValidRate(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).trim();
  if (!s || s === NO_VALUE_TEXT) return false;
  const n = Number(s);
  return Number.isNaN(n) || n !== 0;
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
  return String(rounded).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
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
  return s === NO_VALUE_TEXT || s.endsWith("d") ? s : `${s}d`;
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

  return `<div class="kv">${rows.map(({ k, v }) => (
    `<div class="kv-row"><span class="k">${escHtml(k)}</span><span class="v">${escHtml(formatValue(v))}</span></div>`
  )).join("")}</div>`;
}

function cellStackHtml(cell, opts = {}) {
  if (!cell) return `<div class="cell-empty">${NO_VALUE_TEXT}</div>`;
  const showGola = !!opts.showGola;
  const golaExpr = showGola
    ? formatGolaPrice(cell.rate, cell.golaAddPrice ?? cell.golaAdd ?? cell.gola)
    : NO_VALUE_TEXT;

  return `
    <div class="cell-stack">
      <div class="cell-line cell-rate"><span class="cell-key">Rate</span><span class="cell-val">${escHtml(formatValue(cell.rate))}</span></div>
      <div class="cell-line"><span class="cell-key">Term</span><span class="cell-val">${escHtml(formatTermValue(cell.term))}</span></div>
      <div class="cell-line"><span class="cell-key">GST</span><span class="cell-val">${escHtml(formatValue(cell.gstType))}</span></div>
      <div class="cell-line"><span class="cell-key">Freight</span><span class="cell-val">${escHtml(formatValue(cell.freight))}</span></div>
      <div class="cell-line"><span class="cell-key">CD</span><span class="cell-val">${escHtml(formatCd(cell))}</span></div>
      <div class="cell-line"><span class="cell-key">Brand</span><span class="cell-val">${escHtml(formatValue(cell.brand))}</span></div>
      ${golaExpr !== NO_VALUE_TEXT ? `<div class="cell-line"><span class="cell-key">Gola Service Price</span><span class="cell-val gola-price golaGreen">${escHtml(golaExpr)}</span></div>` : ""}
    </div>`;
}

function getGolaExpression(cell) {
  if (!cell) return "";
  const expr = formatGolaPrice(cell.rate, cell.golaAddPrice ?? cell.golaAdd ?? cell.gola);
  return expr === NO_VALUE_TEXT ? "" : expr;
}

/* ========= State ========= */
let LAST_DATA = null;
let DEALER_HISTORY_DATA = null;
let FILTERS_BOUND = false;
let ACTIVE_RENDER_ROWS = [];
let FILTER_INDEX = { categories: [], productsByCategory: new Map(), allProducts: [] };
let VIEW_DATA_CACHE = { source: null, mode: "", data: null };
let PRODUCT_HISTORY_CACHE = new Map();
let VIEW_MODE = DEFAULT_VIEW_MODE;
let WEF_MODE = DEFAULT_WEF_MODE;
let SEARCH_Q = "";
let HIDE_NO_RATE = false;
let ACTIVE_DEALER = "";
let ACTIVE_VERSION = "";
let VERSION_ENDPOINT_SUPPORTED = true;
let LAST_IS_MOBILE = isMobile();
