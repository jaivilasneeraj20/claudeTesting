/* =====================================================================
   deals.js — drag & drop sales pipeline. Moving a deal to "Won" = 🎉
   ===================================================================== */

function renderDeals() {
  const open = state.data.deals.filter(isOpen);
  const weighted = open.reduce((total, d) => total + (d.value * PROBABILITY[d.stage]) / 100, 0);
  const won = state.data.deals.filter((d) => d.stage === "Won");

  $("#view").innerHTML = `
    <div class="toolbar">
      <div class="filter"><i data-lucide="search"></i><input id="search" placeholder="Search deals, company, contact…"></div>
      <div class="stat-pill"><small>Open pipeline</small><b>${short(sum(open, "value"))}</b></div>
      <div class="stat-pill"><small>Weighted forecast</small><b>${short(weighted)}</b></div>
      <div class="stat-pill"><small>Won so far</small><b style="color:var(--green)">${short(sum(won, "value"))}</b></div>
      <div class="end"><a class="btn btn-ghost sm" href="/api/export/deals"><i data-lucide="download"></i>Export</a></div>
    </div>
    <div id="list"></div>`;
  bindToolbar(drawDeals);
  drawDeals();
}

function drawDeals() {
  const rows = state.data.deals.filter((d) =>
    matches(d.title, nameOf("companies", d.company_id), nameOf("contacts", d.contact_id)));

  $("#list").innerHTML = `<div class="kanban">${Object.entries(STAGES).map(([stage, color]) => {
    const list = rows.filter((d) => d.stage === stage);
    return `<div class="col" data-stage="${stage}" style="--c:${color}">
      <div class="col-head"><i></i>${stage}<em>${list.length}</em></div>
      <div class="col-sum"><b>${short(sum(list, "value"))}</b><span>${PROBABILITY[stage]}% win chance</span></div>
      ${list.map((d, i) => dealCard(d, color, i)).join("") || `<p class="muted" style="font-size:12.5px;text-align:center;padding:20px 0">Drop deals here</p>`}
    </div>`;
  }).join("")}</div>
  <div class="dropbar">
    <div class="drop-zone" data-stage="Won" style="--c:${STAGES.Won}"><i data-lucide="party-popper"></i>Drop here to mark as Won</div>
    <div class="drop-zone" data-stage="Lost" style="--c:${STAGES.Lost}"><i data-lucide="x-circle"></i>Lost</div>
  </div>`;
  icons();
  enableDragAndDrop();
}

function dealCard(d, color, i) {
  const person = nameOf("contacts", d.contact_id);
  return `<div class="deal" draggable="true" data-id="${d.id}" onclick="openForm('deals', ${d.id})" style="--c:${color};animation-delay:${i * 40}ms">
    <b>${esc(d.title)}</b>
    <div class="val">${money(d.value)}</div>
    <div class="muted" style="font-size:12.5px;margin-top:2px">${esc(nameOf("companies", d.company_id) || "No company")}</div>
    <div class="progress"><i style="width:${PROBABILITY[d.stage]}%"></i></div>
    <div class="foot">
      ${isOpen(d) ? dueChip(d.close_date) : `<span class="chip">${fdate(d.close_date)}</span>`}
      ${person ? `<span title="${esc(person)}">${avatar(person, "xs")}</span>` : ""}
    </div>
  </div>`;
}

function enableDragAndDrop() {
  $$(".deal").forEach((card) => {
    card.ondragstart = (e) => {
      e.dataTransfer.setData("id", card.dataset.id);
      card.classList.add("dragging");
      document.body.classList.add("dragging-deal"); // shows the Won / Lost drop zones
    };
    card.ondragend = () => {
      card.classList.remove("dragging");
      document.body.classList.remove("dragging-deal");
    };
  });

  $$(".col, .drop-zone").forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add("over"); };
    col.ondragleave = () => col.classList.remove("over");
    col.ondrop = async (e) => {
      col.classList.remove("over");
      document.body.classList.remove("dragging-deal");
      const deal = find("deals", Number(e.dataTransfer.getData("id")));
      const stage = col.dataset.stage;
      if (!deal || deal.stage === stage) return;

      deal.stage = stage; // move it on screen right away, then save
      drawDeals();
      await api(`deals/${deal.id}`, "PUT", { stage });
      if (stage === "Won") celebrate(deal.title);
      else toast(`"${deal.title}" moved to ${stage}`);
      await refresh();
    };
  });
}
