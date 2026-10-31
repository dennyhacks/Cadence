import { config } from './config.js';
import { pool, explainDbError } from './db.js';
import { createApp } from './app.js';

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
