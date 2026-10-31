import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { today } from '../utils/pricing.js';
import { computeInvoice, TERMS_DAYS } from '../utils/invoicing.js';
import { sendInvoiceEmail, sendReminderEmail } from '../utils/mailer.js';
import { expiryInFuture, luhn, TEST_CARDS } from '../utils/cards.js';
import { toCsv } from '../utils/csv.js';
import { addDays, linesFor, periodStart } from './subscriptions.js';

const day = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d')`;
const cents = (n) => Math.round(Number(n) * 100);
const placeholders = (list) => list.map(() => '?').join(',');

// ---- Making invoices ----

/** Discounts that could apply to an invoice dated `onDate`: in their dates and not used up. */
async function candidateDiscounts(onDate) {
  const rows = await query(
    `SELECT id, name, type, value, min_purchase, min_quantity, ${day('start_date')} AS start_date, ${day('end_date')} AS end_date,
            usage_limit, times_used, applies_to
       FROM discounts
      WHERE start_date <= ? AND (end_date IS NULL OR end_date >= ?) AND (usage_limit IS NULL OR times_used < usage_limit)
      ORDER BY id`,
    [onDate, onDate]
  );
  if (!rows.length) return [];
  const links = await query(`SELECT discount_id, product_id FROM discount_products WHERE discount_id IN (${placeholders(rows)})`, rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    value: Number(r.value),
    min_purchase: r.min_purchase == null ? null : Number(r.min_purchase),
    product_ids: links.filter((l) => l.discount_id === r.id).map((l) => l.product_id),
  }));
}

async function loadForBilling(id) {
  const [sub] = await query(
    `SELECT s.id, s.customer_id, s.payment_terms, s.plan_price, c.name AS customer_name, c.email AS customer_email,
            c.company AS customer_company, c.phone AS customer_phone, c.billing_address AS customer_address,
            p.name AS plan_name, p.billing_period, ${day('s.start_date')} AS start_date
       FROM subscriptions s JOIN users c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id WHERE s.id = ?`,
    [id]
  );
  const lines = (await linesFor([id])).get(id);
  return { ...sub, plan_price: Number(sub.plan_price), lines };
}

class DiscountUnavailable extends Error {}

/** Writes the invoice for period `k` in one transaction. A second invoice for the same period is refused by the database. */
async function createInvoice(sub, k) {
  const start = periodStart(sub.start_date, sub.billing_period, k);
  const end = addDays(periodStart(sub.start_date, sub.billing_period, k + 1), -1);
  const due = addDays(start, TERMS_DAYS[sub.payment_terms]);

  const result = computeInvoice({
    lines: sub.lines.map((l) => ({
      product_id: l.product_id,
      description: l.variant_label ? `${l.product_name} (${l.variant_label})` : l.product_name,
      quantity: l.quantity,
      unit_price: l.unit_price,
      taxes: l.taxes,
    })),
    planPrice: sub.plan_price,
    discounts: await candidateDiscounts(start),
    onDate: start,
  });

  await withTransaction(async (conn) => {
    const [ins] = await conn.execute(
      `INSERT INTO invoices (subscription_id, customer_id, status, period_start, period_end, invoice_date, due_date,
                             customer_name, customer_email, customer_company, customer_phone, customer_address,
                             plan_name, untaxed_total, discount_total, tax_total, total)
       VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sub.id, sub.customer_id, start, end, start, due, sub.customer_name, sub.customer_email,
        sub.customer_company ?? null, sub.customer_phone ?? null, sub.customer_address ?? null, sub.plan_name,
        result.totals.untaxed, result.totals.discount, result.totals.tax, result.totals.total]
    );
    const id = ins.insertId;
    await conn.execute("UPDATE invoices SET number = CONCAT('INV-', LPAD(id, 5, '0')) WHERE id = ?", [id]);

    const addLine = (l) =>
      conn.execute(
        `INSERT INTO invoice_lines (invoice_id, kind, description, quantity, unit_price, discount_amount, tax_label, tax_amount, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, l.kind, l.description, l.quantity, l.unit_price, l.discount_amount, l.tax_label, l.tax_amount, l.amount]
      );
    if (sub.plan_price > 0) {
      await addLine({ kind: 'plan', description: `${sub.plan_name} plan, billed ${sub.billing_period}`, quantity: 1, unit_price: sub.plan_price, discount_amount: 0, tax_label: null, tax_amount: 0, amount: sub.plan_price });
    }
    for (const l of result.lines) await addLine(l);

    // Using a discount is claimed in the database, so two invoices made at once cannot both take its last use.
    for (const d of result.discounts) {
      const [claim] = await conn.execute(
        'UPDATE discounts SET times_used = times_used + 1 WHERE id = ? AND (usage_limit IS NULL OR times_used < usage_limit)',
        [d.discount_id]
      );
      if (claim.affectedRows === 0) throw new DiscountUnavailable();
      await conn.execute('INSERT INTO invoice_discounts (invoice_id, discount_id, name, amount) VALUES (?, ?, ?, ?)', [id, d.discount_id, d.name, d.amount]);
    }
    await conn.execute('UPDATE subscriptions SET next_period_index = GREATEST(next_period_index, ?) WHERE id = ?', [k + 1, sub.id]);
  });
}

/**
 * Invoices every active, unpaused subscription for each billing period that has started and has no invoice yet.
 * Safe to run as often as you like, and from several places at once: nothing is billed twice, and a missed day
 * is caught up on the next run.
 */
export async function generateDueInvoices({ now = new Date(), subscriptionId } = {}) {
  const todayStr = today(now);
  const subs = await query(
    `SELECT s.id, s.next_period_index, ${day('s.start_date')} AS start_date, ${day('s.expiry_date')} AS expiry_date, p.billing_period
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.status = 'active' AND s.is_paused = 0 AND s.start_date <= ? ${subscriptionId ? 'AND s.id = ?' : ''}
      ORDER BY s.id`,
    subscriptionId ? [todayStr, subscriptionId] : [todayStr]
  );

  let created = 0;
  let skipped = 0;
  const billed = new Set();

  for (const row of subs) {
    let full = null;
    for (let k = row.next_period_index; k < row.next_period_index + 2000; k += 1) {
      const start = periodStart(row.start_date, row.billing_period, k);
      if (start > todayStr || (row.expiry_date && start > row.expiry_date)) break;

      try {
        full ??= await loadForBilling(row.id);
        await createInvoice(full, k);
        created += 1;
        billed.add(row.id);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          // Another run already billed this period. Move on.
          await query('UPDATE subscriptions SET next_period_index = GREATEST(next_period_index, ?) WHERE id = ?', [k + 1, row.id]);
          continue;
        }
        if (err instanceof DiscountUnavailable || err.code === 'ER_LOCK_DEADLOCK') {
          skipped += 1; // try again on the next run
          break;
        }
        throw err;
      }
    }
  }
  return { created, subscriptions: billed.size, skipped };
}

// ---- Reading ----

const INVOICE_COLUMNS = `i.id, i.number, i.subscription_id, i.customer_id, i.status, i.customer_name, i.customer_email,
  i.customer_company, i.customer_phone, i.customer_address, i.plan_name,
  ${day('i.period_start')} AS period_start, ${day('i.period_end')} AS period_end, ${day('i.invoice_date')} AS invoice_date,
  ${day('i.due_date')} AS due_date, i.untaxed_total, i.discount_total, i.tax_total, i.total, i.amount_paid,
  DATE_FORMAT(i.sent_at, '%Y-%m-%dT%H:%i:%sZ') AS sent_at, DATE_FORMAT(i.reminded_at, '%Y-%m-%dT%H:%i:%sZ') AS reminded_at,
  s.number AS subscription_number`;

const FROM = 'FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id';

function shape(row, todayStr) {
  const total = Number(row.total);
  const paid = Number(row.amount_paid);
  return {
    ...row,
    untaxed_total: Number(row.untaxed_total),
    discount_total: Number(row.discount_total),
    tax_total: Number(row.tax_total),
    total,
    amount_paid: paid,
    outstanding: Math.round((total - paid) * 100) / 100,
    is_overdue: row.status === 'confirmed' && row.due_date < todayStr,
  };
}

/** What this person can do to the invoice right now. Customers only look and print. */
export function invoiceActions(inv, role) {
  if (role === 'customer') return [];
  const out = [];
  if (inv.status === 'draft') out.push('confirm', 'cancel');
  if (inv.status === 'confirmed') {
    out.push('send');
    if (inv.is_overdue) out.push('remind');
    if (inv.amount_paid === 0) out.push('cancel');
  }
  if (inv.status === 'paid') out.push('send');
  return out;
}

const visibleToCustomer = "i.customer_id = ? AND i.status IN ('confirmed', 'paid')";

export async function loadInvoice(id, user) {
  const n = Number(id);
  const [row] = Number.isInteger(n) && n > 0 ? await query(`SELECT ${INVOICE_COLUMNS} ${FROM} WHERE i.id = ?`, [n]) : [];
  if (!row || (user.role === 'customer' && (row.customer_id !== user.id || !['confirmed', 'paid'].includes(row.status)))) {
    throw new HttpError(404, 'Invoice not found.');
  }
  const inv = shape(row, today());
  const [lines, discounts, payments] = await Promise.all([
    query('SELECT id, kind, description, quantity, unit_price, discount_amount, tax_label, tax_amount, amount FROM invoice_lines WHERE invoice_id = ? ORDER BY id', [inv.id]),
    query('SELECT discount_id, name, amount FROM invoice_discounts WHERE invoice_id = ? ORDER BY discount_id', [inv.id]),
    query(
      `SELECT p.id, p.method, p.amount, ${day('p.paid_on')} AS paid_on, p.note, u.name AS recorded_by
         FROM payments p LEFT JOIN users u ON u.id = p.recorded_by WHERE p.invoice_id = ? ORDER BY p.paid_on, p.id`,
      [inv.id]
    ),
  ]);
  const num = (r, keys) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, keys.includes(k) ? Number(v) : v]));
  return {
    ...inv,
    lines: lines.map((l) => num(l, ['unit_price', 'discount_amount', 'tax_amount', 'amount'])),
    discounts: discounts.map((d) => num(d, ['amount'])),
    payments: payments.map((p) => num(p, ['amount'])),
    actions: invoiceActions(inv, user.role),
    can_record_payment: user.role !== 'customer' && inv.status === 'confirmed' && inv.outstanding > 0,
    can_pay_online: inv.status === 'confirmed' && inv.outstanding > 0,
  };
}

const STATUS_FILTERS = ['draft', 'confirmed', 'paid', 'cancelled', 'overdue'];
export const isInvoiceFilter = (s) => STATUS_FILTERS.includes(s);

export async function listInvoices({ user, status, subscriptionId, page, pageSize }) {
  const todayStr = today();
  const scope = [];
  const scopeParams = [];
  if (user.role === 'customer') {
    scope.push(visibleToCustomer);
    scopeParams.push(user.id);
  }
  const scopeClause = scope.length ? `WHERE ${scope.join(' AND ')}` : '';

  // Totals for the whole scope, so paid, outstanding and overdue stay visible whatever the filter.
  const [summary] = await query(
    `SELECT COALESCE(SUM(CASE WHEN i.status IN ('confirmed', 'paid') THEN i.total END), 0) AS billed,
            COALESCE(SUM(CASE WHEN i.status IN ('confirmed', 'paid') THEN i.amount_paid END), 0) AS paid,
            COALESCE(SUM(CASE WHEN i.status = 'confirmed' AND i.due_date < ? THEN i.total - i.amount_paid END), 0) AS overdue,
            COALESCE(SUM(CASE WHEN i.status = 'confirmed' AND i.due_date < ? THEN 1 END), 0) AS overdue_count
       FROM invoices i ${scopeClause}`,
    [todayStr, todayStr, ...scopeParams]
  );

  const where = [...scope];
  const params = [...scopeParams];
  if (status === 'overdue') {
    where.push("i.status = 'confirmed' AND i.due_date < ?");
    params.push(todayStr);
  } else if (status) {
    where.push('i.status = ?');
    params.push(status);
  }
  if (subscriptionId) {
    where.push('i.subscription_id = ?');
    params.push(subscriptionId);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM invoices i ${clause}`, params);
  const limit = Number(pageSize);
  const offset = (Number(page) - 1) * limit;
  const rows = await query(`SELECT ${INVOICE_COLUMNS} ${FROM} ${clause} ORDER BY i.invoice_date DESC, i.id DESC LIMIT ${limit} OFFSET ${offset}`, params);

  const billed = Number(summary.billed);
  const paid = Number(summary.paid);
  return {
    invoices: rows.map((r) => shape(r, todayStr)),
    total: Number(total),
    page: Number(page),
    pageSize: limit,
    summary: {
      billed,
      paid,
      outstanding: Math.round((billed - paid) * 100) / 100,
      overdue: Number(summary.overdue),
      overdue_count: Number(summary.overdue_count),
    },
  };
}

export async function listPayments({ page, pageSize }) {
  const [{ total }] = await query('SELECT COUNT(*) AS total FROM payments');
  const limit = Number(pageSize);
  const offset = (Number(page) - 1) * limit;
  const rows = await query(
    `SELECT p.id, p.invoice_id, i.number AS invoice_number, i.customer_name, p.method, p.amount, ${day('p.paid_on')} AS paid_on, p.note
       FROM payments p JOIN invoices i ON i.id = p.invoice_id ORDER BY p.paid_on DESC, p.id DESC LIMIT ${limit} OFFSET ${offset}`
  );
  return { payments: rows.map((r) => ({ ...r, amount: Number(r.amount) })), total: Number(total), page: Number(page), pageSize: limit };
}

// ---- Changing an invoice ----

export async function runInvoiceAction(id, action, user) {
  const inv = await loadInvoice(id, user);
  if (!inv.actions.includes(action)) throw new HttpError(409, `You can't ${action} this invoice right now.`);

  if (action === 'confirm') {
    // An invoice with nothing to pay is settled as soon as it is confirmed.
    await query("UPDATE invoices SET status = ? WHERE id = ? AND status = 'draft'", [inv.total <= 0 ? 'paid' : 'confirmed', inv.id]);
  } else if (action === 'cancel') {
    await withTransaction(async (conn) => {
      const [res] = await conn.execute("UPDATE invoices SET status = 'cancelled' WHERE id = ? AND status IN ('draft', 'confirmed') AND amount_paid = 0", [inv.id]);
      if (res.affectedRows === 0) throw new HttpError(409, "You can't cancel this invoice right now.");
      // The discounts it used are given back.
      await conn.execute(
        'UPDATE discounts d JOIN invoice_discounts x ON x.discount_id = d.id SET d.times_used = GREATEST(d.times_used - 1, 0) WHERE x.invoice_id = ?',
        [inv.id]
      );
    });
  } else if (action === 'remind') {
    try {
      await sendReminderEmail(inv, `${config.clientUrl}/invoices/${inv.id}`);
    } catch (err) {
      console.error('Could not send reminder email:', err.message);
      throw new HttpError(502, 'The reminder could not be sent. Check the mail settings and try again.');
    }
    await query('UPDATE invoices SET reminded_at = UTC_TIMESTAMP() WHERE id = ?', [inv.id]);
  } else if (action === 'send') {
    try {
      await sendInvoiceEmail(inv, `${config.clientUrl}/invoices/${inv.id}`);
    } catch (err) {
      console.error('Could not send invoice email:', err.message);
      throw new HttpError(502, 'The email could not be sent. Check the mail settings and try again.');
    }
    await query('UPDATE invoices SET sent_at = UTC_TIMESTAMP() WHERE id = ?', [inv.id]);
  }
  return loadInvoice(inv.id, user);
}

export async function recordPayment(id, input, user) {
  const todayStr = today();
  if (input.paid_on > todayStr) {
    throw new HttpError(400, 'Fix the highlighted fields and try again.', { paid_on: 'The payment date cannot be in the future.' });
  }
  await loadInvoice(id, user); // 404 when it does not exist

  await withTransaction(async (conn) => {
    // Lock the invoice so two payments recorded together cannot overpay it.
    const [[inv]] = await conn.execute('SELECT id, status, total, amount_paid FROM invoices WHERE id = ? FOR UPDATE', [Number(id)]);
    if (inv.status !== 'confirmed') {
      throw new HttpError(409, inv.status === 'paid' ? 'This invoice is already paid.' : 'Payments can only be recorded on a confirmed invoice.');
    }
    const outstanding = cents(inv.total) - cents(inv.amount_paid);
    if (cents(input.amount) > outstanding) {
      throw new HttpError(400, 'Fix the highlighted fields and try again.', {
        amount: `The most you can record is ${(outstanding / 100).toFixed(2)}, which is what is still owed.`,
      });
    }
    await conn.execute('INSERT INTO payments (invoice_id, method, amount, paid_on, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?)', [
      inv.id, input.method, input.amount, input.paid_on, input.note || null, user?.id ?? null,
    ]);
    const settled = cents(input.amount) === outstanding;
    await conn.execute('UPDATE invoices SET amount_paid = amount_paid + ?, status = ? WHERE id = ?', [input.amount, settled ? 'paid' : 'confirmed', inv.id]);
  });
  return loadInvoice(id, user);
}

// ---- Paying online (test mode) ----

const cardError = (field, message) => new HttpError(400, 'Fix the highlighted fields and try again.', { [field]: message });

/**
 * A customer pays an invoice by card. This is a stand-in for a payment provider: only the published test
 * cards work, nothing is charged, and the card number is never stored (only its last four digits, in the note).
 */
export async function payOnline(id, input, user) {
  if (!luhn(input.card_number)) throw cardError('card_number', 'Enter a valid card number.');
  const outcome = TEST_CARDS[input.card_number];
  if (!outcome) throw cardError('card_number', 'This is test mode, so only test cards work. Use 4242 4242 4242 4242.');
  if (!expiryInFuture(input.expiry)) throw cardError('expiry', 'This card has expired. Use a date in the future.');
  if (outcome === 'declined') {
    throw new HttpError(402, 'Your card was declined. That test card always fails. Try 4242 4242 4242 4242 instead.');
  }

  const inv = await loadInvoice(id, user);
  const amount = input.amount ?? inv.outstanding;
  return recordPayment(
    id,
    { method: 'card', amount, paid_on: today(), note: `Online payment (test mode), card ending ${input.card_number.slice(-4)}` },
    user
  );
}

// ---- CSV exports for the team ----

const EXPORT_LIMIT = 50000;

export async function exportInvoicesCsv({ status }) {
  const todayStr = today();
  const where = [];
  const params = [];
  if (status === 'overdue') {
    where.push("i.status = 'confirmed' AND i.due_date < ?");
    params.push(todayStr);
  } else if (status) {
    where.push('i.status = ?');
    params.push(status);
  }
  const rows = await query(
    `SELECT ${INVOICE_COLUMNS} ${FROM} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.invoice_date DESC, i.id DESC LIMIT ${EXPORT_LIMIT}`,
    params
  );
  const invoices = rows.map((r) => shape(r, todayStr));
  return toCsv(
    [
      { header: 'Invoice', value: (r) => r.number },
      { header: 'Subscription', value: (r) => r.subscription_number },
      { header: 'Customer', value: (r) => r.customer_name },
      { header: 'Company', value: (r) => r.customer_company },
      { header: 'Email', value: (r) => r.customer_email },
      { header: 'Status', value: (r) => r.status },
      { header: 'Overdue', value: (r) => (r.is_overdue ? 'yes' : 'no') },
      { header: 'Invoice date', value: (r) => r.invoice_date },
      { header: 'Due date', value: (r) => r.due_date },
      { header: 'Total', value: (r) => r.total },
      { header: 'Paid', value: (r) => r.amount_paid },
      { header: 'Outstanding', value: (r) => (r.status === 'cancelled' ? 0 : r.outstanding) },
    ],
    invoices
  );
}

export async function exportPaymentsCsv() {
  const rows = await query(
    `SELECT ${day('p.paid_on')} AS paid_on, i.number AS invoice_number, i.customer_name, p.method, p.amount, p.note
       FROM payments p JOIN invoices i ON i.id = p.invoice_id ORDER BY p.paid_on DESC, p.id DESC LIMIT ${EXPORT_LIMIT}`
  );
  return toCsv(
    [
      { header: 'Date', value: (r) => r.paid_on },
      { header: 'Invoice', value: (r) => r.invoice_number },
      { header: 'Customer', value: (r) => r.customer_name },
      { header: 'Method', value: (r) => r.method },
      { header: 'Amount', value: (r) => Number(r.amount) },
      { header: 'Note', value: (r) => r.note },
    ],
    rows
  );
}
