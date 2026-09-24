# ⬡ Nexus CRM

Python **FastAPI** mein bana ek modern CRM. Code simple rakha gaya hai: **koi class nahi**, sirf functions aur dictionaries.

## Kya-kya hai
- **Login / Sign up**: password hash karke save hota hai, 7 din tak login yaad rehta hai
- **Smart dashboard**: "Good morning, Naam 👋", apne aap bane insights, monthly target ring, animated KPI cards with sparklines, revenue chart, sales funnel, top companies leaderboard, latest activity
- **Contacts**: lead score (🔥 Hot / ☀️ Warm / ❄️ Cold), filters, CSV import/export
- **Contact profile drawer**: ek click mein Call, WhatsApp, Email; activity log (call, meeting, note…), deals, tasks aur poori timeline
- **Companies**: cards + drawer mein unke log aur deals
- **Pipeline**: drag & drop Kanban, weighted forecast, deal ko Won par drop karo aur confetti 🎉
- **Tasks**: Overdue / Today / Upcoming groups + **calendar view** (din par click karke task add karo)
- **Activity**: saari calls, emails, meetings ek timeline mein (deal stage change aur task complete apne aap log hote hain)
- **Notifications bell**: overdue tasks, aaj ke tasks, is hafte close hone wali deals
- **Command palette** (`Ctrl + K`): kuch bhi search karo ya kahin bhi jao
- **Settings**: naam, monthly target, dark/light theme, 6 accent colours, data export
- **Keyboard shortcuts**: `N` naya item, `G` phir `D/C/P/T` pages par jao, `Esc` band karo
- Sidebar chhota/bada hota hai, mobile par bhi achha chalta hai

## Chalane ka tareeka
```bash
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```
Browser mein kholo: http://127.0.0.1:8000, phir **Sign up** karke account banao.
Pehli baar demo data apne aap aa jaata hai. Sab kuch naya shuru karna ho to `nexus.db` delete kar do.

## Files (kaunsi file kya karti hai)
```
main.py        saare web routes (login, CRUD, dashboard, CSV)
db.py          database: tables, save / update / delete functions (sqlite3)
auth.py        password hash + login cookie
stats.py       dashboard numbers, insights, notifications
seed.py        demo data

static/login.html      login / sign up page
static/index.html      main layout (sidebar, topbar)
static/style.css       poora design (colours upar variables mein)
static/js/helpers.js   chhote kaam ke functions (format, api, toast, confetti…)
static/js/forms.js     har table ka add/edit form
static/js/<page>.js    har page ki alag file: dashboard, contacts, companies, deals, tasks, activity, settings
static/js/app.js       sidebar, navigation, search, notifications, shortcuts
```

## Naya field kaise jodein (example: contact mein "city")
1. `db.py`: `contacts` table mein `city TEXT DEFAULT ''` aur `FIELDS["contacts"]` mein `"city": "text"` jodo
2. `static/js/forms.js`: `contacts` ke fields mein `["city", "City", "text"],` jodo
3. `nexus.db` delete karke server dobara chalao
