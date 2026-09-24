/* =====================================================================
   helpers.js — small functions used by every page. No classes.
   ===================================================================== */

// ---------- fixed lists & colours ----------
const STAGES = { Lead: "#8b90b0", Qualified: "#3b82f6", Proposal: "#a855f7", Negotiation: "#f59e0b", Won: "#22c55e", Lost: "#f43f5e" };
const PROBABILITY = { Lead: 10, Qualified: 25, Proposal: 50, Negotiation: 75, Won: 100, Lost: 0 };
const STATUS = { Lead: "#3b82f6", Prospect: "#f59e0b", Customer: "#22c55e", Inactive: "#8b90b0" };
const PRIORITY = { High: "#f43f5e", Medium: "#f59e0b", Low: "#22c55e" };
const ACTIVITY = {
  Call: { icon: "phone", color: "#22c55e" },
  Email: { icon: "mail", color: "#3b82f6" },
  Meeting: { icon: "users", color: "#a855f7" },
  WhatsApp: { icon: "message-circle", color: "#10b981" },
  Note: { icon: "sticky-note", color: "#f59e0b" },
  Update: { icon: "zap", color: "#06b6d4" },
};
const SOURCES = ["Website", "Referral", "LinkedIn", "Event", "Cold Call", "Other"];
const INDUSTRIES = ["Technology", "Finance", "Healthcare", "Manufacturing", "Retail", "Education", "Other"];

// ---------- app state (everything the pages need) ----------
const state = {
  page: "dashboard",
  data: { companies: [], contacts: [], deals: [], tasks: [], activities: [] },
  me: null,
  search: "",
  chip: "All",
};

// ---------- tiny DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const icons = () => lucide.createIcons();

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- formatting ----------
function money(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function short(n) {
  n = Number(n || 0);
  if (n >= 1e7) return "₹" + (n / 1e7).toFixed(1) + " Cr";
  if (n >= 1e5) return "₹" + (n / 1e5).toFixed(1) + " L";
  if (n >= 1e3) return "₹" + (n / 1e3).toFixed(0) + "K";
  return money(n);
}
function toDate(s) {
  // "2026-09-24" or "2026-09-24 10:30:00" -> Date
  return new Date(s.length <= 10 ? s + "T00:00:00" : s.replace(" ", "T"));
}
function fdate(s) {
  return s ? toDate(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "No date";
}
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function isoOf(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function daysFromToday(s) {
  return Math.round((toDate(s.slice(0, 10)) - toDate(todayISO())) / 86400000);
}
function timeAgo(s) {
  const sec = (Date.now() - toDate(s)) / 1000;
  if (sec < 60) return "just now";
  if (sec < 3600) return Math.floor(sec / 60) + "m ago";
  if (sec < 86400) return Math.floor(sec / 3600) + "h ago";
  if (sec < 86400 * 7) return Math.floor(sec / 86400) + "d ago";
  return fdate(s);
}
function dueChip(s) {
  if (!s) return "";
  const d = daysFromToday(s);
  if (d < 0) return `<span class="chip red"><i data-lucide="alarm-clock"></i>${-d}d late</span>`;
  if (d === 0) return `<span class="chip amber"><i data-lucide="calendar"></i>Today</span>`;
  if (d === 1) return `<span class="chip amber"><i data-lucide="calendar"></i>Tomorrow</span>`;
  return `<span class="chip"><i data-lucide="calendar"></i>${fdate(s)}</span>`;
}

// ---------- small UI pieces ----------
const initials = (name = "?") => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const hue = (text = "") => [...text].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
const avatar = (name, size = "") => `<div class="avatar ${size}" style="--h:${hue(name)}">${esc(initials(name))}</div>`;
const badge = (text, color) => `<span class="badge" style="--c:${color}">${esc(text)}</span>`;
const empty = (icon, text) => `<div class="empty"><i data-lucide="${icon}"></i><p>${text}</p></div>`;
const find = (table, id) => state.data[table].find((row) => row.id === id);
const nameOf = (table, id) => (find(table, id) || {}).name || "";
const sum = (list, key) => list.reduce((total, row) => total + (row[key] || 0), 0);
const isOpen = (deal) => deal.stage !== "Won" && deal.stage !== "Lost";
const matches = (...values) => values.join(" ").toLowerCase().includes(state.search.toLowerCase());

// Lead score (0-100): status + recent activity + open deal value.
function leadScore(contact) {
  let score = { Lead: 20, Prospect: 45, Customer: 65, Inactive: 5 }[contact.status] || 0;
  const acts = state.data.activities.filter((a) => a.contact_id === contact.id);
  score += Math.min(acts.length * 4, 16);
  if (acts.some((a) => daysFromToday(a.created_at) >= -7)) score += 10;
  const openValue = sum(state.data.deals.filter((d) => d.contact_id === contact.id && isOpen(d)), "value");
  score += Math.min(Math.round(openValue / 60000), 12);
  return Math.min(score, 100);
}
function scoreTag(score) {
  if (score >= 70) return { label: "🔥 Hot", color: "#f43f5e" };
  if (score >= 40) return { label: "☀️ Warm", color: "#f59e0b" };
  return { label: "❄️ Cold", color: "#3b82f6" };
}

// ---------- talking to the server ----------
async function api(path, method = "GET", body) {
  const res = await fetch("/api/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) location.href = "/login";
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong");
  return data;
}

async function loadData() {
  state.data = await api("all");
}

// ---------- toast messages ----------
function toast(message, type = "ok") {
  const look = { ok: ["check-circle-2", "var(--green)"], err: ["alert-circle", "var(--red)"], win: ["party-popper", "var(--amber)"] }[type];
  const el = document.createElement("div");
  el.className = "toast";
  el.style.setProperty("--c", look[1]);
  el.innerHTML = `<i data-lucide="${look[0]}"></i>${esc(message)}`;
  $("#toasts").append(el);
  icons();
  setTimeout(() => el.remove(), 3000);
}

// ---------- animated numbers (0 -> value) ----------
function countUp(root = document) {
  root.querySelectorAll("[data-count]").forEach((el) => {
    const end = Number(el.dataset.count);
    const format = el.dataset.format;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / 1100, 1);
      const value = end * (1 - Math.pow(1 - p, 3)); // ease-out
      el.textContent = format === "money" ? short(value) : Math.round(value) + (el.dataset.suffix || "");
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ---------- tiny line chart (SVG) ----------
function sparkline(values, color) {
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 38 - (v / max) * 32]);
  const line = pts.map((p) => p.join(",")).join(" ");
  const id = "g" + Math.random().toString(36).slice(2, 8);
  return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="0,40 ${line} 100,40" fill="url(#${id})"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
  </svg>`;
}

// ---------- confetti 🎉 (plain canvas, no library) ----------
function confetti() {
  const canvas = $("#confetti");
  const ctx = canvas.getContext("2d");
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const colors = ["#7c5cff", "#22d3ee", "#f59e0b", "#22c55e", "#f43f5e", "#ffffff"];
  const pieces = Array.from({ length: 180 }, () => ({
    x: innerWidth / 2, y: innerHeight / 2.5,
    vx: (Math.random() - 0.5) * 18, vy: Math.random() * -16 - 4,
    size: Math.random() * 8 + 4, color: colors[Math.floor(Math.random() * colors.length)],
    spin: Math.random() * 360,
  }));
  let frame = 0;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.45; p.vx *= 0.99; p.spin += 8;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.spin * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });
    if (frame++ < 160) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  draw();
}

// ---------- modal & confirm box ----------
function openModal(html) {
  $("#modalBox").innerHTML = html;
  $("#modal").classList.add("open");
  icons();
}
function closeModal() {
  $("#modal").classList.remove("open");
}
function askConfirm(title, text) {
  return new Promise((resolve) => {
    openModal(`
      <div class="confirm-box">
        <div class="warn"><i data-lucide="trash-2"></i></div>
        <h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
        <div class="modal-foot">
          <button class="btn btn-ghost" id="noBtn">Cancel</button>
          <button class="btn btn-danger" id="yesBtn">Yes, delete</button>
        </div>
      </div>`);
    $("#modalBox").classList.add("confirm-box");
    const done = (answer) => { closeModal(); $("#modalBox").classList.remove("confirm-box"); resolve(answer); };
    $("#yesBtn").onclick = () => done(true);
    $("#noBtn").onclick = () => done(false);
  });
}

// ---------- side drawer ----------
function openDrawer(html) {
  $("#drawer").innerHTML = html;
  document.body.classList.add("drawer-open");
  icons();
}
function closeDrawer() {
  document.body.classList.remove("drawer-open");
  state.drawer = null;
}

// ---------- loading placeholder ----------
function skeleton() {
  return `<div class="grid g4" style="margin-bottom:20px">${'<div class="skeleton" style="height:150px"></div>'.repeat(4)}</div>
          <div class="grid g-main"><div class="skeleton" style="height:340px"></div><div class="skeleton" style="height:340px"></div></div>`;
}
