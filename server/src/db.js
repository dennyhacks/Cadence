import mysql from 'mysql2/promise';
import { config } from './config.js';

// timezone 'Z' keeps every date in UTC, so the server and database never disagree.
export const pool = mysql.createPool({
  ...config.db,
  ...(config.dbSsl && { ssl: config.dbSslOptions }),
  waitForConnections: true,
  connectionLimit: config.dbPoolSize,
  enableKeepAlive: true,
  timezone: 'Z',
  charset: 'utf8mb4',
});

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Turns a raw MySQL connection error into a message a person can act on. */
export function explainDbError(err) {
  const { host, port, user, database } = config.db;
  switch (err.code) {
    case 'ECONNREFUSED':
      return `Cannot reach MySQL at ${host}:${port}. Start the MySQL server and try again.`;
    case 'ER_ACCESS_DENIED_ERROR':
      return `MySQL rejected the login for user "${user}". Check DB_USER and DB_PASSWORD in server/.env.`;
    case 'ER_BAD_DB_ERROR':
      return `Database "${database}" does not exist. Run: npm run db:setup`;
    default:
      return err.message;
  }
}
