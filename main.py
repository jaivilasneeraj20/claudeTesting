"""Nexus CRM — a simple but powerful CRM built with FastAPI + SQLModel.

Run:  uvicorn main:app --reload   ->  open http://127.0.0.1:8000
"""
import hashlib
import hmac
import os
import secrets
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import ValidationError
from fastapi.staticfiles import StaticFiles
from sqlmodel import Field, Session, SQLModel, create_engine, func, or_, select

# ---------------------------------------------------------------- models

class Base(SQLModel):
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Company(Base, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    industry: str = ""
    website: str = ""
    phone: str = ""
    city: str = ""


class Contact(Base, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = ""
    phone: str = ""
    company_id: Optional[int] = Field(default=None, foreign_key="company.id")
    status: str = "Lead"          # Lead | Prospect | Customer | Inactive
    source: str = "Website"


class Deal(Base, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    value: float = 0
    stage: str = "Lead"           # Lead | Qualified | Proposal | Negotiation | Won | Lost
    contact_id: Optional[int] = Field(default=None, foreign_key="contact.id")
    company_id: Optional[int] = Field(default=None, foreign_key="company.id")
    close_date: Optional[date] = None


class Task(Base, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    due_date: Optional[date] = None
    priority: str = "Medium"      # Low | Medium | High
    done: bool = False
    contact_id: Optional[int] = Field(default=None, foreign_key="contact.id")


class User(Base, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = Field(unique=True, index=True)
    password_hash: str


MODELS = {"companies": Company, "contacts": Contact, "deals": Deal, "tasks": Task}
SEARCH = {"companies": "name", "contacts": "name", "deals": "title", "tasks": "title"}

engine = create_engine("sqlite:///crm.db", connect_args={"check_same_thread": False})


@asynccontextmanager
async def lifespan(_):
    SQLModel.metadata.create_all(engine)
    seed()
    yield

app = FastAPI(title="Nexus CRM", lifespan=lifespan)


@app.exception_handler(ValidationError)
@app.exception_handler(ValueError)
def bad_input(_, exc):
    return JSONResponse({"detail": "Invalid data: " + str(exc).splitlines()[0]}, status_code=422)

# ---------------------------------------------------------------- auth
# Passwords: salted PBKDF2. Login: a signed cookie "user_id.expiry.signature".
# Only the Python standard library is used, no extra packages.

SECRET_FILE = "secret.key"
if not os.path.exists(SECRET_FILE):
    with open(SECRET_FILE, "w") as f:
        f.write(secrets.token_hex(32))
SECRET = os.environ.get("CRM_SECRET") or open(SECRET_FILE).read().strip()
COOKIE, MAX_AGE = "crm_session", 7 * 24 * 3600  # stay logged in for 7 days
PUBLIC = ("/login", "/static/", "/api/auth/", "/docs", "/openapi.json")


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return f"{salt}${digest}"


def check_password(password: str, stored: str) -> bool:
    return hmac.compare_digest(hash_password(password, stored.split("$")[0]), stored)


def sign(value: str) -> str:
    return hmac.new(SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()


def make_token(user_id: int) -> str:
    payload = f"{user_id}.{int(time.time()) + MAX_AGE}"
    return f"{payload}.{sign(payload)}"


def user_id_from(request: Request) -> Optional[int]:
    try:
        uid, exp, sig = request.cookies.get(COOKIE, "").split(".")
        if hmac.compare_digest(sig, sign(f"{uid}.{exp}")) and int(exp) > time.time():
            return int(uid)
    except ValueError:
        pass
    return None


@app.middleware("http")
async def require_login(request: Request, call_next):
    path = request.url.path
    if path.startswith(PUBLIC) or user_id_from(request):
        return await call_next(request)
    if path.startswith("/api/"):
        return JSONResponse({"detail": "Please log in"}, status_code=401)
    return RedirectResponse("/login")


def login_response(user: User) -> JSONResponse:
    res = JSONResponse({"id": user.id, "name": user.name, "email": user.email})
    res.set_cookie(COOKIE, make_token(user.id), max_age=MAX_AGE, httponly=True, samesite="lax")
    return res


@app.post("/api/auth/signup", tags=["auth"])
def signup(data: dict):
    name, email = str(data.get("name", "")).strip(), str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    if not name or "@" not in email:
        raise HTTPException(400, "Please enter your name and a valid email")
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    with Session(engine) as s:
        if s.exec(select(User).where(User.email == email)).first():
            raise HTTPException(400, "An account with this email already exists")
        user = User(name=name, email=email, password_hash=hash_password(password))
        s.add(user); s.commit(); s.refresh(user)
        return login_response(user)


@app.post("/api/auth/login", tags=["auth"])
def login(data: dict):
    email = str(data.get("email", "")).strip().lower()
    with Session(engine) as s:
        user = s.exec(select(User).where(User.email == email)).first()
        if not user or not check_password(str(data.get("password", "")), user.password_hash):
            raise HTTPException(401, "Wrong email or password")
        return login_response(user)


@app.post("/api/auth/logout", tags=["auth"])
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"ok": True}


@app.get("/api/me", tags=["auth"])
def me(request: Request):
    with Session(engine) as s:
        user = s.get(User, user_id_from(request))
        if not user:
            raise HTTPException(401, "Please log in")
        return {"id": user.id, "name": user.name, "email": user.email}

# ---------------------------------------------------------------- generic CRUD
# One small factory gives every model full list/search/create/update/delete.

def register_crud(name: str, Model: type[SQLModel]):
    def get_or_404(s: Session, item_id: int):
        obj = s.get(Model, item_id)
        if not obj:
            raise HTTPException(404, f"{Model.__name__} not found")
        return obj

    @app.get(f"/api/{name}", tags=[name])
    def list_items(q: str = ""):
        with Session(engine) as s:
            stmt = select(Model).order_by(Model.id.desc())
            if q:
                stmt = stmt.where(getattr(Model, SEARCH[name]).ilike(f"%{q}%"))
            return s.exec(stmt).all()

    @app.post(f"/api/{name}", tags=[name])
    def create_item(data: dict):
        with Session(engine) as s:
            obj = Model.model_validate(clean(Model, data))
            s.add(obj); s.commit(); s.refresh(obj)
            return obj

    @app.put(f"/api/{name}/{{item_id}}", tags=[name])
    def update_item(item_id: int, data: dict):
        with Session(engine) as s:
            obj = get_or_404(s, item_id)
            for k, v in clean(Model, data).items():
                setattr(obj, k, v)
            Model.model_validate(obj.model_dump())  # validate merged result
            s.add(obj); s.commit(); s.refresh(obj)
            return obj

    @app.delete(f"/api/{name}/{{item_id}}", tags=[name])
    def delete_item(item_id: int):
        with Session(engine) as s:
            s.delete(get_or_404(s, item_id)); s.commit()
            return {"ok": True}


def clean(Model, data: dict) -> dict:
    """Keep only real fields, turn '' into None for optional ids/dates, parse dates."""
    out = {}
    for k, v in data.items():
        if k in ("id", "created_at") or k not in Model.model_fields:
            continue
        if v == "" and (k.endswith("_id") or k.endswith("_date")):
            v = None
        if isinstance(v, str) and k.endswith("_date"):
            v = date.fromisoformat(v)
        out[k] = v
    return out


for _name, _Model in MODELS.items():
    register_crud(_name, _Model)

# ---------------------------------------------------------------- dashboard

@app.get("/api/stats", tags=["dashboard"])
def stats():
    with Session(engine) as s:
        count = lambda M: s.exec(select(func.count()).select_from(M)).one()
        deals = s.exec(select(Deal)).all()
        won = [d for d in deals if d.stage == "Won"]
        closed = [d for d in deals if d.stage in ("Won", "Lost")]
        open_deals = [d for d in deals if d.stage not in ("Won", "Lost")]

        stages = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]
        pipeline = {st: sum(d.value for d in deals if d.stage == st) for st in stages}

        # revenue won per month for the last 6 months
        t = date.today()
        months = [date(t.year + (t.month - 1 - i) // 12, (t.month - 1 - i) % 12 + 1, 1).strftime("%b %Y")
                  for i in range(5, -1, -1)]
        revenue = {m: 0.0 for m in months}
        for d in won:
            key = (d.close_date or d.created_at.date()).strftime("%b %Y")
            if key in revenue:
                revenue[key] += d.value

        statuses = s.exec(select(Contact.status, func.count()).group_by(Contact.status)).all()
        upcoming = s.exec(
            select(Task).where(Task.done == False).order_by(Task.due_date).limit(6)  # noqa: E712
        ).all()

        return {
            "contacts": count(Contact),
            "companies": count(Company),
            "open_deals": len(open_deals),
            "pipeline_value": sum(d.value for d in open_deals),
            "won_value": sum(d.value for d in won),
            "win_rate": round(100 * len(won) / len(closed)) if closed else 0,
            "pending_tasks": s.exec(select(func.count()).where(Task.done == False)).one(),  # noqa: E712
            "pipeline": pipeline,
            "revenue": revenue,
            "contact_status": dict(statuses),
            "upcoming_tasks": upcoming,
            "recent_deals": sorted(deals, key=lambda d: d.created_at, reverse=True)[:5],
        }


@app.get("/api/search", tags=["dashboard"])
def global_search(q: str):
    """Search everything at once (used by the ⌘K search bar)."""
    with Session(engine) as s:
        like = f"%{q}%"
        return {
            "contacts": s.exec(select(Contact).where(or_(Contact.name.ilike(like), Contact.email.ilike(like))).limit(5)).all(),
            "companies": s.exec(select(Company).where(Company.name.ilike(like)).limit(5)).all(),
            "deals": s.exec(select(Deal).where(Deal.title.ilike(like)).limit(5)).all(),
            "tasks": s.exec(select(Task).where(Task.title.ilike(like)).limit(5)).all(),
        }

# ---------------------------------------------------------------- demo data

def seed():
    with Session(engine) as s:
        if s.exec(select(Company)).first():
            return
        t = date.today()
        companies = [
            Company(name="Acme Corp", industry="Manufacturing", website="acme.com", phone="+91 98100 11111", city="Mumbai"),
            Company(name="Globex", industry="Technology", website="globex.io", phone="+91 98100 22222", city="Bengaluru"),
            Company(name="Initech", industry="Finance", website="initech.in", phone="+91 98100 33333", city="Delhi"),
            Company(name="Umbrella Health", industry="Healthcare", website="umbrella.health", phone="+91 98100 44444", city="Pune"),
        ]
        s.add_all(companies); s.commit()
        c = [x.id for x in companies]
        contacts = [
            Contact(name="Aarav Sharma", email="aarav@acme.com", phone="+91 99990 10001", company_id=c[0], status="Customer", source="Referral"),
            Contact(name="Priya Patel", email="priya@globex.io", phone="+91 99990 10002", company_id=c[1], status="Prospect", source="LinkedIn"),
            Contact(name="Rohan Mehta", email="rohan@initech.in", phone="+91 99990 10003", company_id=c[2], status="Lead", source="Website"),
            Contact(name="Ananya Iyer", email="ananya@umbrella.health", phone="+91 99990 10004", company_id=c[3], status="Customer", source="Event"),
            Contact(name="Vikram Singh", email="vikram@globex.io", phone="+91 99990 10005", company_id=c[1], status="Lead", source="Cold Call"),
        ]
        s.add_all(contacts); s.commit()
        p = [x.id for x in contacts]
        s.add_all([
            Deal(title="ERP Rollout", value=450000, stage="Won", contact_id=p[0], company_id=c[0], close_date=t - timedelta(days=100)),
            Deal(title="Cloud Migration", value=820000, stage="Negotiation", contact_id=p[1], company_id=c[1], close_date=t + timedelta(days=15)),
            Deal(title="Security Audit", value=180000, stage="Proposal", contact_id=p[2], company_id=c[2], close_date=t + timedelta(days=30)),
            Deal(title="Patient Portal", value=640000, stage="Won", contact_id=p[3], company_id=c[3], close_date=t - timedelta(days=40)),
            Deal(title="Analytics Suite", value=300000, stage="Qualified", contact_id=p[4], company_id=c[1], close_date=t + timedelta(days=45)),
            Deal(title="Support Renewal", value=120000, stage="Won", contact_id=p[0], company_id=c[0], close_date=t - timedelta(days=5)),
            Deal(title="Mobile App", value=260000, stage="Lead", contact_id=p[2], company_id=c[2]),
            Deal(title="Data Warehouse", value=150000, stage="Lost", contact_id=p[4], company_id=c[1], close_date=t - timedelta(days=20)),
        ])
        s.add_all([
            Task(title="Send proposal to Rohan", due_date=t + timedelta(days=1), priority="High", contact_id=p[2]),
            Task(title="Follow-up call with Priya", due_date=t, priority="High", contact_id=p[1]),
            Task(title="Prepare Q4 report", due_date=t + timedelta(days=5), priority="Medium"),
            Task(title="Onboard Ananya's team", due_date=t + timedelta(days=3), priority="Low", contact_id=p[3]),
            Task(title="Renewal invoice", due_date=t - timedelta(days=2), priority="Medium", done=True, contact_id=p[0]),
        ])
        s.commit()

# ---------------------------------------------------------------- frontend

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse("static/index.html")


@app.get("/login", include_in_schema=False)
def login_page(request: Request):
    return RedirectResponse("/") if user_id_from(request) else FileResponse("static/login.html")
