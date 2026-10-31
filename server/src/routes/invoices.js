import { Router } from 'express';
import { HttpError } from '../utils/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { invoiceActionSchema, parse, paymentSchema } from '../validation/schemas.js';
import { generateDueInvoices, isInvoiceFilter, listInvoices, loadInvoice, recordPayment, runInvoiceAction } from '../services/billing.js';
import { closeExpiredSubscriptions } from '../services/subscriptions.js';

const router = Router();
router.use(requireAuth);
const team = requireRole('admin', 'staff');

router.get('/', async (req, res) => {
  const { status } = req.query;
  if (status !== undefined && !isInvoiceFilter(status)) {
    throw new HttpError(400, 'Choose a valid status.', { status: 'Choose a valid status.' });
  }
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  const subscriptionId = Number.parseInt(req.query.subscription_id, 10) || undefined;
  res.json(await listInvoices({ user: req.user, status, subscriptionId, page, pageSize }));
});

// The "Generate due invoices" button. The same job also runs on its own every hour.
router.post('/generate', team, async (_req, res) => {
  await closeExpiredSubscriptions();
  res.json(await generateDueInvoices());
});

router.get('/:id', async (req, res) => {
  res.json({ invoice: await loadInvoice(req.params.id, req.user) });
});

router.post('/:id/action', team, async (req, res) => {
  const { action } = parse(invoiceActionSchema, req.body);
  res.json({ invoice: await runInvoiceAction(req.params.id, action, req.user) });
});

router.post('/:id/payments', team, async (req, res) => {
  const input = parse(paymentSchema, req.body);
  res.status(201).json({ invoice: await recordPayment(req.params.id, input, req.user) });
});

export default router;
