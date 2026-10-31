import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// The team picks a customer when preparing a subscription.
router.get('/', requireRole('admin', 'staff'), async (_req, res) => {
  const customers = await query("SELECT id, name, email FROM users WHERE role = 'customer' AND is_active = 1 ORDER BY name");
  res.json({ customers });
});

export default router;
