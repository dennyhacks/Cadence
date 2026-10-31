import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';

// The brief asks for every page to answer in under two seconds with thousands of subscriptions.
// These checks need the large data set (`npm run db:seed:volume`) and are skipped without it.

const LIMIT_MS = 2000;
let server;
let base;
let staff;
let volumeCustomer;
let big = false;
let ids = {};

async function call(path, cookie, method = 'GET') {
  const started = performance.now();
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: method === 'POST' ? '{}' : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, ms: Math.round(performance.now() - started) };
}
async function login(email, password) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return res.headers.get('set-cookie').split(';')[0];
}

before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM subscriptions');
  big = n >= 2000;
  if (!big) return;
  staff = await login('staff@cadence.test', 'Staff@12345');
  volumeCustomer = await login('vol.1@cadence.test', 'Customer@12345');
  const [sub] = await query('SELECT MAX(id) AS id FROM subscriptions');
  const [inv] = await query('SELECT MAX(id) AS id FROM invoices');
  const [plan] = await query('SELECT id FROM plans ORDER BY id LIMIT 1');
  ids = { sub: sub.id, inv: inv.id, plan: plan.id };
});

after(async () => {
  server.close();
  await pool.end();
});

describe('speed with thousands of subscriptions', () => {
  const pages = (get) => [
    ['finance dashboard, last 12 months', () => `/api/dashboard`],
    ['finance dashboard, 5 years', () => `/api/dashboard?from=2021-11-01&to=2026-10-31`],
    ['finance dashboard, one plan', () => `/api/dashboard?plan_id=${get().plan}`],
    ['subscription list, first page', () => '/api/subscriptions'],
    ['subscription list, page 200', () => '/api/subscriptions?page=200&pageSize=20'],
    ['subscription list, active only', () => '/api/subscriptions?status=active&page=30'],
    ['subscription list, closed only', () => '/api/subscriptions?status=closed'],
    ['one subscription', () => `/api/subscriptions/${get().sub}`],
    ['invoice list, first page with totals', () => '/api/invoices'],
    ['invoice list, overdue', () => '/api/invoices?status=overdue'],
    ['invoice list, paid, page 500', () => '/api/invoices?status=paid&page=500&pageSize=20'],
    ['invoices of one subscription', () => `/api/invoices?subscription_id=${get().sub}`],
    ['one invoice', () => `/api/invoices/${get().inv}`],
    ['payment list, first page', () => '/api/payments'],
    ['payment list, page 1000', () => '/api/payments?page=1000&pageSize=20'],
    ['customers for the picker', () => '/api/customers'],
  ];

  for (const [name, path] of pages(() => ids)) {
    test(`${name} answers in under two seconds`, async (t) => {
      if (!big) return t.skip('load the large data set first: npm run db:seed:volume');
      const r = await call(path(), staff);
      console.log(`      ${String(r.ms).padStart(5)} ms  ${name}`);
      assert.equal(r.status, 200);
      assert.ok(r.ms < LIMIT_MS, `${name} took ${r.ms} ms`);
    });
  }

  test('a customer with many subscriptions sees their lists quickly', async (t) => {
    if (!big) return t.skip('load the large data set first: npm run db:seed:volume');
    for (const path of ['/api/subscriptions', '/api/invoices', '/api/invoices?status=paid']) {
      const r = await call(path, volumeCustomer);
      console.log(`      ${String(r.ms).padStart(5)} ms  customer ${path}`);
      assert.equal(r.status, 200);
      assert.ok(r.ms < LIMIT_MS, `${path} took ${r.ms} ms`);
    }
  });

  test('the Generate due invoices job checks thousands of subscriptions quickly', async (t) => {
    if (!big) return t.skip('load the large data set first: npm run db:seed:volume');
    const r = await call('/api/invoices/generate', staff, 'POST');
    console.log(`      ${String(r.ms).padStart(5)} ms  generate due invoices (created ${r.data?.created})`);
    assert.equal(r.status, 200);
    assert.ok(r.ms < LIMIT_MS, `generate took ${r.ms} ms`);
  });
});
