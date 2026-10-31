import { paddedId } from '../utils/numbers.js';
import { query } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { priceLine, today } from '../utils/pricing.js';

const round2 = (n) => Math.round(n * 100) / 100;
const placeholders = (list) => list.map(() => '?').join(',');
const fieldError = (field, message) => new HttpError(400, 'Fix the highlighted fields and try again.', { [field]: message });
const day = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d')`;

export const PLAN_COLUMNS = `id, name, price, billing_period, min_quantity, ${day('start_date')} AS start_date,
  ${day('end_date')} AS end_date, auto_close, closable, pausable, renewable`;

// ---- Dates ----

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Adds whole months, clamping a short month to its last day (31 Jan + 1 month = 28 Feb). */
export function addMonths(dateStr, months) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const result = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return result.toISOString().slice(0, 10);
}

/** Adds one billing period. */
export function addPeriod(dateStr, period) {
  return periodStart(dateStr, period, 1);
}

/**
 * When billing period `k` starts, counting from the subscription's start date. Always measured from the
 * start date, not from the previous period, so a 31st never drifts to the 28th for good.
 */
export function periodStart(start, period, k) {
  if (period === 'daily') return addDays(start, k);
  if (period === 'weekly') return addDays(start, 7 * k);
  return addMonths(start, period === 'monthly' ? k : 12 * k);
}

/** The first billing period whose start is on or after `day`. */
export function firstPeriodOnOrAfter(start, period, day) {
  if (start >= day) return 0;
  const gap = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  const longest = { daily: 1, weekly: 7, monthly: 31, yearly: 366 }[period];
  let k = Math.max(0, Math.floor(gap / longest) - 1);
  while (periodStart(start, period, k) < day) k += 1;
  return k;
}

// ---- Plans and lines ----

export async function getPlan(planId) {
  const [plan] = await query(`SELECT ${PLAN_COLUMNS} FROM plans WHERE id = ?`, [planId]);
  if (!plan) throw fieldError('plan_id', 'This plan no longer exists.');
  return { ...plan, price: Number(plan.price), auto_close: !!plan.auto_close };
}

/** A subscription can only start while its plan is available. */
export function checkPlanWindow(plan, startDate) {
  if (startDate < plan.start_date || (plan.end_date && startDate > plan.end_date)) {
    const until = plan.end_date ? `to ${plan.end_date}` : 'with no end date';
    throw fieldError('start_date', `This plan is available from ${plan.start_date} ${until}.`);
  }
}

/**
 * A plan that closes on its own cannot be outlived by its subscriptions. With no expiry date a subscription
 * takes the plan's end date, and an expiry date after the plan's end is refused.
 */
export function applyPlanEnd(plan, expiryDate) {
  if (!plan.auto_close || !plan.end_date) return expiryDate;
  if (!expiryDate) return plan.end_date;
  if (expiryDate > plan.end_date) {
    throw fieldError('expiry_date', `This plan closes on its own on ${plan.end_date}, so a subscription on it cannot expire later.`);
  }
  return expiryDate;
}

/**
 * Checks each line against the catalog and the plan, and works out its price:
 * the product's sales price plus the variant's extra amount.
 */
export async function resolveLines(lines, plan) {
  const fail = (n, message) => fieldError('lines', `Line ${n}: ${message}`);
  const productIds = [...new Set(lines.map((l) => l.product_id))];
  // Taxes the admin marked "apply automatically" go on any line that does not say which taxes to use.
  const automatic = (await query('SELECT id FROM taxes WHERE apply_automatically = 1 ORDER BY id')).map((t) => t.id);
  lines = lines.map((l) => ({ ...l, tax_ids: l.tax_ids ?? automatic }));
  const taxIds = [...new Set(lines.flatMap((l) => l.tax_ids))];

  const products = await query(`SELECT id, name, sales_price FROM products WHERE id IN (${placeholders(productIds)})`, productIds);
  const variants = await query(
    `SELECT product_id, attribute, value, extra_price FROM product_variants WHERE product_id IN (${placeholders(productIds)})`,
    productIds
  );
  const taxes = taxIds.length ? await query(`SELECT id FROM taxes WHERE id IN (${placeholders(taxIds)})`, taxIds) : [];
  const knownTaxes = new Set(taxes.map((t) => t.id));

  return lines.map((l, i) => {
    const n = i + 1;
    const product = products.find((p) => p.id === l.product_id);
    if (!product) throw fail(n, 'This product no longer exists.');

    let extra = 0;
    let label = null;
    if (l.variant) {
      const v = variants.find((x) => x.product_id === l.product_id && x.attribute === l.variant.attribute && x.value === l.variant.value);
      if (!v) throw fail(n, `${product.name} has no variant ${l.variant.attribute}: ${l.variant.value}.`);
      extra = Number(v.extra_price);
      label = `${l.variant.attribute}: ${l.variant.value}`;
    }
    if (l.quantity < plan.min_quantity) throw fail(n, `This plan needs a quantity of at least ${plan.min_quantity}.`);
    if (l.tax_ids.some((t) => !knownTaxes.has(t))) throw fail(n, 'A chosen tax no longer exists.');

    return { ...l, variant_label: label, unit_price: round2(Number(product.sales_price) + extra) };
  });
}

export async function insertLines(conn, subscriptionId, lines) {
  for (const l of lines) {
    const [result] = await conn.execute(
      'INSERT INTO subscription_lines (subscription_id, product_id, variant_label, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
      [subscriptionId, l.product_id, l.variant_label, l.quantity, l.unit_price]
    );
    for (const taxId of new Set(l.tax_ids)) {
      await conn.execute('INSERT INTO subscription_line_taxes (line_id, tax_id) VALUES (?, ?)', [result.insertId, taxId]);
    }
  }
}

export async function assignNumber(conn, id) {
  await conn.execute(`UPDATE subscriptions SET number = CONCAT('SUB-', ${paddedId}) WHERE id = ?`, [id]);
}

// ---- Reading ----

const SUB_COLUMNS = `s.id, s.number, s.status, s.is_paused, s.customer_id, s.plan_id, s.plan_price, s.template_id,
  s.payment_terms, s.validity_days, ${day('s.start_date')} AS start_date, ${day('s.expiry_date')} AS expiry_date,
  ${day('s.quote_valid_until')} AS quote_valid_until, c.name AS customer_name, c.email AS customer_email,
  p.name AS plan_name, p.billing_period, p.min_quantity, p.auto_close, p.closable, p.pausable, p.renewable`;

const FROM = 'FROM subscriptions s JOIN users c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id';

const normalise = (s) => ({
  ...s,
  plan_price: Number(s.plan_price),
  is_paused: !!s.is_paused,
  auto_close: !!s.auto_close,
  closable: !!s.closable,
  pausable: !!s.pausable,
  renewable: !!s.renewable,
});

/**
 * Whole-subscription amounts: the lines plus the plan's price for the period.
 * `untaxed` and `tax` come from the lines; the plan price is added without tax.
 * Discounts are applied on the invoice, not here.
 */
function totalsOf(lines, planPrice) {
  const sum = lines.reduce(
    (t, l) => {
      const r = priceLine({ unitPrice: l.unit_price, quantity: l.quantity, taxRates: l.taxes.map((x) => x.rate) });
      return { untaxed: t.untaxed + r.subtotal, tax: t.tax + r.tax, total: t.total + r.total };
    },
    { untaxed: 0, tax: 0, total: 0 }
  );
  return {
    plan_price: planPrice,
    untaxed: round2(sum.untaxed),
    tax: round2(sum.tax),
    total: round2(sum.total + planPrice),
  };
}

export async function linesFor(ids) {
  if (!ids.length) return new Map();
  const rows = await query(
    `SELECT l.id, l.subscription_id, l.product_id, pr.name AS product_name, l.variant_label, l.quantity, l.unit_price
       FROM subscription_lines l JOIN products pr ON pr.id = l.product_id
      WHERE l.subscription_id IN (${placeholders(ids)}) ORDER BY l.id`,
    ids
  );
  const taxRows = rows.length
    ? await query(
        `SELECT lt.line_id, t.id, t.name, t.rate FROM subscription_line_taxes lt JOIN taxes t ON t.id = lt.tax_id
          WHERE lt.line_id IN (${placeholders(rows.map((r) => r.id))}) ORDER BY t.name`,
        rows.map((r) => r.id)
      )
    : [];
  const bySub = new Map(ids.map((id) => [id, []]));
  for (const r of rows) {
    const taxes = taxRows.filter((t) => t.line_id === r.id).map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }));
    const unitPrice = Number(r.unit_price);
    const priced = priceLine({ unitPrice, quantity: r.quantity, taxRates: taxes.map((t) => t.rate) });
    bySub.get(r.subscription_id).push({
      id: r.id, product_id: r.product_id, product_name: r.product_name, variant_label: r.variant_label,
      quantity: r.quantity, unit_price: unitPrice, taxes, tax_amount: priced.tax, amount: priced.total,
    });
  }
  return bySub;
}

/** The actions this person can take on the subscription right now, following the plan's own rules. */
export function availableActions(s, role) {
  const team = role !== 'customer';
  const out = [];
  if (s.status === 'draft' && team) out.push('send');
  if (s.status === 'quotation') out.push('confirm');
  if (s.status === 'confirmed' && team) out.push('activate');
  if (s.status === 'active') {
    if (s.closable) out.push('close');
    if (s.pausable) out.push(s.is_paused ? 'resume' : 'pause');
  }
  if ((s.status === 'active' || s.status === 'closed') && s.renewable && s.expiry_date) out.push('renew');
  return out;
}

const hiddenFrom = (user, s) => user.role === 'customer' && (s.customer_id !== user.id || s.status === 'draft');

export async function loadSubscription(id, user) {
  const [row] = Number.isInteger(Number(id)) && Number(id) > 0 ? await query(`SELECT ${SUB_COLUMNS} ${FROM} WHERE s.id = ?`, [Number(id)]) : [];
  if (!row || hiddenFrom(user, row)) throw new HttpError(404, 'Subscription not found.');
  const sub = normalise(row);
  const lines = (await linesFor([sub.id])).get(sub.id);
  return { ...sub, lines, totals: totalsOf(lines, sub.plan_price), actions: availableActions(sub, user.role) };
}

export async function listSubscriptions({ user, status, page, pageSize }) {
  const where = [];
  const params = [];
  if (user.role === 'customer') {
    where.push("s.customer_id = ? AND s.status <> 'draft'");
    params.push(user.id);
  }
  if (status) {
    where.push('s.status = ?');
    params.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM subscriptions s ${clause}`, params);
  const limit = Number(pageSize);
  const offset = (Number(page) - 1) * limit;
  const rows = await query(`SELECT ${SUB_COLUMNS} ${FROM} ${clause} ORDER BY s.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
  const lines = await linesFor(rows.map((r) => r.id));
  const subscriptions = rows.map((r) => {
    const sub = normalise(r);
    return { ...sub, totals: totalsOf(lines.get(r.id), sub.plan_price) };
  });
  return { subscriptions, total: Number(total), page: Number(page), pageSize: limit };
}

// ---- Changing status ----

export async function runAction(id, action, user) {
  const sub = await loadSubscription(id, user);
  if (!sub.actions.includes(action)) {
    throw new HttpError(409, `You can't ${action} this subscription right now.`);
  }
  const now = today();

  switch (action) {
    case 'send':
      await query("UPDATE subscriptions SET status = 'quotation', quote_valid_until = ? WHERE id = ?", [addDays(now, sub.validity_days), sub.id]);
      break;
    case 'confirm':
      if (sub.quote_valid_until && sub.quote_valid_until < now) {
        throw new HttpError(409, 'This quotation has expired. Ask for a new one.');
      }
      await query("UPDATE subscriptions SET status = 'confirmed' WHERE id = ?", [sub.id]);
      break;
    case 'activate':
      // Billing starts when the subscription becomes active; earlier periods are not billed after the fact.
      await query("UPDATE subscriptions SET status = 'active', next_period_index = ? WHERE id = ?", [
        firstPeriodOnOrAfter(sub.start_date, sub.billing_period, now),
        sub.id,
      ]);
      break;
    case 'close':
      await query("UPDATE subscriptions SET status = 'closed', is_paused = 0 WHERE id = ?", [sub.id]);
      break;
    case 'pause':
      await query('UPDATE subscriptions SET is_paused = 1 WHERE id = ?', [sub.id]);
      break;
    case 'resume':
      // Periods that passed while paused are not billed.
      await query('UPDATE subscriptions SET is_paused = 0, next_period_index = GREATEST(next_period_index, ?) WHERE id = ?', [
        firstPeriodOnOrAfter(sub.start_date, sub.billing_period, now),
        sub.id,
      ]);
      break;
    case 'renew': {
      const [plan] = await query(`SELECT ${day('end_date')} AS end_date FROM plans WHERE id = ?`, [sub.plan_id]);
      const from = sub.expiry_date >= now ? sub.expiry_date : now;
      const next = addPeriod(from, sub.billing_period);
      if (plan.end_date && next > plan.end_date) {
        throw new HttpError(409, `The plan ends on ${plan.end_date}, so this cannot be renewed past it.`);
      }
      await query(
        "UPDATE subscriptions SET status = 'active', is_paused = 0, expiry_date = ?, next_period_index = GREATEST(next_period_index, ?) WHERE id = ?",
        [next, firstPeriodOnOrAfter(sub.start_date, sub.billing_period, now), sub.id]
      );
      break;
    }
  }
  return loadSubscription(sub.id, user);
}

/** Closes active subscriptions on a plan that closes on its own, once they pass their expiry date or the plan has ended. */
export async function closeExpiredSubscriptions(now = new Date()) {
  const result = await query(
    `UPDATE subscriptions s JOIN plans p ON p.id = s.plan_id
        SET s.status = 'closed', s.is_paused = 0
      WHERE s.status = 'active' AND p.auto_close = 1
        AND ((s.expiry_date IS NOT NULL AND s.expiry_date < ?) OR (p.end_date IS NOT NULL AND p.end_date < ?))`,
    [today(now), today(now)]
  );
  return result.affectedRows;
}
