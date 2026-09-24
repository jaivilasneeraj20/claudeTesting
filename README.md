# ⬡ Nexus CRM

Python **FastAPI** mein bana ek simple lekin powerful CRM, modern sidebar UI ke saath.

## Features
- **Dashboard**: KPI cards (open pipeline, revenue won, win rate, contacts), revenue chart, contacts-by-status chart, pipeline-by-stage chart, upcoming tasks aur recent deals
- **Contacts**: search, status filter, company link, har contact ke deals ka total
- **Companies**: card view, har company ke contacts, deals aur won revenue ke saath
- **Deals Pipeline**: Kanban board, cards drag & drop karke stage badlo (double-click karke edit)
- **Tasks**: ek click mein complete, priority, overdue highlight, filters
- **Global search** (`Ctrl/⌘ + K`), dark/light theme, toasts, mobile-friendly sidebar
- Poori REST API ke docs `/docs` par (Swagger)

## Run
```bash
pip install -r requirements.txt
uvicorn main:app --reload
```
Browser mein kholo: http://127.0.0.1:8000. Pehli baar chalane par demo data apne aap aa jaata hai (`crm.db` delete karke reset kar sakte ho).

## Structure
```
main.py            # poora backend: models, generic CRUD, dashboard stats, search
static/index.html  # layout (sidebar, topbar, modal)
static/style.css   # design system (dark/light theme)
static/app.js      # frontend logic, no build step
static/vendor/     # Chart.js + Lucide icons (offline bhi chalta hai)
```

## Naya field ya module kaise add karein
1. `main.py` mein model mein field add karo (ya naya `SQLModel` class banao aur `MODELS` mein daalo; CRUD API apne aap ban jaati hai).
2. `static/app.js` ke `FIELDS` mein ek line add karo, form apne aap ban jaata hai.
