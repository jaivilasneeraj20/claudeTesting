"""Nexus CRM: all web routes. Simple functions only, no classes.

Run:  python -m uvicorn main:app --reload   ->  open http://127.0.0.1:8000
"""
import csv
import io
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

import auth
import db
import stats
from seed import seed


@asynccontextmanager
async def lifespan(app):
    db.setup()
    seed()
    yield

app = FastAPI(title="Nexus CRM", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")


# Any bad value (like "abc" for a number) becomes a friendly error message.
@app.exception_handler(ValueError)
def bad_value(request, error):
    return JSONResponse({"detail": str(error)}, status_code=422)


# ---------------------------------------------------------------- login check

PUBLIC = ("/login", "/static/", "/api/auth/")


def current_user(request):
    user_id = auth.read_token(request.cookies.get(auth.COOKIE))
    return db.one("SELECT id, name, email, target FROM users WHERE id = ?", (user_id,)) if user_id else None


@app.middleware("http")
async def require_login(request: Request, call_next):
    path = request.url.path
    if path.startswith(PUBLIC) or current_user(request):
        return await call_next(request)
    if path.startswith("/api/"):
        return JSONResponse({"detail": "Please log in"}, status_code=401)
    return RedirectResponse("/login")


def logged_in(user):
    response = JSONResponse(user)
    response.set_cookie(auth.COOKIE, auth.make_token(user["id"]), max_age=auth.MAX_AGE, httponly=True, samesite="lax")
    return response


@app.post("/api/auth/signup")
def signup(data: dict):
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    if not name or "@" not in email:
        raise HTTPException(400, "Please enter your name and a valid email")
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if db.one("SELECT id FROM users WHERE email = ?", (email,)):
        raise HTTPException(400, "An account with this email already exists")
    user_id = db.execute("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                         (name, email, auth.hash_password(password)))
    return logged_in({"id": user_id, "name": name, "email": email})


@app.post("/api/auth/login")
def login(data: dict):
    email = str(data.get("email", "")).strip().lower()
    user = db.one("SELECT * FROM users WHERE email = ?", (email,))
    if not user or not auth.check_password(str(data.get("password", "")), user["password_hash"]):
        raise HTTPException(401, "Wrong email or password")
    return logged_in({"id": user["id"], "name": user["name"], "email": user["email"]})


@app.post("/api/auth/logout")
def logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(auth.COOKIE)
    return response


@app.get("/api/me")
def me(request: Request):
    return current_user(request)


@app.put("/api/me")
def update_me(request: Request, data: dict):
    user = current_user(request)
    name = str(data.get("name", user["name"])).strip() or user["name"]
    target = float(data.get("target", user["target"]) or 0)
    db.execute("UPDATE users SET name = ?, target = ? WHERE id = ?", (name, target, user["id"]))
    return current_user(request)


# ---------------------------------------------------------------- dashboard

@app.get("/api/stats")
def dashboard(request: Request):
    return stats.dashboard(current_user(request))


@app.get("/api/notifications")
def notifications():
    return stats.notifications()


@app.get("/api/all")
def everything():
    """All CRM data in one call. The frontend filters and searches it instantly."""
    return {table: db.all_rows(table) for table in db.FIELDS}


# ---------------------------------------------------------------- CSV export / import

@app.get("/api/export/{table}")
def export_csv(table: str):
    check_table(table)
    rows = db.all_rows(table)
    out = io.StringIO()
    columns = ["id", *db.FIELDS[table], "created_at"]
    writer = csv.DictWriter(out, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return Response(out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={table}.csv"})


@app.post("/api/import/contacts")
def import_contacts(data: dict):
    """Expects {"csv": "..."} with columns like name, email, phone, company, status, source."""
    added = 0
    for row in csv.DictReader(io.StringIO(data.get("csv", ""))):
        row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
        if not row.get("name"):
            continue
        company_name = row.pop("company", "")
        if company_name:
            company = db.one("SELECT id FROM companies WHERE name = ?", (company_name,))
            row["company_id"] = company["id"] if company else db.insert_row("companies", {"name": company_name})["id"]
        if row.get("status") not in db.CHOICES["status"]:
            row["status"] = "Lead"
        db.insert_row("contacts", db.clean("contacts", row))
        added += 1
    return {"added": added}


# ---------------------------------------------------------------- CRUD for every table
# /api/contacts, /api/companies, /api/deals, /api/tasks, /api/activities

def check_table(table):
    if table not in db.FIELDS:
        raise HTTPException(404, "Unknown table")


def get_or_404(table, row_id):
    row = db.get_row(table, row_id)
    if not row:
        raise HTTPException(404, "Not found")
    return row


@app.get("/api/{table}")
def list_rows(table: str):
    check_table(table)
    return db.all_rows(table)


@app.post("/api/{table}")
def create_row(table: str, data: dict):
    check_table(table)
    row = db.insert_row(table, db.clean(table, data))
    if table == "deals":
        db.log_activity(f'New deal "{row["title"]}" created', row["contact_id"], row["id"])
    return row


@app.put("/api/{table}/{row_id}")
def update_row(table: str, row_id: int, data: dict):
    check_table(table)
    old = get_or_404(table, row_id)
    changes = db.clean(table, data, is_new=False)

    # a deal that is won or lost is closed today (unless it already has a past close date)
    today = date.today().isoformat()
    if table == "deals" and changes.get("stage") in ("Won", "Lost") and old["stage"] != changes["stage"]:
        close = changes.get("close_date") or old["close_date"]
        if not close or close > today:
            changes["close_date"] = today

    row = db.update_row(table, row_id, changes)

    # automatic timeline entries
    if table == "deals" and row["stage"] != old["stage"]:
        db.log_activity(f'Deal "{row["title"]}" moved to {row["stage"]}', row["contact_id"], row_id)
    if table == "tasks" and row["done"] and not old["done"]:
        db.log_activity(f'Completed task "{row["title"]}"', row["contact_id"])
    return row


@app.delete("/api/{table}/{row_id}")
def delete_row(table: str, row_id: int):
    check_table(table)
    get_or_404(table, row_id)
    db.delete_row(table, row_id)
    return {"ok": True}


# ---------------------------------------------------------------- pages

@app.get("/", include_in_schema=False)
def home():
    return FileResponse("static/index.html")


@app.get("/login", include_in_schema=False)
def login_page(request: Request):
    return RedirectResponse("/") if current_user(request) else FileResponse("static/login.html")
