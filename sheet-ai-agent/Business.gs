/**
 * Business.gs — dukaan ke roz ke kaam
 *
 *   Orders     : add_order, record_payment, pending_payments, send_payment_reminders
 *   Stock      : update_stock, low_stock
 *   Staff      : mark_attendance, salary_report
 *   Report     : business_report, send_email
 */

function businessTools_() {
  return [
    {
      name: 'add_order',
      description: 'Record a new sale/order in Orders. Rate comes from Stock if not given. Stock is reduced automatically.',
      params: {
        customer: { type: 'string' },
        item: { type: 'string' },
        qty: { type: 'number' },
        rate: { type: 'number', description: 'Price per unit. Leave empty to use the Stock rate.' },
        paid: { type: 'number', description: 'Amount paid right now. Default 0.' },
        phone: { type: 'string' },
        email: { type: 'string' },
        due_days: { type: 'number', description: 'Payment due after how many days. Default 7.' },
      },
      required: ['customer', 'item', 'qty'],
      run: addOrder_,
    },
    {
      name: 'record_payment',
      description: 'Record money received. Give order_id, or customer name (then the oldest pending orders are paid first).',
      params: {
        amount: { type: 'number' },
        order_id: { type: 'string' },
        customer: { type: 'string' },
      },
      required: ['amount'],
      run: recordPayment_,
    },
    {
      name: 'pending_payments',
      description: 'List unpaid/partly paid orders with balance and days overdue. Optionally for one customer.',
      params: { customer: { type: 'string' } },
      run: pendingPayments_,
    },
    {
      name: 'send_payment_reminders',
      description: 'Email a polite payment reminder to every customer whose due date has passed (one email per customer, max once in 3 days). Use dry_run=true to only preview.',
      params: { dry_run: { type: 'boolean' } },
      run: sendPaymentReminders_,
    },
    {
      name: 'update_stock',
      description: 'Change stock of an item. add = quantity to add (negative to reduce), or set = exact new stock. Creates the item if it does not exist.',
      params: {
        item: { type: 'string' },
        add: { type: 'number' },
        set: { type: 'number' },
        rate: { type: 'number' },
        min_stock: { type: 'number', description: 'Alert when stock goes at or below this' },
        unit: { type: 'string', description: 'kg, pcs, box...' },
      },
      required: ['item'],
      run: updateStock_,
    },
    {
      name: 'low_stock',
      description: 'List items whose stock is at or below Min Stock.',
      params: {},
      run: lowStock_,
    },
    {
      name: 'mark_attendance',
      description: 'Mark attendance for all active staff for a day. Everyone is Present (P) except names in absent (A) or half_day (H).',
      params: {
        date: { type: 'string', description: 'yyyy-MM-dd. Default today.' },
        absent: { type: 'array', items: { type: 'string' } },
        half_day: { type: 'array', items: { type: 'string' } },
      },
      run: markAttendance_,
    },
    {
      name: 'salary_report',
      description: 'Salary for a month from attendance. Pay is cut only for A (full day) and H (half day).',
      params: { month: { type: 'string', description: 'yyyy-MM. Default this month.' } },
      run: salaryReport_,
    },
    {
      name: 'business_report',
      description: 'Sales, collection, pending payments, low stock and attendance summary.',
      params: { period: { type: 'string', enum: ['today', 'yesterday', 'week', 'month'] } },
      run: businessReport_,
    },
    {
      name: 'send_email',
      description: 'Send an email. If "to" is empty it goes to the owner.',
      params: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['subject', 'body'],
      run: sendEmail_,
    },
  ];
}


/* ───────────────────────── Orders & payments ───────────────────────── */

function addOrder_(a) {
  const orders = readTable_('Orders');
  const stock = readTable_('Stock');
  const product = findRow_(stock.rows, 'Item', a.item);

  const qty = num_(a.qty);
  const rate = has_(a.rate) ? num_(a.rate) : (product ? num_(product.Rate) : 0);
  if (!rate) return { error: '"' + a.item + '" ka rate nahi mila. Owner se rate poochiye.' };

  const amount = qty * rate;
  const paid = num_(a.paid);
  const dueDate = addDays_(today_(), has_(a.due_days) ? num_(a.due_days) : 7);
  const orderId = nextOrderId_(orders.rows);

  // Purana customer hai toh uska phone/email apne aap bhar do
  const old = orders.rows.filter(function (r) { return same_(r.Customer, a.customer); }).pop();

  appendObject_(orders, {
    'Date': today_(),
    'Order ID': orderId,
    'Customer': old ? old.Customer : a.customer, // naam ki spelling ek jaisi rahe
    'Phone': a.phone || (old && old.Phone),
    'Email': a.email || (old && old.Email),
    'Item': product ? product.Item : a.item,
    'Qty': qty,
    'Rate': rate,
    'Amount': amount,
    'Paid': paid,
    'Balance': amount - paid,
    'Status': paymentStatus_(amount, paid),
    'Due Date': dueDate,
  });

  // Stock kam karo
  let stockNote = 'Yeh item Stock sheet mein nahi hai, isliye stock update nahi hua.';
  if (product) {
    const left = num_(product.Stock) - qty;
    updateRow_(stock, product, { Stock: left });
    if (left < 0) stockNote = 'STOCK KAM THA: ab stock ' + left + ' hai. Owner ko batao ki Stock sheet check karein.';
    else if (left <= num_(product['Min Stock'])) stockNote = 'LOW STOCK: sirf ' + left + ' bacha hai!';
    else stockNote = left + ' stock bacha hai.';
  }

  log_('Order', orderId + ' | ' + a.customer + ' | ' + qty + ' x ' + a.item + ' = ₹' + amount + ' | paid ₹' + paid);
  return { ok: true, order_id: orderId, amount: amount, paid: paid, balance: amount - paid, due_date: fmtDate_(dueDate), stock: stockNote };
}

function recordPayment_(a) {
  const orders = readTable_('Orders');
  let targets;
  if (has_(a.order_id)) {
    targets = orders.rows.filter(function (r) { return same_(r['Order ID'], a.order_id); });
  } else if (has_(a.customer)) {
    targets = orders.rows.filter(function (r) { return same_(r.Customer, a.customer) && num_(r.Balance) > 0; });
  } else {
    return { error: 'order_id ya customer ka naam chahiye.' };
  }
  if (!targets.length) return { error: 'Is naam/ID ka koi pending order nahi mila.' };

  // Paisa purane order se shuru karke lagao
  let left = num_(a.amount);
  const updated = [];
  targets.forEach(function (r) {
    const pay = Math.min(left, num_(r.Balance));
    if (pay <= 0) return;
    const paid = num_(r.Paid) + pay;
    const balance = num_(r.Amount) - paid;
    updateRow_(orders, r, { Paid: paid, Balance: balance, Status: paymentStatus_(num_(r.Amount), paid) });
    left -= pay;
    updated.push({ order_id: r['Order ID'], paid_now: pay, balance_left: balance });
  });

  log_('Payment', (a.order_id || a.customer) + ' | ₹' + a.amount + ' received');
  return { ok: true, updated: updated, extra_not_used: left };
}

function pendingPayments_(a) {
  const today = today_();
  const list = readTable_('Orders').rows
    .filter(function (r) { return num_(r.Balance) > 0 && (!has_(a.customer) || same_(r.Customer, a.customer)); })
    .map(function (r) {
      const due = toDate_(r['Due Date']);
      return {
        order_id: r['Order ID'],
        customer: r.Customer,
        phone: r.Phone,
        item: r.Item,
        balance: num_(r.Balance),
        due_date: due ? fmtDate_(due) : '',
        days_overdue: due ? Math.max(0, daysBetween_(due, today)) : 0,
      };
    })
    .sort(function (x, y) { return y.days_overdue - x.days_overdue; });

  return {
    count: list.length,
    total_pending: sum_(list, 'balance'),
    overdue_count: list.filter(function (o) { return o.days_overdue > 0; }).length,
    orders: list.slice(0, 50),
  };
}

function sendPaymentReminders_(a) {
  const orders = readTable_('Orders');
  const today = today_();
  const byEmail = {};
  let noEmail = 0;

  orders.rows.forEach(function (r) {
    const due = toDate_(r['Due Date']);
    if (num_(r.Balance) <= 0 || !due || due > today) return; // abhi due nahi
    const last = toDate_(r['Last Reminder']);
    if (last && daysBetween_(last, today) < 3) return; // 3 din mein ek hi baar
    if (!r.Email) { noEmail++; return; }
    const key = String(r.Email).trim().toLowerCase();
    (byEmail[key] = byEmail[key] || []).push(r);
  });

  const sent = [];
  Object.keys(byEmail).forEach(function (email) {
    const list = byEmail[email];
    const total = sum_(list, 'Balance');
    const lines = list.map(function (r) {
      return '• ' + r['Order ID'] + ' — ' + r.Item + ' — ₹' + num_(r.Balance) + ' (due ' + fmtDate_(toDate_(r['Due Date'])) + ')';
    });
    const body =
      'Namaste ' + list[0].Customer + ' ji,\n\n' +
      'Aapka ₹' + total + ' ka payment baaki hai:\n' + lines.join('\n') + '\n\n' +
      'Kripya jaldi payment kar dijiye. Agar payment ho chuka hai toh is email ko ignore karein.\n\n' +
      'Dhanyavaad,\n' + businessName_();

    if (!a.dry_run) {
      MailApp.sendEmail(email, 'Payment reminder — ' + businessName_(), body);
      list.forEach(function (r) { updateRow_(orders, r, { 'Last Reminder': today }); });
    }
    sent.push({ customer: list[0].Customer, email: email, total: total });
  });

  if (!a.dry_run && sent.length) log_('Reminders', sent.length + ' customers ko email gaya');
  return { dry_run: !!a.dry_run, sent: sent, skipped_no_email: noEmail, emails_left_today: MailApp.getRemainingDailyQuota() };
}

function paymentStatus_(amount, paid) {
  if (paid >= amount) return 'Paid';
  return paid > 0 ? 'Partial' : 'Pending';
}

function nextOrderId_(rows) {
  let max = 1000;
  rows.forEach(function (r) {
    const n = Number(String(r['Order ID']).replace(/\D/g, ''));
    if (n > max) max = n;
  });
  return 'ORD-' + (max + 1);
}


/* ───────────────────────── Stock ───────────────────────── */

function updateStock_(a) {
  const stock = readTable_('Stock');
  const product = findRow_(stock.rows, 'Item', a.item);

  if (!product) {
    const qty = has_(a.set) ? num_(a.set) : num_(a.add);
    appendObject_(stock, { Item: a.item, Stock: qty, 'Min Stock': num_(a.min_stock), Rate: a.rate, Unit: a.unit });
    log_('Stock', 'Naya item: ' + a.item + ' = ' + qty);
    return { ok: true, created: true, item: a.item, stock: qty };
  }

  const changes = {};
  if (has_(a.set)) changes.Stock = num_(a.set);
  else if (has_(a.add)) changes.Stock = num_(product.Stock) + num_(a.add);
  if (has_(a.rate)) changes.Rate = num_(a.rate);
  if (has_(a.min_stock)) changes['Min Stock'] = num_(a.min_stock);
  if (has_(a.unit)) changes.Unit = a.unit;
  updateRow_(stock, product, changes);

  log_('Stock', product.Item + ' → ' + JSON.stringify(changes));
  return { ok: true, item: product.Item, stock: num_(product.Stock), rate: num_(product.Rate) };
}

function lowStock_() {
  const items = readTable_('Stock').rows
    .filter(function (r) { return num_(r.Stock) <= num_(r['Min Stock']); })
    .map(function (r) { return { item: r.Item, stock: num_(r.Stock), min_stock: num_(r['Min Stock']), unit: r.Unit }; });
  return { count: items.length, items: items };
}


/* ───────────────────────── Staff: attendance & salary ───────────────────────── */

function activeStaff_() {
  return readTable_('Staff').rows.filter(function (s) { return !has_(s.Active) || isYes_(s.Active); });
}

function markAttendance_(a) {
  const date = has_(a.date) ? toDate_(a.date) : today_();
  if (!date) return { error: 'Date samajh nahi aayi. yyyy-MM-dd format mein dijiye.' };
  const key = fmtDate_(date);
  const absent = a.absent || [];
  const half = a.half_day || [];
  const staff = activeStaff_();
  const att = readTable_('Attendance');

  const has = function (list, name) { return list.some(function (n) { return same_(n, name); }); };
  const unknown = absent.concat(half).filter(function (n) {
    return !staff.some(function (s) { return same_(s.Name, n); });
  });

  const marked = staff.map(function (s) {
    const status = has(absent, s.Name) ? 'A' : has(half, s.Name) ? 'H' : 'P';
    // Us din ki entry pehle se hai toh update, warna nayi row
    const existing = att.rows.filter(function (r) {
      const d = toDate_(r.Date);
      return d && fmtDate_(d) === key && same_(r.Name, s.Name);
    })[0];
    if (existing) updateRow_(att, existing, { Status: status });
    else appendObject_(att, { Date: date, Name: s.Name, Status: status });
    return s.Name + ': ' + status;
  });

  log_('Attendance', key + ' | ' + marked.join(', '));
  return { ok: true, date: key, marked: marked, unknown_names: unknown };
}

function salaryReport_(a) {
  const month = has_(a.month) ? String(a.month).slice(0, 7) : fmtDate_(new Date(), 'yyyy-MM');
  const parts = month.split('-').map(Number);
  const daysInMonth = new Date(parts[0], parts[1], 0).getDate();

  const att = readTable_('Attendance').rows.filter(function (r) {
    const d = toDate_(r.Date);
    return d && fmtDate_(d, 'yyyy-MM') === month;
  });

  const staff = activeStaff_().map(function (s) {
    const mine = att.filter(function (r) { return same_(r.Name, s.Name); });
    const count = function (st) { return mine.filter(function (r) { return same_(r.Status, st); }).length; };
    const A = count('A'), H = count('H'), P = count('P');
    const salary = num_(s['Monthly Salary']);
    const payable = Math.round((salary / daysInMonth) * (daysInMonth - A - H * 0.5));
    return { name: s.Name, present: P, half_day: H, absent: A, monthly_salary: salary, payable: payable };
  });

  return {
    month: month,
    days_in_month: daysInMonth,
    rule: 'Per day salary = monthly / days in month. Cut only for A (1 day) and H (half day).',
    staff: staff,
    total_payable: sum_(staff, 'payable'),
  };
}


/* ───────────────────────── Report & email ───────────────────────── */

function businessReport_(a) {
  const period = a.period || 'today';
  const today = today_();
  let from = today, to = today;
  if (period === 'yesterday') from = to = addDays_(today, -1);
  if (period === 'week') from = addDays_(today, -6);
  if (period === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1);

  const orders = readTable_('Orders').rows.filter(function (r) {
    const d = toDate_(r.Date);
    return d && d >= from && d <= to;
  });

  const report = {
    period: period,
    from: fmtDate_(from),
    to: fmtDate_(to),
    orders: orders.length,
    sales: sum_(orders, 'Amount'),
    collected_on_these_orders: sum_(orders, 'Paid'),
    top_items: topBy_(orders, 'Item', 'Amount'),
    top_customers: topBy_(orders, 'Customer', 'Amount'),
  };

  // Baaki sheets na bhi hon toh report chalti rahe
  try {
    const p = pendingPayments_({});
    report.all_pending = { total: p.total_pending, orders: p.count, overdue: p.overdue_count, top: p.orders.slice(0, 5) };
  } catch (e) { report.all_pending = e.message; }
  try { report.low_stock = lowStock_().items; } catch (e) { report.low_stock = e.message; }
  try {
    const key = fmtDate_(today);
    const todayAtt = readTable_('Attendance').rows.filter(function (r) {
      const d = toDate_(r.Date);
      return d && fmtDate_(d) === key;
    });
    report.attendance_today = todayAtt.length
      ? todayAtt.map(function (r) { return r.Name + ': ' + r.Status; })
      : 'Aaj ki attendance abhi nahi lagi';
  } catch (e) { report.attendance_today = e.message; }

  return report;
}

function sendEmail_(a) {
  const to = a.to || ownerEmail_();
  MailApp.sendEmail(to, a.subject, a.body);
  log_('Email', to + ' | ' + a.subject);
  return { ok: true, to: to };
}


/* ── chhote math helpers ── */

function sum_(rows, key) {
  return rows.reduce(function (total, r) { return total + num_(r[key]); }, 0);
}

/** Sabse zyada wale top 5: topBy_(orders, 'Item', 'Amount') */
function topBy_(rows, groupKey, valueKey) {
  const totals = {};
  rows.forEach(function (r) { totals[r[groupKey]] = (totals[r[groupKey]] || 0) + num_(r[valueKey]); });
  return Object.keys(totals)
    .map(function (k) { return { name: k, total: totals[k] }; })
    .sort(function (x, y) { return y.total - x.total; })
    .slice(0, 5);
}
