import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { outbox } from '../src/utils/mailer.js';
import { today } from '../src/utils/pricing.js';
import { expiryInFuture, luhn } from '../src/utils/cards.js';
import { toCsv } from '../src/utils/csv.js';
import { addDays } from '../src/services/subscriptions.js';
import { generateDueInvoices } from '../src/services/billing.js';

let server;
let base;
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
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON, such as a CSV */ }
  const set = res.headers.get('set-cookie');
  return { status: res.status, data, text, headers: res.headers, cookie: set ? set.split(';')[0] : undefined };
}
const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).cookie;

/** A confirmed invoice for Northwind, made straight from the database so each test owns its own. */
async function confirmedInvoice({ dueOffset = 15 } = {}) {
  const plan = (await query("SELECT id FROM plans WHERE name = 'Starter monthly'"))[0].id;
  const r = await query(
    "INSERT INTO subscriptions (customer_id, plan_id, plan_price, status, start_date, payment_terms) VALUES (?, ?, 100, 'active', ?, 'net_15')",
    [ids.northwind, plan, today()]
  );
  subs.push(r.insertId);
  await query('INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price) VALUES (?, ?, 2, 600)', [r.insertId, ids.support]);
  await generateDueInvoices({ subscriptionId: r.insertId });
  const [inv] = await query('SELECT id FROM invoices WHERE subscription_id = ?', [r.insertId]);
  await call('POST', `/api/invoices/${inv.id}/action`, { cookie: staff, body: { action: 'confirm' } });
  if (dueOffset !== 15) await query('UPDATE invoices SET due_date = ? WHERE id = ?', [addDays(today(), dueOffset), inv.id]);
  return inv.id;
}

before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  staff = await login('staff@cadence.test', 'Staff@12345');
  customer = await login('customer@cadence.test', 'Customer@12345');
  kite = await login('kite@cadence.test', 'Customer@12345');
  ids = {
    northwind: (await query("SELECT id FROM users WHERE email = 'customer@cadence.test'"))[0].id,
    support: (await query("SELECT id FROM products WHERE name = 'Priority Support'"))[0].id,
  };
  savedLimits = await query('SELECT id, usage_limit FROM discounts');
  await query('UPDATE discounts SET usage_limit = times_used'); // exact amounts: no demo discount applies
});

after(async () => {
  if (subs.length) {
    const list = subs.join(',');
    await query(`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE subscription_id IN (${list}))`);
    await query(`DELETE FROM invoices WHERE subscription_id IN (${list})`);
    await query(`DELETE FROM subscriptions WHERE id IN (${list})`);
  }
  for (const d of savedLimits) await query('UPDATE discounts SET usage_limit = ? WHERE id = ?', [d.usage_limit, d.id]);
  server.close();
  await pool.end();
});

const card = (over = {}) => ({ card_number: '4242 4242 4242 4242', expiry: '12/39', cvc: '123', name: 'Test Customer', ...over });
const pay = (id, body, cookie = customer) => call('POST', `/api/invoices/${id}/pay`, { cookie, body });

describe('card helpers', () => {
  test('the Luhn check and expiry check', () => {
    assert.equal(luhn('4242424242424242'), true);
    assert.equal(luhn('4242424242424241'), false);
    assert.equal(luhn(''), false);
    const now = new Date('2026-10-15T00:00:00Z');
    assert.equal(expiryInFuture('10/26', now), true); // the card's last month still counts
    assert.equal(expiryInFuture('09/26', now), false);
    assert.equal(expiryInFuture('01/27', now), true);
  });
});

describe('paying online (test mode)', () => {
  test('a customer pays their invoice in full with a test card, and it is marked paid', async () => {
    const id = await confirmedInvoice();
    const before = (await call('GET', `/api/invoices/${id}`, { cookie: customer })).data.invoice;
    assert.equal(before.can_pay_online, true);
    assert.ok(before.outstanding > 0);

    const res = await pay(id, card());
    assert.equal(res.status, 201, res.text);
    assert.equal(res.data.invoice.status, 'paid');
    assert.equal(res.data.invoice.outstanding, 0);
    assert.equal(res.data.invoice.can_pay_online, false);
    const payment = res.data.invoice.payments[0];
    assert.equal(payment.method, 'card');
    assert.equal(payment.amount, before.outstanding);
    assert.match(payment.note, /\(test mode\), card ending 4242/);
    assert.ok(!JSON.stringify(res.data).includes('4242424242424242')); // the full number is never stored or returned
    assert.equal((await pay(id, card())).status, 409); // already paid
  });

  test('a part payment leaves the rest outstanding', async () => {
    const id = await confirmedInvoice();
    const total = (await call('GET', `/api/invoices/${id}`, { cookie: customer })).data.invoice.outstanding;
    const part = await pay(id, card({ card_number: '5555 5555 5555 4444', amount: 500 }));
    assert.equal(part.data.invoice.status, 'confirmed');
    assert.equal(part.data.invoice.outstanding, Math.round((total - 500) * 100) / 100);
    const over = await pay(id, card({ amount: total }));
    assert.equal(over.status, 400); // more than is left
  });

  test('refuses declined, real, mistyped and expired cards, and a bad security code', async () => {
    const id = await confirmedInvoice();
    const declined = await pay(id, card({ card_number: '4000 0000 0000 0002' }));
    assert.equal(declined.status, 402);
    assert.match(declined.data.message, /declined/);
    const real = await pay(id, card({ card_number: '4111 1111 1111 1111' })); // a valid number, but not a test card
    assert.match(real.data.errors.card_number, /test mode/);
    assert.match((await pay(id, card({ card_number: '4242 4242 4242 4241' }))).data.errors.card_number, /valid card number/);
    assert.match((await pay(id, card({ expiry: '01/20' }))).data.errors.expiry, /expired/);
    assert.ok((await pay(id, card({ expiry: '13/30' }))).data.errors.expiry);
    assert.ok((await pay(id, card({ cvc: '12' }))).data.errors.cvc);
    assert.equal((await call('GET', `/api/invoices/${id}`, { cookie: customer })).data.invoice.amount_paid, 0); // nothing was recorded
  });

  test('only the invoice owner can pay, and only once it is confirmed', async () => {
    const id = await confirmedInvoice();
    assert.equal((await pay(id, card(), kite)).status, 404);
    assert.equal((await call('POST', `/api/invoices/${id}/pay`, { body: card() })).status, 401);
    const draft = await confirmedInvoice();
    await query("UPDATE invoices SET status = 'draft' WHERE id = ?", [draft]);
    assert.equal((await pay(draft, card())).status, 404); // customers never see drafts
  });
});

describe('overdue reminders', () => {
  test('the team can remind about an overdue invoice, and it records when', async () => {
    const id = await confirmedInvoice({ dueOffset: -5 });
    const detail = (await call('GET', `/api/invoices/${id}`, { cookie: staff })).data.invoice;
    assert.equal(detail.is_overdue, true);
    assert.ok(detail.actions.includes('remind'));
    assert.equal(detail.reminded_at, null);

    const mails = outbox.length;
    const res = await call('POST', `/api/invoices/${id}/action`, { cookie: staff, body: { action: 'remind' } });
    assert.equal(res.status, 200, res.text);
    assert.ok(res.data.invoice.reminded_at);
    assert.equal(outbox.length, mails + 1);
    assert.equal(outbox.at(-1).kind, 'reminder');
    assert.equal(outbox.at(-1).to, 'customer@cadence.test');
  });

  test('not available for an invoice that is not overdue, and never for a customer', async () => {
    const id = await confirmedInvoice();
    assert.ok(!(await call('GET', `/api/invoices/${id}`, { cookie: staff })).data.invoice.actions.includes('remind'));
    assert.equal((await call('POST', `/api/invoices/${id}/action`, { cookie: staff, body: { action: 'remind' } })).status, 409);
    const late = await confirmedInvoice({ dueOffset: -5 });
    assert.equal((await call('POST', `/api/invoices/${late}/action`, { cookie: customer, body: { action: 'remind' } })).status, 403);
  });

  test('an invoice that has been paid cannot be chased', async () => {
    const id = await confirmedInvoice({ dueOffset: -5 });
    await pay(id, card());
    assert.equal((await call('POST', `/api/invoices/${id}/action`, { cookie: staff, body: { action: 'remind' } })).status, 409);
  });
});

describe('CSV export', () => {
  test('quotes, commas and formulas are made safe for a spreadsheet', () => {
    const csv = toCsv([{ header: 'Name', value: (r) => r.n }, { header: 'Total', value: (r) => r.t }], [
      { n: 'Smith, "Bob"', t: 5 },
      { n: '=HYPERLINK("x")', t: -3 },
      { n: 'Plain', t: 1.5 },
    ]);
    assert.equal(csv, 'Name,Total\r\n"Smith, ""Bob""",5\r\n\'=HYPERLINK("x"),-3\r\nPlain,1.5\r\n'.replace("'=HYPERLINK(\"x\")", '"\'=HYPERLINK(""x"")"'));
  });

  test('the team downloads invoices, following the status filter; customers cannot', async () => {
    const all = await call('GET', '/api/invoices/export.csv', { cookie: staff });
    assert.equal(all.status, 200);
    assert.match(all.headers.get('content-type'), /text\/csv/);
    assert.match(all.headers.get('content-disposition'), /attachment; filename="invoices-\d{4}-\d{2}-\d{2}\.csv"/);
    const lines = all.text.replace(/^﻿/, '').trim().split('\r\n');
    assert.equal(lines[0], 'Invoice,Subscription,Customer,Company,Email,Status,Overdue,Invoice date,Due date,Total,Paid,Outstanding');
    const list = await call('GET', '/api/invoices?pageSize=100', { cookie: staff });
    assert.equal(lines.length - 1, list.data.total);

    const overdue = await call('GET', '/api/invoices/export.csv?status=overdue', { cookie: staff });
    const rows = overdue.text.replace(/^﻿/, '').trim().split('\r\n').slice(1);
    assert.ok(rows.length > 0 && rows.every((r) => r.includes(',confirmed,yes,')));

    assert.equal((await call('GET', '/api/invoices/export.csv?status=bogus', { cookie: staff })).status, 400);
    assert.equal((await call('GET', '/api/invoices/export.csv', { cookie: customer })).status, 403);
    assert.equal((await call('GET', '/api/invoices/export.csv')).status, 401);
  });

  test('payments can be downloaded by the team only', async () => {
    const res = await call('GET', '/api/payments/export.csv', { cookie: staff });
    assert.equal(res.status, 200);
    assert.equal(res.text.replace(/^﻿/, '').split('\r\n')[0], 'Date,Invoice,Customer,Method,Amount,Note');
    assert.ok(res.text.trim().split('\r\n').length > 1);
    assert.equal((await call('GET', '/api/payments/export.csv', { cookie: customer })).status, 403);
  });
});
