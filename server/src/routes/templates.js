import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { parse, templateSchema } from '../validation/schemas.js';
import { getPlan, resolveLines } from '../services/subscriptions.js';
import { today } from '../utils/pricing.js';

const router = Router();
router.use(requireAuth);
const team = requireRole('admin', 'staff');

const nameTaken = () =>
  new HttpError(409, 'A template with this name already exists.', { name: 'A template with this name already exists.' });

async function linesOf(templateIds) {
  if (!templateIds.length) return new Map();
  const rows = await query(
    `SELECT l.id, l.template_id, l.product_id, p.name AS product_name, l.variant_attribute, l.variant_value, l.quantity
       FROM template_lines l JOIN products p ON p.id = l.product_id
      WHERE l.template_id IN (${templateIds.map(() => '?').join(',')}) ORDER BY l.id`,
    templateIds
  );
  const taxes = rows.length
    ? await query(`SELECT line_id, tax_id FROM template_line_taxes WHERE line_id IN (${rows.map(() => '?').join(',')})`, rows.map((r) => r.id))
    : [];
  const map = new Map(templateIds.map((id) => [id, []]));
  for (const r of rows) {
    map.get(r.template_id).push({
      product_id: r.product_id,
      product_name: r.product_name,
      variant: r.variant_attribute ? { attribute: r.variant_attribute, value: r.variant_value } : null,
      quantity: r.quantity,
      tax_ids: taxes.filter((t) => t.line_id === r.id).map((t) => t.tax_id),
    });
  }
  return map;
}

const COLUMNS = `t.id, t.name, t.plan_id, t.validity_days, p.name AS plan_name, p.price AS plan_price, p.billing_period,
  DATE_FORMAT(p.start_date, '%Y-%m-%d') AS plan_start, DATE_FORMAT(p.end_date, '%Y-%m-%d') AS plan_end`;

async function list(where = '', params = []) {
  const rows = await query(`SELECT ${COLUMNS} FROM quotation_templates t JOIN plans p ON p.id = t.plan_id ${where} ORDER BY t.name`, params);
  const lines = await linesOf(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, plan_price: Number(r.plan_price), lines: lines.get(r.id) }));
}

// Customers only see templates whose plan is open right now; the team sees everything.
router.get('/', async (req, res) => {
  if (req.user.role === 'customer') {
    const now = today();
    return res.json({ templates: await list('WHERE p.start_date <= ? AND (p.end_date IS NULL OR p.end_date >= ?)', [now, now]) });
  }
  res.json({ templates: await list() });
});

router.get('/:id', team, async (req, res) => {
  const [template] = await list('WHERE t.id = ?', [Number(req.params.id) || 0]);
  if (!template) throw new HttpError(404, 'Template not found.');
  res.json({ template });
});

async function save(conn, id, t, lines) {
  await conn.execute('UPDATE quotation_templates SET name = ?, plan_id = ?, validity_days = ? WHERE id = ?', [t.name, t.plan_id, t.validity_days, id]);
  await conn.execute('DELETE FROM template_lines WHERE template_id = ?', [id]);
  for (const l of lines) {
    const [result] = await conn.execute(
      'INSERT INTO template_lines (template_id, product_id, variant_attribute, variant_value, quantity) VALUES (?, ?, ?, ?, ?)',
      [id, l.product_id, l.variant?.attribute ?? null, l.variant?.value ?? null, l.quantity]
    );
    for (const taxId of new Set(l.tax_ids)) {
      await conn.execute('INSERT INTO template_line_taxes (line_id, tax_id) VALUES (?, ?)', [result.insertId, taxId]);
    }
  }
}

router.post('/', team, async (req, res) => {
  const t = parse(templateSchema, req.body);
  const plan = await getPlan(t.plan_id);
  const lines = await resolveLines(t.lines, plan);
  try {
    const id = await withTransaction(async (conn) => {
      const [result] = await conn.execute('INSERT INTO quotation_templates (name, plan_id, validity_days) VALUES (?, ?, ?)', [t.name, t.plan_id, t.validity_days]);
      await save(conn, result.insertId, t, lines);
      return result.insertId;
    });
    const [created] = await list('WHERE t.id = ?', [id]);
    res.status(201).json({ template: created });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw nameTaken();
    throw err;
  }
});

router.put('/:id', team, async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = Number.isInteger(id) && id > 0 ? await query('SELECT id FROM quotation_templates WHERE id = ?', [id]) : [];
  if (!existing) throw new HttpError(404, 'Template not found.');
  const t = parse(templateSchema, req.body);
  const plan = await getPlan(t.plan_id);
  const lines = await resolveLines(t.lines, plan);
  try {
    await withTransaction((conn) => save(conn, id, t, lines));
    const [updated] = await list('WHERE t.id = ?', [id]);
    res.json({ template: updated });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw nameTaken();
    throw err;
  }
});

router.delete('/:id', team, async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = Number.isInteger(id) && id > 0 ? await query('SELECT id FROM quotation_templates WHERE id = ?', [id]) : [];
  if (!existing) throw new HttpError(404, 'Template not found.');
  await query('DELETE FROM quotation_templates WHERE id = ?', [id]);
  res.status(204).end();
});

export default router;
