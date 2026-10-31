import { Router } from 'express';
import { query } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { requireRole } from '../middleware/auth.js';
import { parse, taxSchema } from '../validation/schemas.js';

const router = Router();

// Staff can read the rules (they pick taxes on subscriptions); only the admin sets them.
const readers = requireRole('admin', 'staff');
const admin = requireRole('admin');

const toTax = (r) => ({ id: r.id, name: r.name, rate: Number(r.rate), apply_automatically: !!r.apply_automatically });
const nameTaken = () =>
  new HttpError(409, 'A tax with this name already exists.', { name: 'A tax with this name already exists.' });

async function load(raw) {
  const id = Number(raw);
  const [tax] = Number.isInteger(id) && id > 0 ? await query('SELECT id, name, rate, apply_automatically FROM taxes WHERE id = ?', [id]) : [];
  if (!tax) throw new HttpError(404, 'Tax not found.');
  return toTax(tax);
}

router.get('/', readers, async (_req, res) => {
  const rows = await query('SELECT id, name, rate, apply_automatically FROM taxes ORDER BY name');
  res.json({ taxes: rows.map(toTax) });
});

router.get('/:id', readers, async (req, res) => {
  res.json({ tax: await load(req.params.id) });
});

router.post('/', admin, async (req, res) => {
  const t = parse(taxSchema, req.body);
  try {
    const result = await query('INSERT INTO taxes (name, rate, apply_automatically) VALUES (?, ?, ?)', [t.name, t.rate, t.apply_automatically ? 1 : 0]);
    res.status(201).json({ tax: await load(result.insertId) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw nameTaken();
    throw err;
  }
});

router.put('/:id', admin, async (req, res) => {
  const { id } = await load(req.params.id);
  const t = parse(taxSchema, req.body);
  try {
    await query('UPDATE taxes SET name = ?, rate = ?, apply_automatically = ? WHERE id = ?', [t.name, t.rate, t.apply_automatically ? 1 : 0, id]);
    res.json({ tax: await load(id) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw nameTaken();
    throw err;
  }
});

router.delete('/:id', admin, async (req, res) => {
  const { id } = await load(req.params.id);
  try {
    await query('DELETE FROM taxes WHERE id = ?', [id]);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new HttpError(409, 'This tax is used on a subscription, so it cannot be deleted.');
    }
    throw err;
  }
  res.status(204).end();
});

export default router;
