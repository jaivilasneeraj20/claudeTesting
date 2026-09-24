/**
 * Sheet AI Agent — Google Apps Script backend
 *
 * Flow:
 *   1. Browser (Index.html) poori chat history `chat()` ko bhejta hai
 *   2. `chat()` Ollama Cloud se poochta hai: "ab kya karu?"
 *   3. Agar AI koi tool maange (jaise read_sheet), hum woh function chalate hain
 *      aur result wapas AI ko dete hain
 *   4. Jab AI ko aur tool nahi chahiye, final jawab browser ko lauta dete hain
 *
 * Setup: Project Settings → Script Properties mein OLLAMA_API_KEY daalo.
 * (Optional) SHEET_ID daalo agar script kisi sheet se bound nahi hai.
 */

const MODEL = 'gpt-oss:120b';
const OLLAMA_URL = 'https://ollama.com/api/chat';
const MAX_STEPS = 10;      // ek sawaal mein AI zyada se zyada kitni baar tool chala sakta hai
const MAX_ROWS_READ = 300; // AI ko ek baar mein kitni rows dikhani hain

const SYSTEM_PROMPT = `You are a helpful AI agent that works inside the user's Google Spreadsheet.
Reply in the same language the user writes in (Hindi, Hinglish or English).
Use the tools to look at real data before answering — never guess what is in a sheet.
Before changing data, first read the sheet so you know its columns.
Before deleting anything, ask the user to confirm.
After writing data, tell the user exactly what you changed.
Keep answers short. Use simple lists instead of markdown tables.
Today's date: ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')}`;


/* ───────────────────────── Web app entry ───────────────────────── */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Sheet AI Agent')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


/* ───────────────────────── Agent loop ───────────────────────── */

/**
 * Browser se call hota hai.
 * @param {Array} history  [{role:'user'|'assistant'|'tool', content, ...}]
 * @return {{reply: string, messages: Array}}  naye messages jo history mein jodne hain
 */
function chat(history) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }].concat(history);
  const newMessages = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = callOllama_(messages);
    messages.push(reply);
    newMessages.push(reply);

    // AI ne koi tool nahi maanga → yahi final jawab hai
    if (!reply.tool_calls || reply.tool_calls.length === 0) {
      return { reply: reply.content, messages: newMessages };
    }

    // AI ne tool maange → har ek chalao aur result wapas do
    reply.tool_calls.forEach(function (call) {
      const name = call.function.name;
      const result = runTool_(name, call.function.arguments);
      const toolMessage = { role: 'tool', tool_name: name, content: JSON.stringify(result) };
      messages.push(toolMessage);
      newMessages.push(toolMessage);
    });
  }

  return { reply: 'Maaf kijiye, kaam bahut lamba ho gaya. Sawaal thoda chhota karke poochiye.', messages: newMessages };
}

function callOllama_(messages) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('OLLAMA_API_KEY');
  if (!apiKey) throw new Error('OLLAMA_API_KEY nahi mili. Project Settings → Script Properties mein daaliye.');

  const response = UrlFetchApp.fetch(OLLAMA_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify({ model: MODEL, messages: messages, tools: TOOLS, stream: false }),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code !== 200) throw new Error('Ollama error ' + code + ': ' + response.getContentText());

  const msg = JSON.parse(response.getContentText()).message;
  // Sirf zaroori fields rakhte hain (gpt-oss ka lamba "thinking" chhod dete hain)
  const clean = { role: 'assistant', content: msg.content || '' };
  if (msg.tool_calls && msg.tool_calls.length) clean.tool_calls = msg.tool_calls;
  return clean;
}

function runTool_(name, args) {
  try {
    if (typeof args === 'string') args = JSON.parse(args || '{}');
    const fn = TOOL_FUNCTIONS[name];
    if (!fn) return { error: 'Unknown tool: ' + name };
    return fn(args || {});
  } catch (err) {
    return { error: err.message }; // error bhi AI ko batate hain, taaki woh khud theek kar sake
  }
}


/* ───────────────────────── Tools (AI ke haath-pair) ───────────────────────── */

// 1) AI ko batate hain ki kaun-kaun se tools hain (JSON schema)
const TOOLS = [
  tool_('list_sheets', 'List all sheets (tabs) with their row and column counts.', {}),

  tool_('read_sheet', 'Read values from a sheet. Without range it reads all data. Row 1 is usually headers.', {
    sheet: { type: 'string', description: 'Sheet name' },
    range: { type: 'string', description: 'Optional A1 range like "A1:D20"' },
  }, ['sheet']),

  tool_('search_rows', 'Find rows that contain some text (case-insensitive). Returns row numbers.', {
    sheet: { type: 'string' },
    text: { type: 'string', description: 'Text to search for' },
  }, ['sheet', 'text']),

  tool_('append_row', 'Add one new row at the bottom of a sheet.', {
    sheet: { type: 'string' },
    values: { type: 'array', items: { type: 'string' }, description: 'Cell values in column order' },
  }, ['sheet', 'values']),

  tool_('write_cells', 'Write a 2D block of values starting at a cell. Formulas like "=SUM(B2:B9)" are allowed.', {
    sheet: { type: 'string' },
    start_cell: { type: 'string', description: 'Top-left cell, e.g. "B2"' },
    values: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Rows of values' },
  }, ['sheet', 'start_cell', 'values']),

  tool_('create_sheet', 'Create a new sheet (tab), optionally with a header row.', {
    name: { type: 'string' },
    headers: { type: 'array', items: { type: 'string' } },
  }, ['name']),

  tool_('delete_row', 'Delete one row by its row number. Only use after the user confirms.', {
    sheet: { type: 'string' },
    row: { type: 'integer', description: 'Row number (1 = first row)' },
  }, ['sheet', 'row']),
];

function tool_(name, description, properties, required) {
  return {
    type: 'function',
    function: {
      name: name,
      description: description,
      parameters: { type: 'object', properties: properties, required: required || [] },
    },
  };
}

// 2) Asli kaam karne wale functions — naam upar wale TOOLS se match hone chahiye
const TOOL_FUNCTIONS = {
  list_sheets: function () {
    return getSpreadsheet_().getSheets().map(function (s) {
      return { name: s.getName(), rows: s.getLastRow(), columns: s.getLastColumn() };
    });
  },

  read_sheet: function (a) {
    const sh = getSheet_(a.sheet);
    const range = a.range ? sh.getRange(a.range) : sh.getDataRange();
    const values = range.getDisplayValues();
    return {
      range: range.getA1Notation(),
      rows: values.slice(0, MAX_ROWS_READ),
      note: values.length > MAX_ROWS_READ ? 'Only first ' + MAX_ROWS_READ + ' rows shown. Use a smaller range.' : undefined,
    };
  },

  search_rows: function (a) {
    const values = getSheet_(a.sheet).getDataRange().getDisplayValues();
    const needle = String(a.text).toLowerCase();
    const matches = [];
    values.forEach(function (row, i) {
      if (row.join(' ').toLowerCase().indexOf(needle) !== -1) matches.push({ row: i + 1, values: row });
    });
    return { headers: values[0], matches: matches.slice(0, 100), total: matches.length };
  },

  append_row: function (a) {
    const sh = getSheet_(a.sheet);
    sh.appendRow(a.values);
    return { ok: true, row: sh.getLastRow() };
  },

  write_cells: function (a) {
    const values = a.values;
    const width = Math.max.apply(null, values.map(function (r) { return r.length; }));
    const rows = values.map(function (r) { // har row ki length barabar honi chahiye
      return r.concat(new Array(width - r.length).fill(''));
    });
    const range = getSheet_(a.sheet).getRange(a.start_cell).offset(0, 0, rows.length, width);
    range.setValues(rows);
    return { ok: true, range: range.getA1Notation() };
  },

  create_sheet: function (a) {
    const sh = getSpreadsheet_().insertSheet(a.name);
    if (a.headers && a.headers.length) {
      sh.appendRow(a.headers);
      sh.getRange(1, 1, 1, a.headers.length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    return { ok: true, name: a.name };
  },

  delete_row: function (a) {
    getSheet_(a.sheet).deleteRow(a.row);
    return { ok: true, deleted_row: a.row };
  },
};


/* ───────────────────────── Helpers ───────────────────────── */

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet nahi mili. Script Properties mein SHEET_ID daaliye.');
  return ss;
}

function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" nahi mili. Pehle list_sheets chalaiye.');
  return sh;
}

/** Editor se ek baar chala ke check karo ki API key aur sheet sahi hai. */
function testAgent() {
  const result = chat([{ role: 'user', content: 'Is spreadsheet mein kaun-kaun si sheets hain?' }]);
  Logger.log(result.reply);
}
