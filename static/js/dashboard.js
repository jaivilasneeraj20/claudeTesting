/* =====================================================================
   dashboard.js — greeting, smart insights, KPIs, charts, feed.
   ===================================================================== */

let charts = []; // chart objects, destroyed before every re-draw

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

async function renderDashboard() {
  const s = await api("stats");
  const pct = s.target ? Math.round((s.won_this_month / s.target) * 100) : 0;
  const ringLength = 2 * Math.PI * 64;
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--p1").trim();
  const kpiColors = [accent, "#06b6d4", "#f59e0b", "#22c55e"];
  const tones = { red: "#fda4af", amber: "#fde68a", violet: "#ddd6fe", cyan: "#a5f3fc", green: "#bbf7d0" };

  $("#view").innerHTML = `
    <div class="grid g-hero" style="margin-bottom:20px">
      <div class="card hero">
        <h2>${greeting()}, ${esc(s.greeting_name)} 👋</h2>
        <p>${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} ·
           ${s.tasks_today} task${s.tasks_today === 1 ? "" : "s"} today · ${s.new_contacts} new contact${s.new_contacts === 1 ? "" : "s"} this month</p>
        <div class="insights">
          ${s.insights.map((t, i) => `<div class="insight" style="animation-delay:${i * 90}ms"><i data-lucide="${t.icon}" style="color:${tones[t.tone]}"></i>${esc(t.text)}</div>`).join("")}
        </div>
      </div>
      <div class="card ring-card">
        <div class="ring">
          <svg viewBox="0 0 150 150">
            <defs><linearGradient id="ringGrad"><stop offset="0" stop-color="var(--p1)"/><stop offset="1" stop-color="var(--p2)"/></linearGradient></defs>
            <circle class="track" cx="75" cy="75" r="64"/>
            <circle class="bar" id="ringBar" cx="75" cy="75" r="64" stroke-dasharray="${ringLength}" stroke-dashoffset="${ringLength}"/>
          </svg>
          <strong><span data-count="${pct}" data-suffix="%">0%</span></strong>
        </div>
        <b style="font-size:16px">Monthly target</b>
        <small>${short(s.won_this_month)} won of ${short(s.target)} · <a onclick="go('settings')" style="color:var(--p1)">change</a></small>
      </div>
    </div>

    <div class="grid g4" style="margin-bottom:20px">
      ${s.kpis.map((k, i) => `
        <div class="card kpi lift" style="--c:${kpiColors[i]}">
          <div class="kpi-top">
            <div class="ico"><i data-lucide="${k.icon}"></i></div>
            ${k.trend === null ? "" : `<span class="trend ${k.trend >= 0 ? "up" : "down"}"><i data-lucide="${k.trend >= 0 ? "trending-up" : "trending-down"}"></i>${Math.abs(k.trend)}%</span>`}
          </div>
          <small>${k.label}</small>
          <strong data-count="${k.value}" data-format="${k.money ? "money" : ""}" data-suffix="${k.suffix || ""}">0</strong>
          ${sparkline(k.series, kpiColors[i])}
        </div>`).join("")}
    </div>

    <div class="grid g-main" style="margin-bottom:20px">
      <div class="card">
        <div class="card-head"><h3><i data-lucide="bar-chart-3"></i>Revenue & new business</h3><span class="muted" style="font-size:13px">Last 6 months</span></div>
        <div class="chart-box"><canvas id="revChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><h3><i data-lucide="pie-chart"></i>Lead sources</h3></div>
        <div class="chart-box"><canvas id="sourceChart"></canvas></div>
      </div>
    </div>

    <div class="grid g3" style="margin-bottom:20px">
      <div class="card">
        <div class="card-head"><h3><i data-lucide="filter"></i>Sales funnel</h3><a onclick="go('deals')">Pipeline →</a></div>
        ${s.funnel.map((f, i) => {
          const max = Math.max(...s.funnel.map((x) => x.value), 1);
          return `<div class="funnel-row">
            <div class="top"><b>${f.stage} <span class="muted">· ${f.count}</span></b><span>${short(f.value)}</span></div>
            <div class="funnel-bar"><i style="width:${Math.max((f.value / max) * 100, 3)}%;--c:${STAGES[f.stage]};animation-delay:${i * 100}ms"></i></div>
          </div>`;
        }).join("")}
      </div>
      <div class="card">
        <div class="card-head"><h3><i data-lucide="trophy"></i>Top companies</h3><a onclick="go('companies')">All →</a></div>
        ${s.top_companies.map((c, i) => `
          <div class="row click" onclick="showCompany(${c.id})">
            <span class="rank r${i + 1}">${i + 1}</span>${avatar(c.name, "xs")}
            <div class="grow"><b>${esc(c.name)}</b><span>${c.deals} won deal${c.deals === 1 ? "" : "s"}</span></div>
            <b>${short(c.won)}</b>
          </div>`).join("") || empty("trophy", "Win a deal to see your top companies")}
      </div>
      <div class="card">
        <div class="card-head"><h3><i data-lucide="list-checks"></i>Up next</h3><a onclick="go('tasks')">All tasks →</a></div>
        ${s.upcoming.map((t) => `
          <div class="row">
            <div class="check" onclick="toggleTask(${t.id})"><i data-lucide="check"></i></div>
            <div class="grow"><b>${esc(t.title)}</b><span>${esc(t.contact_name || "No contact")}</span></div>
            ${dueChip(t.due_date)}
          </div>`).join("") || empty("party-popper", "All caught up!")}
      </div>
    </div>

    <div class="grid g-main">
      <div class="card">
        <div class="card-head"><h3><i data-lucide="activity"></i>Latest activity</h3><a onclick="go('activity')">Full timeline →</a></div>
        <div class="timeline">${s.feed.map(timelineItem).join("") || empty("activity", "No activity yet")}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3><i data-lucide="flame"></i>Closing soon</h3></div>
        ${s.closing.map((d) => `
          <div class="row click" onclick="openForm('deals', ${d.id})">
            ${avatar(nameOf("companies", d.company_id) || d.title, "xs")}
            <div class="grow"><b>${esc(d.title)}</b><span>${badge(d.stage, STAGES[d.stage])}</span></div>
            <div style="text-align:right"><b>${short(d.value)}</b><div style="margin-top:4px">${dueChip(d.close_date)}</div></div>
          </div>`).join("") || empty("inbox", "No open deals with a close date")}
      </div>
    </div>`;

  icons();
  countUp($("#view"));
  requestAnimationFrame(() => ($("#ringBar").style.strokeDashoffset = ringLength * (1 - Math.min(pct, 100) / 100)));
  drawDashboardCharts(s);
}

function drawDashboardCharts(s) {
  const css = getComputedStyle(document.documentElement);
  const p1 = css.getPropertyValue("--p1").trim();
  const p2 = css.getPropertyValue("--p2").trim();
  Chart.defaults.color = css.getPropertyValue("--muted").trim();
  Chart.defaults.borderColor = css.getPropertyValue("--border").trim();
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";

  const ctx = $("#revChart").getContext("2d");
  const fill = ctx.createLinearGradient(0, 0, 0, 290);
  fill.addColorStop(0, p1 + "cc");
  fill.addColorStop(1, p1 + "22");
  const moneyTip = { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.raw)}` } };

  charts.push(new Chart(ctx, {
    data: {
      labels: s.months,
      datasets: [
        { type: "bar", label: "Revenue won", data: s.revenue, backgroundColor: fill, borderRadius: 10, barThickness: 34, order: 2 },
        { type: "line", label: "New pipeline added", data: s.added_value, borderColor: p2, backgroundColor: p2, borderWidth: 3,
          cubicInterpolationMode: "monotone", pointRadius: 4, pointBackgroundColor: "#fff", order: 1 },
      ],
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "top", align: "end", labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: moneyTip },
      scales: { y: { ticks: { callback: short }, grid: { drawTicks: false } }, x: { grid: { display: false } } },
    },
  }));

  const palette = [p1, p2, "#f59e0b", "#22c55e", "#f43f5e", "#a855f7"];
  charts.push(new Chart($("#sourceChart"), {
    type: "doughnut",
    data: { labels: Object.keys(s.sources), datasets: [{ data: Object.values(s.sources), backgroundColor: palette, borderWidth: 0, spacing: 3, borderRadius: 8 }] },
    options: { maintainAspectRatio: false, cutout: "70%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, padding: 14, boxWidth: 8 } } } },
  }));
}

// one line of the activity timeline (used on dashboard, drawer and activity page)
function timelineItem(a, i = 0) {
  const look = ACTIVITY[a.type] || ACTIVITY.Note;
  const who = a.contact_name || nameOf("contacts", a.contact_id);
  return `<div class="tl-item" style="animation-delay:${Math.min(i, 10) * 40}ms">
    <div class="tl-icon" style="--c:${look.color}"><i data-lucide="${look.icon}"></i></div>
    <div class="tl-body">
      <p>${esc(a.note)}</p>
      <span>${a.type}${who ? ` · <b>${esc(who)}</b>` : ""} · ${timeAgo(a.created_at)}</span>
    </div>
  </div>`;
}
