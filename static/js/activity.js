/* =====================================================================
   activity.js — full timeline of calls, emails, meetings and updates.
   ===================================================================== */

function renderActivity() {
  $("#view").innerHTML = `
    <div class="toolbar">
      <div class="filter"><i data-lucide="search"></i><input id="search" placeholder="Search notes or contact…"></div>
      <div class="chips">${["All", ...Object.keys(ACTIVITY)].map((c) =>
        `<button data-chip="${c}">${c === "All" ? "" : `<i data-lucide="${ACTIVITY[c].icon}"></i>`}${c}</button>`).join("")}</div>
    </div>
    <div id="list"></div>`;
  bindToolbar(drawActivity);
  drawActivity();
}

function drawActivity() {
  const rows = state.data.activities
    .filter((a) => (state.chip === "All" || a.type === state.chip) && matches(a.note, nameOf("contacts", a.contact_id)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  // group by day: "Today", "Yesterday", "12 Sep"
  const groups = {};
  rows.forEach((a) => {
    const d = daysFromToday(a.created_at);
    const label = d === 0 ? "Today" : d === -1 ? "Yesterday" : fdate(a.created_at);
    (groups[label] = groups[label] || []).push(a);
  });

  $("#list").innerHTML = Object.entries(groups).map(([label, list]) => `
    <div class="group-title"><i data-lucide="calendar"></i>${label}<em>${list.length}</em></div>
    <div class="card"><div class="timeline">${list.map(timelineItem).join("")}</div></div>`).join("")
    || `<div class="card">${empty("activity", "No activity found")}</div>`;
  icons();
}
