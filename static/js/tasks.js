/* =====================================================================
   tasks.js — task list (grouped) and a month calendar.
   ===================================================================== */

let taskView = "list";        // "list" or "calendar"
let calMonth = new Date();    // month shown in the calendar

function renderTasks() {
  $("#view").innerHTML = `
    <div class="toolbar">
      <div class="filter"><i data-lucide="search"></i><input id="search" placeholder="Search tasks…"></div>
      <div class="chips">${["All", "Pending", "Done"].map((c) => `<button data-chip="${c}">${c}</button>`).join("")}</div>
      <div class="end chips" id="viewSwitch">
        <button data-view="list" class="${taskView === "list" ? "on" : ""}"><i data-lucide="list"></i>List</button>
        <button data-view="calendar" class="${taskView === "calendar" ? "on" : ""}"><i data-lucide="calendar-days"></i>Calendar</button>
      </div>
    </div>
    <div id="list"></div>`;
  $$("#viewSwitch button").forEach((b) => (b.onclick = () => { taskView = b.dataset.view; renderTasks(); }));
  bindToolbar(drawTasks);
  drawTasks();
}

function drawTasks() {
  const rows = state.data.tasks.filter((t) =>
    (state.chip === "All" || (state.chip === "Done") === !!t.done) && matches(t.title, nameOf("contacts", t.contact_id)));
  taskView === "calendar" ? drawCalendar(rows) : drawTaskList(rows);
  icons();
}

function drawTaskList(rows) {
  const today = todayISO();
  const groups = [
    ["Overdue", "alarm-clock", rows.filter((t) => !t.done && t.due_date && t.due_date < today)],
    ["Today", "sun", rows.filter((t) => !t.done && t.due_date === today)],
    ["Upcoming", "calendar-clock", rows.filter((t) => !t.done && t.due_date > today)],
    ["No date", "inbox", rows.filter((t) => !t.done && !t.due_date)],
    ["Completed", "check-check", rows.filter((t) => t.done)],
  ].filter((g) => g[2].length);

  $("#list").innerHTML = groups.map(([title, icon, list]) => `
    <div class="group-title"><i data-lucide="${icon}"></i>${title}<em>${list.length}</em></div>
    <div class="card table-wrap">${list.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")).map((t, i) => `
      <div class="task ${t.done ? "done" : ""}" style="animation-delay:${i * 30}ms">
        <div class="check" onclick="toggleTask(${t.id})"><i data-lucide="check"></i></div>
        <div class="body"><b>${esc(t.title)}</b>
          <div class="chips-row">
            ${dueChip(t.due_date)}
            ${t.contact_id ? `<a class="chip" onclick="showContact(${t.contact_id})"><i data-lucide="user"></i>${esc(nameOf("contacts", t.contact_id))}</a>` : ""}
          </div>
        </div>
        ${badge(t.priority, PRIORITY[t.priority])}
        <div class="row-actions">
          <button class="icon-btn sm" onclick="openForm('tasks', ${t.id})"><i data-lucide="pencil"></i></button>
          <button class="icon-btn sm danger" onclick="removeRow('tasks', ${t.id})"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`).join("")}
    </div>`).join("") || `<div class="card">${empty("check-check", "No tasks here. Enjoy your day! ☕")}</div>`;
}

function drawCalendar(rows) {
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7)); // grid starts on Monday
  const today = todayISO();

  let cells = "";
  for (let i = 0; i < 42; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = isoOf(day);
    const events = [
      ...rows.filter((t) => t.due_date === iso).map((t) =>
        `<div class="ev ${t.done ? "done" : ""}" style="--c:${PRIORITY[t.priority]}" onclick="event.stopPropagation(); openForm('tasks', ${t.id})">${esc(t.title)}</div>`),
      ...state.data.deals.filter((d) => isOpen(d) && d.close_date === iso).map((d) =>
        `<div class="ev" style="--c:#a855f7" onclick="event.stopPropagation(); openForm('deals', ${d.id})">💰 ${esc(d.title)}</div>`),
    ];
    cells += `<div class="day ${day.getMonth() !== month ? "other" : ""} ${iso === today ? "today" : ""}" onclick="openForm('tasks', null, {due_date: '${iso}'})">
      <span class="n">${day.getDate()}</span>
      ${events.slice(0, 3).join("")}${events.length > 3 ? `<span class="ev-more">+${events.length - 3} more</span>` : ""}
    </div>`;
  }

  $("#list").innerHTML = `<div class="card">
    <div class="cal-head">
      <h3>${first.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h3>
      <button class="icon-btn sm" onclick="moveMonth(-1)"><i data-lucide="chevron-left"></i></button>
      <button class="icon-btn sm" onclick="moveMonth(1)"><i data-lucide="chevron-right"></i></button>
      <button class="btn btn-ghost sm" onclick="calMonth = new Date(); drawTasks()">Today</button>
      <span class="muted" style="margin-left:auto;font-size:12.5px">Click a day to add a task · 💰 = deal closing</span>
    </div>
    <div class="calendar">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="dow">${d}</div>`).join("")}${cells}</div>
  </div>`;
}

function moveMonth(step) {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + step, 1);
  drawTasks();
}

async function toggleTask(id) {
  const task = find("tasks", id);
  await api(`tasks/${id}`, "PUT", { done: !task.done });
  toast(task.done ? "Task reopened" : "Task completed ✅");
  await refresh();
}
