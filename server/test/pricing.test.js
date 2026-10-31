import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { discountAmount, discountApplies, discountStatus, priceLine } from '../src/utils/pricing.js';

const now = new Date('2026-06-15T10:00:00Z');
const base = { type: 'percentage', value: 10, min_purchase: null, min_quantity: null, start_date: '2026-01-01', end_date: null, usage_limit: null, times_used: 0, applies_to: 'subscription', product_ids: [] };

describe('discount status', () => {
  test('active, upcoming, expired and used up', () => {
    assert.equal(discountStatus(base, now), 'active');
    assert.equal(discountStatus({ ...base, start_date: '2026-07-01' }, now), 'upcoming');
    assert.equal(discountStatus({ ...base, end_date: '2026-06-14' }, now), 'expired');
    assert.equal(discountStatus({ ...base, end_date: '2026-06-15' }, now), 'active'); // the end date itself still counts
    assert.equal(discountStatus({ ...base, usage_limit: 5, times_used: 5 }, now), 'used_up');
    assert.equal(discountStatus({ ...base, usage_limit: 5, times_used: 4 }, now), 'active');
  });
});

describe('when a discount applies', () => {
  const order = { subtotal: 1000, quantity: 2, productIds: [7] };

  test('needs the minimum purchase and quantity', () => {
    assert.equal(discountApplies({ ...base, min_purchase: 1000 }, order, now), true);
    assert.equal(discountApplies({ ...base, min_purchase: 1000.01 }, order, now), false);
    assert.equal(discountApplies({ ...base, min_quantity: 2 }, order, now), true);
    assert.equal(discountApplies({ ...base, min_quantity: 3 }, order, now), false);
  });

  test('a product discount needs one of its products', () => {
    const d = { ...base, applies_to: 'products', product_ids: [7, 8] };
    assert.equal(discountApplies(d, order, now), true);
    assert.equal(discountApplies(d, { ...order, productIds: [9] }, now), false);
  });

  test('never applies once expired or used up', () => {
    assert.equal(discountApplies({ ...base, end_date: '2026-06-01' }, order, now), false);
    assert.equal(discountApplies({ ...base, usage_limit: 1, times_used: 1 }, order, now), false);
  });
});

describe('amounts', () => {
  test('percentage and fixed discounts, never more than the amount', () => {
    assert.equal(discountAmount(base, 999.99), 100);
    assert.equal(discountAmount({ ...base, type: 'fixed', value: 250 }, 1000), 250);
    assert.equal(discountAmount({ ...base, type: 'fixed', value: 250 }, 100), 100);
  });

  test('prices a line with discount and tax on what is left', () => {
    assert.deepEqual(priceLine({ unitPrice: 2400, quantity: 2, taxRates: [18], discount: 480 }), {
      subtotal: 4800, discount: 480, taxable: 4320, tax: 777.6, total: 5097.6,
    });
  });

  test('stacks several taxes and works in whole cents', () => {
    const r = priceLine({ unitPrice: 0.1, quantity: 3, taxRates: [9, 9] });
    assert.equal(r.subtotal, 0.3);
    assert.equal(r.total, 0.36); // 0.30 + 0.03 + 0.03, with no floating point drift
  });

  test('a discount larger than the line leaves nothing to pay', () => {
    assert.equal(priceLine({ unitPrice: 100, quantity: 1, taxRates: [18], discount: 500 }).total, 0);
  });
});
