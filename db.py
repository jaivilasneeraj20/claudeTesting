"""Database helpers: plain functions + Python's built-in sqlite3. No classes."""
import sqlite3
from datetime import date

DB_FILE = "nexus.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, target REAL DEFAULT 2500000,
    created_at TEXT DEFAULT (datetime('now', 'localtime')));
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, industry TEXT DEFAULT '', website TEXT DEFAULT '',
    phone TEXT DEFAULT '', city TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now', 'localtime')));
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT DEFAULT '', phone TEXT DEFAULT '',
    company_id INTEGER, status TEXT DEFAULT 'Lead', source TEXT DEFAULT 'Website',
    created_at TEXT DEFAULT (datetime('now', 'localtime')));
CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, value REAL DEFAULT 0, stage TEXT DEFAULT 'Lead',
    contact_id INTEGER, company_id INTEGER, close_date TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')));
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, due_date TEXT, priority TEXT DEFAULT 'Medium',
    done INTEGER DEFAULT 0, contact_id INTEGER, created_at TEXT DEFAULT (datetime('now', 'localtime')));
CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY, type TEXT DEFAULT 'Note', note TEXT NOT NULL,
    contact_id INTEGER, deal_id INTEGER, created_at TEXT DEFAULT (datetime('now', 'localtime')));
"""

# Every table and its columns. "id" = link to another table.
FIELDS = {
    "companies": {"name": "text", "industry": "text", "website": "text", "phone": "text", "city": "text"},
    "contacts": {"name": "text", "email": "text", "phone": "text", "company_id": "id", "status": "text", "source": "text"},
    "deals": {"title": "text", "value": "number", "stage": "text", "contact_id": "id", "company_id": "id", "close_date": "date"},
    "tasks": {"title": "text", "due_date": "date", "priority": "text", "done": "bool", "contact_id": "id"},
    "activities": {"type": "text", "note": "text", "contact_id": "id", "deal_id": "id"},
}
REQUIRED = {"companies": "name", "contacts": "name", "deals": "title", "tasks": "title", "activities": "note"}

STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]
CHOICES = {
    "stage": STAGES,
    "status": ["Lead", "Prospect", "Customer", "Inactive"],
    "priority": ["Low", "Medium", "High"],
    "type": ["Call", "Email", "Meeting", "WhatsApp", "Note", "Update"],
}

# When a row is deleted, remove links to it from other tables.
UNLINK = {
    "companies": ["UPDATE contacts SET company_id = NULL WHERE company_id = ?",
                  "UPDATE deals SET company_id = NULL WHERE company_id = ?"],
    "contacts": ["UPDATE deals SET contact_id = NULL WHERE contact_id = ?",
                 "UPDATE tasks SET contact_id = NULL WHERE contact_id = ?",
                 "DELETE FROM activities WHERE contact_id = ?"],
    "deals": ["UPDATE activities SET deal_id = NULL WHERE deal_id = ?"],
    "tasks": [],
    "activities": [],
}


def run(sql, params=()):
    """Run one SQL statement. Returns (rows as dicts, id of the new row)."""
    con = sqlite3.connect(DB_FILE)
    con.row_factory = sqlite3.Row
    try:
        cur = con.execute(sql, params)
        rows = [dict(r) for r in cur.fetchall()]
        con.commit()
        return rows, cur.lastrowid
    finally:
        con.close()


def query(sql, params=()):
    return run(sql, params)[0]


def one(sql, params=()):
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql, params=()):
    return run(sql, params)[1]


def setup():
    con = sqlite3.connect(DB_FILE)
    con.executescript(SCHEMA)
    con.close()


# ---------------------------------------------------------------- simple CRUD

def clean(table, data, is_new=True):
    """Keep only known columns and convert each value to the right type."""
    out = {}
    for key, kind in FIELDS[table].items():
        if key not in data:
            continue
        value = data[key]
        if kind == "text":
            value = str(value or "").strip()
        elif kind == "number":
            value = float(value or 0)
        elif kind == "bool":
            value = 1 if value else 0
        elif kind == "id":
            value = int(value) if value not in (None, "") else None
        elif kind == "date":
            value = date.fromisoformat(value).isoformat() if value else None
        if key in CHOICES and value not in CHOICES[key]:
            raise ValueError(f"{key} must be one of: {', '.join(CHOICES[key])}")
        out[key] = value

    must = REQUIRED[table]
    if (is_new or must in out) and not out.get(must):
        raise ValueError(f"{must} is required")
    return out


def all_rows(table):
    return query(f"SELECT * FROM {table} ORDER BY id DESC")


def get_row(table, row_id):
    return one(f"SELECT * FROM {table} WHERE id = ?", (row_id,))


def insert_row(table, data):
    cols = ", ".join(data)
    marks = ", ".join("?" for _ in data)
    new_id = execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", list(data.values()))
    return get_row(table, new_id)


def update_row(table, row_id, data):
    if data:
        sets = ", ".join(f"{k} = ?" for k in data)
        execute(f"UPDATE {table} SET {sets} WHERE id = ?", [*data.values(), row_id])
    return get_row(table, row_id)


def delete_row(table, row_id):
    for sql in UNLINK[table]:
        execute(sql, (row_id,))
    execute(f"DELETE FROM {table} WHERE id = ?", (row_id,))


def log_activity(note, contact_id=None, deal_id=None, type="Update"):
    insert_row("activities", {"type": type, "note": note, "contact_id": contact_id, "deal_id": deal_id})
