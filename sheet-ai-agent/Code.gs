/**
 * Virtual Employee — AI ka dimaag (agent loop)
 *
 * Files:
 *   Code.gs      → yeh file: web app + AI se baat-cheet ka loop
 *   Business.gs  → dukaan ke kaam: order, payment, stock, attendance, salary, report, email
 *   Duties.gs    → roz ke fixed kaam (jaise subah 9 baje report) jo employee khud karta hai
 *   Tools.gs     → kisi bhi sheet ko padhne/likhne ke general tools
 *   Setup.gs     → ek click mein saari sheets banana
 *   Helpers.gs   → chhote kaam ke functions
 *
 * Har tool ek object hai: { name, description, params, required, run }
 *   - name/description/params → AI ko batate hain ki tool kya karta hai
 *   - run → asli JavaScript function jo sheet mein kaam karta hai
 */

const MODEL = 'gpt-oss:120b';
const OLLAMA_URL = 'https://ollama.com/api/chat';
const MAX_STEPS = 12; // ek kaam mein AI zyada se zyada kitni baar tool chala sakta hai


/* ───────────────────────── Web app ───────────────────────── */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(businessName_() + ' — Virtual Employee')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Browser (Index.html) se call hota hai */
function chat(history) {
  return runAgent_(history, false);
}

/** Browser ke naam dikhane ke liye */
function getInfo() {
  return { business: businessName_(), model: MODEL };
}


/* ───────────────────────── Sabse main part: agent loop ───────────────────────── */

/**
 * @param {Array} history      [{role:'user'|'assistant'|'tool', content}]
 * @param {boolean} scheduled  true = trigger se khud chal raha hai (koi chat nahi kar raha)
 * @return {{reply: string, messages: Array}}
 */
function runAgent_(history, scheduled) {
  const tools = allTools_();
  const messages = [{ role: 'system', content: systemPrompt_(scheduled) }].concat(history);
  const newMessages = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = callOllama_(messages, tools);
    messages.push(reply);
    newMessages.push(reply);

    // AI ko koi tool nahi chahiye → yahi final jawab hai
    if (!reply.tool_calls || reply.tool_calls.length === 0) {
      return { reply: reply.content, messages: newMessages };
    }

    // AI ne tool maange → har ek chalao aur result wapas AI ko do
    reply.tool_calls.forEach(function (call) {
      const name = call.function.name;
      const result = runTool_(tools, name, call.function.arguments);
      const toolMessage = { role: 'tool', tool_name: name, content: JSON.stringify(result) };
      messages.push(toolMessage);
      newMessages.push(toolMessage);
    });
  }

  return { reply: 'Kaam bahut lamba ho gaya, beech mein ruk gaya. Thoda chhota karke boliye.', messages: newMessages };
}

/** Employee ke saare tools ek jagah */
function allTools_() {
  return businessTools_().concat(dutyTools_(), sheetTools_());
}

function systemPrompt_(scheduled) {
  const now = new Date();
  let prompt = `You are the virtual employee of "${businessName_()}". You manage the owner's business in Google Sheets like a careful, honest office assistant.
Reply in the owner's language (Hindi, Hinglish or English). Keep replies short and clear. Money is in ₹.

Business sheets and the tools for them:
- Orders (sales + payments): add_order, record_payment, pending_payments, send_payment_reminders
- Stock (inventory): update_stock, low_stock
- Staff + Attendance: mark_attendance, salary_report
- Reports: business_report, send_email
- Duties (your recurring jobs): add_duty, list_duties, update_duty, remove_duty
- Log: record of everything you changed
For any other sheet, use list_sheets, read_sheet, search_rows, append_row, write_cells, create_sheet, delete_row.

Rules:
- Prefer the business tools over raw sheet edits: they keep stock, balance and the log correct.
- Never make up numbers. Get them from tools.
- After changing data, say exactly what changed.
- Use simple lists, not markdown tables.
- If a tool says a sheet is missing, tell the owner to press the "Setup" button.

Today: ${fmtDate_(now, 'yyyy-MM-dd (EEEE)')}, time ${fmtDate_(now, 'HH:mm')}. Owner email: ${ownerEmail_()}`;

  if (scheduled) {
    prompt += `

You are running a scheduled duty by yourself. Nobody is chatting, so do not ask questions: do the job fully,
then write a short report for the owner (it will be emailed to them automatically).`;
  } else {
    prompt += `

If important details are missing (like customer, item or quantity), ask once, briefly.
Ask the owner to confirm before deleting anything or sending emails to customers.`;
  }
  return prompt;
}


/* ───────────────────────── Ollama se baat ───────────────────────── */

function callOllama_(messages, tools) {
  const apiKey = prop_('OLLAMA_API_KEY');
  if (!apiKey) throw new Error('OLLAMA_API_KEY nahi mili. Project Settings → Script Properties mein daaliye.');

  // Hamare tools ko Ollama ke format mein badalna
  const toolSchemas = tools.map(function (t) {
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: { type: 'object', properties: t.params || {}, required: t.required || [] },
      },
    };
  });

  const response = UrlFetchApp.fetch(OLLAMA_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify({ model: MODEL, messages: messages, tools: toolSchemas, stream: false }),
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

function runTool_(tools, name, args) {
  const tool = tools.filter(function (t) { return t.name === name; })[0];
  if (!tool) return { error: 'Aisa koi tool nahi hai: ' + name };
  try {
    if (typeof args === 'string') args = JSON.parse(args || '{}');
    return tool.run(args || {});
  } catch (err) {
    return { error: err.message }; // error bhi AI ko batate hain taaki woh khud theek kar sake
  }
}


/** Editor se chala ke check karo ki API key aur sheet sahi hai */
function testAgent() {
  Logger.log(runAgent_([{ role: 'user', content: 'Aaj ki business report do' }], false).reply);
}
