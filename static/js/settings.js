/* =====================================================================
   settings.js — profile, monthly target, look & feel, data export.
   ===================================================================== */

const ACCENTS = {
  Violet: ["#7c5cff", "#22d3ee"],
  Ocean: ["#2563eb", "#06b6d4"],
  Emerald: ["#059669", "#a3e635"],
  Sunset: ["#f43f5e", "#f59e0b"],
  Candy: ["#d946ef", "#fb7185"],
  Gold: ["#d97706", "#facc15"],
};

function applyAccent(name) {
  const [p1, p2] = ACCENTS[name] || ACCENTS.Violet;
  document.documentElement.style.setProperty("--p1", p1);
  document.documentElement.style.setProperty("--p2", p2);
  try { localStorage.setItem("accent", name); } catch {}
}
function savedAccent() {
  try { return localStorage.getItem("accent") || "Violet"; } catch { return "Violet"; }
}

function renderSettings() {
  const me = state.me;
  const theme = document.documentElement.dataset.theme;
  $("#view").innerHTML = `
    <div class="grid g-main">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3><i data-lucide="user-round"></i>Your profile</h3></div>
          <form id="profileForm" class="form-grid">
            <label>Name<input name="name" value="${esc(me.name)}" required></label>
            <label>Email<input value="${esc(me.email)}" disabled></label>
            <label class="full">Monthly sales target (₹)<input name="target" type="number" min="0" step="1000" value="${me.target}"></label>
            <div class="full"><button class="btn btn-primary"><i data-lucide="check"></i>Save profile</button></div>
          </form>
        </div>

        <div class="card">
          <div class="card-head"><h3><i data-lucide="palette"></i>Look & feel</h3></div>
          <div class="setting-row">
            <div><b>Theme</b><span>Dark looks premium, light is great in daylight</span></div>
            <div class="chips" id="themeChips">
              <button data-theme="dark" class="${theme === "dark" ? "on" : ""}"><i data-lucide="moon"></i>Dark</button>
              <button data-theme="light" class="${theme === "light" ? "on" : ""}"><i data-lucide="sun"></i>Light</button>
            </div>
          </div>
          <div class="setting-row" style="align-items:flex-start;flex-direction:column">
            <div><b>Accent colour</b><span>Changes buttons, charts and highlights everywhere</span></div>
            <div class="swatches">${Object.entries(ACCENTS).map(([name, [a, b]]) =>
              `<div class="swatch ${savedAccent() === name ? "on" : ""}" title="${name}" data-accent="${name}" style="background:linear-gradient(135deg, ${a}, ${b})"></div>`).join("")}</div>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h3><i data-lucide="database"></i>Your data</h3></div>
          ${["contacts", "companies", "deals", "tasks", "activities"].map((t) => `
            <div class="setting-row">
              <div><b style="text-transform:capitalize">${t}</b><span>${state.data[t].length} records</span></div>
              <a class="btn btn-ghost sm" href="/api/export/${t}"><i data-lucide="download"></i>CSV</a>
            </div>`).join("")}
          <div class="setting-row">
            <div><b>Import contacts</b><span>CSV with name, email, phone, company, status, source</span></div>
            <button class="btn btn-primary sm" onclick="importContacts()"><i data-lucide="upload"></i>Import</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3><i data-lucide="keyboard"></i>Keyboard shortcuts</h3></div>
          ${[["Ctrl + K", "Search & quick actions"], ["N", "Add new item on this page"], ["G then D / C / P / T", "Go to Dashboard / Contacts / Pipeline / Tasks"], ["Esc", "Close any window"]]
            .map(([k, text]) => `<div class="shortcut"><span>${text}</span><kbd>${k}</kbd></div>`).join("")}
        </div>
      </div>
    </div>`;
  icons();

  $("#profileForm").onsubmit = async (e) => {
    e.preventDefault();
    state.me = await api("me", "PUT", Object.fromEntries(new FormData(e.target)));
    showMe();
    toast("Profile saved");
  };
  $$("#themeChips button").forEach((b) => (b.onclick = () => { setTheme(b.dataset.theme); renderSettings(); }));
  $$(".swatch").forEach((s) => (s.onclick = () => { applyAccent(s.dataset.accent); renderSettings(); toast(`${s.dataset.accent} theme applied`); }));
}
