import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { today } from '../src/utils/pricing.js';
import { addDays, closeExpiredSubscriptions } from '../src/services/subscriptions.js';
import { generateDueInvoices } from '../src/services/billing.js';

const run = Date.now();
let server;
let base;
let admin;
let staff;
let customer;
let ids = {};
const subs = [];
const plans = [];
let savedProfile;

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

before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await login('admin@cadence.test', 'Admin@12345');
  staff = await login('staff@cadence.test', 'Staff@12345');
  customer = await login('customer@cadence.test', 'Customer@12345');
  const [north] = await query("SELECT id, name, company, phone, billing_address FROM users WHERE email = 'customer@cadence.test'");
  savedProfile = north;
  ids = {
    northwind: north.id,
    support: (await query("SELECT id FROM products WHERE name = 'Priority Support'"))[0].id,
    suite: (await query("SELECT id FROM products WHERE name = 'Team Workspace Suite'"))[0].id,
    gst18: (await query("SELECT id FROM taxes WHERE name = 'GST 18%'"))[0].id,
    gst5: (await query("SELECT id FROM taxes WHERE name = 'GST 5%'"))[0].id,
  };
});

after(async () => {
  await query("DELETE FROM quotation_templates WHERE name LIKE 'Test %'");
  if (subs.length) {
    const list = subs.join(',');
    await query(`DELETE FROM invoices WHERE subscription_id IN (${list})`);
    await query(`DELETE FROM subscriptions WHERE id IN (${list})`);
  }
  if (plans.length) await query(`DELETE FROM plans WHERE id IN (${plans.join(',')})`);
  await query("DELETE FROM taxes WHERE name LIKE 'Test %'");
  await query('UPDATE users SET name = ?, company = ?, phone = ?, billing_address = ? WHERE id = ?', [
    savedProfile.name, savedProfile.company, savedProfile.phone, savedProfile.billing_address, savedProfile.id,
  ]);
  server.close();
  await pool.end();
});

const plan = (over = {}) => ({
  name: `Test plan ${run}-${plans.length}`,
  price: 100,
  billing_period: 'monthly',
  min_quantity: 1,
  start_date: addDays(today(), -30),
  end_date: addDays(today(), 30),
  auto_close: true,
  closable: true,
  pausable: true,
  renewable: true,
  ...over,
});
async function makePlan(over) {
  const res = await call('POST', '/api/plans', { cookie: admin, body: plan(over) });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  plans.push(res.data.plan.id);
  return res.data.plan;
}
const sub = (planId, over = {}) => ({
  customer_id: ids.northwind,
  plan_id: planId,
  start_date: today(),
  expiry_date: null,
  payment_terms: 'net_15',
  validity_days: 14,
  lines: [{ product_id: ids.support, quantity: 1 }],
  ...over,
});
async function makeSub(planId, over) {
  const res = await call('POST', '/api/subscriptions', { cookie: staff, body: sub(planId, over) });
  if (res.status === 201) subs.push(res.data.subscription.id);
  return res;
}

describe('plans that end close their subscriptions', () => {
  test('a subscription with no expiry date on a closing plan takes the plan end date', async () => {
    const p = await makePlan();
    const res = await makeSub(p.id);
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(res.data.subscription.expiry_date, p.end_date);
  });

  test('an expiry date after the plan end is refused; an earlier one is kept', async () => {
    const p = await makePlan();
    const late = await makeSub(p.id, { expiry_date: addDays(p.end_date, 10) });
    assert.equal(late.status, 400);
    assert.match(late.data.errors.expiry_date, /closes on its own on/);
    const early = await makeSub(p.id, { expiry_date: addDays(today(), 10) });
    assert.equal(early.data.subscription.expiry_date, addDays(today(), 10));
  });

  test('a plan that does not close on its own leaves the expiry date alone', async () => {
    const p = await makePlan({ auto_close: false });
    const res = await makeSub(p.id);
    assert.equal(res.data.subscription.expiry_date, null);
  });

  test('once the plan has ended, active subscriptions close even without an expiry date', async () => {
    const mk = async (over) => {
      const p = await makePlan(over);
      const r = await query(
        "INSERT INTO subscriptions (customer_id, plan_id, status, start_date, expiry_date) VALUES (?, ?, 'active', ?, NULL)",
        [ids.northwind, p.id, addDays(today(), -20)]
      );
      subs.push(r.insertId);
      return { planId: p.id, id: r.insertId };
    };
    const ended = await mk({ end_date: addDays(today(), -1), start_date: addDays(today(), -40) });
    const keeps = await mk({ end_date: addDays(today(), -1), start_date: addDays(today(), -40), auto_close: false });
    const running = await mk({ end_date: addDays(today(), 20) });
    await closeExpiredSubscriptions();
    const status = async (x) => (await query('SELECT status FROM subscriptions WHERE id = ?', [x.id]))[0].status;
    assert.equal(await status(ended), 'closed');
    assert.equal(await status(keeps), 'active'); // this plan does not close on its own
    assert.equal(await status(running), 'active');
  });
});

describe('taxes applied automatically', () => {
  let autoId;

  test('the admin marks a tax as automatic, and the setting is saved and returned', async () => {
    const res = await call('POST', '/api/taxes', { cookie: admin, body: { name: `Test auto ${run}`, rate: 2, apply_automatically: true } });
    assert.equal(res.status, 201);
    autoId = res.data.tax.id;
    assert.equal(res.data.tax.apply_automatically, true);
    const plain = await call('POST', '/api/taxes', { cookie: admin, body: { name: `Test plain ${run}`, rate: 3 } });
    assert.equal(plain.data.tax.apply_automatically, false);
    const list = await call('GET', '/api/taxes', { cookie: staff });
    assert.ok(list.data.taxes.find((t) => t.id === autoId).apply_automatically);
    assert.ok(list.data.taxes.find((t) => t.name === 'GST 18%').apply_automatically);
  });

  test('a line that does not choose taxes gets the automatic ones, so none can be forgotten', async () => {
    const p = await makePlan({ auto_close: false });
    const res = await makeSub(p.id);
    const taxIds = res.data.subscription.lines[0].taxes.map((t) => t.id).sort();
    assert.ok(taxIds.includes(autoId) && taxIds.includes(ids.gst18));
    assert.ok(!res.data.subscription.lines[0].taxes.some((t) => t.name === `Test plain ${run}`));
    assert.ok(res.data.subscription.totals.tax > 0);
  });

  test('choosing taxes on purpose is respected, including choosing none', async () => {
    const p = await makePlan({ auto_close: false });
    const none = await makeSub(p.id, { lines: [{ product_id: ids.support, quantity: 1, tax_ids: [] }] });
    assert.deepEqual(none.data.subscription.lines[0].taxes, []);
    const one = await makeSub(p.id, { lines: [{ product_id: ids.support, quantity: 1, tax_ids: [ids.gst5] }] });
    assert.deepEqual(one.data.subscription.lines[0].taxes.map((t) => t.id), [ids.gst5]);
  });

  test('quotation templates get the automatic taxes too', async () => {
    const p = await makePlan({ auto_close: false });
    const res = await call('POST', '/api/templates', {
      cookie: staff,
      body: { name: `Test tpl ${run}`, plan_id: p.id, validity_days: 10, lines: [{ product_id: ids.support, quantity: 1 }] },
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.ok(res.data.template.lines[0].tax_ids.includes(autoId));
    assert.ok(res.data.template.lines[0].tax_ids.includes(ids.gst18));
  });
});

describe('customer details', () => {
  test('people see and change their own details; each field is checked', async () => {
    assert.equal((await call('GET', '/api/profile')).status, 401);
    const bad = await call('PUT', '/api/profile', { cookie: customer, body: { name: 'A', phone: 'call me', company: 'x'.repeat(200) } });
    assert.equal(bad.status, 400);
    assert.ok(bad.data.errors.name && bad.data.errors.phone && bad.data.errors.company);

    const ok = await call('PUT', '/api/profile', {
      cookie: customer,
      body: { name: 'Northwind Traders', company: `Test Co ${run}`, phone: '+91 98765 00000', billing_address: '1 Test Street, Chennai 600001' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.profile.company, `Test Co ${run}`);
    const again = await call('GET', '/api/profile', { cookie: customer });
    assert.equal(again.data.profile.billing_address, '1 Test Street, Chennai 600001');
    assert.equal(again.data.profile.email, 'customer@cadence.test');
    // Someone else's details are never touched.
    const mine = await call('GET', '/api/profile', { cookie: staff });
    assert.notEqual(mine.data.profile.company, `Test Co ${run}`);
  });

  test('an invoice carries the billed-to details from when it was made, and does not change afterwards', async () => {
    const p = await makePlan({ auto_close: false });
    const r = await query(
      "INSERT INTO subscriptions (customer_id, plan_id, plan_price, status, start_date, payment_terms) VALUES (?, ?, 100, 'active', ?, 'net_15')",
      [ids.northwind, p.id, today()]
    );
    subs.push(r.insertId);
    await query('INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price) VALUES (?, ?, 1, 600)', [r.insertId, ids.support]);
    await generateDueInvoices({ subscriptionId: r.insertId });
    const [inv] = await query('SELECT id FROM invoices WHERE subscription_id = ?', [r.insertId]);

    const first = await call('GET', `/api/invoices/${inv.id}`, { cookie: staff });
    assert.equal(first.data.invoice.customer_company, `Test Co ${run}`);
    assert.equal(first.data.invoice.customer_phone, '+91 98765 00000');
    assert.equal(first.data.invoice.customer_address, '1 Test Street, Chennai 600001');

    await call('PUT', '/api/profile', { cookie: customer, body: { name: 'Northwind Traders', company: 'Renamed Ltd' } });
    const after = await call('GET', `/api/invoices/${inv.id}`, { cookie: staff });
    assert.equal(after.data.invoice.customer_company, `Test Co ${run}`);
  });
});
