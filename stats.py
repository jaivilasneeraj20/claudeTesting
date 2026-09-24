"""Dashboard numbers, smart insights and notifications. Plain functions only."""
from collections import Counter
from datetime import date, timedelta

from db import query

# Chance (in %) that a deal in each stage will be won. Used for the forecast.
PROBABILITY = {"Lead": 10, "Qualified": 25, "Proposal": 50, "Negotiation": 75, "Won": 100, "Lost": 0}


def inr(n):
    """1250000 -> '₹12.5 L'"""
    if n >= 1e7:
        return f"₹{n / 1e7:.1f} Cr"
    if n >= 1e5:
        return f"₹{n / 1e5:.1f} L"
    return f"₹{n:,.0f}"


def last_months(count):
    """[('2026-04', 'Apr'), ..., ('2026-09', 'Sep')] ending with this month."""
    t = date.today()
    months = []
    for i in range(count - 1, -1, -1):
        m = date(t.year + (t.month - 1 - i) // 12, (t.month - 1 - i) % 12 + 1, 1)
        months.append((m.strftime("%Y-%m"), m.strftime("%b")))
    return months


def trend(now, before):
    """Percent change, e.g. 120 vs 100 -> 20. None when there is nothing to compare."""
    if not before:
        return None
    return round((now - before) * 100 / before)


def closed_on(deal):
    return (deal["close_date"] or deal["created_at"])[:7]


def dashboard(user):
    deals = query("SELECT * FROM deals")
    contacts = query("SELECT * FROM contacts")
    today = date.today().isoformat()
    week = (date.today() + timedelta(days=7)).isoformat()
    months = last_months(6)

    won = [d for d in deals if d["stage"] == "Won"]
    open_deals = [d for d in deals if d["stage"] not in ("Won", "Lost")]

    revenue = [sum(d["value"] for d in won if closed_on(d) == key) for key, _ in months]
    added_value = [sum(d["value"] for d in deals if d["created_at"][:7] == key) for key, _ in months]
    new_contacts = [sum(1 for c in contacts if c["created_at"][:7] == key) for key, _ in months]
    forecast_now = sum(d["value"] * PROBABILITY[d["stage"]] / 100 for d in open_deals)

    win_rates = []
    for key, _ in months:
        closed = [d for d in deals if d["stage"] in ("Won", "Lost") and closed_on(d) == key]
        win_rates.append(round(100 * sum(d["stage"] == "Won" for d in closed) / len(closed)) if closed else 0)

    all_closed = [d for d in deals if d["stage"] in ("Won", "Lost")]
    win_rate = round(100 * len(won) / len(all_closed)) if all_closed else 0

    kpis = [
        {"label": "Revenue this month", "icon": "indian-rupee", "value": revenue[-1], "money": True,
         "trend": trend(revenue[-1], revenue[-2]), "series": revenue},
        {"label": "Open pipeline", "icon": "layers", "value": sum(d["value"] for d in open_deals), "money": True,
         "trend": trend(added_value[-1], added_value[-2]), "series": added_value},
        {"label": "Weighted forecast", "icon": "radar", "value": round(forecast_now), "money": True,
         "trend": None, "series": added_value},
        {"label": "Win rate", "icon": "target", "value": win_rate, "suffix": "%",
         "trend": trend(win_rates[-1], win_rates[-2]), "series": win_rates},
    ]

    funnel = [{"stage": s, "count": sum(d["stage"] == s for d in deals),
               "value": sum(d["value"] for d in deals if d["stage"] == s)} for s in PROBABILITY if s != "Lost"]

    top_companies = query("""
        SELECT c.id, c.name, c.industry, SUM(d.value) AS won, COUNT(d.id) AS deals
        FROM deals d JOIN companies c ON c.id = d.company_id
        WHERE d.stage = 'Won' GROUP BY c.id ORDER BY won DESC LIMIT 5""")

    feed = query("""
        SELECT a.*, c.name AS contact_name FROM activities a
        LEFT JOIN contacts c ON c.id = a.contact_id ORDER BY a.created_at DESC, a.id DESC LIMIT 8""")

    upcoming = query("""
        SELECT t.*, c.name AS contact_name FROM tasks t LEFT JOIN contacts c ON c.id = t.contact_id
        WHERE t.done = 0 ORDER BY t.due_date IS NULL, t.due_date LIMIT 6""")

    closing = sorted([d for d in open_deals if d["close_date"]], key=lambda d: d["close_date"])[:5]

    sources = Counter(c["source"] for c in contacts)
    target = user["target"] or 0

    return {
        "greeting_name": user["name"].split()[0],
        "tasks_today": sum(1 for t in query("SELECT due_date FROM tasks WHERE done = 0") if t["due_date"] == today),
        "new_contacts": new_contacts[-1],
        "kpis": kpis,
        "months": [label for _, label in months],
        "revenue": revenue,
        "added_value": added_value,
        "target": target,
        "won_this_month": revenue[-1],
        "funnel": funnel,
        "sources": dict(sources.most_common()),
        "top_companies": top_companies,
        "feed": feed,
        "upcoming": upcoming,
        "closing": closing,
        "insights": insights(deals, contacts, revenue[-1], target, today, week),
    }


def insights(deals, contacts, won_now, target, today, week):
    """Small rule-based tips shown on the dashboard."""
    tips = []
    overdue = query("SELECT COUNT(*) AS n FROM tasks WHERE done = 0 AND due_date < ?", (today,))[0]["n"]
    if overdue:
        tips.append({"icon": "alarm-clock", "tone": "red", "text": f"{overdue} overdue task{'s need' if overdue > 1 else ' needs'} your attention"})

    soon = [d for d in deals if d["stage"] not in ("Won", "Lost") and d["close_date"] and today <= d["close_date"] <= week]
    if soon:
        tips.append({"icon": "flame", "tone": "amber",
                     "text": f"{len(soon)} deal{'s' * (len(soon) > 1)} worth {inr(sum(d['value'] for d in soon))} closing this week"})

    open_deals = [d for d in deals if d["stage"] not in ("Won", "Lost")]
    if open_deals:
        big = max(open_deals, key=lambda d: d["value"])
        tips.append({"icon": "gem", "tone": "violet", "text": f"Biggest opportunity: {big['title']} ({inr(big['value'])})"})

    customers = Counter(c["source"] for c in contacts if c["status"] == "Customer")
    if customers:
        tips.append({"icon": "sparkles", "tone": "cyan", "text": f"{customers.most_common(1)[0][0]} brings you the most customers"})

    if target:
        if won_now >= target:
            tips.insert(0, {"icon": "trophy", "tone": "green", "text": "Monthly target achieved. Amazing work! 🎉"})
        else:
            tips.append({"icon": "target", "tone": "green", "text": f"{inr(target - won_now)} more to hit this month's target"})
    return tips


def notifications():
    today = date.today().isoformat()
    week = (date.today() + timedelta(days=7)).isoformat()
    items = []
    for t in query("SELECT * FROM tasks WHERE done = 0 AND due_date < ? ORDER BY due_date", (today,)):
        items.append({"icon": "alarm-clock", "tone": "red", "title": t["title"], "text": f"Overdue since {t['due_date']}", "page": "tasks"})
    for t in query("SELECT * FROM tasks WHERE done = 0 AND due_date = ?", (today,)):
        items.append({"icon": "calendar-check", "tone": "amber", "title": t["title"], "text": "Due today", "page": "tasks"})
    for d in query("SELECT * FROM deals WHERE stage NOT IN ('Won','Lost') AND close_date BETWEEN ? AND ? ORDER BY close_date", (today, week)):
        items.append({"icon": "flame", "tone": "violet", "title": d["title"], "text": f"{inr(d['value'])} closing on {d['close_date']}", "page": "deals"})
    return items
