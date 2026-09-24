/* =====================================================================
   app.js — sidebar, page switching, search palette, notifications,
   keyboard shortcuts and start-up.
   ===================================================================== */

// Every page: [title, subtitle, icon, draw function, table used by "New"]
const PAGES = {
  dashboard: ["Dashboard", "Your business at a glance", "layout-dashboard", renderDashboard, "contacts"],
  contacts: ["Contacts", "Everyone you do business with", "users", renderContacts, "contacts"],
  companies: ["Companies", "Accounts & organisations", "building-2", renderCompanies, "companies"],
  deals: ["Pipeline", "Drag deals between stages. Drop on Won to celebrate 🎉", "kanban", renderDeals, "deals"],
  tasks: ["Tasks", "Stay on top of every follow-up", "check-circle-2", renderTasks, "tasks"],
  activity: ["Activity", "Every call, email and meeting in one timeline", "activity", renderActivity, "activities"],
  settings: ["Settings", "Profile, target, theme and data", "settings", renderSettings, "contacts"],
};

// ---------- sidebar ----------
function drawNav() {
  const d = state.data;
  const overdue = d.tasks.filter((t) => !t.done && t.due_date && t.due_date < todayISO()).length;
  const counts = {
    contacts: d.contacts.length, companies: d.companies.length,
    deals: d.deals.filter(isOpen).length, tasks: d.tasks.filter((t) => !t.done).length,
  };
  const link = (key) => `<a data-page="${key}" class="${state.page === key ? "active" : ""}" title="${PAGES[key][0]}">
    <i data-lucide="${PAGES[key][2]}"></i><span>${PAGES[key][0]}</span>
    <em class="${key === "tasks" && overdue ? "hot" : ""}">${counts[key] ?? ""}</em></a>`;

  $("#nav").innerHTML = `
    <p class="nav-label">Overview</p>${link("dashboard")}${link("activity")}
    <p class="nav-label">Customers</p>${link("contacts")}${link("companies")}
    <p class="nav-label">Sales</p>${link("deals")}${link("tasks")}
    <p class="nav-label">You</p>${link("settings")}`;
  $$("#nav a").forEach((a) => (a.onclick = () => go(a.dataset.page)));

  // target progress card
  const month = todayISO().slice(0, 7);
  const won = sum(d.deals.filter((x) => x.stage === "Won" && (x.close_date || "").startsWith(month)), "value");
  const target = state.me?.target || 0;
  $("#sideTarget").innerHTML = `${short(won)} <span>/ ${short(target)}</span>`;
  $("#sideTargetBar").style.width = Math.min(target ? (won / target) * 100 : 0, 100) + "%";
  icons();
}

function showMe() {
  $("#meName").textContent = state.me.name;
  $("#meEmail").textContent = state.me.email;
  $("#meAvatar").textContent = initials(state.me.name);
  $("#meAvatar").style.setProperty("--h", hue(state.me.name));
}

// ---------- pages ----------
async function go(page) {
  if (!PAGES[page]) page = "dashboard";
  state.page = page;
  state.search = "";
  state.chip = "All";
  closeDrawer();
  location.hash = page;
  document.body.classList.remove("nav-open");
  $("#title").textContent = PAGES[page][0];
  $("#subtitle").textContent = PAGES[page][1];
  $("#view").innerHTML = skeleton();
  await refresh();
  window.scrollTo({ top: 0 });
}

// Reload data from the server and redraw the current page (and open drawer).
async function refresh() {
  await loadData();
  drawNav();
  charts.forEach((c) => c.destroy());
  charts = [];
  $("#view").classList.remove("view");
  void $("#view").offsetWidth; // restart the fade-in animation
  $("#view").classList.add("view");
  await PAGES[state.page][3]();
  if (state.drawer) (state.drawer.type === "contact" ? showContact : showCompany)(state.drawer.id);
  loadNotifications();
}

// Search box + filter chips shared by the list pages.
function bindToolbar(redraw) {
  const input = $("#search");
  if (input) {
    input.value = state.search;
    input.oninput = () => { state.search = input.value; redraw(); };
  }
  $$("[data-chip]").forEach((b) => {
    b.classList.toggle("on", b.dataset.chip === state.chip);
    b.onclick = () => {
      state.chip = b.dataset.chip;
      $$("[data-chip]").forEach((x) => x.classList.toggle("on", x === b));
      redraw();
    };
  });
  icons();
}

// ---------- theme & sidebar size ----------
function setTheme(theme, redraw = true) {
  document.documentElement.dataset.theme = theme;
  $("#themeBtn").innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}"></i>`;
  try { localStorage.setItem("theme", theme); } catch {}
  icons();
  if (redraw && state.page === "dashboard") refresh(); // redraw charts in new colours
}

function toggleSidebar() {
  document.body.classList.toggle("mini");
  try { localStorage.setItem("mini", document.body.classList.contains("mini") ? "1" : ""); } catch {}
  setTimeout(() => charts.forEach((c) => c.resize()), 320);
}

// ---------- notifications (bell) ----------
async function loadNotifications() {
  const items = await api("notifications");
  $("#bellDot").textContent = items.length || "";
  $("#bellPop").innerHTML = `<h4>Notifications <span class="muted">${items.length}</span></h4>` + (items.map((n) => `
    <div class="pop-item" onclick="closePops(); go('${n.page}')">
      <div class="tl-icon" style="--c:var(--${n.tone})"><i data-lucide="${n.icon}"></i></div>
      <div><b>${esc(n.title)}</b><span>${esc(n.text)}</span></div>
    </div>`).join("") || empty("bell-off", "You're all caught up 🎉"));
  icons();
}

function closePops() {
  $$(".pop").forEach((p) => (p.hidden = true));
}
function togglePop(id) {
  const pop = $(id);
  const wasHidden = pop.hidden;
  closePops();
  pop.hidden = !wasHidden;
}

function drawNewMenu() {
  $("#newPop").innerHTML = Object.entries(FORMS).map(([table, f]) => `
    <div class="pop-item" onclick="closePops(); openForm('${table}')"><i data-lucide="${f.icon}"></i><b>${f.title}</b></div>`).join("");
  icons();
}

// ---------- command palette (Ctrl + K) ----------
let paletteItems = [];
let paletteIndex = 0;

function paletteActions() {
  return [
    ...Object.entries(FORMS).map(([table, f]) => ({ group: "Create", icon: "plus", label: `New ${f.title.toLowerCase()}`, run: () => openForm(table) })),
    ...Object.entries(PAGES).map(([key, p]) => ({ group: "Go to", icon: p[2], label: p[0], run: () => go(key) })),
    { group: "Actions", icon: "sun-moon", label: "Toggle dark / light theme", run: () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark") },
    { group: "Actions", icon: "download", label: "Export contacts to CSV", run: () => (location.href = "/api/export/contacts") },
    { group: "Actions", icon: "log-out", label: "Log out", run: logout },
  ];
}

function openPalette() {
  $("#palette").classList.add("open");
  $("#paletteInput").value = "";
  drawPalette("");
  setTimeout(() => $("#paletteInput").focus(), 30);
}
function closePalette() {
  $("#palette").classList.remove("open");
  $("#paletteInput").blur();
}

function drawPalette(q) {
  q = q.toLowerCase().trim();
  const has = (text) => text.toLowerCase().includes(q);
  const d = state.data;
  paletteItems = paletteActions().filter((a) => !q || has(a.label));
  if (q) {
    paletteItems.push(
      ...d.contacts.filter((c) => has(c.name + " " + c.email + " " + c.phone)).slice(0, 5)
        .map((c) => ({ group: "Contacts", icon: "user", label: c.name, hint: nameOf("companies", c.company_id), run: () => { go("contacts"); setTimeout(() => showContact(c.id), 300); } })),
      ...d.companies.filter((c) => has(c.name)).slice(0, 4)
        .map((c) => ({ group: "Companies", icon: "building-2", label: c.name, hint: c.city, run: () => { go("companies"); setTimeout(() => showCompany(c.id), 300); } })),
      ...d.deals.filter((x) => has(x.title)).slice(0, 4)
        .map((x) => ({ group: "Deals", icon: "briefcase", label: x.title, hint: short(x.value), run: () => openForm("deals", x.id) })),
      ...d.tasks.filter((t) => has(t.title)).slice(0, 4)
        .map((t) => ({ group: "Tasks", icon: "check-circle-2", label: t.title, hint: fdate(t.due_date), run: () => openForm("tasks", t.id) })),
    );
  }
  paletteIndex = 0;

  let lastGroup = "";
  $("#paletteList").innerHTML = paletteItems.map((item, i) => {
    const head = item.group !== lastGroup ? `<div class="p-group">${item.group}</div>` : "";
    lastGroup = item.group;
    return `${head}<div class="p-item" data-i="${i}"><div class="p-ico"><i data-lucide="${item.icon}"></i></div>${esc(item.label)}<span>${esc(item.hint || "")}</span></div>`;
  }).join("") || empty("search-x", "Nothing found");
  $$(".p-item").forEach((el) => {
    el.onmouseenter = () => highlight(Number(el.dataset.i));
    el.onclick = () => runPalette(Number(el.dataset.i));
  });
  highlight(0);
  icons();
}

function highlight(i) {
  paletteIndex = i;
  $$(".p-item").forEach((el) => el.classList.toggle("active", Number(el.dataset.i) === i));
  $(`.p-item[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
}
function runPalette(i) {
  const item = paletteItems[i];
  if (!item) return;
  closePalette();
  item.run();
}

$("#paletteInput").oninput = (e) => drawPalette(e.target.value);
$("#paletteInput").onkeydown = (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); highlight(Math.min(paletteIndex + 1, paletteItems.length - 1)); }
  if (e.key === "ArrowUp") { e.preventDefault(); highlight(Math.max(paletteIndex - 1, 0)); }
  if (e.key === "Enter") runPalette(paletteIndex);
};

// ---------- keyboard shortcuts ----------
let lastKey = "";
document.addEventListener("keydown", (e) => {
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if (e.key === "Escape") { closePalette(); closeModal(); closeDrawer(); closePops(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".modal.open")) return;

  const key = e.key.toLowerCase();
  if (lastKey === "g") {
    const jump = { d: "dashboard", c: "contacts", p: "deals", t: "tasks", a: "activity", s: "settings" }[key];
    if (jump) go(jump);
    lastKey = "";
    return;
  }
  if (key === "n") openForm(PAGES[state.page][4]);
  lastKey = key;
});

// ---------- log out ----------
async function logout() {
  await api("auth/logout", "POST");
  location.href = "/login";
}

// ---------- start the app ----------
async function start() {
  let theme = "dark";
  try {
    theme = localStorage.getItem("theme") || "dark";
    if (localStorage.getItem("mini") && innerWidth > 860) document.body.classList.add("mini");
  } catch {}
  applyAccent(savedAccent());
  setTheme(theme, false);

  $("#themeBtn").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  $("#collapseBtn").onclick = toggleSidebar;
  $("#logoutBtn").onclick = logout;
  $("#bellBtn").onclick = (e) => { e.stopPropagation(); togglePop("#bellPop"); };
  $("#newBtn").onclick = (e) => { e.stopPropagation(); togglePop("#newPop"); };
  document.addEventListener("click", (e) => { if (!e.target.closest(".pop")) closePops(); });
  $$(".modal").forEach((m) => (m.onclick = (e) => { if (e.target === m) m.classList.remove("open"); }));
  window.onhashchange = () => { const p = location.hash.slice(1); if (PAGES[p] && p !== state.page) go(p); };

  state.me = await api("me");
  showMe();
  drawNewMenu();
  go(location.hash.slice(1));
}

start();
