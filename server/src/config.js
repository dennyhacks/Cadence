import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const DEFAULT_SECRET = 'dev-only-secret-change-me';

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET === DEFAULT_SECRET)) {
  throw new Error('Set a strong JWT_SECRET in server/.env before running in production.');
}

export const config = {
  isProd,
  port: Number(env.PORT) || 4000,
  clientUrl: env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: env.JWT_SECRET || DEFAULT_SECRET,
  cookieSecure: env.COOKIE_SECURE === 'true',
  bcryptRounds: Number(env.BCRYPT_ROUNDS) || 12,
  sessionDays: 7,
  resetMinutes: 60,
  db: {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'cadence',
  },
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'Cadence <no-reply@cadence.local>',
  },
};
