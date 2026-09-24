/**
 * Chhote helper functions jo har file use karti hai.
 */

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function businessName_() {
  return prop_('BUSINESS_NAME') || 'Meri Dukaan';
}

function ownerEmail_() {
  return prop_('OWNER_EMAIL') || Session.getEffectiveUser().getEmail();
}

function getSpreadsheet_() {
  const id = prop_('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet nahi mili. Script Properties mein SHEET_ID daaliye.');
  return ss;
}

function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" nahi mili.');
  return sh;
}


/* ── Date aur number ── */

function fmtDate_(d, pattern) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), pattern || 'yyyy-MM-dd');
}

/** Aaj ki date, raat 12 baje wali (time hata ke) */
function today_() {
  return toDate_(fmtDate_(new Date()));
}

/** Date, "2026-09-24" ya "24/09/2026" ko Date mein badalna */
function toDate_(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  let m = String(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = String(v).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function addDays_(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween_(from, to) {
  return Math.round((toDate_(fmtDate_(to)) - toDate_(fmtDate_(from))) / 86400000);
}

/** "₹1,200" → 1200 ; khaali → 0 */
function num_(v) {
  const n = Number(String(v === undefined || v === null ? '' : v).replace(/[₹,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

/** Value di gayi hai ya nahi */
function has_(v) {
  return v !== undefined && v !== null && v !== '';
}

/** Naam milana bina capital/small letter ki fikr kiye */
function same_(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function isYes_(v) {
  return v === true || ['yes', 'y', 'haan', 'true', '1'].indexOf(String(v).trim().toLowerCase()) !== -1;
}


/* ── Sheet ko "table" ki tarah use karna ── */

/**
 * Sheet padh ke objects bana deta hai:
 *   rows = [{ Customer: 'Ramesh', Amount: 500, _row: 2 }, ...]
 * _row = sheet mein asli row number (update ke kaam aata hai)
 */
function readTable_(name) {
  const sheet = getSheet_(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const rows = [];
  values.slice(1).forEach(function (r, i) {
    if (r.join('') === '') return; // khaali row chhodo
    const obj = { _row: i + 2 };
    headers.forEach(function (h, j) { obj[h] = r[j]; });
    rows.push(obj);
  });
  return { sheet: sheet, headers: headers, rows: rows };
}

/** Ek row ki kuch cells badalna: updateRow_(table, row, { Status: 'Paid' }) */
function updateRow_(table, row, changes) {
  Object.keys(changes).forEach(function (h) {
    const col = table.headers.indexOf(h);
    if (col === -1) throw new Error('"' + table.sheet.getName() + '" sheet mein "' + h + '" column nahi hai.');
    table.sheet.getRange(row._row, col + 1).setValue(changes[h]);
    row[h] = changes[h];
  });
}

/** Object ko nayi row bana ke neeche jodna (headers ke order mein) */
function appendObject_(table, obj) {
  table.sheet.appendRow(table.headers.map(function (h) { return has_(obj[h]) ? obj[h] : ''; }));
}

/** Kisi column mein naam se row dhoondhna */
function findRow_(rows, column, value) {
  return rows.filter(function (r) { return same_(r[column], value); })[0] || null;
}

/** Log sheet mein likhna: employee ne kya kiya */
function log_(kaam, details) {
  try {
    getSheet_('Log').appendRow([new Date(), kaam, details]);
  } catch (e) {
    // Log sheet na ho toh kaam mat roko
  }
}
