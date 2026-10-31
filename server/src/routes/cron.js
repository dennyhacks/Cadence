import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../utils/errors.js';
import { generateDueInvoices } from '../services/billing.js';
import { closeExpiredSubscriptions } from '../services/subscriptions.js';

const router = Router();

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Where a server cannot keep a timer running (for example a serverless host), a scheduler calls this once a day
// with the CRON_SECRET. It does what the hourly job does on a normal server. Repeating it is safe.
router.get('/billing', async (req, res) => {
  const given = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!config.cronSecret || !same(given, config.cronSecret)) throw new HttpError(401, 'Not allowed.');

  const closed = await closeExpiredSubscriptions();
  const invoices = await generateDueInvoices();
  res.json({ closed, ...invoices });
});

export default router;
