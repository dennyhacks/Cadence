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
  await query("DELETE FROM taxes WHERE name LIKE 'Test %'");
  await query("DELETE FROM discounts WHERE name LIKE 'Test %'");
  server.close();
  await pool.end();
});

const discount = (over = {}) => ({
  name: `Test discount ${run}`,
  type: 'percentage',
  value: 10,
  min_purchase: 500,
  min_quantity: null,
  start_date: '2026-01-01',
  end_date: '2027-01-01',
  usage_limit: 5,
  applies_to: 'subscription',
  product_ids: [],
  ...over,
});

describe('taxes', () => {
  let id;

  test('staff can read taxes but only the admin can change them', async () => {
    assert.equal((await call('GET', '/api/taxes')).status, 401);
    assert.equal((await call('GET', '/api/taxes', { cookie: customer })).status, 403);
    assert.equal((await call('GET', '/api/taxes', { cookie: staff })).status, 200);
    assert.equal((await call('POST', '/api/taxes', { cookie: staff, body: { name: `Test staff ${run}`, rate: 5 } })).status, 403);
  });

  test('the admin creates, updates and deletes a tax', async () => {
    const res = await call('POST', '/api/taxes', { cookie: admin, body: { name: `Test tax ${run}`, rate: 12.5 } });
    assert.equal(res.status, 201);
    id = res.data.tax.id;
    assert.equal(res.data.tax.rate, 12.5);
    const up = await call('PUT', `/api/taxes/${id}`, { cookie: admin, body: { name: `Test tax ${run}`, rate: 18 } });
    assert.equal(up.data.tax.rate, 18);
    assert.equal((await call('DELETE', `/api/taxes/${id}`, { cookie: admin })).status, 204);
    assert.equal((await call('GET', `/api/taxes/${id}`, { cookie: admin })).status, 404);
  });

  test('rejects bad rates and duplicate names', async () => {
    for (const rate of [-1, 100.01, 5.123, 'ten']) {
      const res = await call('POST', '/api/taxes', { cookie: admin, body: { name: `Test bad ${run}`, rate } });
      assert.equal(res.status, 400, String(rate));
      assert.ok(res.data.errors.rate);
    }
    const first = await call('POST', '/api/taxes', { cookie: admin, body: { name: `Test dup ${run}`, rate: 5 } });
    assert.equal(first.status, 201);
    assert.equal((await call('POST', '/api/taxes', { cookie: admin, body: { name: `Test dup ${run}`, rate: 6 } })).status, 409);
  });
});

describe('discounts', () => {
  let id;
  let productId;

  before(async () => {
    const list = await call('GET', '/api/products', { cookie: admin });
    productId = list.data.products[0].id;
  });

  test('only the admin can touch discounts', async () => {
    assert.equal((await call('GET', '/api/discounts')).status, 401);
    assert.equal((await call('GET', '/api/discounts', { cookie: staff })).status, 403);
    assert.equal((await call('POST', '/api/discounts', { cookie: staff, body: discount() })).status, 403);
    assert.equal((await call('GET', '/api/discounts', { cookie: customer })).status, 403);
  });

  test('creates a whole-subscription discount with its status', async () => {
    const res = await call('POST', '/api/discounts', { cookie: admin, body: discount() });
    assert.equal(res.status, 201);
    id = res.data.discount.id;
    assert.equal(res.data.discount.status, 'active');
    assert.equal(res.data.discount.times_used, 0);
    assert.equal(res.data.discount.min_purchase, 500);
    assert.equal(res.data.discount.start_date, '2026-01-01');
  });

  test('a product discount stores its products; switching to subscription clears them', async () => {
    const body = discount({ applies_to: 'products', product_ids: [productId] });
    const up = await call('PUT', `/api/discounts/${id}`, { cookie: admin, body });
    assert.deepEqual(up.data.discount.product_ids, [productId]);
    const back = await call('PUT', `/api/discounts/${id}`, { cookie: admin, body: discount() });
    assert.deepEqual(back.data.discount.product_ids, []);
  });

  test('validates value, dates, limit and products', async () => {
    const bad = await call('POST', '/api/discounts', {
      cookie: admin,
      body: discount({ name: `Test bad ${run}`, value: 150, end_date: '2025-01-01', usage_limit: 0, applies_to: 'products', product_ids: [] }),
    });
    assert.equal(bad.status, 400);
    assert.match(bad.data.errors.value, /more than 100/);
    assert.match(bad.data.errors.end_date, /before the start date/);
    assert.ok(bad.data.errors.usage_limit);
    assert.match(bad.data.errors.product_ids, /at least one/);

    const zero = await call('POST', '/api/discounts', { cookie: admin, body: discount({ name: `Test zero ${run}`, value: 0 }) });
    assert.match(zero.data.errors.value, /more than 0/);

    const ghost = await call('POST', '/api/discounts', {
      cookie: admin,
      body: discount({ name: `Test ghost ${run}`, applies_to: 'products', product_ids: [999999] }),
    });
    assert.equal(ghost.status, 400);
    assert.ok(ghost.data.errors.product_ids);

    assert.equal((await call('POST', '/api/discounts', { cookie: admin, body: discount() })).status, 409);
  });

  test('reports expired, used up and upcoming discounts', async () => {
    const list = await call('GET', '/api/discounts', { cookie: admin });
    const status = (name) => list.data.discounts.find((d) => d.name === name).status;
    assert.equal(status('Summer sale'), 'expired');
    assert.equal(status('Launch week'), 'used_up');
    assert.equal(status('Festive offer'), 'upcoming');
    assert.equal(status('Welcome 10%'), 'active');
  });

  test('deletes a discount', async () => {
    assert.equal((await call('DELETE', `/api/discounts/${id}`, { cookie: admin })).status, 204);
    assert.equal((await call('GET', `/api/discounts/${id}`, { cookie: admin })).status, 404);
  });
});
