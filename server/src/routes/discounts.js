import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { requireRole } from '../middleware/auth.js';
import { parse, discountSchema } from '../validation/schemas.js';
import { discountStatus } from '../utils/pricing.js';

const router = Router();
router.use(requireRole('admin')); // discounts are admin only

const COLUMNS = `d.id, d.name, d.type, d.value, d.min_purchase, d.min_quantity,
  DATE_FORMAT(d.start_date, '%Y-%m-%d') AS start_date,
  DATE_FORMAT(d.end_date, '%Y-%m-%d') AS end_date,
  d.usage_limit, d.times_used, d.applies_to`;

const num = (v) => (v == null ? null : Number(v));
const toDiscount = (r, productIds = []) => {
  const d = { ...r, value: Number(r.value), min_purchase: num(r.min_purchase) };
  return { ...d, status: discountStatus(d), product_ids: productIds };
};
const nameTaken = () =>
  new HttpError(409, 'A discount with this name already exists.', { name: 'A discount with this name already exists.' });

async function load(raw) {
  const id = Number(raw);
  const [row] = Number.isInteger(id) && id > 0 ? await query(`SELECT ${COLUMNS} FROM discounts d WHERE d.id = ?`, [id]) : [];
  if (!row) throw new HttpError(404, 'Discount not found.');
  const links = await query('SELECT product_id FROM discount_products WHERE discount_id = ? ORDER BY product_id', [id]);
  return toDiscount(row, links.map((l) => l.product_id));
}

async function checkProducts(ids) {
  if (!ids.length) return;
  const found = await query(`SELECT id FROM products WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  if (found.length !== new Set(ids).size) {
    throw new HttpError(400, 'Fix the highlighted fields and try again.', {
      product_ids: 'One of the chosen products no longer exists. Refresh and choose again.',
    });
  }
}

async function save(conn, id, d) {
  await conn.execute(
    `UPDATE discounts SET name = ?, type = ?, value = ?, min_purchase = ?, min_quantity = ?, start_date = ?,
            end_date = ?, usage_limit = ?, applies_to = ? WHERE id = ?`,
    [d.name, d.type, d.value, d.min_purchase, d.min_quantity, d.start_date, d.end_date, d.usage_limit, d.applies_to, id]
  );
  await conn.execute('DELETE FROM discount_products WHERE discount_id = ?', [id]);
  if (d.applies_to === 'products') {
    for (const productId of new Set(d.product_ids)) {
      await conn.execute('INSERT INTO discount_products (discount_id, product_id) VALUES (?, ?)', [id, productId]);
    }
  }
}

router.get('/', async (_req, res) => {
  const rows = await query(
    `SELECT ${COLUMNS}, GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ', ') AS product_names
       FROM discounts d
       LEFT JOIN discount_products dp ON dp.discount_id = d.id
       LEFT JOIN products p ON p.id = dp.product_id
      GROUP BY d.id ORDER BY d.start_date DESC, d.id DESC`
  );
  res.json({ discounts: rows.map((r) => ({ ...toDiscount(r), product_names: r.product_names })) });
});

router.get('/:id', async (req, res) => {
  res.json({ discount: await load(req.params.id) });
});

router.post('/', async (req, res) => {
  const d = parse(discountSchema, req.body);
  if (d.applies_to === 'products') await checkProducts(d.product_ids);
  try {
    const id = await withTransaction(async (conn) => {
      const [result] = await conn.execute('INSERT INTO discounts (name, type, value, start_date, applies_to) VALUES (?, ?, ?, ?, ?)', [
        d.name, d.type, d.value, d.start_date, d.applies_to,
      ]);
      await save(conn, result.insertId, d);
      return result.insertId;
    });
    res.status(201).json({ discount: await load(id) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw nameTaken();
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const { id } = await load(req.params.id);
  const d = parse(discountSchema, req.body);
  if (d.applies_to === 'products') await checkProducts(d.product_ids);
  try {
    await withTransaction((conn) => save(conn, id, d));
    res.json({ discount: await load(id) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw nameTaken();
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = await load(req.params.id);
  await query('DELETE FROM discounts WHERE id = ?', [id]);
  res.status(204).end();
});

export default router;
