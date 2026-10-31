import { z } from 'zod';
import { HttpError } from '../utils/errors.js';

// Password rules from the brief: more than eight characters, with an uppercase
// letter, a lowercase letter and a special character.
export const PASSWORD_RULES = [
  { id: 'length', text: 'more than 8 characters', test: (p) => p.length > 8 },
  { id: 'upper', text: 'an uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', text: 'a lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'special', text: 'a special character', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

const email = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .max(255, 'Email must be 255 characters or fewer.')
  .pipe(z.email('Enter a valid email address.'));

const name = z
  .string({ error: 'Enter your name.' })
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(120, 'Name must be 120 characters or fewer.');

const newPassword = z
  .string({ error: 'Enter a password.' })
  .max(64, 'Password must be 64 characters or fewer.')
  .superRefine((value, ctx) => {
    const missing = PASSWORD_RULES.filter((rule) => !rule.test(value)).map((rule) => rule.text);
    if (missing.length) {
      ctx.addIssue({ code: 'custom', message: `Password needs ${missing.join(', ')}.` });
    }
  });

export const signupSchema = z.object({ name, email, password: newPassword });
export const staffSchema = z.object({ name, email, password: newPassword });
export const loginSchema = z.object({
  email,
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
});
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({
  token: z.string({ error: 'This reset link is invalid.' }).min(1).max(200),
  password: newPassword,
});

/** Validates `data` and throws a 400 HttpError with per-field messages when it is wrong. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;

  const errors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] ?? 'form';
    if (!errors[field]) errors[field] = issue.message;
  }
  throw new HttpError(400, 'Fix the highlighted fields and try again.', errors);
}
