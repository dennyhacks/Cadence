import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { sendOverdueReminders } from '../src/services/billing.js';
import { outbox } from '../src/utils/mailer.js';

let server;
let base;
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
  staff = await login('staff@cadence.test', 'Staff@12345');
  customer = await login('customer@cadence.test', 'Customer@12345');
});

after(async () => {
  server.close();
  await pool.end();
});

describe('recurring revenue on the dashboard', () => {
  test('reports monthly revenue, yearly run rate, churn and a three month forecast', async () => {
    const { status, data } = await call('GET', '/api/dashboard', { cookie: staff });
    assert.equal(status, 200);
    const r = data.recurring;
    assert.ok(r.mrr > 0);
    assert.equal(r.arr, Math.round(r.mrr * 12 * 100) / 100);
    assert.equal(r.forecast.length, 3);
    assert.ok(r.forecast.every((m) => m.amount === r.mrr));
    assert.ok(r.churn_rate >= 0 && r.churn_rate <= 100);
  });
});

describe('search', () => {
  test('finds subscriptions, invoices, products and plans', async () => {
    const [sub] = await query("SELECT number FROM subscriptions WHERE number IS NOT NULL ORDER BY id LIMIT 1");
    const bySub = await call('GET', `/api/search?q=${sub.number}`, { cookie: staff });
    assert.equal(bySub.status, 200);
    assert.ok(bySub.data.results.some((r) => r.type === 'Subscription' && r.label === sub.number));

    const byCustomer = await call('GET', '/api/search?q=northwind', { cookie: staff });
    assert.ok(byCustomer.data.results.some((r) => r.type === 'Invoice' || r.type === 'Subscription'));
  });

  test('returns nothing for one character or for text that is not a wildcard match', async () => {
    assert.deepEqual((await call('GET', '/api/search?q=a', { cookie: staff })).data.results, []);
    assert.deepEqual((await call('GET', '/api/search?q=%25', { cookie: staff })).data.results, []);
  });

  test('is for the team only', async () => {
    assert.equal((await call('GET', '/api/search?q=sub', { cookie: customer })).status, 403);
    assert.equal((await call('GET', '/api/search?q=sub')).status, 401);
  });
});

describe('automatic overdue reminders', () => {
  test('sends one reminder, then waits a week, and skips undeliverable addresses', async () => {
    const [inv] = await query("SELECT id, customer_email FROM invoices WHERE status = 'confirmed' AND due_date < CURDATE() ORDER BY id LIMIT 1");
    assert.ok(inv, 'the demo data has an overdue invoice');
    try {
      await query("UPDATE invoices SET reminded_at = NULL WHERE id = ?", [inv.id]);

      // .test addresses are skipped.
      const skippedBefore = outbox.length;
      await sendOverdueReminders();
      assert.equal(outbox.filter((m) => m.kind === 'reminder').length, outbox.slice(0, skippedBefore).filter((m) => m.kind === 'reminder').length);

      await query("UPDATE invoices SET customer_email = 'payer@example.com' WHERE id = ?", [inv.id]);
      const first = await sendOverdueReminders();
      assert.equal(first, 1);
      assert.equal(outbox.at(-1).to, 'payer@example.com');
      assert.equal(outbox.at(-1).kind, 'reminder');

      assert.equal(await sendOverdueReminders(), 0, 'not again within a week');

      await query("UPDATE invoices SET reminded_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 8 DAY) WHERE id = ?", [inv.id]);
      assert.equal(await sendOverdueReminders(), 1, 'again after a week');
    } finally {
      await query("UPDATE invoices SET customer_email = ?, reminded_at = NULL WHERE id = ?", [inv.customer_email, inv.id]);
    }
  });
});
