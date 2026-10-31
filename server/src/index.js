import { config } from './config.js';
import { pool, explainDbError } from './db.js';
import { createApp } from './app.js';
import { closeExpiredSubscriptions } from './services/subscriptions.js';

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

// Plans that close on their own: close what has expired now, then check every hour.
const closeExpired = () =>
  closeExpiredSubscriptions()
    .then((n) => n && console.log(`Closed ${n} expired subscription(s).`))
    .catch((err) => console.error('Closing expired subscriptions failed:', err.message));
closeExpired();
setInterval(closeExpired, 60 * 60 * 1000).unref();
