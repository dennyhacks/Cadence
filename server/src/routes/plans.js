import { Router } from 'express';
import { query } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { requireRole } from '../middleware/auth.js';
import { parse, planSchema } from '../validation/schemas.js';

const router = Router();
router.use(requireRole('admin', 'staff'));

const COLUMNS = `id, name, price, billing_period, min_quantity,
  DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
  DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
  auto_close, closable, pausable, renewable`;

const toPlan = (r) => ({
  ...r,
  price: Number(r.price),
  auto_close: !!r.auto_close,
  closable: !!r.closable,
  pausable: !!r.pausable,
  renewable: !!r.renewable,
});

const nameTaken = () =>
  new HttpError(409, 'A plan with this name already exists.', { name: 'A plan with this name already exists.' });

async function load(raw) {
  const id = Number(raw);
  const [plan] = Number.isInteger(id) && id > 0 ? await query(`SELECT ${COLUMNS} FROM plans WHERE id = ?`, [id]) : [];
  if (!plan) throw new HttpError(404, 'Plan not found.');
  return toPlan(plan);
}

const values = (p) => [
  p.name, p.price, p.billing_period, p.min_quantity, p.start_date, p.end_date,
  p.auto_close ? 1 : 0, p.closable ? 1 : 0, p.pausable ? 1 : 0, p.renewable ? 1 : 0,
];

router.get('/', async (_req, res) => {
  const rows = await query(`SELECT ${COLUMNS} FROM plans ORDER BY name`);
  res.json({ plans: rows.map(toPlan) });
});

router.get('/:id', async (req, res) => {
  res.json({ plan: await load(req.params.id) });
});

router.post('/', async (req, res) => {
  const p = parse(planSchema, req.body);
  try {
    const result = await query(
      `INSERT INTO plans (name, price, billing_period, min_quantity, start_date, end_date,
                          auto_close, closable, pausable, renewable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values(p)
    );
    res.status(201).json({ plan: await load(result.insertId) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw nameTaken();
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const existing = await load(req.params.id);
  const p = parse(planSchema, req.body);
  try {
    await query(
      `UPDATE plans SET name = ?, price = ?, billing_period = ?, min_quantity = ?, start_date = ?, end_date = ?,
                        auto_close = ?, closable = ?, pausable = ?, renewable = ? WHERE id = ?`,
      [...values(p), existing.id]
    );
    res.json({ plan: await load(existing.id) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw nameTaken();
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = await load(req.params.id);
  try {
    await query('DELETE FROM plans WHERE id = ?', [id]);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new HttpError(409, 'This plan is used on a subscription, so it cannot be deleted.');
    }
    throw err;
  }
  res.status(204).end();
});

export default router;
