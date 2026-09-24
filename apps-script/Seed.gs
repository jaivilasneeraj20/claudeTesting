/**
 * Seed.gs: fills an empty database with realistic demo data so the app looks alive.
 */

const DEMO_COMPANIES = [
  ["Acme Corp", "Manufacturing", "Mumbai"], ["Globex", "Technology", "Bengaluru"],
  ["Initech", "Finance", "Delhi"], ["Umbrella Health", "Healthcare", "Pune"],
  ["Stark Retail", "Retail", "Hyderabad"], ["Wayne Education", "Education", "Chennai"],
  ["Zenith Motors", "Manufacturing", "Ahmedabad"], ["BlueLeaf Foods", "Retail", "Jaipur"],
];
const DEMO_PEOPLE = [
  "Aarav Sharma", "Priya Patel", "Rohan Mehta", "Ananya Iyer", "Vikram Singh", "Sneha Reddy",
  "Karan Malhotra", "Isha Kapoor", "Arjun Nair", "Meera Joshi", "Rahul Verma", "Diya Gupta",
  "Aditya Rao", "Kavya Menon",
];
const DEMO_DEALS = [
  "ERP Rollout", "Cloud Migration", "Security Audit", "Patient Portal", "Analytics Suite", "Support Renewal",
  "Mobile App", "Data Warehouse", "POS Upgrade", "LMS Platform", "Fleet Tracking", "AI Chatbot",
  "Website Revamp", "Payroll System", "Inventory Sync", "CRM Training", "Annual AMC", "Marketing Automation",
];
const DEMO_TASKS = [
  ["Send proposal", "High"], ["Follow-up call", "High"], ["Prepare Q4 report", "Medium"],
  ["Schedule product demo", "Medium"], ["Share pricing sheet", "Low"], ["Renewal invoice", "Medium"],
  ["Collect feedback", "Low"], ["Contract review", "High"], ["Onboarding kickoff", "Medium"],
  ["Update case study", "Low"],
];
const DEMO_NOTES = {
  Call: ["Discussed budget and timeline", "Intro call, very interested", "Clarified technical questions"],
  Email: ["Sent the proposal PDF", "Shared the case study", "Sent meeting notes"],
  Meeting: ["Product demo went great", "Met the decision makers", "Workshop with their IT team"],
  WhatsApp: ["Confirmed tomorrow's meeting", "Shared quick price update"],
  Note: ["Prefers communication in the morning", "Budget approval expected next month"],
};

// Same random numbers every time (like random.seed(7) in Python).
let seedState_ = 7;
function random_() {
  seedState_ = (seedState_ * 1103515245 + 12345) % 2147483648;
  return seedState_ / 2147483648;
}
const randint_ = (a, b) => a + Math.floor(random_() * (b - a + 1));
const choice_ = (list) => list[Math.floor(random_() * list.length)];

function stamp_(iso) {
  return `${iso} ${String(randint_(9, 19)).padStart(2, "0")}:${String(randint_(0, 59)).padStart(2, "0")}:00`;
}

function seed_() {
  if (rows_("companies").length) return;
  seedState_ = 7;
  const today = today_();
  const ago = (days) => addDays_(today, -days);
  const day = Number(today.slice(8, 10));

  const companies = insertMany_("companies", DEMO_COMPANIES.map(([name, industry, city]) => ({
    name, industry, city, website: `${name.toLowerCase().replace(/ /g, "")}.com`,
    phone: `+91 98${randint_(10000000, 99999999)}`, created_at: stamp_(ago(randint_(120, 180))),
  })));

  const contacts = insertMany_("contacts", DEMO_PEOPLE.map((name, i) => {
    const company = DEMO_COMPANIES[i % DEMO_COMPANIES.length][0];
    return {
      name, email: `${name.split(" ")[0].toLowerCase()}@${company.toLowerCase().replace(/ /g, "")}.com`,
      phone: `+91 99${randint_(10000000, 99999999)}`, company_id: companies[i % companies.length].id,
      status: choice_(["Lead", "Prospect", "Customer", "Customer", "Prospect", "Inactive"]),
      source: choice_(["Website", "Referral", "LinkedIn", "Event", "Cold Call", "Referral"]),
      created_at: stamp_(ago(randint_(0, 170))),
    };
  }));

  const stages = ["Won", "Won", "Won", "Won", "Won", "Lost", "Negotiation", "Negotiation", "Proposal", "Proposal",
    "Qualified", "Qualified", "Lead", "Lead", "Won", "Lost", "Won", "Won"];
  const closedDaysAgo = [Math.min(3, day - 1), Math.min(8, day - 1), 38, 66, 97, 22, 130, 55, 160, 75]; // spread over 6 months
  insertMany_("deals", DEMO_DEALS.map((title, i) => {
    const contact = choice_(contacts);
    const stage = stages[i];
    let closed, created;
    if (stage === "Won" || stage === "Lost") {
      closed = ago(closedDaysAgo.shift());
      created = addDays_(closed, -randint_(10, 40));
    } else {
      closed = addDays_(today, randint_(2, 50));
      created = ago(randint_(0, 60));
    }
    return { title, value: randint_(6, 120) * 10000, stage, contact_id: contact.id, company_id: contact.company_id,
      close_date: closed, created_at: stamp_(created) };
  }));

  const dueIn = [-3, 0, 0, 1, 2, -1, 4, 6, 9, 12];
  insertMany_("tasks", DEMO_TASKS.map(([title, priority], i) => {
    const contact = choice_(contacts);
    return { title: `${title} · ${contact.name.split(" ")[0]}`, priority, contact_id: contact.id,
      due_date: addDays_(today, dueIn[i]), done: i === 5 ? 1 : 0, created_at: stamp_(ago(randint_(1, 10))) };
  }));

  const activities = [];
  for (let i = 0; i < 34; i++) {
    const kind = choice_(Object.keys(DEMO_NOTES));
    activities.push({ type: kind, note: choice_(DEMO_NOTES[kind]), contact_id: choice_(contacts).id,
      created_at: stamp_(ago(randint_(0, 25))) });
  }
  insertMany_("activities", activities);
}
