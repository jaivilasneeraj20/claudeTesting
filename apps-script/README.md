# ⬡ Nexus CRM: Google Apps Script version

Yeh wahi Nexus CRM hai jo FastAPI mein bana tha, lekin ab yeh **Google Apps Script web app** hai
aur database ki jagah **Google Sheets** use hoti hai. Design, pages aur features bilkul same hain.
Server, hosting ya Python ki zaroorat nahi. Sab kuch tumhari Google Drive mein chalta hai.

## FastAPI se kya badla

| FastAPI version | Apps Script version |
|---|---|
| `main.py` (routes) | `Code.gs`: ek `api(path, method, body, token)` function saare routes sambhalta hai |
| `db.py` + SQLite (`nexus.db`) | `Db.gs` + Google Sheet **"Nexus CRM Database"** (har table = ek tab) |
| `auth.py` + cookie | `Auth.gs` + token (browser ke localStorage mein) |
| `stats.py` | `Stats.gs` |
| `seed.py` | `Seed.gs` |
| `static/index.html` + `login.html` | `Index.html` (login aur app ek hi page mein) |
| `static/style.css` | `Style.html` |
| `static/js/*.js` | `Helpers.html` (helpers + forms), `Pages.html` (saare pages), `App.html` (sidebar, shortcuts, login) |
| `fetch("/api/...")` | `google.script.run.api(...)` |

## Setup (10 minute, copy-paste wala tareeka)

1. [script.google.com](https://script.google.com) kholo → **New project**. Naam rakho `Nexus CRM`.
2. Left side ⚙️ **Project Settings** → **"Show appsscript.json manifest file in editor"** tick karo.
3. Har file banao aur is folder se content copy-paste karo:
   - **Script files** (➕ → Script): `Code`, `Db`, `Auth`, `Stats`, `Seed`
     (editor khud `.gs` laga deta hai; jo `Code.gs` pehle se hai, uska content replace kar do)
   - **HTML files** (➕ → HTML): `Index`, `Style`, `Helpers`, `Pages`, `App`
   - `appsscript.json` ka content bhi replace kar do
   - File ke naam bilkul same rakhna (capital letters bhi), warna `include_()` file nahi dhoondh paayega.
4. Upar dropdown se function **`setup`** chuno → **Run**. Google permission maangega → **Allow**.
   Isse tumhari Drive mein **"Nexus CRM Database"** naam ki sheet ban jaayegi, demo data ke saath.
   (Execution log mein sheet ka link bhi dikhega.)
5. **Deploy → New deployment** → type **Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone** (ya "Anyone with Google account")
   - **Deploy** dabao aur jo **Web app URL** mile, use browser mein kholo.
6. **Sign up** karke account banao. Bas! 🎉

> Code badalne ke baad: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
> Sirf save karne se live URL update nahi hota. (Testing ke liye **Deploy → Test deployments** wala URL hamesha latest code chalata hai.)

### clasp se (developers ke liye, ek command)
```bash
npm install -g @google/clasp
clasp login
cd apps-script
clasp create --type webapp --title "Nexus CRM" --rootDir .
clasp push
```
Phir upar ke step 4 aur 5 karo.

## Database (Google Sheet) kaise dikhti hai

Sheet mein 6 tabs: `users`, `companies`, `contacts`, `deals`, `tasks`, `activities`.
Row 1 mein column ke naam, neeche data. Tum sheet mein seedha data dekh/badal bhi sakte ho,
bas `id` column mat chhedna aur date `2026-09-24` format mein likhna.

- Sab kuch **plain text** mein save hota hai, taaki Google Sheets dates/numbers ko apne aap na badle.
- `users` tab mein password **hash** hokar save hota hai, asli password kabhi nahi.
- Sheet sirf tumhari Drive mein hai. Web app "Me" ke naam se chalta hai, isliye users ko sheet ka access dene ki zaroorat nahi.

**Sab kuch naya shuru karna ho** (FastAPI mein `nexus.db` delete karne jaisa):
sheet ke saare tabs ka data (row 2 se neeche) delete karo, phir editor se `setup` dobara Run karo.
Poori nayi sheet chahiye to ⚙️ Project Settings → Script Properties mein `DB_SPREADSHEET_ID` hata do.

## Naya field kaise jodein (example: contact mein "city")
1. `Db.gs`: `FIELDS.contacts` mein `city: "text"` jodo (sheet mein column apne aap ban jaayega)
2. `Helpers.html`: `FORMS.contacts.fields` mein `["city", "City", "text"],` jodo
3. Save karke nayi version deploy karo

## Dhyan rakhne wali baatein
- Apps Script mein har server call ~0.5-1.5 second leta hai, isliye FastAPI se thoda slow lagega. Normal hai.
- Jin function ke naam ke end mein `_` hai (jaise `deleteRow_`), unhe browser call nahi kar sakta. Yeh security ke liye hai.
  Browser sirf `api()` ko call karta hai, aur woh har request par login token check karta hai.
- Google Sheets ek chhote/medium CRM (kuch hazaar rows) ke liye badhiya hai. Lakhon rows ke liye asli database better hai.
- Chart.js aur Lucide icons CDN (jsdelivr) se load hote hain.
