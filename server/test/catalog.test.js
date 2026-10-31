import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';

const run = Date.now();
let server;
let base;
let admin;
let staff;
let customer;

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
});

after(async () => {
  await query("DELETE FROM products WHERE name LIKE 'Test %'");
  await query("DELETE FROM plans WHERE name LIKE 'Test %'");
  server.close();
  await pool.end();
});

const product = (over = {}) => ({
  name: `Test product ${run}`,
  type: 'service',
  sales_price: 1000,
  cost_price: 400,
  notes: 'Note',
  variants: [{ attribute: 'Brand', value: 'Odoo', extra_price: 560 }],
  ...over,
});
const plan = (over = {}) => ({
  name: `Test plan ${run}`,
  price: 499,
  billing_period: 'monthly',
  min_quantity: 1,
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  auto_close: true,
  closable: true,
  pausable: false,
  renewable: true,
  ...over,
});

describe('access', () => {
  test('signed-out and customer requests are refused', async () => {
    assert.equal((await call('GET', '/api/products')).status, 401);
    assert.equal((await call('GET', '/api/plans')).status, 401);
    assert.equal((await call('GET', '/api/products', { cookie: customer })).status, 403);
    assert.equal((await call('POST', '/api/plans', { cookie: customer, body: plan() })).status, 403);
  });
});

describe('products', () => {
  let id;

  test('staff can create a product with variants', async () => {
    const res = await call('POST', '/api/products', { cookie: staff, body: product() });
    assert.equal(res.status, 201);
    id = res.data.product.id;
    assert.equal(res.data.product.sales_price, 1000);
    assert.deepEqual(res.data.product.variants.map((v) => [v.attribute, v.value, v.extra_price]), [['Brand', 'Odoo', 560]]);
  });

  test('rejects bad input with a message per field', async () => {
    const res = await call('POST', '/api/products', {
      cookie: admin,
      body: product({ name: '', type: 'thing', sales_price: -1, cost_price: 1.234 }),
    });
    assert.equal(res.status, 400);
    assert.ok(res.data.errors.name && res.data.errors.type && res.data.errors.sales_price && res.data.errors.cost_price);
  });

  test('rejects a repeated variant and a duplicate name', async () => {
    const v = { attribute: 'Brand', value: 'Odoo', extra_price: 1 };
    const dup = await call('POST', '/api/products', { cookie: admin, body: product({ name: `Test dup ${run}`, variants: [v, v] }) });
    assert.equal(dup.status, 400);
    assert.match(dup.data.errors.variants, /repeats/);
    const same = await call('POST', '/api/products', { cookie: admin, body: product() });
    assert.equal(same.status, 409);
  });

  test('update replaces the variants; list shows the count', async () => {
    const res = await call('PUT', `/api/products/${id}`, {
      cookie: admin,
      body: product({ sales_price: 1500, variants: [{ attribute: 'Tier', value: 'Pro', extra_price: 100 }, { attribute: 'Tier', value: 'Max', extra_price: 250 }] }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.product.sales_price, 1500);
    assert.equal(res.data.product.variants.length, 2);
    const list = await call('GET', '/api/products', { cookie: staff });
    assert.equal(list.data.products.find((p) => p.id === id).variant_count, 2);
  });

  test('missing products are 404 and delete works', async () => {
    assert.equal((await call('GET', '/api/products/999999', { cookie: admin })).status, 404);
    assert.equal((await call('GET', '/api/products/abc', { cookie: admin })).status, 404);
    assert.equal((await call('DELETE', `/api/products/${id}`, { cookie: admin })).status, 204);
    assert.equal((await call('GET', `/api/products/${id}`, { cookie: admin })).status, 404);
  });
});

describe('plans', () => {
  let id;

  test('creates a plan and returns dates as plain dates', async () => {
    const res = await call('POST', '/api/plans', { cookie: staff, body: plan() });
    assert.equal(res.status, 201);
    id = res.data.plan.id;
    assert.equal(res.data.plan.start_date, '2026-01-01');
    assert.equal(res.data.plan.end_date, '2026-12-31');
    assert.equal(res.data.plan.auto_close, true);
    assert.equal(res.data.plan.pausable, false);
  });

  test('validates period, quantity and dates', async () => {
    const bad = await call('POST', '/api/plans', {
      cookie: admin,
      body: plan({ name: `Test bad ${run}`, billing_period: 'hourly', min_quantity: 0, start_date: '2026-13-40' }),
    });
    assert.equal(bad.status, 400);
    assert.ok(bad.data.errors.billing_period && bad.data.errors.min_quantity && bad.data.errors.start_date);

    const order = await call('POST', '/api/plans', { cookie: admin, body: plan({ name: `Test order ${run}`, end_date: '2025-12-31' }) });
    assert.match(order.data.errors.end_date, /before the start date/);

    const noEnd = await call('POST', '/api/plans', { cookie: admin, body: plan({ name: `Test noend ${run}`, end_date: null, auto_close: true }) });
    assert.match(noEnd.data.errors.end_date, /end date/);
  });

  test('rejects a duplicate name, updates, and deletes', async () => {
    assert.equal((await call('POST', '/api/plans', { cookie: admin, body: plan() })).status, 409);
    const up = await call('PUT', `/api/plans/${id}`, { cookie: admin, body: plan({ billing_period: 'yearly', pausable: true }) });
    assert.equal(up.data.plan.billing_period, 'yearly');
    assert.equal(up.data.plan.pausable, true);
    assert.equal((await call('DELETE', `/api/plans/${id}`, { cookie: admin })).status, 204);
    assert.equal((await call('GET', `/api/plans/${id}`, { cookie: admin })).status, 404);
  });
});
