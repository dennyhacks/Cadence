import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { explainDbError } from '../src/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const fresh = process.argv.includes('--fresh');

async function main() {
  const { database, ...server } = config.db;

  // Create the database if the MySQL user is allowed to. If it already exists, this does nothing.
  const ssl = config.dbSsl ? { ssl: config.dbSslOptions } : {};
  const root = await mysql.createConnection({ ...server, ...ssl });
  try {
    await root.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (err) {
    console.warn(`Could not create database "${database}" (${err.code}). Continuing in case it exists.`);
  }
  await root.end();

  const db = await mysql.createConnection({ ...config.db, ...ssl, multipleStatements: true });
  try {
    if (fresh) {
      const [tables] = await db.query('SHOW TABLES');
      await db.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const row of tables) {
        await db.query(`DROP TABLE IF EXISTS \`${Object.values(row)[0]}\``);
      }
      await db.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log(`Dropped ${tables.length} tables.`);
    }

    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(190) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);

    const [rows] = await db.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      console.log(`Applied ${file}`);
      count++;
    }
    console.log(count ? `Done. ${count} migration(s) applied.` : 'Database is up to date.');
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(`\nMigration failed: ${explainDbError(err)}`);
  process.exit(1);
});
