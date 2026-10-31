import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { razorpayApi, signatureFor } from '../src/utils/razorpay.js';

let server;
let base;
let customer;
let other;
let invoice;
let original;

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

const realApi = { ...razorpayApi };
const orders = new Map();
let paymentStatus = 'captured';

before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  customer = await login('customer@cadence.test', 'Customer@12345');
  other = await login('kite@cadence.test', 'Customer@12345');

  [invoice] = await query(
    `SELECT i.id, i.total, i.amount_paid, i.status FROM invoices i JOIN users u ON u.id = i.customer_id
      WHERE u.email = 'customer@cadence.test' AND i.status = 'confirmed' AND i.total - i.amount_paid > 100 ORDER BY i.id LIMIT 1`
  );
  assert.ok(invoice, 'the demo customer has an invoice with money owed');
  original = { ...invoice };

  // Stand-ins for Razorpay's own servers.
  razorpayApi.createOrder = async (o) => {
    const order = { id: `order_T${orders.size + 1}`, amount: o.amount, currency: o.currency, notes: o.notes, status: 'created' };
    orders.set(order.id, order);
    return order;
  };
  razorpayApi.fetchOrder = async (id) => orders.get(id);
  razorpayApi.fetchPayment = async (id) => ({ id, order_id: [...orders.keys()].find((k) => id.endsWith(k.slice(-2))) ?? 'order_T1', status: paymentStatus, method: 'upi' });
});

after(async () => {
  Object.assign(razorpayApi, realApi);
  config.razorpay.keyId = '';
  config.razorpay.keySecret = '';
  await query('DELETE FROM payments WHERE invoice_id = ? AND note LIKE ?', [invoice.id, 'Razorpay %']);
  await query('UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?', [original.amount_paid, original.status, invoice.id]);
  server.close();
  await pool.end();
});

describe('Razorpay payments', () => {
  test('say so plainly when Razorpay is not set up', async () => {
    config.razorpay.keyId = '';
    config.razorpay.keySecret = '';
    const detail = await call('GET', `/api/invoices/${invoice.id}`, { cookie: customer });
    assert.equal(detail.data.invoice.razorpay_enabled, false);
    const res = await call('POST', `/api/invoices/${invoice.id}/razorpay/order`, { cookie: customer, body: {} });
    assert.equal(res.status, 503);
  });

  describe('when it is set up', () => {
    before(() => {
      config.razorpay.keyId = 'rzp_test_unit';
      config.razorpay.keySecret = 'unit-test-secret';
    });

    test('creates an order in paise for the amount still owed, and never for more', async () => {
      const detail = (await call('GET', `/api/invoices/${invoice.id}`, { cookie: customer })).data.invoice;
      assert.equal(detail.razorpay_enabled, true);

      const full = await call('POST', `/api/invoices/${invoice.id}/razorpay/order`, { cookie: customer, body: {} });
      assert.equal(full.status, 201);
      assert.equal(full.data.amount, Math.round(detail.outstanding * 100));
      assert.equal(full.data.currency, 'INR');
      assert.equal(full.data.key_id, 'rzp_test_unit');
      assert.equal(JSON.stringify(full.data).includes('unit-test-secret'), false, 'the secret never leaves the server');

      const part = await call('POST', `/api/invoices/${invoice.id}/razorpay/order`, { cookie: customer, body: { amount: 50 } });
      assert.equal(part.data.amount, 5000);

      const tooMuch = await call('POST', `/api/invoices/${invoice.id}/razorpay/order`, { cookie: customer, body: { amount: detail.outstanding + 1 } });
      assert.equal(tooMuch.status, 400);
      assert.ok(tooMuch.data.errors.amount);
    });

    test("another customer cannot start or verify a payment on this invoice", async () => {
      assert.equal((await call('POST', `/api/invoices/${invoice.id}/razorpay/order`, { cookie: other, body: {} })).status, 404);
      assert.equal((await call('POST', `/api/invoices/${invoice.id}/razorpay/verify`, { cookie: other, body: { razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 's' } })).status, 404);
      assert.equal((await call('POST', `/api/invoices/${invoice.id}/razorpay/order`, { body: {} })).status, 401);
    });

    test('records nothing when the signature is wrong or the fields are missing', async () => {
      const order = await call('POST', `/api/invoices/${invoice.id}/razorpay/order`, { cookie: customer, body: { amount: 10 } });
      const bad = await call('POST', `/api/invoices/${invoice.id}/razorpay/verify`, {
        cookie: customer,
        body: { razorpay_order_id: order.data.order_id, razorpay_payment_id: 'pay_AA', razorpay_signature: 'f'.repeat(64) },
      });
      assert.equal(bad.status, 400);
      assert.equal((await call('POST', `/api/invoices/${invoice.id}/razorpay/verify`, { cookie: customer, body: {} })).status, 400);
      const [{ n }] = await query('SELECT COUNT(*) AS n FROM payments WHERE invoice_id = ? AND note LIKE ?', [invoice.id, 'Razorpay %']);
      assert.equal(Number(n), 0);
    });

    test('records a verified payment once, using the amount from Razorpay', async () => {
      const order = await call('POST', `/api/invoices/${invoice.id}/razorpay/order`, { cookie: customer, body: { amount: 25.5 } });
      const paymentId = `pay_${order.data.order_id.slice(-2)}`;
      const body = {
        razorpay_order_id: order.data.order_id,
        razorpay_payment_id: paymentId,
        razorpay_signature: signatureFor(order.data.order_id, paymentId),
      };
      const before = (await call('GET', `/api/invoices/${invoice.id}`, { cookie: customer })).data.invoice;

      const first = await call('POST', `/api/invoices/${invoice.id}/razorpay/verify`, { cookie: customer, body });
      assert.equal(first.status, 201);
      assert.equal(Math.round((first.data.invoice.amount_paid - before.amount_paid) * 100), 2550);
      const added = first.data.invoice.payments.at(-1);
      assert.equal(added.method, 'upi');
      assert.match(added.note, /^Razorpay pay_/);

      // Sending the same confirmation again changes nothing.
      const again = await call('POST', `/api/invoices/${invoice.id}/razorpay/verify`, { cookie: customer, body });
      assert.equal(again.data.invoice.amount_paid, first.data.invoice.amount_paid);
    });

    test('records nothing while Razorpay has not captured the payment', async () => {
      const order = await call('POST', `/api/invoices/${invoice.id}/razorpay/order`, { cookie: customer, body: { amount: 12 } });
      const paymentId = `pay_${order.data.order_id.slice(-2)}x`;
      paymentStatus = 'failed';
      try {
        const res = await call('POST', `/api/invoices/${invoice.id}/razorpay/verify`, {
          cookie: customer,
          body: { razorpay_order_id: order.data.order_id, razorpay_payment_id: paymentId, razorpay_signature: signatureFor(order.data.order_id, paymentId) },
        });
        assert.equal(res.status, 402);
      } finally {
        paymentStatus = 'captured';
      }
    });
  });
});
