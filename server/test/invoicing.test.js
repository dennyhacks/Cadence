import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computeInvoice } from '../src/utils/invoicing.js';

const gst = { name: 'GST 18%', rate: 18 };
const line = (over = {}) => ({ product_id: 1, description: 'Suite', quantity: 2, unit_price: 2960, taxes: [gst], ...over });
const disc = (over = {}) => ({
  id: 1, name: 'Ten off', type: 'percentage', value: 10, min_purchase: null, min_quantity: null, start_date: '2026-01-01',
  end_date: null, usage_limit: null, times_used: 0, applies_to: 'subscription', product_ids: [], ...over,
});
const base = { lines: [line()], planPrice: 499, discounts: [], onDate: '2026-06-15' };

describe('invoice amounts', () => {
  test('lines, tax and the untaxed plan price, with no discount', () => {
    const r = computeInvoice(base);
    assert.deepEqual(r.totals, { untaxed: 6419, discount: 0, tax: 1065.6, total: 7484.6 });
    assert.equal(r.lines[0].amount, 6985.6);
  });

  test('a discount comes off before tax, and never off the plan price', () => {
    const r = computeInvoice({ ...base, discounts: [disc()] });
    assert.equal(r.totals.discount, 592); // 10% of 5920
    assert.equal(r.totals.tax, 959.04); // 18% of 5328
    assert.equal(r.totals.total, 6786.04); // 6419 - 592 + 959.04
    assert.deepEqual(r.discounts, [{ discount_id: 1, name: 'Ten off', amount: 592 }]);
  });

  test('discounts stack, each on what the last left', () => {
    const r = computeInvoice({ ...base, discounts: [disc(), disc({ id: 2, name: 'Fixed', type: 'fixed', value: 500 })] });
    assert.equal(r.totals.discount, 1092); // 592, then 500 off the remaining 5328
    assert.equal(r.discounts.length, 2);
  });

  test('a product discount only touches its products and is split across them', () => {
    const lines = [line({ product_id: 1, unit_price: 1000, quantity: 1 }), line({ product_id: 2, description: 'Other', unit_price: 3000, quantity: 1 })];
    const r = computeInvoice({ ...base, lines, discounts: [disc({ applies_to: 'products', product_ids: [2], type: 'fixed', value: 300 })] });
    assert.equal(r.lines[0].discount_amount, 0);
    assert.equal(r.lines[1].discount_amount, 300);
    const both = computeInvoice({ ...base, lines, discounts: [disc({ applies_to: 'products', product_ids: [1, 2], type: 'fixed', value: 100 })] });
    assert.equal(both.lines[0].discount_amount + both.lines[1].discount_amount, 100); // pro rata, no cents lost
    assert.equal(both.lines[0].discount_amount, 25);
  });

  test('respects minimums, dates and usage limits', () => {
    const none = (d) => computeInvoice({ ...base, discounts: [disc(d)] }).totals.discount;
    assert.equal(none({ min_purchase: 6000 }), 0);
    assert.equal(none({ min_quantity: 3 }), 0);
    assert.equal(none({ start_date: '2026-07-01' }), 0);
    assert.equal(none({ end_date: '2026-06-14' }), 0);
    assert.equal(none({ usage_limit: 5, times_used: 5 }), 0);
    assert.equal(none({ min_purchase: 5920, min_quantity: 2 }), 592);
    assert.equal(none({ applies_to: 'products', product_ids: [99] }), 0);
  });

  test('a fixed discount larger than the lines cannot make the invoice negative', () => {
    const r = computeInvoice({ ...base, discounts: [disc({ type: 'fixed', value: 99999 })] });
    assert.equal(r.totals.discount, 5920);
    assert.equal(r.totals.tax, 0);
    assert.equal(r.totals.total, 499); // only the plan price is left
  });

  test('prices are exact to the cent', () => {
    const r = computeInvoice({ ...base, lines: [line({ unit_price: 0.1, quantity: 3 })], planPrice: 0, discounts: [disc({ value: 33.33 })] });
    assert.equal(r.totals.discount, 0.1);
    assert.equal(r.totals.untaxed, 0.3);
  });
});
