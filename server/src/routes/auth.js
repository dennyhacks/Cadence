import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { sendResetEmail } from '../utils/mailer.js';
import { clearSessionCookie, publicUser, setSessionCookie } from '../middleware/auth.js';
import { forgotSchema, loginSchema, parse, resetSchema, signupSchema } from '../validation/schemas.js';

const router = Router();

const limiter = (max, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, message)),
  });

const loginLimiter = limiter(30, 'Too many sign-in attempts. Wait a few minutes and try again.');
const signupLimiter = limiter(30, 'Too many sign-up attempts. Wait a few minutes and try again.');
const forgotLimiter = limiter(8, 'Too many reset requests. Wait a few minutes and try again.');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// Compared against when the email is unknown, so a wrong email and a wrong
// password take about the same time to reject.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);

router.post('/signup', signupLimiter, async (req, res) => {
  const { name, email, password } = parse(signupSchema, req.body);
  const hash = await bcrypt.hash(password, config.bcryptRounds);

  let id;
  try {
    const result = await query("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'customer')", [
      name,
      email,
      hash,
    ]);
    id = result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'An account with this email already exists.', {
        email: 'An account with this email already exists. Sign in instead.',
      });
    }
    throw err;
  }

  const user = { id, name, email, role: 'customer' };
  setSessionCookie(res, user);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const [user] = await query('SELECT id, name, email, role, password_hash, is_active FROM users WHERE email = ?', [email]);

  const matches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !matches) throw new HttpError(401, 'Incorrect email or password.');
  if (!user.is_active) throw new HttpError(403, 'This account is turned off. Ask an admin to turn it back on.');

  setSessionCookie(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ message: 'Signed out.' });
});

// Returns { user: null } instead of an error when signed out, so the app can
// check on page load without a failed request showing up in the console.
router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const { email } = parse(forgotSchema, req.body);
  const [user] = await query('SELECT id, name, email FROM users WHERE email = ? AND is_active = 1', [email]);

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    // Only the hash is stored, so a copy of the database cannot be used to reset anyone's password.
    await query('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [user.id]);
    await query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))',
      [user.id, sha256(token), config.resetMinutes]
    );
    const link = `${config.clientUrl}/reset-password?token=${token}`;
    // Not awaited: the response is the same speed whether or not the account exists.
    sendResetEmail(user, link).catch((err) => console.error('Could not send reset email:', err.message));
  }

  // Same answer either way, so this form cannot be used to find out who has an account.
  res.json({ message: 'If an account exists for that email, a reset link is on its way.' });
});

router.get('/reset-password/validate', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const [row] = token
    ? await query('SELECT id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()', [
        sha256(token),
      ])
    : [];
  res.json({ valid: Boolean(row) });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = parse(resetSchema, req.body);
  const invalid = new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');

  const [reset] = await query(
    'SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()',
    [sha256(token)]
  );
  if (!reset) throw invalid;

  const hash = await bcrypt.hash(password, config.bcryptRounds);
  await withTransaction(async (conn) => {
    // The WHERE used_at IS NULL check makes the link single-use even if two requests race.
    const [claimed] = await conn.execute(
      'UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL',
      [reset.id]
    );
    if (claimed.affectedRows !== 1) throw invalid;
    await conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, reset.user_id]);
    await conn.execute('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [
      reset.user_id,
    ]);
  });

  res.json({ message: 'Password updated. Sign in with your new password.' });
});

export default router;
