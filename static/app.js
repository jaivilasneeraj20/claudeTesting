/* ================= Nexus CRM — frontend (vanilla JS, no build step) ================= */

const STAGES = { Lead: "#8b90b0", Qualified: "#3b82f6", Proposal: "#a855f7", Negotiation: "#f59e0b", Won: "#22c55e", Lost: "#f43f5e" };
const STATUS = { Lead: "#3b82f6", Prospect: "#f59e0b", Customer: "#22c55e", Inactive: "#8b90b0" };
const PRIORITY = { High: "#f43f5e", Medium: "#f59e0b", Low: "#22c55e" };

// Form definitions — one place to add / change fields for every module.
const FIELDS = {
  contacts: [
    ["name", "Full name", "text", { required: true }],
    ["email", "Email", "email"],
    ["phone", "Phone", "text"],
    ["company_id", "Company", "ref:companies"],
    ["status", "Status", Object.keys(STATUS)],
    ["source", "Source", ["Website", "Referral", "LinkedIn", "Event", "Cold Call", "Other"]],
  ],
  companies: [
    ["name", "Company name", "text", { required: true }],
    ["industry", "Industry", ["Technology", "Finance", "Healthcare", "Manufacturing", "Retail", "Education", "Other"]],
    ["website", "Website", "text"],
    ["phone", "Phone", "text"],
    ["city", "City", "text", { full: true }],
  ],
  deals: [
    ["title", "Deal title", "text", { required: true, full: true }],
    ["value", "Value (₹)", "number"],
    ["stage", "Stage", Object.keys(STAGES)],
    ["contact_id", "Contact", "ref:contacts"],
    ["company_id", "Company", "ref:companies"],
    ["close_date", "Expected close", "date", { full: true }],
  ],
  tasks: [
    ["title", "Task", "text", { required: true, full: true }],
    ["due_date", "Due date", "date"],
    ["priority", "Priority", Object.keys(PRIORITY), { def: "Medium" }],
    ["contact_id", "Related contact", "ref:contacts", { full: true }],
  ],
};

const VIEWS = {
  dashboard: ["Dashboard", "Your sales at a glance"],
  contacts: ["Contacts", "Everyone you do business with"],
  companies: ["Companies", "Accounts & organisations"],
  deals: ["Deals Pipeline", "Drag cards to move deals between stages"],
  tasks: ["Tasks", "Stay on top of follow-ups"],
};
const SINGULAR = { contacts: "Contact", companies: "Company", deals: "Deal", tasks: "Task" };

let db = { contacts: [], companies: [], deals: [], tasks: [] };
let current = "dashboard";
let filter = { q: "", chip: "All" };
let charts = [];

/* ---------------- helpers ---------------- */
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const short = (n) => (n >= 1e7 ? "₹" + (n / 1e7).toFixed(1) + " Cr" : n >= 1e5 ? "₹" + (n / 1e5).toFixed(1) + " L" : money(n));
const fdate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const initials = (s = "?") => s.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const hue = (s = "") => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
const avatar = (name) => `<div class="avatar" style="--h:${hue(name)}">${esc(initials(name))}</div>`;
const badge = (text, color) => `<span class="badge" style="--c:${color}">${esc(text)}</span>`;
const byId = (list, id) => db[list].find((x) => x.id === id);
const icons = () => lucide.createIcons();
const isOverdue = (t) => !t.done && t.due_date && t.due_date < new Date().toISOString().slice(0, 10);

async function api(path, method = "GET", body) {
  const res = await fetch("/api/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : "Request failed");
  }
  return res.json();
}

async function loadAll() {
  const keys = Object.keys(db);
  const lists = await Promise.all(keys.map((k) => api(k)));
  keys.forEach((k, i) => (db[k] = lists[i]));
  $("#cnt-contacts").textContent = db.contacts.length;
  $("#cnt-companies").textContent = db.companies.length;
  $("#cnt-deals").textContent = db.deals.filter((d) => !["Won", "Lost"].includes(d.stage)).length;
  $("#cnt-tasks").textContent = db.tasks.filter((t) => !t.done).length;
}

function toast(msg, err = false) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.innerHTML = `<i data-lucide="${err ? "alert-circle" : "check-circle-2"}"></i>${esc(msg)}`;
  $("#toasts").append(el);
  icons();
  setTimeout(() => el.remove(), 2800);
}

const empty = (icon, text) => `<div class="empty"><i data-lucide="${icon}"></i><p>${text}</p></div>`;

const toolbar = (placeholder, chips = []) => `
  <div class="toolbar">
    <div class="filter"><i data-lucide="search"></i><input id="q" placeholder="${placeholder}" value="${esc(filter.q)}"></div>
    ${chips.length ? `<div class="chips">${chips.map((c) => `<button class="${filter.chip === c ? "on" : ""}" data-chip="${c}">${c}</button>`).join("")}</div>` : ""}
  </div>`;

function bindToolbar() {
  const q = $("#q");
  if (q) q.oninput = (e) => { filter.q = e.target.value; renderBody(); };
  document.querySelectorAll("[data-chip]").forEach((b) => (b.onclick = () => { filter.chip = b.dataset.chip; render(); }));
}
const match = (...vals) => vals.join(" ").toLowerCase().includes(filter.q.toLowerCase());

/* ---------------- navigation ---------------- */
function go(view) {
  current = view;
  filter = { q: "", chip: "All" };
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  $("#title").textContent = VIEWS[view][0];
  $("#subtitle").textContent = VIEWS[view][1];
  $("#addBtn").style.display = view === "dashboard" ? "none" : "";
  document.body.classList.remove("nav-open");
  location.hash = view;
  render();
}

async function render() {
  await loadAll();
  charts.forEach((c) => c.destroy());
  charts = [];
  await (current === "dashboard" ? renderDashboard() : renderPage());
  icons();
}

// Pages = toolbar (rendered once) + body (re-rendered on typing, keeps input focus)
function renderPage() {
  const tb = {
    contacts: toolbar("Search contacts…", ["All", ...Object.keys(STATUS)]),
    companies: toolbar("Search companies…"),
    deals: toolbar("Search deals…"),
    tasks: toolbar("Search tasks…", ["All", "Pending", "Done", "Overdue"]),
  }[current];
  $("#view").innerHTML = tb + `<div id="body"></div>`;
  bindToolbar();
  renderBody();
}

function renderBody() {
  ({ contacts: contactsBody, companies: companiesBody, deals: dealsBody, tasks: tasksBody })[current]();
  icons();
}

/* ---------------- dashboard ---------------- */
async function renderDashboard() {
  const s = await api("stats");
  const kpi = (icon, label, value, c) =>
    `<div class="card kpi" style="--c:${c}"><div class="ico"><i data-lucide="${icon}"></i></div><small>${label}</small><strong>${value}</strong></div>`;

  $("#view").innerHTML = `
    <div class="grid kpis">
      ${kpi("wallet", "Open pipeline", short(s.pipeline_value), "#7c5cff")}
      ${kpi("trending-up", "Revenue won", short(s.won_value), "#22c55e")}
      ${kpi("target", "Win rate", s.win_rate + "%", "#f59e0b")}
      ${kpi("users", "Total contacts", s.contacts, "#22d3ee")}
    </div>
    <div class="grid two">
      <div class="card"><div class="card-head"><h3>Revenue (last 6 months)</h3><span class="muted">${short(s.won_value)} total</span></div><div class="chart-box"><canvas id="revChart"></canvas></div></div>
      <div class="card"><div class="card-head"><h3>Contacts by status</h3></div><div class="chart-box"><canvas id="statusChart"></canvas></div></div>
    </div>
    <div class="grid two">
      <div class="card"><div class="card-head"><h3>Pipeline by stage</h3><span class="muted">${s.open_deals} open deals</span></div><div class="chart-box"><canvas id="stageChart"></canvas></div></div>
      <div class="card"><div class="card-head"><h3>Upcoming tasks</h3><a class="muted" onclick="go('tasks')">View all →</a></div>
        ${s.upcoming_tasks.map((t) => `
          <div class="list-item">
            <div class="grow"><b>${esc(t.title)}</b><span class="${isOverdue(t) ? "overdue" : ""}">${fdate(t.due_date)}</span></div>
            ${badge(t.priority, PRIORITY[t.priority])}
          </div>`).join("") || empty("party-popper", "All caught up!")}
      </div>
    </div>
    <div class="card"><div class="card-head"><h3>Recent deals</h3><a class="muted" onclick="go('deals')">Open pipeline →</a></div>
      ${s.recent_deals.map((d) => `
        <div class="list-item">
          ${avatar(byId("companies", d.company_id)?.name || d.title)}
          <div class="grow"><b>${esc(d.title)}</b><span>${esc(byId("companies", d.company_id)?.name || "No company")}</span></div>
          ${badge(d.stage, STAGES[d.stage])}<b style="min-width:110px;text-align:right">${money(d.value)}</b>
        </div>`).join("") || empty("inbox", "No deals yet")}
    </div>`;

  const css = getComputedStyle(document.documentElement);
  Chart.defaults.color = css.getPropertyValue("--muted").trim();
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.borderColor = css.getPropertyValue("--border").trim();

  const ctx = $("#revChart").getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, "rgba(124,92,255,.45)");
  grad.addColorStop(1, "rgba(124,92,255,0)");
  charts.push(new Chart(ctx, {
    type: "line",
    data: { labels: Object.keys(s.revenue), datasets: [{ data: Object.values(s.revenue), fill: true, backgroundColor: grad, borderColor: "#7c5cff", borderWidth: 3, cubicInterpolationMode: "monotone", pointBackgroundColor: "#fff", pointBorderColor: "#7c5cff", pointRadius: 5 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.raw) } } }, scales: { y: { ticks: { callback: short }, grid: { drawTicks: false } }, x: { grid: { display: false } } } },
  }));

  charts.push(new Chart($("#statusChart"), {
    type: "doughnut",
    data: { labels: Object.keys(s.contact_status), datasets: [{ data: Object.values(s.contact_status), backgroundColor: Object.keys(s.contact_status).map((k) => STATUS[k] || "#888"), borderWidth: 0, spacing: 4, borderRadius: 6 }] },
    options: { maintainAspectRatio: false, cutout: "72%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, padding: 16 } } } },
  }));

  charts.push(new Chart($("#stageChart"), {
    type: "bar",
    data: { labels: Object.keys(s.pipeline), datasets: [{ data: Object.values(s.pipeline), backgroundColor: Object.keys(s.pipeline).map((k) => STAGES[k]), borderRadius: 10, barThickness: 34 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.raw) } } }, scales: { y: { ticks: { callback: short } }, x: { grid: { display: false } } } },
  }));
}

/* ---------------- contacts ---------------- */
function contactsBody() {
  const rows = db.contacts.filter((c) =>
    (filter.chip === "All" || c.status === filter.chip) &&
    match(c.name, c.email, c.phone, byId("companies", c.company_id)?.name));

  $("#body").innerHTML = `<div class="card table-wrap">${rows.length ? `
    <table>
      <thead><tr><th>Name</th><th>Company</th><th>Phone</th><th>Status</th><th>Source</th><th>Deals</th><th></th></tr></thead>
      <tbody>${rows.map((c) => {
        const deals = db.deals.filter((d) => d.contact_id === c.id);
        return `<tr>
          <td><div class="person">${avatar(c.name)}<div><b>${esc(c.name)}</b><span>${esc(c.email)}</span></div></div></td>
          <td>${esc(byId("companies", c.company_id)?.name || "—")}</td>
          <td class="muted">${esc(c.phone || "—")}</td>
          <td>${badge(c.status, STATUS[c.status])}</td>
          <td class="muted">${esc(c.source)}</td>
          <td><b>${deals.length}</b> <span class="muted">· ${short(deals.reduce((a, d) => a + d.value, 0))}</span></td>
          <td>${actions("contacts", c.id)}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>` : empty("user-search", "No contacts found")}</div>`;
}

const actions = (res, id) => `<div class="row-actions">
  <button class="icon-btn" onclick="openForm('${res}', ${id})" title="Edit"><i data-lucide="pencil"></i></button>
  <button class="icon-btn danger" onclick="removeItem('${res}', ${id})" title="Delete"><i data-lucide="trash-2"></i></button>
</div>`;

/* ---------------- companies ---------------- */
function companiesBody() {
  const rows = db.companies.filter((c) => match(c.name, c.industry, c.city));
  $("#body").innerHTML = rows.length ? `<div class="grid cards">${rows.map((c) => {
    const deals = db.deals.filter((d) => d.company_id === c.id);
    const people = db.contacts.filter((p) => p.company_id === c.id).length;
    return `<div class="card company">
      <div class="top">${avatar(c.name)}<div style="flex:1"><h4>${esc(c.name)}</h4><span class="muted" style="font-size:13px">${esc(c.industry || "—")}</span></div>${actions("companies", c.id)}</div>
      <div class="meta">
        <div><i data-lucide="globe"></i>${esc(c.website || "—")}</div>
        <div><i data-lucide="phone"></i>${esc(c.phone || "—")}</div>
        <div><i data-lucide="map-pin"></i>${esc(c.city || "—")}</div>
      </div>
      <div class="stats">
        <div><b>${people}</b><span>Contacts</span></div>
        <div><b>${deals.length}</b><span>Deals</span></div>
        <div><b>${short(deals.filter((d) => d.stage === "Won").reduce((a, d) => a + d.value, 0))}</b><span>Won</span></div>
      </div>
    </div>`;
  }).join("")}</div>` : `<div class="card">${empty("building-2", "No companies found")}</div>`;
}

/* ---------------- deals (kanban) ---------------- */
function dealsBody() {
  const rows = db.deals.filter((d) => match(d.title, byId("companies", d.company_id)?.name, byId("contacts", d.contact_id)?.name));
  $("#body").innerHTML = `<div class="kanban">${Object.entries(STAGES).map(([stage, c]) => {
    const list = rows.filter((d) => d.stage === stage);
    return `<div class="col" data-stage="${stage}" style="--c:${c}">
      <div class="col-head"><i></i>${stage}<em>${list.length}</em></div>
      <div class="col-total">${money(list.reduce((a, d) => a + d.value, 0))}</div>
      ${list.map((d) => {
        const person = byId("contacts", d.contact_id)?.name;
        return `<div class="deal" draggable="true" data-id="${d.id}" ondblclick="openForm('deals', ${d.id})">
          <b>${esc(d.title)}</b>
          <div class="val">${money(d.value)}</div>
          <div class="muted" style="font-size:12.5px;margin-top:4px">${esc(byId("companies", d.company_id)?.name || "No company")}</div>
          <div class="foot">
            <span><i data-lucide="calendar" style="width:13px;height:13px;vertical-align:-2px"></i> ${fdate(d.close_date)}</span>
            ${person ? avatar(person) : ""}
          </div>
        </div>`;
      }).join("")}
    </div>`;
  }).join("")}</div>`;

  // native HTML5 drag & drop
  document.querySelectorAll(".deal").forEach((el) => {
    el.ondragstart = (e) => { e.dataTransfer.setData("id", el.dataset.id); el.classList.add("dragging"); };
    el.ondragend = () => el.classList.remove("dragging");
  });
  document.querySelectorAll(".col").forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add("over"); };
    col.ondragleave = () => col.classList.remove("over");
    col.ondrop = async (e) => {
      col.classList.remove("over");
      const id = +e.dataTransfer.getData("id");
      const deal = byId("deals", id);
      if (!deal || deal.stage === col.dataset.stage) return;
      await api(`deals/${id}`, "PUT", { stage: col.dataset.stage });
      toast(`"${deal.title}" moved to ${col.dataset.stage}`);
      await loadAll();
      renderBody();
    };
  });
}

/* ---------------- tasks ---------------- */
function tasksBody() {
  const rows = db.tasks
    .filter((t) => ({ All: true, Pending: !t.done, Done: t.done, Overdue: isOverdue(t) })[filter.chip])
    .filter((t) => match(t.title, byId("contacts", t.contact_id)?.name))
    .sort((a, b) => a.done - b.done || (a.due_date || "9").localeCompare(b.due_date || "9"));

  $("#body").innerHTML = `<div class="card table-wrap">${rows.map((t) => `
    <div class="task ${t.done ? "done" : ""}">
      <div class="check" onclick="toggleTask(${t.id})"><i data-lucide="check"></i></div>
      <div class="body"><b>${esc(t.title)}</b>
        <span class="${isOverdue(t) ? "overdue" : ""}">
          <i data-lucide="calendar" style="width:13px;height:13px;vertical-align:-2px"></i> ${fdate(t.due_date)}${isOverdue(t) ? " · Overdue" : ""}
          ${t.contact_id ? ` · <i data-lucide="user" style="width:13px;height:13px;vertical-align:-2px"></i> ${esc(byId("contacts", t.contact_id)?.name || "")}` : ""}
        </span>
      </div>
      ${badge(t.priority, PRIORITY[t.priority])}
      ${actions("tasks", t.id)}
    </div>`).join("") || empty("check-check", "No tasks here")}</div>`;
}

async function toggleTask(id) {
  const t = byId("tasks", id);
  await api(`tasks/${id}`, "PUT", { done: !t.done });
  toast(t.done ? "Task reopened" : "Task completed 🎉");
  await loadAll();
  renderBody();
}

/* ---------------- create / edit / delete ---------------- */
let editing = null; // { res, id }

function openForm(res, id = null) {
  editing = { res, id };
  const item = id ? byId(res, id) : {};
  $("#modalTitle").textContent = (id ? "Edit " : "New ") + SINGULAR[res];
  $("#formFields").innerHTML = FIELDS[res].map(([key, label, type, opt = {}]) => {
    const v = item[key] ?? opt.def ?? "";
    let input;
    if (Array.isArray(type)) {
      input = `<select name="${key}">${type.map((o) => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    } else if (type.startsWith("ref:")) {
      const list = db[type.slice(4)];
      input = `<select name="${key}"><option value="">— None —</option>${list.map((o) => `<option value="${o.id}" ${o.id === v ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select>`;
    } else {
      input = `<input name="${key}" type="${type}" value="${esc(v)}" ${opt.required ? "required" : ""} ${type === "number" ? 'min="0" step="any"' : ""}>`;
    }
    return `<label class="${opt.full ? "full" : ""}">${label}${input}</label>`;
  }).join("");
  $("#modal").classList.add("open");
  icons();
  setTimeout(() => $("#formFields input")?.focus(), 50);
}

function closeModal() { $("#modal").classList.remove("open"); }

$("#form").onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  for (const [key, , type] of FIELDS[editing.res]) {
    if (type === "number") data[key] = +data[key] || 0;
    if (typeof type === "string" && type.startsWith("ref:")) data[key] = data[key] ? +data[key] : null;
  }
  try {
    const { res, id } = editing;
    await api(id ? `${res}/${id}` : res, id ? "PUT" : "POST", data);
    closeModal();
    toast(`${SINGULAR[res]} ${id ? "updated" : "created"}`);
    render();
  } catch (err) {
    toast(err.message, true);
  }
};

async function removeItem(res, id) {
  if (!confirm(`Delete this ${SINGULAR[res].toLowerCase()}?`)) return;
  try {
    await api(`${res}/${id}`, "DELETE");
    toast(`${SINGULAR[res]} deleted`);
    render();
  } catch (err) {
    toast("Can't delete — it's linked to other records", true);
  }
}

/* ---------------- global search (Ctrl/⌘ K) ---------------- */
function openSearch() {
  $("#palette").classList.add("open");
  $("#paletteInput").value = "";
  $("#paletteResults").innerHTML = "";
  setTimeout(() => $("#paletteInput").focus(), 50);
}

let searchTimer;
$("#paletteInput").oninput = (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) return ($("#paletteResults").innerHTML = "");
  searchTimer = setTimeout(async () => {
    const r = await api("search?q=" + encodeURIComponent(q));
    const icon = { contacts: "user", companies: "building-2", deals: "briefcase", tasks: "check-circle-2" };
    const html = Object.entries(r).filter(([, v]) => v.length).map(([k, items]) =>
      `<div class="p-group">${VIEWS[k][0]}</div>` +
      items.map((i) => `<div class="p-item" onclick="$('#palette').classList.remove('open'); go('${k}'); setTimeout(() => openForm('${k}', ${i.id}), 150)">
        <i data-lucide="${icon[k]}"></i>${esc(i.name || i.title)}</div>`).join("")).join("");
    $("#paletteResults").innerHTML = html || empty("search-x", "Nothing found");
    icons();
  }, 200);
};

/* ---------------- theme & boot ---------------- */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $("#themeBtn").innerHTML = `<i data-lucide="${t === "dark" ? "sun" : "moon"}"></i>`;
  try { localStorage.setItem("theme", t); } catch {}
  icons();
  if (current === "dashboard") render(); // re-color charts
}
$("#themeBtn").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

document.querySelectorAll("#nav a").forEach((a) => (a.onclick = () => go(a.dataset.view)));
$("#addBtn").onclick = () => openForm(current);
document.querySelectorAll(".modal").forEach((m) => (m.onclick = (e) => { if (e.target === m) m.classList.remove("open"); }));
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); }
  if (e.key === "Escape") document.querySelectorAll(".modal").forEach((m) => m.classList.remove("open"));
});

let saved = "dark";
try { saved = localStorage.getItem("theme") || "dark"; } catch {}
document.documentElement.dataset.theme = saved;
$("#themeBtn").innerHTML = `<i data-lucide="${saved === "dark" ? "sun" : "moon"}"></i>`;
window.onhashchange = () => { const v = location.hash.slice(1); if (VIEWS[v] && v !== current) go(v); };
go(VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : "dashboard");
