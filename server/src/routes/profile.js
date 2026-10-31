import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, profileSchema } from '../validation/schemas.js';

const router = Router();
router.use(requireAuth);

const COLUMNS = 'id, name, email, role, company, phone, billing_address';
const toProfile = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  company: u.company ?? '', phone: u.phone ?? '', billing_address: u.billing_address ?? '',
});

// People change their own details. These are copied onto each new invoice as the "billed to" details.
router.get('/', async (req, res) => {
  const [user] = await query(`SELECT ${COLUMNS} FROM users WHERE id = ?`, [req.user.id]);
  res.json({ profile: toProfile(user) });
});

router.put('/', async (req, res) => {
  const p = parse(profileSchema, req.body);
  await query('UPDATE users SET name = ?, company = ?, phone = ?, billing_address = ? WHERE id = ?', [
    p.name, p.company || null, p.phone || null, p.billing_address || null, req.user.id,
  ]);
  const [user] = await query(`SELECT ${COLUMNS} FROM users WHERE id = ?`, [req.user.id]);
  res.json({ profile: toProfile(user) });
});

export default router;
