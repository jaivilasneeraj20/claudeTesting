/**
 * Duties.gs — employee ke fixed kaam jo woh khud time par karta hai
 *
 * "Duties" sheet ka format:
 *   Duty                               | Time | Days      | Active | Last Run
 *   Subah ki report banao...           | 9    | Daily     | Yes    |
 *   Hafte ki sales report              | 19   | Sat       | Yes    |
 *   Pichle mahine ki salary report     | 10   | Month:1   | Yes    |
 *
 *   Time = ghanta (0-23), jaise 9 = subah 9 baje, 18 = shaam 6 baje
 *   Days = Daily  |  Mon,Thu (hafte ke din)  |  Month:1 (har mahine ki 1 tareekh)
 *
 * Trigger har ghante runDuties() chalata hai. Jis duty ka time ho gaya,
 * AI use poora karta hai aur report aapko email kar deta hai.
 */

function dutyTools_() {
  return [
    {
      name: 'add_duty',
      description: 'Give yourself a recurring job. time = hour 0-23. days = "Daily", weekdays like "Mon,Thu", or "Month:1" for a day of the month.',
      params: {
        duty: { type: 'string', description: 'Clear instruction of what to do, e.g. "Check low stock and list items to reorder"' },
        time: { type: 'integer' },
        days: { type: 'string' },
      },
      required: ['duty', 'time'],
      run: addDuty_,
    },
    {
      name: 'list_duties',
      description: 'Show all recurring duties with their id.',
      params: {},
      run: listDuties_,
    },
    {
      name: 'update_duty',
      description: 'Change a duty by id: turn it on/off, or change time/days/text.',
      params: {
        id: { type: 'integer' },
        active: { type: 'boolean' },
        time: { type: 'integer' },
        days: { type: 'string' },
        duty: { type: 'string' },
      },
      required: ['id'],
      run: updateDuty_,
    },
    {
      name: 'remove_duty',
      description: 'Delete a duty by id. Ask the owner first.',
      params: { id: { type: 'integer' } },
      required: ['id'],
      run: removeDuty_,
    },
  ];
}

function addDuty_(a) {
  const hour = num_(a.time);
  if (hour < 0 || hour > 23) return { error: 'time 0 se 23 ke beech hona chahiye.' };
  appendObject_(readTable_('Duties'), { Duty: a.duty, Time: hour, Days: a.days || 'Daily', Active: 'Yes' });
  log_('Duty added', a.duty + ' @ ' + hour + ':00 ' + (a.days || 'Daily'));
  return { ok: true };
}

function listDuties_() {
  return readTable_('Duties').rows.map(function (d) {
    const last = toDate_(d['Last Run']);
    return {
      id: d._row,
      duty: d.Duty,
      time: parseHour_(d.Time) + ':00',
      days: d.Days || 'Daily',
      active: isYes_(d.Active),
      last_run: last ? fmtDate_(last, 'yyyy-MM-dd HH:mm') : 'kabhi nahi',
    };
  });
}

function updateDuty_(a) {
  const table = readTable_('Duties');
  const duty = table.rows.filter(function (d) { return d._row === num_(a.id); })[0];
  if (!duty) return { error: 'Is id ki duty nahi mili. Pehle list_duties chalaiye.' };
  const changes = {};
  if (has_(a.active)) changes.Active = a.active ? 'Yes' : 'No';
  if (has_(a.time)) changes.Time = num_(a.time);
  if (has_(a.days)) changes.Days = a.days;
  if (has_(a.duty)) changes.Duty = a.duty;
  updateRow_(table, duty, changes);
  log_('Duty updated', duty.Duty + ' → ' + JSON.stringify(changes));
  return { ok: true };
}

function removeDuty_(a) {
  const table = readTable_('Duties');
  const duty = table.rows.filter(function (d) { return d._row === num_(a.id); })[0];
  if (!duty) return { error: 'Is id ki duty nahi mili.' };
  table.sheet.deleteRow(duty._row);
  log_('Duty removed', duty.Duty);
  return { ok: true, removed: duty.Duty };
}


/* ───────────────────────── Scheduler (trigger yeh chalata hai) ───────────────────────── */

function runDuties() {
  const now = new Date();
  const hour = Number(fmtDate_(now, 'H'));
  const todayKey = fmtDate_(now);
  const table = readTable_('Duties');

  table.rows.forEach(function (d) {
    // Time se 3 ghante ke andar chalao (agar trigger thoda late chala toh bhi duty na chhoote)
    const start = parseHour_(d.Time);
    if (!isYes_(d.Active) || hour < start || hour >= start + 3 || !dayMatches_(d.Days, now)) return;

    const last = toDate_(d['Last Run']);
    if (last && fmtDate_(last) === todayKey) return; // aaj pehle hi ho chuka

    updateRow_(table, d, { 'Last Run': now }); // pehle mark karo taaki do baar na chale

    let report;
    try {
      report = runAgent_([{ role: 'user', content: 'Scheduled duty: ' + d.Duty }], true).reply;
    } catch (e) {
      report = '⚠️ Yeh duty poori nahi ho payi: ' + e.message;
    }

    MailApp.sendEmail(ownerEmail_(), '🤖 ' + businessName_() + ' — ' + String(d.Duty).slice(0, 60), report);
    log_('Duty done', d.Duty + ' → ' + String(report).slice(0, 300));
  });
}

/** "Daily", "Mon,Thu" ya "Month:1" — kya aaj woh din hai? */
function dayMatches_(days, now) {
  const s = String(days || 'Daily').trim().toLowerCase();
  if (s === 'daily' || s === 'roz') return true;
  if (s.indexOf('month:') === 0) return Number(s.split(':')[1]) === Number(fmtDate_(now, 'd'));
  const today = fmtDate_(now, 'EEE').toLowerCase(); // "mon", "tue"...
  return s.split(',').some(function (x) { return x.trim().slice(0, 3) === today; });
}

/** Time column mein 9, "9", "9:00" — sab ko 9 bana do */
function parseHour_(v) {
  if (v instanceof Date) return v.getHours();
  return parseInt(String(v), 10);
}

/** Duty ko abhi turant chala ke dekhna ho toh (editor se) */
function testDutiesNow() {
  const table = readTable_('Duties');
  const first = table.rows.filter(function (d) { return isYes_(d.Active); })[0];
  if (!first) return Logger.log('Koi active duty nahi hai.');
  Logger.log(runAgent_([{ role: 'user', content: 'Scheduled duty: ' + first.Duty }], true).reply);
}
