// Money maths shared by subscriptions and invoices. Everything is done in whole cents
// so totals never drift by a fraction.

const toCents = (n) => Math.round(n * 100);
const fromCents = (c) => c / 100;

/** The current day as YYYY-MM-DD in UTC, the same way dates are stored. */
export const today = (now = new Date()) => now.toISOString().slice(0, 10);

/** 'upcoming', 'active', 'expired' or 'used_up' for a discount row. */
export function discountStatus(d, now = new Date()) {
  const day = today(now);
  if (d.usage_limit != null && d.times_used >= d.usage_limit) return 'used_up';
  if (d.end_date && day > d.end_date) return 'expired';
  if (day < d.start_date) return 'upcoming';
  return 'active';
}

/**
 * Whether a discount can be applied to something being billed.
 * `subtotal` is the amount before discount, `quantity` the units billed and
 * `productIds` the products involved (a whole-subscription discount ignores them).
 */
export function discountApplies(d, { subtotal, quantity, productIds = [] }, now = new Date()) {
  if (discountStatus(d, now) !== 'active') return false;
  if (d.min_purchase != null && subtotal < Number(d.min_purchase)) return false;
  if (d.min_quantity != null && quantity < d.min_quantity) return false;
  if (d.applies_to === 'products') {
    const wanted = new Set(d.product_ids ?? []);
    return productIds.some((id) => wanted.has(id));
  }
  return true;
}

/** How much a discount takes off `amount`. It never takes off more than the amount. */
export function discountAmount(d, amount) {
  const cents = toCents(amount);
  const off = d.type === 'percentage' ? Math.round((cents * Number(d.value)) / 100) : toCents(Number(d.value));
  return fromCents(Math.min(off, cents));
}

/**
 * Prices one line: quantity x unit price, minus the discount, plus tax on what is left.
 * `taxRates` are percentages, e.g. [18] or [9, 9].
 */
export function priceLine({ unitPrice, quantity, taxRates = [], discount = 0 }) {
  const subtotal = toCents(unitPrice) * quantity;
  const off = Math.min(toCents(discount), subtotal);
  const taxable = subtotal - off;
  const tax = taxRates.reduce((sum, rate) => sum + Math.round((taxable * rate) / 100), 0);
  return {
    subtotal: fromCents(subtotal),
    discount: fromCents(off),
    taxable: fromCents(taxable),
    tax: fromCents(tax),
    total: fromCents(taxable + tax),
  };
}
