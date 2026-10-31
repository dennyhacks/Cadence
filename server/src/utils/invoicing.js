import { discountAmount, discountApplies, priceLine } from './pricing.js';

// Works out what one invoice says: each line, the discounts that apply, tax on what is left, and the totals.
// Pure functions: no database, so every rule here can be tested directly.

const cents = (n) => Math.round(n * 100);
const money = (c) => c / 100;

/** Days to pay, from the subscription's payment terms. */
export const TERMS_DAYS = { immediate: 0, net_15: 15, net_30: 30, net_45: 45 };

/** Splits `amount` cents across lines in proportion to `weights`, never giving a line more than its cap. */
function allocate(amount, weights, caps) {
  const total = weights.reduce((s, w) => s + w, 0);
  const shares = weights.map((w, i) => Math.min(caps[i], Math.floor((amount * w) / total)));
  let left = amount - shares.reduce((s, x) => s + x, 0);
  for (let i = shares.length - 1; i >= 0 && left > 0; i -= 1) {
    const room = Math.min(left, caps[i] - shares[i]);
    shares[i] += room;
    left -= room;
  }
  return shares;
}

/**
 * @param {object} input
 * @param {Array} input.lines  { product_id, description, quantity, unit_price, taxes: [{ name, rate }] }
 * @param {number} input.planPrice  charged once for the period, without tax or discount
 * @param {Array} input.discounts  candidate discounts (with product_ids), tried in order
 * @param {string} input.onDate  YYYY-MM-DD the invoice is dated, used for discount dates
 */
export function computeInvoice({ lines, planPrice, discounts, onDate }) {
  const when = new Date(`${onDate}T00:00:00Z`);
  const work = lines.map((l) => ({ ...l, subtotal: cents(l.unit_price) * l.quantity, off: 0 }));
  const applied = [];

  for (const d of discounts) {
    const eligible = d.applies_to === 'products' ? work.filter((l) => d.product_ids.includes(l.product_id)) : work;
    if (!eligible.length) continue;

    const original = money(eligible.reduce((s, l) => s + l.subtotal, 0));
    const quantity = eligible.reduce((s, l) => s + l.quantity, 0);
    if (!discountApplies(d, { subtotal: original, quantity, productIds: eligible.map((l) => l.product_id) }, when)) continue;

    // Each discount comes off what the earlier ones left, and never takes a line below zero.
    const remaining = eligible.map((l) => l.subtotal - l.off);
    const room = remaining.reduce((s, x) => s + x, 0);
    const off = Math.min(cents(discountAmount(d, money(room))), room);
    if (off <= 0) continue;

    allocate(off, remaining, remaining).forEach((share, i) => {
      eligible[i].off += share;
    });
    applied.push({ discount_id: d.id, name: d.name, amount: money(off) });
  }

  const priced = work.map((l) => {
    const r = priceLine({ unitPrice: l.unit_price, quantity: l.quantity, taxRates: l.taxes.map((t) => t.rate), discount: money(l.off) });
    return {
      product_id: l.product_id,
      kind: 'product',
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_amount: r.discount,
      tax_label: l.taxes.map((t) => t.name).join(', ') || null,
      tax_amount: r.tax,
      amount: r.total,
      subtotal: r.subtotal,
    };
  });

  const sum = (key) => priced.reduce((s, l) => s + cents(l[key]), 0);
  const plan = cents(planPrice);
  const untaxed = sum('subtotal') + plan;
  const discount = sum('discount_amount');
  const tax = sum('tax_amount');

  return {
    lines: priced,
    discounts: applied,
    totals: {
      untaxed: money(untaxed),
      discount: money(discount),
      tax: money(tax),
      total: money(untaxed - discount + tax),
    },
  };
}
