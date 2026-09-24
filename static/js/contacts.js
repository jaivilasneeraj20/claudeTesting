/* =====================================================================
   contacts.js — contacts table + contact profile drawer.
   ===================================================================== */

function renderContacts() {
  $("#view").innerHTML = `
    <div class="toolbar">
      <div class="filter"><i data-lucide="search"></i><input id="search" placeholder="Search name, email, phone, company…"></div>
      <div class="chips">${["All", "🔥 Hot", ...Object.keys(STATUS)].map((c) => `<button data-chip="${c}">${c}</button>`).join("")}</div>
      <div class="end">
        <button class="btn btn-ghost sm" onclick="importContacts()"><i data-lucide="upload"></i>Import</button>
        <a class="btn btn-ghost sm" href="/api/export/contacts"><i data-lucide="download"></i>Export</a>
      </div>
    </div>
    <div id="list"></div>`;
  bindToolbar(drawContacts);
  drawContacts();
}

function drawContacts() {
  const rows = state.data.contacts.filter((c) => {
    const chipOk = state.chip === "All" || c.status === state.chip || (state.chip === "🔥 Hot" && leadScore(c) >= 70);
    return chipOk && matches(c.name, c.email, c.phone, nameOf("companies", c.company_id));
  });

  $("#list").innerHTML = `<div class="card table-wrap">${rows.length ? `
    <table>
      <thead><tr><th>Name</th><th>Company</th><th>Status</th><th>Lead score</th><th>Deals</th><th>Last activity</th><th></th></tr></thead>
      <tbody>${rows.map((c, i) => {
        const deals = state.data.deals.filter((d) => d.contact_id === c.id);
        const last = state.data.activities.find((a) => a.contact_id === c.id);
        const score = leadScore(c);
        const tag = scoreTag(score);
        return `<tr onclick="showContact(${c.id})" style="animation-delay:${Math.min(i, 15) * 25}ms">
          <td><div class="person">${avatar(c.name)}<div><b>${esc(c.name)}</b><span>${esc(c.email || c.phone || "—")}</span></div></div></td>
          <td>${esc(nameOf("companies", c.company_id) || "—")}</td>
          <td>${badge(c.status, STATUS[c.status])}</td>
          <td><div class="score" style="--c:${tag.color}"><div class="progress"><i style="width:${score}%"></i></div>${tag.label}</div></td>
          <td><b>${deals.length}</b> <span class="muted">· ${short(sum(deals, "value"))}</span></td>
          <td class="muted">${last ? timeAgo(last.created_at) : "—"}</td>
          <td><div class="row-actions">
            <button class="icon-btn sm" title="Edit" onclick="event.stopPropagation(); openForm('contacts', ${c.id})"><i data-lucide="pencil"></i></button>
            <button class="icon-btn sm danger" title="Delete" onclick="event.stopPropagation(); removeRow('contacts', ${c.id})"><i data-lucide="trash-2"></i></button>
          </div></td>
        </tr>`;
      }).join("")}</tbody>
    </table>` : empty("user-search", "No contacts found")}</div>`;
  icons();
}

// ---------- contact profile (right drawer) ----------
function showContact(id) {
  const c = find("contacts", id);
  if (!c) return;
  state.drawer = { type: "contact", id };
  const deals = state.data.deals.filter((d) => d.contact_id === id);
  const tasks = state.data.tasks.filter((t) => t.contact_id === id);
  const acts = state.data.activities.filter((a) => a.contact_id === id);
  const score = leadScore(c);
  const tag = scoreTag(score);
  const phone = (c.phone || "").replace(/[^\d]/g, "");

  openDrawer(`
    <div class="d-cover"><button class="icon-btn" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>
    <div class="d-body">
      ${avatar(c.name, "lg")}
      <h2>${esc(c.name)}</h2>
      <div class="d-sub">
        ${badge(c.status, STATUS[c.status])}
        <span class="chip" style="color:${tag.color}">${tag.label} · ${score}</span>
        ${c.company_id ? `<a class="chip" onclick="showCompany(${c.company_id})"><i data-lucide="building-2"></i>${esc(nameOf("companies", c.company_id))}</a>` : ""}
        <span class="chip"><i data-lucide="radio"></i>${esc(c.source)}</span>
      </div>

      <div class="quick">
        <a class="btn btn-ghost sm" href="tel:${esc(c.phone)}" ${phone ? "" : "hidden"} onclick="quickLog(${id}, 'Call', 'Made a phone call')"><i data-lucide="phone"></i>Call</a>
        <a class="btn btn-ghost sm" href="https://wa.me/${phone}" target="_blank" ${phone ? "" : "hidden"} onclick="quickLog(${id}, 'WhatsApp', 'Sent a WhatsApp message')"><i data-lucide="message-circle"></i>WhatsApp</a>
        <a class="btn btn-ghost sm" href="mailto:${esc(c.email)}" ${c.email ? "" : "hidden"} onclick="quickLog(${id}, 'Email', 'Sent an email')"><i data-lucide="mail"></i>Email</a>
        <button class="btn btn-ghost sm" onclick="openForm('contacts', ${id})"><i data-lucide="pencil"></i>Edit</button>
      </div>

      <div class="d-stats">
        <div><b>${deals.length}</b><span>Deals</span></div>
        <div><b>${short(sum(deals.filter((d) => d.stage === "Won"), "value"))}</b><span>Won</span></div>
        <div><b>${tasks.filter((t) => !t.done).length}</b><span>Open tasks</span></div>
      </div>

      <div class="log-box">
        <div class="chips" id="logType">${["Call", "Email", "Meeting", "WhatsApp", "Note"].map((t, i) =>
          `<button class="${i === 0 ? "on" : ""}" data-type="${t}"><i data-lucide="${ACTIVITY[t].icon}"></i>${t}</button>`).join("")}</div>
        <textarea id="logNote" placeholder="What happened? e.g. Discussed pricing, sending proposal tomorrow"></textarea>
        <button class="btn btn-primary sm" onclick="logFromDrawer(${id})"><i data-lucide="send"></i>Log activity</button>
      </div>

      <div class="d-section">
        <h4>Deals <a class="chip" onclick="openForm('deals', null, {contact_id: ${id}, company_id: ${c.company_id || "null"}})"><i data-lucide="plus"></i>Add</a></h4>
        ${deals.map((d) => `<div class="row click" onclick="openForm('deals', ${d.id})">
          <div class="grow"><b>${esc(d.title)}</b><span>${fdate(d.close_date)}</span></div>
          ${badge(d.stage, STAGES[d.stage])}<b>${short(d.value)}</b></div>`).join("") || `<p class="muted" style="font-size:13px">No deals yet</p>`}
      </div>

      <div class="d-section">
        <h4>Tasks <a class="chip" onclick="openForm('tasks', null, {contact_id: ${id}})"><i data-lucide="plus"></i>Add</a></h4>
        ${tasks.map((t) => `<div class="row ${t.done ? "done" : ""}">
          <div class="check" onclick="toggleTask(${t.id})"><i data-lucide="check"></i></div>
          <div class="grow"><b>${esc(t.title)}</b></div>${dueChip(t.due_date)}</div>`).join("") || `<p class="muted" style="font-size:13px">No tasks</p>`}
      </div>

      <div class="d-section">
        <h4>Timeline</h4>
        <div class="timeline">${acts.map(timelineItem).join("") || `<p class="muted" style="font-size:13px">No activity yet. Log your first call above!</p>`}</div>
      </div>
    </div>`);

  $$("#logType button").forEach((b) => (b.onclick = () => {
    $$("#logType button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
  }));
}

async function logFromDrawer(contactId) {
  const note = $("#logNote").value.trim();
  if (!note) return toast("Write a short note first", "err");
  const type = $("#logType .on").dataset.type;
  await api("activities", "POST", { type, note, contact_id: contactId });
  toast(`${type} logged`);
  await refresh();
}

// Clicking Call / WhatsApp / Email also saves it on the timeline.
function quickLog(contactId, type, note) {
  api("activities", "POST", { type, note, contact_id: contactId }).then(refresh);
}

// ---------- CSV import ----------
function importContacts() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,text/csv";
  input.onchange = async () => {
    const text = await input.files[0].text();
    try {
      const result = await api("import/contacts", "POST", { csv: text });
      toast(`${result.added} contacts imported`);
      await refresh();
    } catch (err) {
      toast(err.message, "err");
    }
  };
  input.click();
}
