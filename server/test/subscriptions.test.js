import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { today } from '../src/utils/pricing.js';
import { addDays, addPeriod, closeExpiredSubscriptions } from '../src/services/subscriptions.js';

const run = Date.now();
let server;
let base;
let admin;
let staff;
let customer;
let kite;
let ids = {}; // plans, products, taxes, customers found by name
const created = [];

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
    suite: await byName('products', 'Team Workspace Suite'),
    support: await byName('products', 'Priority Support'),
    gst: await byName('taxes', 'GST 18%'),
    northwind: (await query("SELECT id FROM users WHERE email = 'customer@cadence.test'"))[0].id,
    kiteId: (await query("SELECT id FROM users WHERE email = 'kite@cadence.test'"))[0].id,
  };
});

after(async () => {
  if (created.length) await query(`DELETE FROM subscriptions WHERE id IN (${created.join(',')})`);
  await query("DELETE FROM quotation_templates WHERE name LIKE 'Test %'");
  server.close();
  await pool.end();
});

const sub = (over = {}) => ({
  customer_id: ids.northwind,
  plan_id: ids.starter,
  start_date: today(),
  expiry_date: addDays(today(), 60),
  payment_terms: 'net_30',
  validity_days: 14,
  lines: [{ product_id: ids.suite, variant: { attribute: 'Brand', value: 'Odoo' }, quantity: 2, tax_ids: [ids.gst] }],
  ...over,
});

async function makeActive(body = sub()) {
  const res = await call('POST', '/api/subscriptions', { cookie: staff, body });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  created.push(res.data.subscription.id);
  const id = res.data.subscription.id;
  for (const action of ['send', 'confirm', 'activate']) {
    const step = await call('POST', `/api/subscriptions/${id}/action`, { cookie: staff, body: { action } });
    assert.equal(step.status, 200, `${action}: ${JSON.stringify(step.data)}`);
  }
  return id;
}
const act = (id, action, cookie = staff) => call('POST', `/api/subscriptions/${id}/action`, { cookie, body: { action } });

describe('dates', () => {
  test('adds a billing period without overflowing short months', () => {
    assert.equal(addPeriod('2026-01-31', 'monthly'), '2026-02-28');
    assert.equal(addPeriod('2028-02-29', 'yearly'), '2029-02-28');
    assert.equal(addPeriod('2026-12-15', 'monthly'), '2027-01-15');
    assert.equal(addPeriod('2026-03-01', 'weekly'), '2026-03-08');
    assert.equal(addPeriod('2026-03-01', 'daily'), '2026-03-02');
  });
});

describe('creating a subscription', () => {
  test('only the team can create; signed-out and customers are refused', async () => {
    assert.equal((await call('GET', '/api/subscriptions')).status, 401);
    assert.equal((await call('POST', '/api/subscriptions', { cookie: customer, body: sub() })).status, 403);
    assert.equal((await call('PUT', '/api/subscriptions/1', { cookie: customer, body: sub() })).status, 403);
  });

  test('numbers it, prices the lines from the product and variant, and adds tax', async () => {
    const res = await call('POST', '/api/subscriptions', { cookie: staff, body: sub() });
    assert.equal(res.status, 201);
    const s = res.data.subscription;
    created.push(s.id);
    assert.match(s.number, /^SUB-\d{5}$/);
    assert.equal(s.status, 'draft');
    assert.equal(s.lines[0].unit_price, 2960); // 2400 + 560 for Brand: Odoo
    assert.equal(s.lines[0].variant_label, 'Brand: Odoo');
    assert.deepEqual(s.totals, { untaxed: 5920, tax: 1065.6, total: 6985.6 });
    assert.deepEqual(s.actions, ['send']);
  });

  test('ignores a price sent by the client', async () => {
    const body = sub();
    body.lines[0].unit_price = 1;
    const res = await call('POST', '/api/subscriptions', { cookie: staff, body });
    created.push(res.data.subscription.id);
    assert.equal(res.data.subscription.lines[0].unit_price, 2960);
  });

  test('validates dates, lines, customer and plan rules', async () => {
    const bad = await call('POST', '/api/subscriptions', { cookie: staff, body: sub({ payment_terms: 'later', lines: [] }) });
    assert.equal(bad.status, 400);
    assert.ok(bad.data.errors.payment_terms);
    assert.match(bad.data.errors.lines, /at least one/);

    const backwards = await call('POST', '/api/subscriptions', { cookie: staff, body: sub({ expiry_date: addDays(today(), -5) }) });
    assert.match(backwards.data.errors.expiry_date, /before the start date/);

    const early = await call('POST', '/api/subscriptions', { cookie: staff, body: sub({ start_date: '2025-01-01' }) });
    assert.match(early.data.errors.start_date, /available from/);

    const notCustomer = await call('POST', '/api/subscriptions', { cookie: staff, body: sub({ customer_id: 1 }) });
    assert.ok(notCustomer.data.errors.customer_id);

    const minQty = await call('POST', '/api/subscriptions', {
      cookie: staff,
      body: sub({ plan_id: ids.weekly, lines: [{ product_id: ids.support, quantity: 1, tax_ids: [] }] }),
    });
    assert.match(minQty.data.errors.lines, /Line 1: .*at least 3/);

    const badVariant = await call('POST', '/api/subscriptions', {
      cookie: staff,
      body: sub({ lines: [{ product_id: ids.suite, variant: { attribute: 'Brand', value: 'Nope' }, quantity: 1, tax_ids: [] }] }),
    });
    assert.match(badVariant.data.errors.lines, /no variant/);

    const badTax = await call('POST', '/api/subscriptions', {
      cookie: staff,
      body: sub({ lines: [{ product_id: ids.suite, quantity: 1, tax_ids: [999999] }] }),
    });
    assert.match(badTax.data.errors.lines, /tax no longer exists/);
  });

  test('a draft can be edited and deleted; later statuses cannot', async () => {
    const created1 = await call('POST', '/api/subscriptions', { cookie: staff, body: sub() });
    const id = created1.data.subscription.id;
    const edit = await call('PUT', `/api/subscriptions/${id}`, {
      cookie: staff,
      body: sub({ lines: [{ product_id: ids.support, quantity: 4, tax_ids: [] }] }),
    });
    assert.equal(edit.status, 200);
    assert.equal(edit.data.subscription.lines.length, 1);
    assert.equal(edit.data.subscription.totals.total, 2400);
    assert.equal((await call('DELETE', `/api/subscriptions/${id}`, { cookie: staff })).status, 204);

    const activeId = await makeActive();
    assert.equal((await call('PUT', `/api/subscriptions/${activeId}`, { cookie: staff, body: sub() })).status, 409);
    assert.equal((await call('DELETE', `/api/subscriptions/${activeId}`, { cookie: staff })).status, 409);
  });
});

describe('status flow', () => {
  test('moves Draft, Quotation, Confirmed, Active, Closed in order', async () => {
    const res = await call('POST', '/api/subscriptions', { cookie: staff, body: sub() });
    const id = res.data.subscription.id;
    created.push(id);
    const seen = [res.data.subscription.status];
    for (const action of ['send', 'confirm', 'activate', 'close']) {
      const step = await act(id, action);
      assert.equal(step.status, 200, action);
      seen.push(step.data.subscription.status);
    }
    assert.deepEqual(seen, ['draft', 'quotation', 'confirmed', 'active', 'closed']);
  });

  test('refuses steps out of order', async () => {
    const res = await call('POST', '/api/subscriptions', { cookie: staff, body: sub() });
    created.push(res.data.subscription.id);
    assert.equal((await act(res.data.subscription.id, 'activate')).status, 409);
    assert.equal((await act(res.data.subscription.id, 'close')).status, 409);
    assert.equal((await act(res.data.subscription.id, 'explode')).status, 400);
  });

  test('sending a quotation sets how long it stays valid; an expired one cannot be confirmed', async () => {
    const res = await call('POST', '/api/subscriptions', { cookie: staff, body: sub({ validity_days: 10 }) });
    const id = res.data.subscription.id;
    created.push(id);
    const sent = await act(id, 'send');
    assert.equal(sent.data.subscription.quote_valid_until, addDays(today(), 10));
    await query("UPDATE subscriptions SET quote_valid_until = '2020-01-01' WHERE id = ?", [id]);
    const late = await act(id, 'confirm');
    assert.equal(late.status, 409);
    assert.match(late.data.message, /expired/);
  });

  test('pause, resume, renew and early close follow the plan rules', async () => {
    const id = await makeActive();
    const paused = await act(id, 'pause');
    assert.equal(paused.data.subscription.is_paused, true);
    assert.ok(paused.data.subscription.actions.includes('resume'));
    assert.equal((await act(id, 'pause')).status, 409);
    assert.equal((await act(id, 'resume')).data.subscription.is_paused, false);

    const before = (await call('GET', `/api/subscriptions/${id}`, { cookie: staff })).data.subscription.expiry_date;
    const renewed = await act(id, 'renew');
    assert.equal(renewed.data.subscription.expiry_date, addPeriod(before, 'monthly'));

    await query('UPDATE plans SET closable = 0, pausable = 0 WHERE id = ?', [ids.starter]);
    try {
      const locked = await call('GET', `/api/subscriptions/${id}`, { cookie: staff });
      assert.ok(!locked.data.subscription.actions.includes('close'));
      assert.ok(!locked.data.subscription.actions.includes('pause'));
      assert.equal((await act(id, 'close')).status, 409);
    } finally {
      await query('UPDATE plans SET closable = 1, pausable = 1 WHERE id = ?', [ids.starter]);
    }
  });

  test('a plan that closes on its own closes subscriptions once they expire', async () => {
    const trial = await byName('plans', 'Trial daily');
    const insert = await query(
      "INSERT INTO subscriptions (customer_id, plan_id, status, start_date, expiry_date) VALUES (?, ?, 'active', '2026-10-01', '2026-10-05')",
      [ids.northwind, trial]
    );
    created.push(insert.insertId);
    const keep = await query(
      "INSERT INTO subscriptions (customer_id, plan_id, status, start_date, expiry_date) VALUES (?, ?, 'active', '2026-10-01', '2099-01-01')",
      [ids.northwind, trial]
    );
    created.push(keep.insertId);
    await closeExpiredSubscriptions();
    const rows = await query('SELECT id, status FROM subscriptions WHERE id IN (?, ?)', [insert.insertId, keep.insertId]);
    assert.equal(rows.find((r) => r.id === insert.insertId).status, 'closed');
    assert.equal(rows.find((r) => r.id === keep.insertId).status, 'active');
  });
});

describe('the customer portal', () => {
  test('a customer sees only their own subscriptions, never drafts', async () => {
    const list = await call('GET', '/api/subscriptions?pageSize=100', { cookie: customer });
    assert.equal(list.status, 200);
    assert.ok(list.data.subscriptions.length > 0);
    assert.ok(list.data.subscriptions.every((s) => s.customer_id === ids.northwind && s.status !== 'draft'));

    const staffList = await call('GET', '/api/subscriptions?pageSize=100', { cookie: staff });
    assert.ok(staffList.data.subscriptions.some((s) => s.customer_id !== ids.northwind));
  });

  test("another customer's subscription, and any draft, looks like it does not exist", async () => {
    const [other] = await query('SELECT id FROM subscriptions WHERE customer_id = ? AND status <> ? LIMIT 1', [ids.kiteId, 'draft']);
    assert.equal((await call('GET', `/api/subscriptions/${other.id}`, { cookie: customer })).status, 404);
    assert.equal((await act(other.id, 'confirm', customer)).status, 404);
    const draft = await call('POST', '/api/subscriptions', { cookie: staff, body: sub() });
    created.push(draft.data.subscription.id);
    assert.equal((await call('GET', `/api/subscriptions/${draft.data.subscription.id}`, { cookie: customer })).status, 404);
  });

  test('filters by status and paginates', async () => {
    const active = await call('GET', '/api/subscriptions?status=active&pageSize=2&page=1', { cookie: staff });
    assert.ok(active.data.subscriptions.every((s) => s.status === 'active'));
    assert.ok(active.data.subscriptions.length <= 2);
    assert.ok(active.data.total >= active.data.subscriptions.length);
    assert.equal((await call('GET', '/api/subscriptions?status=bogus', { cookie: staff })).status, 400);
  });

  test('starts from a template as a quotation, confirms it, and cannot activate it', async () => {
    const [template] = await query("SELECT id FROM quotation_templates WHERE name = 'Team starter bundle'");
    const res = await call('POST', '/api/subscriptions/from-template', { cookie: kite, body: { template_id: template.id } });
    assert.equal(res.status, 201);
    const s = res.data.subscription;
    created.push(s.id);
    assert.equal(s.status, 'quotation');
    assert.equal(s.customer_id, ids.kiteId);
    assert.equal(s.lines.length, 2);
    assert.equal(s.lines[0].unit_price, 2960);
    assert.deepEqual(s.actions, ['confirm']);

    assert.equal((await act(s.id, 'activate', kite)).status, 409);
    const confirmed = await act(s.id, 'confirm', kite);
    assert.equal(confirmed.data.subscription.status, 'confirmed');
    assert.equal((await act(s.id, 'activate', kite)).status, 409);
    assert.equal((await act(s.id, 'activate', staff)).data.subscription.status, 'active');
  });

  test('a customer can pause and resume their own active subscription when the plan allows it', async () => {
    const id = await makeActive();
    assert.equal((await act(id, 'pause', customer)).data.subscription.is_paused, true);
    assert.equal((await act(id, 'resume', customer)).data.subscription.is_paused, false);
    assert.equal((await act(id, 'pause', kite)).status, 404);
  });

  test('only customers can start from a template', async () => {
    const [template] = await query('SELECT id FROM quotation_templates LIMIT 1');
    assert.equal((await call('POST', '/api/subscriptions/from-template', { cookie: staff, body: { template_id: template.id } })).status, 403);
    assert.equal((await call('POST', '/api/subscriptions/from-template', { cookie: customer, body: { template_id: 999999 } })).status, 404);
  });
});

describe('quotation templates', () => {
  const template = (over = {}) => ({
    name: `Test template ${run}`,
    plan_id: ids.starter,
    validity_days: 21,
    lines: [{ product_id: ids.suite, variant: { attribute: 'Brand', value: 'Odoo' }, quantity: 1, tax_ids: [ids.gst] }],
    ...over,
  });
  let id;

  test('the team creates, reads, updates and deletes a template', async () => {
    const res = await call('POST', '/api/templates', { cookie: staff, body: template() });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    id = res.data.template.id;
    assert.equal(res.data.template.validity_days, 21);
    assert.deepEqual(res.data.template.lines[0].tax_ids, [ids.gst]);

    const up = await call('PUT', `/api/templates/${id}`, { cookie: admin, body: template({ validity_days: 30, lines: [{ product_id: ids.support, quantity: 2, tax_ids: [] }] }) });
    assert.equal(up.data.template.validity_days, 30);
    assert.equal(up.data.template.lines.length, 1);

    assert.equal((await call('DELETE', `/api/templates/${id}`, { cookie: staff })).status, 204);
    assert.equal((await call('GET', `/api/templates/${id}`, { cookie: staff })).status, 404);
  });

  test('validates the plan, lines and validity, and rejects duplicate names', async () => {
    const bad = await call('POST', '/api/templates', { cookie: staff, body: template({ name: '', validity_days: 0, lines: [] }) });
    assert.equal(bad.status, 400);
    assert.ok(bad.data.errors.name && bad.data.errors.validity_days && bad.data.errors.lines);
    const first = await call('POST', '/api/templates', { cookie: staff, body: template({ name: `Test dup ${run}` }) });
    assert.equal(first.status, 201);
    assert.equal((await call('POST', '/api/templates', { cookie: staff, body: template({ name: `Test dup ${run}` }) })).status, 409);
  });

  test('customers can list templates but not change them', async () => {
    const list = await call('GET', '/api/templates', { cookie: customer });
    assert.equal(list.status, 200);
    assert.ok(list.data.templates.length > 0);
    assert.equal((await call('POST', '/api/templates', { cookie: customer, body: template({ name: `Test no ${run}` }) })).status, 403);
    assert.equal((await call('GET', `/api/templates/${list.data.templates[0].id}`, { cookie: customer })).status, 403);
    assert.equal((await call('GET', '/api/templates')).status, 401);
  });
});

describe('customer list for the team', () => {
  test('the team can list customers; customers cannot', async () => {
    const res = await call('GET', '/api/customers', { cookie: staff });
    assert.equal(res.status, 200);
    assert.ok(res.data.customers.some((c) => c.id === ids.northwind));
    assert.equal((await call('GET', '/api/customers', { cookie: customer })).status, 403);
  });
});
