# 🤖 Sheet AI Agent (Google Apps Script + Ollama Cloud)

Ek chhota lekin powerful AI agent jo aapki **Google Sheet** padh sakta hai, likh sakta hai, search kar sakta hai aur nayi sheets bana sakta hai — sab kuch chat se.

- **Backend:** `Code.gs` (Apps Script) → Ollama Cloud API, model `gpt-oss:120b`
- **Frontend:** `Index.html` (sirf vanilla HTML/CSS/JS, koi library nahi)

## Agent kaise kaam karta hai

```
Aap sawaal likhte ho (Index.html)
      │  google.script.run.chat(history)
      ▼
chat()  ──►  Ollama (gpt-oss:120b)  "kaunsa tool chalau?"
  ▲                 │
  │   tool result   ▼
  └──────── runTool_()  → read_sheet / append_row / ...
      (jab tak AI ko tool chahiye, yeh loop chalta hai — max 10 baar)
      ▼
Final jawab browser mein dikhta hai
```

## Tools (AI kya-kya kar sakta hai)

| Tool | Kaam |
|---|---|
| `list_sheets` | Saari sheets aur unki rows/columns |
| `read_sheet` | Poori sheet ya koi range (`A1:D20`) padhna |
| `search_rows` | Kisi text wali rows dhoondhna |
| `append_row` | Neeche nayi row jodna |
| `write_cells` | Kisi cell se shuru karke data/formula likhna |
| `create_sheet` | Nayi sheet + headers |
| `delete_row` | Row delete (AI pehle aapse poochta hai) |

**Naya tool jodna ho?** `Code.gs` mein 2 jagah likhna hai:
1. `TOOLS` array mein `tool_('naam', 'kya karta hai', {params})`
2. `TOOL_FUNCTIONS` mein same naam ka function

## Setup (5 minute)

1. Apni Google Sheet kholo → **Extensions → Apps Script**
2. `Code.gs` ka code paste karo
3. **+ → HTML** file banao, naam `Index` rakho, `Index.html` ka code paste karo
4. (Optional) **Project Settings → "Show appsscript.json"** on karke `appsscript.json` paste karo
5. **Project Settings → Script Properties → Add property**
   - `OLLAMA_API_KEY` = aapki Ollama API key
   - (Optional) `SHEET_ID` = agar script sheet ke andar se nahi banayi, toh sheet URL ka ID
6. Editor mein `testAgent` function chalao → permissions allow karo → Logs mein jawab aana chahiye
7. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Only myself** (recommended — agent aapki sheet badal sakta hai)
8. Web app URL kholo aur chat shuru karo 🎉

> ⚠️ API key kabhi code mein mat likho, hamesha Script Properties mein rakho.

## Example sawaal

- "Meri spreadsheet mein kaun-kaun si sheets hain?"
- "Sales sheet mein total amount kitna hai?"
- "Expenses sheet mein aaj ki date ke saath Chai, 20 add karo"
- "Jin rows mein 'Pending' hai, woh dikhao"
- "Summary naam ki sheet banao aur har category ka total SUMIF formula se daalo"
