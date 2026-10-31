import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError } from '../utils/errors.js';

export const COOKIE_NAME = 'cadence_token';

export function setSessionCookie(res, user) {
  const token = jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: String(user.id),
    expiresIn: `${config.sessionDays}d`,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });
}

export const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

/**
 * Reads the session cookie and attaches req.user. The user is loaded from the
 * database on every request, so a disabled account or changed role takes effect at once.
 */
export async function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const [user] = await query('SELECT id, name, email, role FROM users WHERE id = ? AND is_active = 1', [
      Number(payload.sub),
    ]);
    if (user) req.user = user;
  } catch {
    // Expired or tampered token: treat the visitor as signed out.
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Sign in to continue.');
  next();
}

/** Allows only the listed roles, e.g. requireRole('admin') or requireRole('admin', 'staff'). */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw new HttpError(401, 'Sign in to continue.');
    if (!roles.includes(req.user.role)) throw new HttpError(403, "You don't have permission to do that.");
    next();
  };
}
