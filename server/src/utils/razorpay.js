import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from './errors.js';

const API = 'https://api.razorpay.com/v1';

export const razorpayEnabled = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);

/** The signature Razorpay Checkout returns: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function signatureFor(orderId, paymentId, secret = config.razorpay.keySecret) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

export function signatureValid(orderId, paymentId, signature) {
  const expected = Buffer.from(signatureFor(orderId, paymentId));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

async function call(method, path, body) {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, ...(body && { 'Content-Type': 'application/json' }) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, 'Razorpay could not be reached. Try again in a moment.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error('Razorpay error:', res.status, data?.error?.description);
    throw new HttpError(502, 'Razorpay did not accept the request. Try again, or pay another way.');
  }
  return data;
}

// Kept in one object so tests can swap it for a stand-in.
export const razorpayApi = {
  createOrder: (order) => call('POST', '/orders', order),
  fetchOrder: (id) => call('GET', `/orders/${encodeURIComponent(id)}`),
  fetchPayment: (id) => call('GET', `/payments/${encodeURIComponent(id)}`),
};
