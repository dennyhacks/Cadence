import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { exportPaymentsCsv, listPayments } from '../services/billing.js';

const router = Router();

router.get('/export.csv', requireRole('admin', 'staff'), async (_req, res) => {
  const csv = await exportPaymentsCsv();
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
  res.send(`\uFEFF${csv}`);
});

router.get('/', requireRole('admin', 'staff'), async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  res.json(await listPayments({ page, pageSize }));
});

export default router;
