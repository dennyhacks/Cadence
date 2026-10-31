// These rules mirror the server (server/src/validation/schemas.js). The server is
// the real gatekeeper; checking here just gives people instant feedback.

export const PASSWORD_RULES = [
  { id: 'length', label: 'More than 8 characters', test: (p) => p.length > 8 },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'special', label: 'A special character', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export function validateEmail(value) {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (email.length > 255) return 'Email must be 255 characters or fewer.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  return '';
}

export function validateName(value) {
  const name = value.trim();
  if (!name) return 'Enter your name.';
  if (name.length < 2) return 'Name must be at least 2 characters.';
  if (name.length > 120) return 'Name must be 120 characters or fewer.';
  return '';
}

export function validateNewPassword(value) {
  if (!value) return 'Enter a password.';
  if (value.length > 64) return 'Password must be 64 characters or fewer.';
  const missing = PASSWORD_RULES.filter((rule) => !rule.test(value)).map((rule) => rule.label.toLowerCase());
  return missing.length ? `Password needs ${missing.join(', ')}.` : '';
}

export function validateConfirm(password, confirm) {
  if (!confirm) return 'Enter your password again.';
  if (password !== confirm) return 'Passwords do not match.';
  return '';
}

/** Drops empty messages so `Object.keys(errors).length` tells you whether anything is wrong. */
export function compact(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}
