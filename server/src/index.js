import { config } from './config.js';
import { pool, explainDbError } from './db.js';
import { createApp } from './app.js';
import { closeExpiredSubscriptions } from './services/subscriptions.js';
import { generateDueInvoices } from './services/billing.js';

try {
  await pool.query('SELECT 1');
} catch (err) {
  console.error(`\nDatabase error: ${explainDbError(err)}\n`);
  process.exit(1);
}

createApp().listen(config.port, () => {
  console.log(`Cadence API running at http://localhost:${config.port}`);
  if (!config.smtp.host) console.log('No SMTP set: password reset links will be printed here.');
});

// The daily job. It closes subscriptions whose plan closes on its own, then invoices every period that is due.
// It runs at start-up and then every hour, so a day the server was off is caught up. Repeating it is safe: the
// database allows one invoice per subscription and period, so nothing is billed twice.
async function dailyJob() {
  try {
    const closed = await closeExpiredSubscriptions();
    if (closed) console.log(`Closed ${closed} expired subscription(s).`);
    const { created, skipped } = await generateDueInvoices();
    if (created || skipped) console.log(`Billing: ${created} invoice(s) created${skipped ? `, ${skipped} to retry` : ''}.`);
  } catch (err) {
    console.error('The daily billing job failed:', err.message);
  }
}
dailyJob();
setInterval(dailyJob, 60 * 60 * 1000).unref();
