import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// ENV_FILE lets a command use another settings file, for example the hosted database:
//   ENV_FILE=.env.remote npm run db:setup
const envFile = process.env.ENV_FILE ?? '.env';
dotenv.config({ path: fileURLToPath(new URL(`../${envFile}`, import.meta.url)), quiet: true });

const env = process.env;

/** Hosting services usually give one connection URL: mysql://user:password@host:port/database */
function fromUrl(value) {
  if (!value) return {};
  const u = new URL(value);
  return {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}
const url = fromUrl(env.DATABASE_URL);
const onVercel = Boolean(env.VERCEL);
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
  // How many proxies sit in front of the app (Vercel adds one). Without this every visitor looks like the proxy,
  // so the sign-in and reset limits would count everyone together.
  trustProxy: Number(env.TRUST_PROXY) || (onVercel ? 1 : 0),
  bcryptRounds: Number(env.BCRYPT_ROUNDS) || 12,
  sessionDays: 7,
  resetMinutes: 60,
  // A job runner such as Vercel Cron calls /api/cron/billing with this secret.
  cronSecret: env.CRON_SECRET || '',
  // Razorpay Checkout. Without both keys the card form in test mode is used instead.
  razorpay: { keyId: env.RAZORPAY_KEY_ID || '', keySecret: env.RAZORPAY_KEY_SECRET || '' },
  db: {
    host: url.host ?? (env.DB_HOST || '127.0.0.1'),
    port: url.port ?? (Number(env.DB_PORT) || 3306),
    user: url.user ?? (env.DB_USER || 'root'),
    password: url.password ?? (env.DB_PASSWORD || ''),
    database: url.database ?? (env.DB_NAME || 'cadence'),
  },
  // Hosted databases need an encrypted connection. A serverless function keeps its pool small,
  // because many copies of it can run at once.
  dbSsl: env.DB_SSL === 'true',
  dbSslOptions: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  dbPoolSize: Number(env.DB_POOL) || (onVercel ? 3 : 10),
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'Cadence <no-reply@cadence.local>',
  },
};
