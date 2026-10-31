import { query } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { today } from '../utils/pricing.js';
import { addMonths } from './subscriptions.js';

// Everything on the finance dashboard is added up in SQL, so the work stays in the database and
// the page gets a few small rows however many subscriptions and invoices there are. The queries
// use the indexes on invoice date, payment date, invoice status and due date, and subscription status and plan.

const MAX_MONTHS = 60;
const money = (v) => Math.round(Number(v ?? 0) * 100) / 100;
const day = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d')`;

const monthOf = (dateStr) => dateStr.slice(0, 7);

/** Every month from `from` to `to`, so a month with no activity still shows as zero. */
function monthsBetween(from, to) {
  const out = [];
  let cursor = `${monthOf(from)}-01`;
  while (monthOf(cursor) <= monthOf(to)) {
    out.push(monthOf(cursor));
    cursor = addMonths(cursor, 1);
  }
  return out;
}

/** Turns the filters into a checked range. Defaults to the last 12 months. */
export function resolveFilters({ from, to, plan_id: planId }, now = new Date()) {
  const end = to ?? today(now);
  const start = from ?? `${monthOf(addMonths(`${monthOf(end)}-01`, -11))}-01`;
  const fail = (field, message) => new HttpError(400, 'Fix the highlighted fields and try again.', { [field]: message });
  if (start > end) throw fail('from', 'The start date cannot be after the end date.');
  if (monthsBetween(start, end).length > MAX_MONTHS) throw fail('from', `Choose a range of ${MAX_MONTHS / 12} years or less.`);
  return { from: start, to: end, planId };
}

export async function buildDashboard(filters, now = new Date()) {
  const { from, to, planId } = filters;
  const todayStr = today(now);

  if (planId) {
    const [plan] = await query('SELECT id FROM plans WHERE id = ?', [planId]);
    if (!plan) throw new HttpError(400, 'Fix the highlighted fields and try again.', { plan_id: 'This plan no longer exists.' });
  }
  const onPlan = planId ? 'AND s.plan_id = ?' : '';
  const planArg = planId ? [planId] : [];
  const joinSub = 'JOIN subscriptions s ON s.id = i.subscription_id';

  const [statusRows, invoicedRows, collectedRows, owed, overdueList, recent, planSubs, planInvoiced, planCollected, plans] = await Promise.all([
    query(`SELECT s.status, s.is_paused, COUNT(*) AS n FROM subscriptions s WHERE 1 = 1 ${onPlan} GROUP BY s.status, s.is_paused`, planArg),
    query(
      `SELECT DATE_FORMAT(i.invoice_date, '%Y-%m') AS month, SUM(i.total) AS amount, COUNT(*) AS n
         FROM invoices i ${joinSub}
        WHERE i.status IN ('confirmed', 'paid') AND i.invoice_date BETWEEN ? AND ? ${onPlan} GROUP BY month`,
      [from, to, ...planArg]
    ),
    query(
      `SELECT DATE_FORMAT(p.paid_on, '%Y-%m') AS month, SUM(p.amount) AS amount, COUNT(*) AS n
         FROM payments p JOIN invoices i ON i.id = p.invoice_id ${joinSub}
        WHERE p.paid_on BETWEEN ? AND ? ${onPlan} GROUP BY month`,
      [from, to, ...planArg]
    ),
    query(
      `SELECT COALESCE(SUM(i.total - i.amount_paid), 0) AS outstanding,
              COALESCE(SUM(CASE WHEN i.due_date < ? THEN i.total - i.amount_paid END), 0) AS overdue,
              COALESCE(SUM(CASE WHEN i.due_date < ? THEN 1 END), 0) AS overdue_count
         FROM invoices i ${joinSub} WHERE i.status = 'confirmed' ${onPlan}`,
      [todayStr, todayStr, ...planArg]
    ),
    query(
      `SELECT i.id, i.number, i.customer_name, ${day('i.due_date')} AS due_date, i.total - i.amount_paid AS outstanding
         FROM invoices i ${joinSub} WHERE i.status = 'confirmed' AND i.due_date < ? ${onPlan}
        ORDER BY i.due_date, i.id LIMIT 5`,
      [todayStr, ...planArg]
    ),
    query(
      `SELECT p.id, p.invoice_id, i.number AS invoice_number, i.customer_name, p.method, p.amount, ${day('p.paid_on')} AS paid_on
         FROM payments p JOIN invoices i ON i.id = p.invoice_id ${joinSub}
        WHERE p.paid_on BETWEEN ? AND ? ${onPlan} ORDER BY p.paid_on DESC, p.id DESC LIMIT 5`,
      [from, to, ...planArg]
    ),
    query(`SELECT s.plan_id, COUNT(*) AS n FROM subscriptions s WHERE s.status = 'active' AND s.is_paused = 0 ${onPlan} GROUP BY s.plan_id`, planArg),
    query(
      `SELECT s.plan_id, SUM(i.total) AS amount FROM invoices i ${joinSub}
        WHERE i.status IN ('confirmed', 'paid') AND i.invoice_date BETWEEN ? AND ? ${onPlan} GROUP BY s.plan_id`,
      [from, to, ...planArg]
    ),
    query(
      `SELECT s.plan_id, SUM(p.amount) AS amount FROM payments p JOIN invoices i ON i.id = p.invoice_id ${joinSub}
        WHERE p.paid_on BETWEEN ? AND ? ${onPlan} GROUP BY s.plan_id`,
      [from, to, ...planArg]
    ),
    query(`SELECT id, name, billing_period FROM plans ${planId ? 'WHERE id = ?' : ''} ORDER BY name`, planArg),
  ]);

  // Subscriptions by status, with paused ones counted apart from active ones.
  const byStatus = { draft: 0, quotation: 0, confirmed: 0, active: 0, closed: 0 };
  let paused = 0;
  for (const r of statusRows) {
    if (r.status === 'active' && r.is_paused) paused += Number(r.n);
    else byStatus[r.status] += Number(r.n);
  }

  const invoiced = new Map(invoicedRows.map((r) => [r.month, r]));
  const collected = new Map(collectedRows.map((r) => [r.month, r]));
  const months = monthsBetween(from, to).map((month) => ({
    month,
    invoiced: money(invoiced.get(month)?.amount),
    collected: money(collected.get(month)?.amount),
  }));
  const sum = (key) => money(months.reduce((s, m) => s + m[key], 0));

  const lookup = (rows) => new Map(rows.map((r) => [r.plan_id, r]));
  const subsBy = lookup(planSubs);
  const invBy = lookup(planInvoiced);
  const colBy = lookup(planCollected);

  return {
    filters: { from, to, plan_id: planId ?? null },
    subscriptions: { active: byStatus.active, paused, by_status: { ...byStatus, active: byStatus.active + paused } },
    revenue: {
      invoiced: sum('invoiced'),
      invoice_count: invoicedRows.reduce((s, r) => s + Number(r.n), 0),
      collected: sum('collected'),
      payment_count: collectedRows.reduce((s, r) => s + Number(r.n), 0),
      outstanding: money(owed[0].outstanding),
      overdue: money(owed[0].overdue),
      overdue_count: Number(owed[0].overdue_count),
    },
    months,
    by_plan: plans.map((p) => ({
      plan_id: p.id,
      name: p.name,
      billing_period: p.billing_period,
      active: Number(subsBy.get(p.id)?.n ?? 0),
      invoiced: money(invBy.get(p.id)?.amount),
      collected: money(colBy.get(p.id)?.amount),
    })),
    overdue_invoices: overdueList.map((r) => ({ ...r, outstanding: money(r.outstanding) })),
    recent_payments: recent.map((r) => ({ ...r, amount: money(r.amount) })),
  };
}
