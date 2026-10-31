import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { listPayments } from '../services/billing.js';

const router = Router();

router.get('/', requireRole('admin', 'staff'), async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  res.json(await listPayments({ page, pageSize }));
});

export default router;
