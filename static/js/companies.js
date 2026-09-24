/* =====================================================================
   companies.js — company cards + company drawer.
   ===================================================================== */

function renderCompanies() {
  $("#view").innerHTML = `
    <div class="toolbar">
      <div class="filter"><i data-lucide="search"></i><input id="search" placeholder="Search companies, industry, city…"></div>
      <div class="chips">${["All", ...INDUSTRIES.slice(0, 6)].map((c) => `<button data-chip="${c}">${c}</button>`).join("")}</div>
      <div class="end"><a class="btn btn-ghost sm" href="/api/export/companies"><i data-lucide="download"></i>Export</a></div>
    </div>
    <div id="list"></div>`;
  bindToolbar(drawCompanies);
  drawCompanies();
}

function drawCompanies() {
  const rows = state.data.companies.filter((c) =>
    (state.chip === "All" || c.industry === state.chip) && matches(c.name, c.industry, c.city));

  $("#list").innerHTML = rows.length ? `<div class="grid cards">${rows.map((c, i) => {
    const deals = state.data.deals.filter((d) => d.company_id === c.id);
    const people = state.data.contacts.filter((p) => p.company_id === c.id);
    return `<div class="card company lift" onclick="showCompany(${c.id})" style="animation-delay:${Math.min(i, 12) * 40}ms">
      <div class="top">
        ${avatar(c.name)}
        <div style="flex:1;min-width:0"><h4>${esc(c.name)}</h4><span class="muted" style="font-size:13px">${esc(c.industry || "—")}</span></div>
        <div class="row-actions">
          <button class="icon-btn sm" onclick="event.stopPropagation(); openForm('companies', ${c.id})"><i data-lucide="pencil"></i></button>
          <button class="icon-btn sm danger" onclick="event.stopPropagation(); removeRow('companies', ${c.id})"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
      <div class="meta">
        <div><i data-lucide="map-pin"></i>${esc(c.city || "—")}</div>
        <div><i data-lucide="globe"></i>${esc(c.website || "—")}</div>
      </div>
      <div style="display:flex">${people.slice(0, 5).map((p) => `<span title="${esc(p.name)}" style="margin-right:-8px">${avatar(p.name, "xs")}</span>`).join("")}</div>
      <div class="mini-stats">
        <div><b>${people.length}</b><span>Contacts</span></div>
        <div><b>${deals.filter(isOpen).length}</b><span>Open deals</span></div>
        <div><b>${short(sum(deals.filter((d) => d.stage === "Won"), "value"))}</b><span>Won</span></div>
      </div>
    </div>`;
  }).join("")}</div>` : `<div class="card">${empty("building-2", "No companies found")}</div>`;
  icons();
}

function showCompany(id) {
  const c = find("companies", id);
  if (!c) return;
  state.drawer = { type: "company", id };
  const deals = state.data.deals.filter((d) => d.company_id === id);
  const people = state.data.contacts.filter((p) => p.company_id === id);
  const site = c.website && !c.website.startsWith("http") ? "https://" + c.website : c.website;

  openDrawer(`
    <div class="d-cover"><button class="icon-btn" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>
    <div class="d-body">
      ${avatar(c.name, "lg")}
      <h2>${esc(c.name)}</h2>
      <div class="d-sub">
        <span class="chip"><i data-lucide="briefcase"></i>${esc(c.industry || "—")}</span>
        <span class="chip"><i data-lucide="map-pin"></i>${esc(c.city || "—")}</span>
      </div>
      <div class="quick">
        <a class="btn btn-ghost sm" href="${esc(site)}" target="_blank" ${site ? "" : "hidden"}><i data-lucide="globe"></i>Website</a>
        <a class="btn btn-ghost sm" href="tel:${esc(c.phone)}" ${c.phone ? "" : "hidden"}><i data-lucide="phone"></i>Call</a>
        <button class="btn btn-ghost sm" onclick="openForm('companies', ${id})"><i data-lucide="pencil"></i>Edit</button>
      </div>
      <div class="d-stats">
        <div><b>${people.length}</b><span>Contacts</span></div>
        <div><b>${short(sum(deals.filter(isOpen), "value"))}</b><span>In pipeline</span></div>
        <div><b>${short(sum(deals.filter((d) => d.stage === "Won"), "value"))}</b><span>Won</span></div>
      </div>
      <div class="d-section">
        <h4>People <a class="chip" onclick="openForm('contacts', null, {company_id: ${id}})"><i data-lucide="plus"></i>Add</a></h4>
        ${people.map((p) => `<div class="row click" onclick="showContact(${p.id})">${avatar(p.name, "xs")}
          <div class="grow"><b>${esc(p.name)}</b><span>${esc(p.email)}</span></div>${badge(p.status, STATUS[p.status])}</div>`).join("")
          || `<p class="muted" style="font-size:13px">No contacts yet</p>`}
      </div>
      <div class="d-section">
        <h4>Deals <a class="chip" onclick="openForm('deals', null, {company_id: ${id}})"><i data-lucide="plus"></i>Add</a></h4>
        ${deals.map((d) => `<div class="row click" onclick="openForm('deals', ${d.id})">
          <div class="grow"><b>${esc(d.title)}</b><span>${fdate(d.close_date)}</span></div>
          ${badge(d.stage, STAGES[d.stage])}<b>${short(d.value)}</b></div>`).join("") || `<p class="muted" style="font-size:13px">No deals yet</p>`}
      </div>
    </div>`);
}
