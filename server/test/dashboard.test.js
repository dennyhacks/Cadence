import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { addMonths } from '../src/services/subscriptions.js';
import { today } from '../src/utils/pricing.js';

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
const dash = (qs = '', cookie = staff) => call('GET', `/api/dashboard${qs}`, { cookie });
const n = (v) => Number(v ?? 0);

before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await login('admin@cadence.test', 'Admin@12345');
  staff = await login('staff@cadence.test', 'Staff@12345');
  customer = await login('customer@cadence.test', 'Customer@12345');
});

after(async () => {
  server.close();
  await pool.end();
});

describe('access', () => {
  test('only the team can open the dashboard', async () => {
    assert.equal((await call('GET', '/api/dashboard')).status, 401);
    assert.equal((await dash('', customer)).status, 403);
    assert.equal((await dash('', staff)).status, 200);
    assert.equal((await dash('', admin)).status, 200);
  });
});

describe('the numbers', () => {
  test('default to the last 12 months with one row per month, in order', async () => {
    const { data } = await dash();
    const end = today();
    assert.equal(data.filters.to, end);
    assert.equal(data.months.length, 12);
    assert.equal(data.months.at(-1).month, end.slice(0, 7));
    assert.deepEqual(data.months.map((m) => m.month), [...data.months.map((m) => m.month)].sort());
    assert.equal(data.filters.from, `${addMonths(`${end.slice(0, 7)}-01`, -11).slice(0, 7)}-01`);
  });

  test('match what the database holds', async () => {
    const { data } = await dash('?from=2026-01-01&to=2026-12-31');
    const [inv] = await query(
      "SELECT COALESCE(SUM(total), 0) AS v, COUNT(*) AS c FROM invoices WHERE status IN ('confirmed', 'paid') AND invoice_date BETWEEN '2026-01-01' AND '2026-12-31'"
    );
    const [pay] = await query("SELECT COALESCE(SUM(amount), 0) AS v FROM payments WHERE paid_on BETWEEN '2026-01-01' AND '2026-12-31'");
    const [owed] = await query(
      "SELECT COALESCE(SUM(total - amount_paid), 0) AS o FROM invoices WHERE status = 'confirmed'"
    );
    const [late] = await query(
      "SELECT COALESCE(SUM(total - amount_paid), 0) AS v, COUNT(*) AS c FROM invoices WHERE status = 'confirmed' AND due_date < ?",
      [today()]
    );
    assert.equal(data.revenue.invoiced, n(inv.v));
    assert.equal(data.revenue.invoice_count, n(inv.c));
    assert.equal(data.revenue.collected, n(pay.v));
    assert.equal(data.revenue.outstanding, n(owed.o));
    assert.equal(data.revenue.overdue, n(late.v));
    assert.equal(data.revenue.overdue_count, n(late.c));
    assert.equal(data.months.reduce((s, m) => s + m.invoiced, 0).toFixed(2), n(inv.v).toFixed(2));
    assert.ok(data.revenue.invoiced > 0 && data.revenue.collected > 0);
  });

  test('count subscriptions by status, with paused ones apart', async () => {
    const { data } = await dash();
    const rows = await query('SELECT status, is_paused, COUNT(*) AS c FROM subscriptions GROUP BY status, is_paused');
    const count = (status, paused) => n(rows.find((r) => r.status === status && !!r.is_paused === paused)?.c);
    assert.equal(data.subscriptions.active, count('active', false));
    assert.equal(data.subscriptions.paused, count('active', true));
    assert.equal(data.subscriptions.by_status.active, count('active', false) + count('active', true));
    assert.equal(data.subscriptions.by_status.closed, count('closed', false));
    assert.equal(Object.values(data.subscriptions.by_status).reduce((a, b) => a + b, 0), n((await query('SELECT COUNT(*) AS c FROM subscriptions'))[0].c));
  });

  test('list the oldest overdue invoices and the newest payments', async () => {
    const { data } = await dash('?from=2026-01-01&to=2026-12-31');
    assert.ok(data.overdue_invoices.length > 0 && data.overdue_invoices.length <= 5);
    const dates = data.overdue_invoices.map((i) => i.due_date);
    assert.deepEqual(dates, [...dates].sort());
    assert.ok(data.overdue_invoices.every((i) => i.due_date < today() && i.outstanding > 0));
    const paid = data.recent_payments.map((p) => p.paid_on);
    assert.deepEqual(paid, [...paid].sort().reverse());
  });

  test('agree with the invoice list on overdue totals', async () => {
    const { data } = await dash();
    const list = await call('GET', '/api/invoices?status=overdue', { cookie: staff });
    assert.equal(data.revenue.overdue, list.data.summary.overdue);
    assert.equal(data.revenue.overdue_count, list.data.summary.overdue_count);
  });
});

describe('filters', () => {
  test('a plan narrows everything to that plan', async () => {
    const all = (await dash('?from=2026-01-01&to=2026-12-31')).data;
    const [starter] = await query("SELECT id FROM plans WHERE name = 'Starter monthly'");
    const one = (await dash(`?from=2026-01-01&to=2026-12-31&plan_id=${starter.id}`)).data;
    assert.equal(one.by_plan.length, 1);
    assert.equal(one.by_plan[0].name, 'Starter monthly');
    assert.ok(one.revenue.invoiced > 0 && one.revenue.invoiced < all.revenue.invoiced);
    assert.equal(one.revenue.invoiced, one.by_plan[0].invoiced);
    assert.equal(one.filters.plan_id, starter.id);
    const [{ v }] = await query(
      "SELECT COALESCE(SUM(i.total), 0) AS v FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id WHERE s.plan_id = ? AND i.status IN ('confirmed','paid') AND i.invoice_date BETWEEN '2026-01-01' AND '2026-12-31'",
      [starter.id]
    );
    assert.equal(one.revenue.invoiced, n(v));
  });

  test('the plan breakdown adds up to the totals', async () => {
    const { data } = await dash('?from=2026-01-01&to=2026-12-31');
    assert.equal(data.by_plan.reduce((s, p) => s + p.invoiced, 0).toFixed(2), data.revenue.invoiced.toFixed(2));
    assert.equal(data.by_plan.reduce((s, p) => s + p.active, 0), data.subscriptions.active);
  });

  test('a range with no activity returns zeros, not an error', async () => {
    const { status, data } = await dash('?from=2020-01-01&to=2020-03-31');
    assert.equal(status, 200);
    assert.equal(data.months.length, 3);
    assert.equal(data.revenue.invoiced, 0);
    assert.equal(data.revenue.collected, 0);
  });

  test('rejects bad dates, backwards ranges, huge ranges and unknown plans', async () => {
    assert.equal((await dash('?from=yesterday')).status, 400);
    assert.match((await dash('?from=2026-06-01&to=2026-01-01')).data.errors.from, /after the end date/);
    assert.match((await dash('?from=2000-01-01&to=2026-01-01')).data.errors.from, /5 years or less/);
    assert.ok((await dash('?plan_id=abc')).data.errors.plan_id);
    assert.ok((await dash('?plan_id=999999')).data.errors.plan_id);
    assert.ok((await dash('?plan_id=-3')).data.errors.plan_id);
  });
});
