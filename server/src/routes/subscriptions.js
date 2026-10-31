import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { parse, subscriptionSchema, transitionSchema } from '../validation/schemas.js';
import { today } from '../utils/pricing.js';
import {
  addDays, assignNumber, checkPlanWindow, getPlan, insertLines, listSubscriptions, loadSubscription, resolveLines, runAction,
} from '../services/subscriptions.js';

const router = Router();
router.use(requireAuth);
const team = requireRole('admin', 'staff');

const STATUSES = ['draft', 'quotation', 'confirmed', 'active', 'closed'];

router.get('/', async (req, res) => {
  const { status } = req.query;
  if (status !== undefined && !STATUSES.includes(status)) {
    throw new HttpError(400, 'Choose a valid status.', { status: 'Choose a valid status.' });
  }
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  res.json(await listSubscriptions({ user: req.user, status, page, pageSize }));
});

// A customer starts a subscription from a template. It begins as a quotation they can confirm.
router.post('/from-template', requireRole('customer'), async (req, res) => {
  const templateId = Number(req.body?.template_id);
  const [template] = Number.isInteger(templateId) && templateId > 0
    ? await query('SELECT id, plan_id, validity_days FROM quotation_templates WHERE id = ?', [templateId])
    : [];
  if (!template) throw new HttpError(404, 'That template is not available.');

  const plan = await getPlan(template.plan_id);
  const now = today();
  if (now < plan.start_date || (plan.end_date && now > plan.end_date)) {
    throw new HttpError(409, 'This plan is not available right now.');
  }

  const rows = await query(
    'SELECT id, product_id, variant_attribute, variant_value, quantity FROM template_lines WHERE template_id = ? ORDER BY id',
    [template.id]
  );
  const taxRows = rows.length
    ? await query(`SELECT line_id, tax_id FROM template_line_taxes WHERE line_id IN (${rows.map(() => '?').join(',')})`, rows.map((r) => r.id))
    : [];
  const lines = await resolveLines(
    rows.map((r) => ({
      product_id: r.product_id,
      variant: r.variant_attribute ? { attribute: r.variant_attribute, value: r.variant_value } : null,
      quantity: Math.max(r.quantity, plan.min_quantity),
      tax_ids: taxRows.filter((t) => t.line_id === r.id).map((t) => t.tax_id),
    })),
    plan
  );

  const id = await withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO subscriptions (customer_id, plan_id, plan_price, template_id, status, start_date, expiry_date,
                                  payment_terms, validity_days, quote_valid_until, created_by)
       VALUES (?, ?, ?, ?, 'quotation', ?, ?, 'immediate', ?, ?, ?)`,
      [req.user.id, plan.id, plan.price, template.id, now, plan.end_date, template.validity_days, addDays(now, template.validity_days), req.user.id]
    );
    await insertLines(conn, result.insertId, lines);
    await assignNumber(conn, result.insertId);
    return result.insertId;
  });
  res.status(201).json({ subscription: await loadSubscription(id, req.user) });
});

async function validated(body) {
  const data = parse(subscriptionSchema, body);
  const plan = await getPlan(data.plan_id);
  checkPlanWindow(plan, data.start_date);
  const [customer] = await query("SELECT id FROM users WHERE id = ? AND role = 'customer' AND is_active = 1", [data.customer_id]);
  if (!customer) throw new HttpError(400, 'Fix the highlighted fields and try again.', { customer_id: 'Choose a customer.' });
  if (data.template_id) {
    const [template] = await query('SELECT id FROM quotation_templates WHERE id = ?', [data.template_id]);
    if (!template) data.template_id = null;
  }
  return { data, plan, lines: await resolveLines(data.lines, plan) };
}

router.post('/', team, async (req, res) => {
  const { data, plan, lines } = await validated(req.body);
  const id = await withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO subscriptions (customer_id, plan_id, plan_price, template_id, status, start_date, expiry_date,
                                  payment_terms, validity_days, created_by)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [data.customer_id, data.plan_id, plan.price, data.template_id, data.start_date, data.expiry_date, data.payment_terms, data.validity_days, req.user.id]
    );
    await insertLines(conn, result.insertId, lines);
    await assignNumber(conn, result.insertId);
    return result.insertId;
  });
  res.status(201).json({ subscription: await loadSubscription(id, req.user) });
});

router.get('/:id', async (req, res) => {
  res.json({ subscription: await loadSubscription(req.params.id, req.user) });
});

router.put('/:id', team, async (req, res) => {
  const existing = await loadSubscription(req.params.id, req.user);
  if (!['draft', 'quotation'].includes(existing.status)) {
    throw new HttpError(409, 'Only drafts and quotations can be edited.');
  }
  const { data, plan, lines } = await validated(req.body);
  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE subscriptions SET customer_id = ?, plan_id = ?, plan_price = ?, template_id = ?, start_date = ?,
              expiry_date = ?, payment_terms = ?, validity_days = ? WHERE id = ?`,
      [data.customer_id, data.plan_id, plan.price, data.template_id, data.start_date, data.expiry_date, data.payment_terms, data.validity_days, existing.id]
    );
    await conn.execute('DELETE FROM subscription_lines WHERE subscription_id = ?', [existing.id]);
    await insertLines(conn, existing.id, lines);
  });
  res.json({ subscription: await loadSubscription(existing.id, req.user) });
});

router.delete('/:id', team, async (req, res) => {
  const existing = await loadSubscription(req.params.id, req.user);
  if (existing.status !== 'draft') throw new HttpError(409, 'Only a draft can be deleted. Close the subscription instead.');
  await query('DELETE FROM subscriptions WHERE id = ?', [existing.id]);
  res.status(204).end();
});

router.post('/:id/action', async (req, res) => {
  const { action } = parse(transitionSchema, req.body);
  res.json({ subscription: await runAction(req.params.id, action, req.user) });
});

export default router;
