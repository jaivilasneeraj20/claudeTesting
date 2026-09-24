/**
 * Nexus CRM on Google Apps Script. Code.gs = all "web routes" (was main.py).
 *
 * The page calls  api("contacts/5", "PUT", {...}, token)  through google.script.run,
 * exactly like the FastAPI version called  fetch("/api/contacts/5", {method: "PUT"}).
 */

// Opens the web app. The very first time it also creates the sheet tabs and demo data.
function doGet() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("DB_READY")) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      if (!props.getProperty("DB_READY")) {
        setup();
        props.setProperty("DB_READY", "yes");
      }
    } finally {
      lock.releaseLock();
    }
  }
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Nexus CRM")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// <?!= include_("Style") ?> inside Index.html pastes another file in.
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// Stops a route with an error message, like HTTPException in FastAPI.
function fail_(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}


// ---------------------------------------------------------------- the one entry point

// Every request from the browser comes here. Returns JSON text: {status, data} or {status, detail}.
function api(path, method, body, token) {
  method = String(method || "GET").toUpperCase();
  body = body || {};
  const lock = method === "GET" ? null : LockService.getScriptLock();
  try {
    if (lock) lock.waitLock(30000); // one change at a time, so rows never clash
    CACHE = {};
    return JSON.stringify({ status: 200, data: route_(String(path || ""), method, body, token) });
  } catch (error) {
    if (!error.status) console.error(error.stack || error);
    return JSON.stringify({ status: error.status || 500, detail: error.message || "Something went wrong" });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function route_(path, method, body, token) {
  const [first, second] = path.replace(/^\/+|\/+$/g, "").split("/");
  const is = (m, p) => method === m && path === p;

  // no login needed
  if (is("POST", "auth/signup")) return signup_(body);
  if (is("POST", "auth/login")) return login_(body);
  if (is("POST", "auth/logout")) return { ok: true };

  // login check (was the "require_login" middleware)
  const user = currentUser_(token);
  if (!user) fail_(401, "Please log in");

  if (is("GET", "me")) return user;
  if (is("PUT", "me")) return updateMe_(user, body);
  if (is("GET", "stats")) return dashboard_(user);
  if (is("GET", "notifications")) return notifications_();
  if (is("GET", "all")) return everything_();
  if (method === "GET" && first === "export") return exportCsv_(second);
  if (is("POST", "import/contacts")) return importContacts_(body);

  // CRUD for every table: contacts, companies, deals, tasks, activities
  checkTable_(first);
  if (second === undefined) {
    if (method === "GET") return allRows_(first);
    if (method === "POST") return createRow_(first, body);
  } else {
    if (!/^\d+$/.test(second)) fail_(404, "Not found");
    if (method === "PUT") return updateItem_(first, Number(second), body);
    if (method === "DELETE") return deleteItem_(first, Number(second));
  }
  fail_(404, "Not found");
}


// ---------------------------------------------------------------- login

function publicUser_(user) {
  return user && { id: user.id, name: user.name, email: user.email, target: user.target };
}

function currentUser_(token) {
  const userId = readToken_(token);
  return userId ? publicUser_(getRow_("users", userId)) : null;
}

function loggedIn_(user) {
  return Object.assign(publicUser_(user), { token: makeToken_(user.id) });
}

function signup_(data) {
  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  if (!name || !email.includes("@")) fail_(400, "Please enter your name and a valid email");
  if (password.length < 6) fail_(400, "Password must be at least 6 characters");
  if (findRow_("users", "email", email)) fail_(400, "An account with this email already exists");
  const user = insertRow_("users", { name, email, password_hash: hashPassword_(password) });
  return loggedIn_(user);
}

function login_(data) {
  const email = String(data.email || "").trim().toLowerCase();
  const user = findRow_("users", "email", email);
  if (!user || !checkPassword_(String(data.password || ""), user.password_hash)) fail_(401, "Wrong email or password");
  return loggedIn_(user);
}

function updateMe_(user, data) {
  const name = String(data.name ?? user.name).trim() || user.name;
  const target = Number(data.target ?? user.target) || 0;
  return publicUser_(updateRow_("users", user.id, { name, target }));
}


// ---------------------------------------------------------------- dashboard

// All CRM data in one call. The page filters and searches it instantly.
function everything_() {
  const out = {};
  Object.keys(FIELDS).forEach((table) => { out[table] = allRows_(table); });
  return out;
}


// ---------------------------------------------------------------- CSV export / import

function csvCell_(value) {
  const text = toCell_(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Returns {filename, csv}; the page turns it into a download.
function exportCsv_(table) {
  checkTable_(table);
  const columns = ["id", ...Object.keys(FIELDS[table]), "created_at"];
  const lines = [columns.join(",")].concat(allRows_(table).map((row) => columns.map((c) => csvCell_(row[c])).join(",")));
  return { filename: `${table}.csv`, csv: lines.join("\r\n") + "\r\n" };
}

// Tiny CSV reader: handles quotes, commas and new lines inside quotes.
function parseCsv_(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  text = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  return rows.map((cells) => {
    const out = {};
    header.forEach((h, i) => { if (h) out[h] = (cells[i] || "").trim(); });
    return out;
  });
}

// Expects {csv: "..."} with columns like name, email, phone, company, status, source.
function importContacts_(data) {
  let added = 0;
  parseCsv_(data.csv).forEach((row) => {
    if (!row.name) return;
    const companyName = row.company || "";
    delete row.company;
    if (companyName) {
      const company = findRow_("companies", "name", companyName);
      row.company_id = company ? company.id : insertRow_("companies", { name: companyName }).id;
    }
    if (!CHOICES.status.includes(row.status)) row.status = "Lead";
    insertRow_("contacts", clean_("contacts", row));
    added++;
  });
  return { added };
}


// ---------------------------------------------------------------- CRUD for every table

function checkTable_(table) {
  if (!FIELDS[table]) fail_(404, "Unknown table");
}

function getOr404_(table, id) {
  const row = getRow_(table, id);
  if (!row) fail_(404, "Not found");
  return row;
}

function createRow_(table, data) {
  const row = insertRow_(table, clean_(table, data));
  if (table === "deals") logActivity_(`New deal "${row.title}" created`, row.contact_id, row.id);
  return row;
}

function updateItem_(table, id, data) {
  const old = getOr404_(table, id);
  const changes = clean_(table, data, false);

  // a deal that is won or lost is closed today (unless it already has a past close date)
  const today = today_();
  if (table === "deals" && ["Won", "Lost"].includes(changes.stage) && old.stage !== changes.stage) {
    const close = changes.close_date || old.close_date;
    if (!close || close > today) changes.close_date = today;
  }

  const row = updateRow_(table, id, changes);

  // automatic timeline entries
  if (table === "deals" && row.stage !== old.stage) logActivity_(`Deal "${row.title}" moved to ${row.stage}`, row.contact_id, id);
  if (table === "tasks" && row.done && !old.done) logActivity_(`Completed task "${row.title}"`, row.contact_id);
  return row;
}

function deleteItem_(table, id) {
  getOr404_(table, id);
  deleteRow_(table, id);
  return { ok: true };
}
