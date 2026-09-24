/**
 * Db.gs: the database is a Google Sheet. Every table is one tab, row 1 = column names.
 * Plain functions only, no classes.
 *
 * Names ending with "_" are private: the browser cannot call them with google.script.run.
 */

// Every table and its columns. "id" = link to another table.
const FIELDS = {
  companies: { name: "text", industry: "text", website: "text", phone: "text", city: "text" },
  contacts: { name: "text", email: "text", phone: "text", company_id: "id", status: "text", source: "text" },
  deals: { title: "text", value: "number", stage: "text", contact_id: "id", company_id: "id", close_date: "date" },
  tasks: { title: "text", due_date: "date", priority: "text", done: "bool", contact_id: "id" },
  activities: { type: "text", note: "text", contact_id: "id", deal_id: "id" },
};
const USER_FIELDS = { name: "text", email: "text", password_hash: "text", target: "number" };
const REQUIRED = { companies: "name", contacts: "name", deals: "title", tasks: "title", activities: "note" };

// Default values for new rows (same as DEFAULT in the old SQL tables).
const DEFAULTS = {
  users: { target: 2500000 },
  contacts: { status: "Lead", source: "Website" },
  deals: { value: 0, stage: "Lead" },
  tasks: { priority: "Medium", done: 0 },
  activities: { type: "Note" },
};

const STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const CHOICES = {
  stage: STAGES,
  status: ["Lead", "Prospect", "Customer", "Inactive"],
  priority: ["Low", "Medium", "High"],
  type: ["Call", "Email", "Meeting", "WhatsApp", "Note", "Update"],
};

// When a row is deleted, remove links to it from other tables: [table, column, "clear" or "delete"].
const UNLINK = {
  companies: [["contacts", "company_id", "clear"], ["deals", "company_id", "clear"]],
  contacts: [["deals", "contact_id", "clear"], ["tasks", "contact_id", "clear"], ["activities", "contact_id", "delete"]],
  deals: [["activities", "deal_id", "clear"]],
  tasks: [],
  activities: [],
};

const DB_KEY = "DB_SPREADSHEET_ID";
let CACHE = {}; // rows already read during this request, so each tab is read only once


// ---------------------------------------------------------------- columns & types

function kinds_(table) {
  const fields = table === "users" ? USER_FIELDS : FIELDS[table];
  return Object.assign({ id: "number" }, fields, { created_at: "datetime" });
}

function columns_(table) {
  return Object.keys(kinds_(table));
}

// Sheet cell -> JS value of the right type.
function fromCell_(value, kind) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, TZ, kind === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm:ss");
  }
  if (value === "" || value === null || value === undefined) {
    return { text: "", number: 0, bool: 0 }[kind] ?? null;
  }
  if (kind === "number" || kind === "id" || kind === "bool") return Number(value);
  return String(value);
}

// JS value -> sheet cell. Everything is saved as plain text so Sheets never changes it.
function toCell_(value) {
  return value === null || value === undefined ? "" : String(value);
}


// ---------------------------------------------------------------- the spreadsheet

// Uses the sheet this script is attached to, or creates "Nexus CRM Database" in your Drive.
function book_() {
  if (CACHE.book) return CACHE.book;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(DB_KEY);
  let book = null;
  if (id) {
    try { book = SpreadsheetApp.openById(id); } catch (e) { book = null; }
  }
  if (!book) {
    book = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create("Nexus CRM Database");
    props.setProperty(DB_KEY, book.getId());
  }
  CACHE.book = book;
  return book;
}

// Returns the tab for a table, creating it (or new columns) when missing.
function sheet_(table) {
  const key = "sheet:" + table;
  if (CACHE[key]) return CACHE[key];
  const book = book_();
  let sheet = book.getSheetByName(table);
  if (!sheet) {
    sheet = book.insertSheet(table);
    sheet.getRange("A:Z").setNumberFormat("@"); // plain text: no auto dates / numbers
  }
  const wanted = columns_(table);
  const header = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
  const missing = wanted.filter((c) => !header.includes(c));
  if (missing.length) {
    sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  CACHE[key] = sheet;
  return sheet;
}

function header_(table) {
  const sheet = sheet_(table);
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

// All rows of a table in sheet order (row 2 = first item).
function rows_(table) {
  const key = "rows:" + table;
  if (CACHE[key]) return CACHE[key];
  const sheet = sheet_(table);
  const header = header_(table);
  const kinds = kinds_(table);
  const values = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, header.length).getValues() : [];
  const rows = values
    .filter((cells) => cells[header.indexOf("id")] !== "")
    .map((cells) => {
      const row = {};
      Object.keys(kinds).forEach((col) => { row[col] = fromCell_(cells[header.indexOf(col)], kinds[col]); });
      return row;
    });
  CACHE[key] = rows;
  return rows;
}

function toCells_(table, row) {
  return header_(table).map((col) => toCell_(row[col]));
}

// Write one row (index in rows_ list) back to the sheet.
function writeRow_(table, index, row) {
  const cells = toCells_(table, row);
  sheet_(table).getRange(index + 2, 1, 1, cells.length).setNumberFormat("@").setValues([cells]);
}

// Replace the whole table (used for deletes and demo data).
function writeAll_(table, rows) {
  const sheet = sheet_(table);
  const width = header_(table).length;
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, width).clearContent();
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, width).setNumberFormat("@").setValues(rows.map((r) => toCells_(table, r)));
  }
  CACHE["rows:" + table] = rows;
}

// Run this once from the editor (select "setup" and press Run): creates the tabs and demo data.
function setup() {
  ["users", ...Object.keys(FIELDS)].forEach(sheet_);
  seed_();
  Logger.log("Database: " + book_().getUrl());
}


// ---------------------------------------------------------------- simple CRUD

function copy_(row) {
  return row ? Object.assign({}, row) : null;
}

// Keep only known columns and convert each value to the right type.
function clean_(table, data, isNew = true) {
  const out = {};
  Object.entries(FIELDS[table]).forEach(([key, kind]) => {
    if (!(key in data)) return;
    let value = data[key];
    if (kind === "text") value = String(value ?? "").trim();
    else if (kind === "number") {
      value = Number(value || 0);
      if (isNaN(value)) fail_(422, `${key} must be a number`);
    } else if (kind === "bool") value = value && value !== "0" && value !== "false" ? 1 : 0;
    else if (kind === "id") {
      value = value === null || value === "" || value === undefined ? null : parseInt(value, 10);
      if (Number.isNaN(value)) fail_(422, `${key} must be a number`);
    } else if (kind === "date") {
      value = value ? String(value).slice(0, 10) : null;
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail_(422, `${key} must be a date like 2026-09-24`);
    }
    if (CHOICES[key] && !CHOICES[key].includes(value)) fail_(422, `${key} must be one of: ${CHOICES[key].join(", ")}`);
    out[key] = value;
  });

  const must = REQUIRED[table];
  if ((isNew || must in out) && !out[must]) fail_(422, `${must} is required`);
  return out;
}

// Newest first, like "ORDER BY id DESC".
function allRows_(table) {
  return rows_(table).map(copy_).sort((a, b) => b.id - a.id);
}

function getRow_(table, id) {
  return copy_(rows_(table).find((r) => r.id === Number(id)));
}

function findRow_(table, column, value) {
  return copy_(rows_(table).find((r) => r[column] === value));
}

function newRow_(table, data, rows) {
  const id = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const blank = {};
  Object.entries(kinds_(table)).forEach(([col, kind]) => { blank[col] = fromCell_("", kind); });
  return Object.assign(blank, DEFAULTS[table] || {}, { created_at: now_() }, data, { id });
}

function insertRow_(table, data) {
  const rows = rows_(table);
  const row = newRow_(table, data, rows);
  rows.push(row);
  writeRow_(table, rows.length - 1, row);
  return copy_(row);
}

// Many rows in one go (much faster than one by one).
function insertMany_(table, list) {
  const rows = rows_(table).slice();
  const added = list.map((data) => {
    const row = newRow_(table, data, rows);
    rows.push(row);
    return row;
  });
  writeAll_(table, rows);
  return added.map(copy_);
}

function updateRow_(table, id, data) {
  const rows = rows_(table);
  const index = rows.findIndex((r) => r.id === Number(id));
  if (index < 0) return null;
  Object.assign(rows[index], data);
  writeRow_(table, index, rows[index]);
  return copy_(rows[index]);
}

function deleteRow_(table, id) {
  id = Number(id);
  UNLINK[table].forEach(([other, column, action]) => {
    const rows = rows_(other);
    if (!rows.some((r) => r[column] === id)) return;
    const kept = action === "delete"
      ? rows.filter((r) => r[column] !== id)
      : rows.map((r) => (r[column] === id ? Object.assign(r, { [column]: null }) : r));
    writeAll_(other, kept);
  });
  writeAll_(table, rows_(table).filter((r) => r.id !== id));
}

function logActivity_(note, contactId = null, dealId = null, type = "Update") {
  insertRow_("activities", { type, note, contact_id: contactId, deal_id: dealId });
}


// ---------------------------------------------------------------- dates (script time zone)

const TZ = Session.getScriptTimeZone() || "Asia/Kolkata";

function now_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
}

function today_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
}

// addDays_("2026-09-24", 7) -> "2026-10-01"
function addDays_(iso, days) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
