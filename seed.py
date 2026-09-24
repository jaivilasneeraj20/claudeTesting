"""Fills an empty database with realistic demo data so the app looks alive."""
import random
from datetime import date, datetime, timedelta

from db import insert_row, one

COMPANIES = [
    ("Acme Corp", "Manufacturing", "Mumbai"), ("Globex", "Technology", "Bengaluru"),
    ("Initech", "Finance", "Delhi"), ("Umbrella Health", "Healthcare", "Pune"),
    ("Stark Retail", "Retail", "Hyderabad"), ("Wayne Education", "Education", "Chennai"),
    ("Zenith Motors", "Manufacturing", "Ahmedabad"), ("BlueLeaf Foods", "Retail", "Jaipur"),
]
PEOPLE = [
    "Aarav Sharma", "Priya Patel", "Rohan Mehta", "Ananya Iyer", "Vikram Singh", "Sneha Reddy",
    "Karan Malhotra", "Isha Kapoor", "Arjun Nair", "Meera Joshi", "Rahul Verma", "Diya Gupta",
    "Aditya Rao", "Kavya Menon",
]
DEALS = [
    "ERP Rollout", "Cloud Migration", "Security Audit", "Patient Portal", "Analytics Suite", "Support Renewal",
    "Mobile App", "Data Warehouse", "POS Upgrade", "LMS Platform", "Fleet Tracking", "AI Chatbot",
    "Website Revamp", "Payroll System", "Inventory Sync", "CRM Training", "Annual AMC", "Marketing Automation",
]
TASKS = [
    ("Send proposal", "High"), ("Follow-up call", "High"), ("Prepare Q4 report", "Medium"),
    ("Schedule product demo", "Medium"), ("Share pricing sheet", "Low"), ("Renewal invoice", "Medium"),
    ("Collect feedback", "Low"), ("Contract review", "High"), ("Onboarding kickoff", "Medium"),
    ("Update case study", "Low"),
]
NOTES = {
    "Call": ["Discussed budget and timeline", "Intro call, very interested", "Clarified technical questions"],
    "Email": ["Sent the proposal PDF", "Shared the case study", "Sent meeting notes"],
    "Meeting": ["Product demo went great", "Met the decision makers", "Workshop with their IT team"],
    "WhatsApp": ["Confirmed tomorrow's meeting", "Shared quick price update"],
    "Note": ["Prefers communication in the morning", "Budget approval expected next month"],
}


def stamp(d):
    return datetime.combine(d, datetime.min.time()).replace(hour=random.randint(9, 19), minute=random.randint(0, 59)).strftime("%Y-%m-%d %H:%M:%S")


def seed():
    if one("SELECT id FROM companies LIMIT 1"):
        return
    random.seed(7)
    t = date.today()
    ago = lambda days: t - timedelta(days=days)

    company_ids = []
    for name, industry, city in COMPANIES:
        slug = name.lower().replace(" ", "")
        row = insert_row("companies", {"name": name, "industry": industry, "city": city, "website": f"{slug}.com",
                                       "phone": f"+91 98{random.randint(10000000, 99999999)}", "created_at": stamp(ago(random.randint(120, 180)))})
        company_ids.append(row["id"])

    contact_ids = []
    for i, name in enumerate(PEOPLE):
        company = company_ids[i % len(company_ids)]
        first = name.split()[0].lower()
        row = insert_row("contacts", {
            "name": name, "email": f"{first}@{COMPANIES[i % len(COMPANIES)][0].lower().replace(' ', '')}.com",
            "phone": f"+91 99{random.randint(10000000, 99999999)}", "company_id": company,
            "status": random.choice(["Lead", "Prospect", "Customer", "Customer", "Prospect", "Inactive"]),
            "source": random.choice(["Website", "Referral", "LinkedIn", "Event", "Cold Call", "Referral"]),
            "created_at": stamp(ago(random.randint(0, 170)))})
        contact_ids.append((row["id"], company))

    stages = ["Won", "Won", "Won", "Won", "Won", "Lost", "Negotiation", "Negotiation", "Proposal", "Proposal",
              "Qualified", "Qualified", "Lead", "Lead", "Won", "Lost", "Won", "Won"]
    closed_days_ago = iter([min(3, t.day - 1), min(8, t.day - 1), 38, 66, 97, 22, 130, 55, 160, 75])  # spread over 6 months
    for title, stage in zip(DEALS, stages):
        contact, company = random.choice(contact_ids)
        if stage in ("Won", "Lost"):
            closed = ago(next(closed_days_ago))
            created = closed - timedelta(days=random.randint(10, 40))
        else:
            closed = t + timedelta(days=random.randint(2, 50))
            created = ago(random.randint(0, 60))
        insert_row("deals", {"title": title, "value": random.randint(6, 120) * 10000, "stage": stage,
                             "contact_id": contact, "company_id": company, "close_date": closed.isoformat(),
                             "created_at": stamp(created)})

    for i, (title, priority) in enumerate(TASKS):
        contact, _ = random.choice(contact_ids)
        person = one("SELECT name FROM contacts WHERE id = ?", (contact,))["name"].split()[0]
        insert_row("tasks", {"title": f"{title} · {person}", "priority": priority, "contact_id": contact,
                             "due_date": (t + timedelta(days=[-3, 0, 0, 1, 2, -1, 4, 6, 9, 12][i])).isoformat(),
                             "done": 1 if i == 5 else 0, "created_at": stamp(ago(random.randint(1, 10)))})

    for _ in range(34):
        kind = random.choice(list(NOTES))
        contact, _ = random.choice(contact_ids)
        insert_row("activities", {"type": kind, "note": random.choice(NOTES[kind]), "contact_id": contact,
                                  "created_at": stamp(ago(random.randint(0, 25)))})
