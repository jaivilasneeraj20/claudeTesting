/**
 * Stats.gs: dashboard numbers, smart insights and notifications. Plain functions only.
 */

// Chance (in %) that a deal in each stage will be won. Used for the forecast.
const PROBABILITY = { Lead: 10, Qualified: 25, Proposal: 50, Negotiation: 75, Won: 100, Lost: 0 };
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 1250000 -> "₹12.5 L"
function inr_(n) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return "₹" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// [["2026-04", "Apr"], ..., ["2026-09", "Sep"]] ending with this month.
function lastMonths_(count) {
  const [year, month] = today_().split("-").map(Number);
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    const index = year * 12 + (month - 1) - i;
    const y = Math.floor(index / 12);
    const m = index % 12;
    months.push([`${y}-${String(m + 1).padStart(2, "0")}`, MONTH_NAMES[m]]);
  }
  return months;
}

// Percent change, e.g. 120 vs 100 -> 20. null when there is nothing to compare.
function trend_(now, before) {
  return before ? Math.round(((now - before) * 100) / before) : null;
}

function closedOn_(deal) {
  return (deal.close_date || deal.created_at).slice(0, 7);
}

const sumOf_ = (list, pick) => list.reduce((total, x) => total + pick(x), 0);
const isOpen_ = (deal) => deal.stage !== "Won" && deal.stage !== "Lost";

// {"Website": 3, "Referral": 5} -> ordered from most to least, like Counter.most_common()
function countBy_(list, pick) {
  const counts = {};
  list.forEach((x) => { counts[pick(x)] = (counts[pick(x)] || 0) + 1; });
  const sorted = {};
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => { sorted[k] = v; });
  return sorted;
}

function withContactName_(row) {
  const contact = getRow_("contacts", row.contact_id);
  return Object.assign({}, row, { contact_name: contact ? contact.name : null });
}

function dashboard_(user) {
  const deals = allRows_("deals");
  const contacts = allRows_("contacts");
  const tasks = allRows_("tasks");
  const today = today_();
  const week = addDays_(today, 7);
  const months = lastMonths_(6);

  const won = deals.filter((d) => d.stage === "Won");
  const openDeals = deals.filter(isOpen_);

  const revenue = months.map(([key]) => sumOf_(won.filter((d) => closedOn_(d) === key), (d) => d.value));
  const addedValue = months.map(([key]) => sumOf_(deals.filter((d) => d.created_at.slice(0, 7) === key), (d) => d.value));
  const newContacts = months.map(([key]) => contacts.filter((c) => c.created_at.slice(0, 7) === key).length);
  const forecastNow = sumOf_(openDeals, (d) => (d.value * PROBABILITY[d.stage]) / 100);

  const winRates = months.map(([key]) => {
    const closed = deals.filter((d) => !isOpen_(d) && closedOn_(d) === key);
    return closed.length ? Math.round((100 * closed.filter((d) => d.stage === "Won").length) / closed.length) : 0;
  });

  const allClosed = deals.filter((d) => !isOpen_(d));
  const winRate = allClosed.length ? Math.round((100 * won.length) / allClosed.length) : 0;
  const last = (list) => list[list.length - 1];
  const prev = (list) => list[list.length - 2];

  const kpis = [
    { label: "Revenue this month", icon: "indian-rupee", value: last(revenue), money: true,
      trend: trend_(last(revenue), prev(revenue)), series: revenue },
    { label: "Open pipeline", icon: "layers", value: sumOf_(openDeals, (d) => d.value), money: true,
      trend: trend_(last(addedValue), prev(addedValue)), series: addedValue },
    { label: "Weighted forecast", icon: "radar", value: Math.round(forecastNow), money: true,
      trend: null, series: addedValue },
    { label: "Win rate", icon: "target", value: winRate, suffix: "%",
      trend: trend_(last(winRates), prev(winRates)), series: winRates },
  ];

  const funnel = Object.keys(PROBABILITY).filter((s) => s !== "Lost").map((stage) => ({
    stage,
    count: deals.filter((d) => d.stage === stage).length,
    value: sumOf_(deals.filter((d) => d.stage === stage), (d) => d.value),
  }));

  // Top 5 companies by won deal value
  const byCompany = {};
  won.filter((d) => d.company_id && getRow_("companies", d.company_id)).forEach((d) => {
    const c = getRow_("companies", d.company_id);
    byCompany[c.id] = byCompany[c.id] || { id: c.id, name: c.name, industry: c.industry, won: 0, deals: 0 };
    byCompany[c.id].won += d.value;
    byCompany[c.id].deals += 1;
  });
  const topCompanies = Object.values(byCompany).sort((a, b) => b.won - a.won).slice(0, 5);

  const feed = allRows_("activities")
    .sort((a, b) => (a.created_at === b.created_at ? b.id - a.id : a.created_at < b.created_at ? 1 : -1))
    .slice(0, 8)
    .map(withContactName_);

  const upcoming = tasks
    .filter((t) => !t.done)
    .sort((a, b) => (!a.due_date) - (!b.due_date) || (a.due_date || "").localeCompare(b.due_date || ""))
    .slice(0, 6)
    .map(withContactName_);

  const closing = openDeals.filter((d) => d.close_date).sort((a, b) => a.close_date.localeCompare(b.close_date)).slice(0, 5);
  const target = user.target || 0;

  return {
    greeting_name: user.name.split(" ")[0],
    tasks_today: tasks.filter((t) => !t.done && t.due_date === today).length,
    new_contacts: last(newContacts),
    kpis,
    months: months.map(([, label]) => label),
    revenue,
    added_value: addedValue,
    target,
    won_this_month: last(revenue),
    funnel,
    sources: countBy_(contacts, (c) => c.source),
    top_companies: topCompanies,
    feed,
    upcoming,
    closing,
    insights: insights_(deals, contacts, tasks, last(revenue), target, today, week),
  };
}

// Small rule-based tips shown on the dashboard.
function insights_(deals, contacts, tasks, wonNow, target, today, week) {
  const tips = [];
  const overdue = tasks.filter((t) => !t.done && t.due_date && t.due_date < today).length;
  if (overdue) {
    tips.push({ icon: "alarm-clock", tone: "red", text: `${overdue} overdue task${overdue > 1 ? "s need" : " needs"} your attention` });
  }

  const soon = deals.filter((d) => isOpen_(d) && d.close_date && today <= d.close_date && d.close_date <= week);
  if (soon.length) {
    tips.push({ icon: "flame", tone: "amber",
      text: `${soon.length} deal${soon.length > 1 ? "s" : ""} worth ${inr_(sumOf_(soon, (d) => d.value))} closing this week` });
  }

  const openDeals = deals.filter(isOpen_);
  if (openDeals.length) {
    const big = openDeals.reduce((a, b) => (b.value > a.value ? b : a));
    tips.push({ icon: "gem", tone: "violet", text: `Biggest opportunity: ${big.title} (${inr_(big.value)})` });
  }

  const customers = countBy_(contacts.filter((c) => c.status === "Customer"), (c) => c.source);
  if (Object.keys(customers).length) {
    tips.push({ icon: "sparkles", tone: "cyan", text: `${Object.keys(customers)[0]} brings you the most customers` });
  }

  if (target) {
    if (wonNow >= target) tips.unshift({ icon: "trophy", tone: "green", text: "Monthly target achieved. Amazing work! 🎉" });
    else tips.push({ icon: "target", tone: "green", text: `${inr_(target - wonNow)} more to hit this month's target` });
  }
  return tips;
}

function notifications_() {
  const today = today_();
  const week = addDays_(today, 7);
  const tasks = allRows_("tasks").filter((t) => !t.done);
  const byDate = (key) => (a, b) => a[key].localeCompare(b[key]);
  const items = [];
  tasks.filter((t) => t.due_date && t.due_date < today).sort(byDate("due_date")).forEach((t) => {
    items.push({ icon: "alarm-clock", tone: "red", title: t.title, text: `Overdue since ${t.due_date}`, page: "tasks" });
  });
  tasks.filter((t) => t.due_date === today).forEach((t) => {
    items.push({ icon: "calendar-check", tone: "amber", title: t.title, text: "Due today", page: "tasks" });
  });
  allRows_("deals").filter((d) => isOpen_(d) && d.close_date && today <= d.close_date && d.close_date <= week)
    .sort(byDate("close_date")).forEach((d) => {
      items.push({ icon: "flame", tone: "violet", title: d.title, text: `${inr_(d.value)} closing on ${d.close_date}`, page: "deals" });
    });
  return items;
}
