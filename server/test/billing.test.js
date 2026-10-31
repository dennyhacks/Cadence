import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { outbox } from '../src/utils/mailer.js';
import { today } from '../src/utils/pricing.js';
import { addDays, addMonths, firstPeriodOnOrAfter, periodStart } from '../src/services/subscriptions.js';
import { generateDueInvoices } from '../src/services/billing.js';

let server;
let base;
let admin;
let staff;
let customer;
let kite;
let ids = {};
let savedLimits = [];
const subs = [];

async function call(method, path, { body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  const set = res.headers.get('set-cookie');
  return { status: res.status, data, cookie: set ? set.split(';')[0] : undefined };
}
const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).cookie;
const byName = async (table, name) => (await query(`SELECT id FROM ${table} WHERE name = ?`, [name]))[0].id;

/** An active subscription made straight in the database, so each test controls its own dates. */
async function makeSub({ plan = 'starter', start, expiry = null, paused = 0, status = 'active', index = 0, planPrice, terms = 'net_15', tax = false, qty = 2 }) {
  const planRow = (await query('SELECT price FROM plans WHERE id = ?', [ids[plan]]))[0];
  const res = await query(
    `INSERT INTO subscriptions (customer_id, plan_id, plan_price, status, is_paused, next_period_index, start_date, expiry_date, payment_terms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ids.northwind, ids[plan], planPrice ?? planRow.price, status, paused, index, start, expiry, terms]
  );
  subs.push(res.insertId);
  const line = await query('INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price) VALUES (?, ?, ?, 600)', [res.insertId, ids.support, qty]);
  if (tax) await query('INSERT INTO subscription_line_taxes (line_id, tax_id) VALUES (?, ?)', [line.insertId, ids.gst]);
  return res.insertId;
}
const invoicesOf = (subId) => query("SELECT id, status, DATE_FORMAT(period_start, '%Y-%m-%d') AS period_start, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, discount_total, tax_total, total, untaxed_total FROM invoices WHERE subscription_id = ? ORDER BY period_start", [subId]);

before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await login('admin@cadence.test', 'Admin@12345');
  staff = await login('staff@cadence.test', 'Staff@12345');
  customer = await login('customer@cadence.test', 'Customer@12345');
  kite = await login('kite@cadence.test', 'Customer@12345');
  ids = {
    starter: await byName('plans', 'Starter monthly'),
    weekly: await byName('plans', 'Team weekly'),
    support: await byName('products', 'Priority Support'),
    gst: await byName('taxes', 'GST 18%'),
    northwind: (await query("SELECT id FROM users WHERE email = 'customer@cadence.test'"))[0].id,
  };
  // Switch the demo discounts off so these tests see exact amounts; they are put back afterwards.
  savedLimits = await query('SELECT id, usage_limit FROM discounts');
  await query('UPDATE discounts SET usage_limit = times_used');
});

after(async () => {
  if (subs.length) {
    const list = subs.join(',');
    await query(`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE subscription_id IN (${list}))`);
    await query(`DELETE FROM invoices WHERE subscription_id IN (${list})`);
    await query(`DELETE FROM subscriptions WHERE id IN (${list})`);
  }
  await query("DELETE FROM discounts WHERE name LIKE 'Test %'");
  for (const d of savedLimits) await query('UPDATE discounts SET usage_limit = ? WHERE id = ?', [d.usage_limit, d.id]);
  server.close();
  await pool.end();
});

describe('billing periods', () => {
  test('periods are counted from the start date and never drift', () => {
    assert.equal(periodStart('2026-01-31', 'monthly', 1), '2026-02-28');
    assert.equal(periodStart('2026-01-31', 'monthly', 2), '2026-03-31'); // back on the 31st, not the 28th
    assert.equal(periodStart('2026-03-01', 'weekly', 2), '2026-03-15');
    assert.equal(periodStart('2028-02-29', 'yearly', 1), '2029-02-28');
    assert.equal(firstPeriodOnOrAfter('2026-01-01', 'monthly', '2026-01-01'), 0);
    assert.equal(firstPeriodOnOrAfter('2026-01-01', 'monthly', '2026-03-02'), 3);
    assert.equal(firstPeriodOnOrAfter('2026-01-01', 'monthly', '2026-03-01'), 2);
    assert.equal(firstPeriodOnOrAfter('2026-01-01', 'daily', '2026-01-10'), 9);
    assert.equal(firstPeriodOnOrAfter('2026-01-01', 'yearly', '2030-06-01'), 5);
  });
});

describe('generating invoices', () => {
  test('bills every period that has started, with details, tax and plan price filled in', async () => {
    const start = addMonths(today(), -2);
    const id = await makeSub({ start, tax: true });
    const result = await generateDueInvoices({ subscriptionId: id });
    assert.equal(result.created, 3);

    const rows = await invoicesOf(id);
    assert.deepEqual(rows.map((r) => r.period_start), [start, addMonths(start, 1), addMonths(start, 2)]);
    assert.equal(rows[0].invoice_date, start);
    assert.equal(rows[0].due_date, addDays(start, 15)); // net_15
    assert.equal(Number(rows[0].untaxed_total), 1699); // 2 x 600 + 499 plan price
    assert.equal(Number(rows[0].tax_total), 216); // 18% of the lines only
    assert.equal(Number(rows[0].total), 1915);
    assert.ok(rows.every((r) => r.status === 'draft'));

    const detail = await call('GET', `/api/invoices/${rows[0].id}`, { cookie: staff });
    assert.equal(detail.data.invoice.customer_name, 'Northwind Traders');
    assert.deepEqual(detail.data.invoice.lines.map((l) => [l.kind, l.quantity, l.amount]), [['plan', 1, 499], ['product', 2, 1416]]);
    assert.match(detail.data.invoice.number, /^INV-\d{5}$/);
  });

  test('running again bills nothing twice', async () => {
    const id = await makeSub({ start: addMonths(today(), -1) });
    assert.equal((await generateDueInvoices({ subscriptionId: id })).created, 2);
    assert.equal((await generateDueInvoices({ subscriptionId: id })).created, 0);
    assert.equal((await invoicesOf(id)).length, 2);
  });

  test('two runs at the same moment still make one invoice per period', async () => {
    const id = await makeSub({ start: addMonths(today(), -2) });
    await Promise.all([generateDueInvoices({ subscriptionId: id }), generateDueInvoices({ subscriptionId: id }), generateDueInvoices({ subscriptionId: id })]);
    const rows = await invoicesOf(id);
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map((r) => r.period_start)).size, 3);
  });

  test('the database itself refuses a second invoice for the same period', async () => {
    const id = await makeSub({ start: today() });
    await generateDueInvoices({ subscriptionId: id });
    const [first] = await invoicesOf(id);
    await assert.rejects(
      query(
        `INSERT INTO invoices (subscription_id, customer_id, period_start, period_end, invoice_date, due_date, customer_name, customer_email,
                               plan_name, untaxed_total, tax_total, total) VALUES (?, ?, ?, ?, ?, ?, 'x', 'x@x.test', 'x', 1, 0, 1)`,
        [id, ids.northwind, first.period_start, first.period_start, first.period_start, first.period_start]
      ),
      (err) => err.code === 'ER_DUP_ENTRY'
    );
  });

  test('skips paused, draft, closed and not-yet-started subscriptions, and stops at the expiry date', async () => {
    const start = addMonths(today(), -2);
    const paused = await makeSub({ start, paused: 1 });
    const draft = await makeSub({ start, status: 'draft' });
    const closed = await makeSub({ start, status: 'closed' });
    const future = await makeSub({ start: addDays(today(), 5) });
    const ending = await makeSub({ start, expiry: addMonths(start, 1) });
    await generateDueInvoices();
    for (const id of [paused, draft, closed, future]) assert.equal((await invoicesOf(id)).length, 0);
    assert.equal((await invoicesOf(ending)).length, 2); // periods starting on or before the expiry date
  });

  test('a subscription activated late is not billed for periods before it was active; resuming skips paused periods', async () => {
    const late = await makeSub({ plan: 'weekly', start: addDays(today(), -10), status: 'confirmed', qty: 3 });
    const act = await call('POST', `/api/subscriptions/${late}/action`, { cookie: staff, body: { action: 'activate' } });
    assert.equal(act.status, 200);
    assert.equal((await generateDueInvoices({ subscriptionId: late })).created, 0); // next period starts in 4 days
    assert.equal((await query('SELECT next_period_index AS n FROM subscriptions WHERE id = ?', [late]))[0].n, 2);

    const resumed = await makeSub({ plan: 'weekly', start: addDays(today(), -21), paused: 1, qty: 3 });
    const res = await call('POST', `/api/subscriptions/${resumed}/action`, { cookie: staff, body: { action: 'resume' } });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal((await generateDueInvoices({ subscriptionId: resumed })).created, 1); // only the period that starts today
  });

  test('a discount applies on its own, is counted, stops at its limit, and is given back when the invoice is cancelled', async () => {
    const d = await query(
      `INSERT INTO discounts (name, type, value, start_date, usage_limit, applies_to) VALUES ('Test two uses', 'percentage', 10, '2026-01-01', 2, 'subscription')`
    );
    const id = await makeSub({ start: addMonths(today(), -2) });
    await generateDueInvoices({ subscriptionId: id });
    const rows = await invoicesOf(id);
    assert.deepEqual(rows.map((r) => Number(r.discount_total)), [120, 120, 0]); // 10% of 1200, twice, then used up
    assert.equal((await query('SELECT times_used FROM discounts WHERE id = ?', [d.insertId]))[0].times_used, 2);

    const cancel = await call('POST', `/api/invoices/${rows[0].id}/action`, { cookie: staff, body: { action: 'cancel' } });
    assert.equal(cancel.data.invoice.status, 'cancelled');
    assert.equal((await query('SELECT times_used FROM discounts WHERE id = ?', [d.insertId]))[0].times_used, 1);
  });

  test('an invoice with nothing to pay is settled when confirmed', async () => {
    await query("INSERT INTO discounts (name, type, value, start_date, usage_limit, applies_to) VALUES ('Test free', 'fixed', 99999, '2026-01-01', 1, 'subscription')");
    const id = await makeSub({ start: today(), planPrice: 0 });
    await generateDueInvoices({ subscriptionId: id });
    const [inv] = await invoicesOf(id);
    assert.equal(Number(inv.total), 0);
    const res = await call('POST', `/api/invoices/${inv.id}/action`, { cookie: staff, body: { action: 'confirm' } });
    assert.equal(res.data.invoice.status, 'paid');
  });
});

describe('invoice status and sending', () => {
  let subId;
  let invoiceId;

  before(async () => {
    subId = await makeSub({ start: today() });
    await generateDueInvoices({ subscriptionId: subId });
    invoiceId = (await invoicesOf(subId))[0].id;
  });
  const act = (action, cookie = staff) => call('POST', `/api/invoices/${invoiceId}/action`, { cookie, body: { action } });

  test('a draft is hidden from the customer; only the team can act', async () => {
    assert.equal((await call('GET', `/api/invoices/${invoiceId}`, { cookie: customer })).status, 404);
    assert.equal((await act('confirm', customer)).status, 403);
    assert.equal((await call('GET', `/api/invoices/${invoiceId}`)).status, 401);
    assert.equal((await act('explode')).status, 400);
    assert.equal((await act('send')).status, 409); // not confirmed yet
  });

  test('confirming moves Draft to Confirmed and the customer can then see it', async () => {
    const res = await act('confirm');
    assert.equal(res.data.invoice.status, 'confirmed');
    assert.deepEqual(res.data.invoice.actions.sort(), ['cancel', 'send']);
    assert.equal(res.data.invoice.can_record_payment, true);
    assert.equal((await act('confirm')).status, 409);
    assert.equal((await call('GET', `/api/invoices/${invoiceId}`, { cookie: customer })).status, 200);
    assert.equal((await call('GET', `/api/invoices/${invoiceId}`, { cookie: kite })).status, 404); // someone else's
  });

  test('sending emails the customer and records when', async () => {
    const before = outbox.length;
    const res = await act('send');
    assert.equal(res.status, 200);
    assert.ok(res.data.invoice.sent_at);
    assert.equal(outbox.length, before + 1);
    assert.equal(outbox.at(-1).to, 'customer@cadence.test');
    assert.match(outbox.at(-1).link, /\/invoices\/\d+$/);
  });

  test('payments: partial, over-payment, future date, then the rest settles it', async () => {
    const pay = (body, cookie = staff) => call('POST', `/api/invoices/${invoiceId}/payments`, { cookie, body });
    const total = 1699; // 2 x 600 + 499

    assert.equal((await pay({ method: 'cash', amount: 100, paid_on: today() }, customer)).status, 403);
    const bad = await pay({ method: 'barter', amount: -5, paid_on: 'soon' });
    assert.equal(bad.status, 400);
    assert.ok(bad.data.errors.method && bad.data.errors.amount && bad.data.errors.paid_on);
    assert.match((await pay({ method: 'cash', amount: 10, paid_on: addDays(today(), 3) })).data.errors.paid_on, /future/);

    const part = await pay({ method: 'upi', amount: 699, paid_on: today(), note: 'First part' });
    assert.equal(part.status, 201);
    assert.equal(part.data.invoice.status, 'confirmed');
    assert.equal(part.data.invoice.outstanding, 1000);
    assert.equal(part.data.invoice.payments[0].note, 'First part');
    assert.deepEqual(part.data.invoice.actions.sort(), ['send']); // cannot be cancelled once money is in

    const over = await pay({ method: 'cash', amount: 1000.01, paid_on: today() });
    assert.equal(over.status, 400);
    assert.match(over.data.errors.amount, /1000\.00/);

    const rest = await pay({ method: 'bank_transfer', amount: 1000, paid_on: today() });
    assert.equal(rest.data.invoice.status, 'paid');
    assert.equal(rest.data.invoice.amount_paid, total);
    assert.equal(rest.data.invoice.outstanding, 0);
    assert.equal(rest.data.invoice.can_record_payment, false);
    assert.equal((await pay({ method: 'cash', amount: 1, paid_on: today() })).status, 409);
  });

  test('two payments recorded at once cannot overpay an invoice', async () => {
    const id = await makeSub({ start: today() });
    await generateDueInvoices({ subscriptionId: id });
    const [inv] = await invoicesOf(id);
    await call('POST', `/api/invoices/${inv.id}/action`, { cookie: staff, body: { action: 'confirm' } });
    const results = await Promise.all(
      [1, 2].map(() => call('POST', `/api/invoices/${inv.id}/payments`, { cookie: staff, body: { method: 'cash', amount: 1699, paid_on: today() } }))
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]); // the second finds it already paid
    assert.equal(Number((await query('SELECT amount_paid FROM invoices WHERE id = ?', [inv.id]))[0].amount_paid), 1699);
  });

  test('a draft can be cancelled', async () => {
    const id = await makeSub({ start: today() });
    await generateDueInvoices({ subscriptionId: id });
    const [inv] = await invoicesOf(id);
    const res = await call('POST', `/api/invoices/${inv.id}/action`, { cookie: staff, body: { action: 'cancel' } });
    assert.equal(res.data.invoice.status, 'cancelled');
    assert.deepEqual(res.data.invoice.actions, []);
  });
});

describe('lists, overdue and the manual button', () => {
  test('overdue invoices are flagged, filterable and counted', async () => {
    const id = await makeSub({ start: addDays(today(), -40), terms: 'net_15' });
    await query('UPDATE subscriptions SET next_period_index = 0 WHERE id = ?', [id]);
    await generateDueInvoices({ subscriptionId: id });
    const [inv] = await invoicesOf(id);
    await call('POST', `/api/invoices/${inv.id}/action`, { cookie: staff, body: { action: 'confirm' } });

    const overdue = await call('GET', '/api/invoices?status=overdue&pageSize=100', { cookie: staff });
    assert.equal(overdue.status, 200);
    assert.ok(overdue.data.invoices.some((i) => i.id === inv.id && i.is_overdue === true));
    assert.ok(overdue.data.invoices.every((i) => i.status === 'confirmed' && i.is_overdue));
    assert.ok(overdue.data.summary.overdue_count >= 1);
    assert.ok(overdue.data.summary.overdue > 0);
    assert.equal(overdue.data.summary.outstanding, Math.round((overdue.data.summary.billed - overdue.data.summary.paid) * 100) / 100);

    assert.equal((await call('GET', '/api/invoices?status=bogus', { cookie: staff })).status, 400);
  });

  test('a customer sees only their own confirmed and paid invoices', async () => {
    const list = await call('GET', '/api/invoices?pageSize=100', { cookie: customer });
    assert.equal(list.status, 200);
    assert.ok(list.data.invoices.length > 0);
    assert.ok(list.data.invoices.every((i) => i.customer_id === ids.northwind && ['confirmed', 'paid'].includes(i.status)));
    const kiteList = await call('GET', '/api/invoices?pageSize=100', { cookie: kite });
    assert.ok(kiteList.data.invoices.every((i) => i.customer_id !== ids.northwind));
  });

  test('filters by subscription and paginates', async () => {
    const id = await makeSub({ start: addMonths(today(), -2) });
    await generateDueInvoices({ subscriptionId: id });
    const page = await call('GET', `/api/invoices?subscription_id=${id}&pageSize=2&page=2`, { cookie: staff });
    assert.equal(page.data.total, 3);
    assert.equal(page.data.invoices.length, 1);
  });

  test('payments are listed for the team only', async () => {
    const list = await call('GET', '/api/payments', { cookie: staff });
    assert.equal(list.status, 200);
    assert.ok(list.data.payments.length > 0);
    assert.ok(list.data.payments[0].invoice_number);
    assert.equal((await call('GET', '/api/payments', { cookie: customer })).status, 403);
  });

  test('the Generate due invoices button is for the team and reports what it did', async () => {
    const id = await makeSub({ start: today() });
    assert.equal((await call('POST', '/api/invoices/generate', { cookie: customer })).status, 403);
    const res = await call('POST', '/api/invoices/generate', { cookie: staff });
    assert.equal(res.status, 200);
    assert.ok(res.data.created >= 1);
    assert.equal((await invoicesOf(id)).length, 1);
    assert.equal((await call('POST', '/api/invoices/generate', { cookie: staff })).data.created, 0);
  });
});
