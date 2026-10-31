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

// ---- Catalog (products and plans) ----

const money = (label) =>
  z
    .number({ error: `Enter ${label} as a number.` })
    .min(0, `${label[0].toUpperCase()}${label.slice(1)} cannot be negative.`)
    .max(9_999_999.99, `${label[0].toUpperCase()}${label.slice(1)} is too large.`)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most 2 decimal places.');

const text = (label, max) =>
  z
    .string({ error: `Enter ${label}.` })
    .trim()
    .min(1, `Enter ${label}.`)
    .max(max, `${label[0].toUpperCase()}${label.slice(1)} must be ${max} characters or fewer.`);

const variant = z.object({
  attribute: text('an attribute, for example Brand', 60),
  value: text('a value, for example Odoo', 60),
  extra_price: money('the extra price'),
});

export const productSchema = z
  .object({
    name: text('a product name', 160),
    type: z.enum(['service', 'goods'], { error: 'Choose service or goods.' }),
    sales_price: money('the sales price'),
    cost_price: money('the cost price'),
    notes: z.string().trim().max(2000, 'Notes must be 2000 characters or fewer.').optional().default(''),
    variants: z.array(variant).max(50, 'A product can have up to 50 variants.').optional().default([]),
  })
  .superRefine((p, ctx) => {
    const seen = new Set();
    p.variants.forEach((v, i) => {
      const key = `${v.attribute.toLowerCase()}|${v.value.toLowerCase()}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['variants'], message: `Variant ${i + 1} repeats ${v.attribute}: ${v.value}.` });
      }
      seen.add(key);
    });
  });

const isoDate = (label) =>
  z
    .string({ error: `Choose ${label}.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `Choose ${label}.`)
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), `Choose ${label}.`);

export const planSchema = z
  .object({
    name: text('a plan name', 160),
    price: money('the price'),
    billing_period: z.enum(['daily', 'weekly', 'monthly', 'yearly'], { error: 'Choose how often this plan bills.' }),
    min_quantity: z
      .number({ error: 'Enter the minimum quantity as a whole number.' })
      .int('Enter the minimum quantity as a whole number.')
      .min(1, 'Minimum quantity must be at least 1.')
      .max(100000, 'Minimum quantity is too large.'),
    start_date: isoDate('a start date'),
    end_date: isoDate('an end date').nullable().optional().default(null),
    auto_close: z.boolean().default(false),
    closable: z.boolean().default(false),
    pausable: z.boolean().default(false),
    renewable: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (p.end_date && p.end_date < p.start_date) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'The end date cannot be before the start date.' });
    }
    if (p.auto_close && !p.end_date) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'Set an end date for a plan that closes on its own.' });
    }
  });
