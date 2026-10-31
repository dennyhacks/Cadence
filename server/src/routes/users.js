import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { publicUser, requireRole } from '../middleware/auth.js';
import { parse, staffSchema } from '../validation/schemas.js';

const router = Router();

// Only the admin can see the user list or add a member of staff.
router.use(requireRole('admin'));

const ROLES = ['admin', 'staff', 'customer'];

// Optional ?role=staff narrows the list to one role.
router.get('/', async (req, res) => {
  const { role } = req.query;
  if (role !== undefined && !ROLES.includes(role)) {
    throw new HttpError(400, 'Role must be admin, staff or customer.', { role: 'Role must be admin, staff or customer.' });
  }
  const users = await query(
    `SELECT id, name, email, role, is_active, created_at FROM users ${role ? 'WHERE role = ?' : ''} ORDER BY created_at DESC, id DESC`,
    role ? [role] : []
  );
  res.json({ users });
});

router.post('/staff', async (req, res) => {
  const { name, email, password } = parse(staffSchema, req.body);
  const hash = await bcrypt.hash(password, config.bcryptRounds);

  try {
    const result = await query("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'staff')", [
      name,
      email,
      hash,
    ]);
    res.status(201).json({ user: publicUser({ id: result.insertId, name, email, role: 'staff' }) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'An account with this email already exists.', {
        email: 'An account with this email already exists.',
      });
    }
    throw err;
  }
});

export default router;
