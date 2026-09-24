# 🤖 Virtual Employee (Google Sheets + Ollama Cloud)

Aapka AI employee jo Google Sheets mein aapki dukaan/business ka kaam karta hai.
Aap chat mein bolte ho aur woh karta hai. Kuch kaam woh **roz khud time par** karke aapko email bhej deta hai.

- AI model: `gpt-oss:120b` (Ollama Cloud)
- Backend: Google Apps Script
- Frontend: sirf vanilla HTML/CSS/JS

## Yeh employee kya-kya karta hai

| Kaam | Aap bolte ho | Employee karta hai |
|---|---|---|
| 🧾 Order entry | "Ramesh ka order: 10 kg cheeni, 45 rate, 200 diye" | Orders mein entry, bill ₹450, baaki ₹250, **stock khud kam** |
| 💰 Payment | "Ramesh ne 500 de diye" | Purane order se shuru karke balance kam karta hai |
| 📋 Udhaar list | "Kiska payment baaki hai?" | Sabse purane baaki payment pehle dikhata hai |
| 📧 Reminder | "Baaki walon ko reminder bhejo" | Har customer ko ek email (3 din mein ek baar se zyada nahi) |
| 📦 Stock | "50 kg cheeni aayi" / "Kya khatam ho raha hai?" | Stock update karta hai, low stock batata hai |
| 👥 Attendance | "Aaj Suresh chutti par hai, baaki sab aaye" | Sabki attendance laga deta hai (P/A/H) |
| 💵 Salary | "Is mahine ki salary batao" | Chhuttiyon ke hisaab se har staff ki salary |
| 📊 Report | "Aaj ki report do" / "Is hafte ki report" | Sales, collection, top items/customers, udhaar, stock, attendance |
| ⏰ Roz ke kaam | "Roz shaam 7 baje stock check karke batana" | Duties sheet mein likh leta hai aur roz khud karta hai |
| 📝 Hisaab | (khud) | Har badlav **Log** sheet mein likhta hai |

Aapki apni koi aur sheet ho toh use bhi padh/likh sakta hai (`read_sheet`, `write_cells` wagairah).

## Roz khud kya karta hai (Duties sheet)

Setup ke baad yeh duties apne aap ban jaati hain. Sheet mein seedha badal sakte ho, ya chat mein bol sakte ho.

| Duty | Time | Days | Chalu? |
|---|---|---|---|
| Subah ki report | 9 | Daily | Yes |
| Due payment walon ko reminder email | 11 | Daily | **No**: pehle khud check karke `Yes` karo |
| Shaam ki report + kya order karna hai | 20 | Daily | Yes |
| Hafte ki report | 19 | Sat | Yes |
| Pichle mahine ki salary | 10 | Month:1 | Yes |

- **Time**: ghanta (0–23). Trigger har ghante chalta hai, isliye duty us ghante ke andar kabhi bhi chal sakti hai.
- **Days**: `Daily`, `Mon,Thu` jaise din, ya `Month:1` (har mahine ki 1 tareekh).
- Har duty ka result **aapke email** par aata hai.

## Sheets (Setup button se apne aap banti hain)

| Sheet | Columns |
|---|---|
| Orders | Date, Order ID, Customer, Phone, Email, Item, Qty, Rate, Amount, Paid, Balance, Status, Due Date, Last Reminder |
| Stock | Item, Stock, Min Stock, Rate, Unit |
| Staff | Name, Phone, Email, Monthly Salary, Active (Yes/No) |
| Attendance | Date, Name, Status (P / A / H) |
| Duties | Duty, Time, Days, Active, Last Run |
| Log | Time, Kaam, Details |

> Column ke naam mat badliye, code inhi naamon se data dhoondhta hai. Aage aur columns jod sakte ho.

**Salary ka niyam:** per day salary = mahine ki salary ÷ mahine ke din. Sirf `A` (poora din) aur `H` (aadha din) par paisa katta hai.

## Setup (10 minute)

1. Nayi Google Sheet banao, phir **Extensions → Apps Script**.
2. Yeh files banao aur code paste karo (naam same rakho):
   - `Code.gs`, `Business.gs`, `Duties.gs`, `Tools.gs`, `Setup.gs`, `Helpers.gs`
   - **+ → HTML** se `Index` naam ki file banao, usmein `Index.html` ka code
   - (Optional) **Project Settings → Show "appsscript.json"** on karke `appsscript.json` paste karo
3. **Project Settings → Script Properties** mein daalo:
   - `OLLAMA_API_KEY` = aapki Ollama key (**zaroori**)
   - `BUSINESS_NAME` = aapki dukaan ka naam (optional)
   - `OWNER_EMAIL` = report kis email par aaye (optional, default aapka Google email)
4. Editor mein `setupBusiness` function chalao, permissions allow karo. Saari sheets aur roz ka trigger ban jaayega.
5. **Stock** aur **Staff** sheet mein apna data bharo.
6. `testAgent` chala ke dekho: Logs mein report aani chahiye.
7. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Only myself** (zaroori hai, kyunki employee aapka data badalta hai aur email bhejta hai)
8. Web app ka URL phone mein bookmark kar lo 📱

> ⚠️ API key kabhi code mein mat likho, sirf Script Properties mein rakho.

## Code kaise samjhein

```
Index.html  ──google.script.run.chat()──►  Code.gs: runAgent_()
                                               │
                     ┌─────── loop ────────────┤
                     ▼                         │
            Ollama (gpt-oss:120b)              │
          "mujhe add_order chahiye"            │
                     │                         │
                     ▼                         │
      Business.gs / Duties.gs / Tools.gs  ─────┘  (result wapas AI ko)
                     │
                     ▼
               Final jawab

Trigger (har ghante) ──► Duties.gs: runDuties() ──► runAgent_() ──► aapko email
```

**Naya kaam sikhana ho?** Kisi bhi `...Tools_()` list mein ek object jodo:

```js
{
  name: 'gst_report',
  description: 'Calculate GST for this month',   // AI yeh padh ke samajhta hai
  params: { rate: { type: 'number' } },
  run: function (a) { /* sheet se data nikalo, result return karo */ },
}
```

## Limits

- Gmail se roz ~100 email (free account) bhej sakte ho.
- Ek kaam max 6 minute chal sakta hai (Apps Script ki limit).
- AI ek baar mein 300 rows tak padhta hai. Report aur hisaab wale tools poori sheet ginte hain.
