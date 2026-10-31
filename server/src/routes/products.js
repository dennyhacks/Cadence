import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { requireRole } from '../middleware/auth.js';
import { parse, productSchema } from '../validation/schemas.js';

const router = Router();
router.use(requireRole('admin', 'staff'));

const toProduct = (row) => ({
  ...row,
  sales_price: Number(row.sales_price),
  cost_price: Number(row.cost_price),
});
const toVariant = (v) => ({ ...v, extra_price: Number(v.extra_price) });

const nameTaken = () =>
  new HttpError(409, 'A product with this name already exists.', { name: 'A product with this name already exists.' });

async function load(id) {
  const [product] = await query('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) throw new HttpError(404, 'Product not found.');
  const variants = await query(
    'SELECT id, attribute, value, extra_price FROM product_variants WHERE product_id = ? ORDER BY attribute, id',
    [id]
  );
  return { ...toProduct(product), variants: variants.map(toVariant) };
}

const parseId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'Product not found.');
  return id;
};

// ?variants=1 also returns each product's variants, for pickers that need them.
router.get('/', async (req, res) => {
  const rows = await query(
    `SELECT p.*, COUNT(v.id) AS variant_count
       FROM products p LEFT JOIN product_variants v ON v.product_id = p.id
      GROUP BY p.id ORDER BY p.name`
  );
  const products = rows.map((r) => ({ ...toProduct(r), variant_count: Number(r.variant_count) }));
  if (req.query.variants) {
    const variants = await query('SELECT product_id, attribute, value, extra_price FROM product_variants ORDER BY attribute, value');
    for (const p of products) {
      p.variants = variants.filter((v) => v.product_id === p.id).map((v) => ({ attribute: v.attribute, value: v.value, extra_price: Number(v.extra_price) }));
    }
  }
  res.json({ products });
});

router.get('/:id', async (req, res) => {
  res.json({ product: await load(parseId(req.params.id)) });
});

async function saveVariants(conn, productId, variants) {
  await conn.execute('DELETE FROM product_variants WHERE product_id = ?', [productId]);
  for (const v of variants) {
    await conn.execute('INSERT INTO product_variants (product_id, attribute, value, extra_price) VALUES (?, ?, ?, ?)', [
      productId,
      v.attribute,
      v.value,
      v.extra_price,
    ]);
  }
}

router.post('/', async (req, res) => {
  const p = parse(productSchema, req.body);
  try {
    const id = await withTransaction(async (conn) => {
      const [result] = await conn.execute(
        'INSERT INTO products (name, type, sales_price, cost_price, notes) VALUES (?, ?, ?, ?, ?)',
        [p.name, p.type, p.sales_price, p.cost_price, p.notes || null]
      );
      await saveVariants(conn, result.insertId, p.variants);
      return result.insertId;
    });
    res.status(201).json({ product: await load(id) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw nameTaken();
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  await load(id); // 404 if it does not exist
  const p = parse(productSchema, req.body);
  try {
    await withTransaction(async (conn) => {
      await conn.execute(
        'UPDATE products SET name = ?, type = ?, sales_price = ?, cost_price = ?, notes = ? WHERE id = ?',
        [p.name, p.type, p.sales_price, p.cost_price, p.notes || null, id]
      );
      await saveVariants(conn, id, p.variants);
    });
    res.json({ product: await load(id) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw nameTaken();
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  await load(id);
  try {
    await query('DELETE FROM products WHERE id = ?', [id]);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new HttpError(409, 'This product is used on a subscription, so it cannot be deleted.');
    }
    throw err;
  }
  res.status(204).end();
});

export default router;
