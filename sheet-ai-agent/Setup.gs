/**
 * Setup.gs — ek baar chalao: saari business sheets + roz ka trigger ban jaata hai.
 * Jo sheet pehle se hai use chheda nahi jaata.
 */

const BUSINESS_SHEETS = {
  Orders: ['Date', 'Order ID', 'Customer', 'Phone', 'Email', 'Item', 'Qty', 'Rate', 'Amount', 'Paid', 'Balance', 'Status', 'Due Date', 'Last Reminder'],
  Stock: ['Item', 'Stock', 'Min Stock', 'Rate', 'Unit'],
  Staff: ['Name', 'Phone', 'Email', 'Monthly Salary', 'Active'],
  Attendance: ['Date', 'Name', 'Status'], // P = present, A = absent, H = half day
  Duties: ['Duty', 'Time', 'Days', 'Active', 'Last Run'],
  Log: ['Time', 'Kaam', 'Details'],
};

// Shuruaat ki duties — "Duties" sheet mein inhe badal sakte ho
const DEFAULT_DUTIES = [
  ['Subah ki report: kal ki sales, saare pending payments (sabse purane pehle), low stock items. Short aur saaf.', 9, 'Daily', 'Yes'],
  ['Jin customers ki payment due date nikal gayi hai unhe send_payment_reminders se reminder email bhejo.', 11, 'Daily', 'No'],
  ['Shaam ki report: aaj ki sales, aaj kitna collection hua, aur kal ke liye kya order karna hai (low stock).', 20, 'Daily', 'Yes'],
  ['Is hafte ki business report (week) banao: sales, top items, top customers, pending payments.', 19, 'Sat', 'Yes'],
  ['Pichle mahine ki salary report banao (salary_report, pichla mahina) aur har staff ki payable salary batao.', 10, 'Month:1', 'Yes'],
];

function setupBusiness() {
  const ss = getSpreadsheet_();
  const created = [];

  Object.keys(BUSINESS_SHEETS).forEach(function (name) {
    if (ss.getSheetByName(name)) return;
    const sh = ss.insertSheet(name);
    styleHeader_(sh, BUSINESS_SHEETS[name]);
    if (name === 'Duties') {
      sh.getRange(2, 1, DEFAULT_DUTIES.length, 4).setValues(DEFAULT_DUTIES);
      sh.setColumnWidth(1, 520);
    }
    created.push(name);
  });

  installTriggers();
  log_('Setup', created.length ? 'Sheets bani: ' + created.join(', ') : 'Trigger dobara lagaya');

  return created.length
    ? '✅ Sheets ban gayi: ' + created.join(', ') + '. Ab Stock aur Staff sheet mein apna data bhar dijiye. Duties har ghante check hongi.'
    : '✅ Saari sheets pehle se hain. Duties ka trigger chalu hai.';
}

/** Har ghante runDuties() chalane wala trigger (purana ho toh hata ke naya) */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runDuties') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runDuties').timeBased().everyHours(1).create();
}
