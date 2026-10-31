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
  const ROW = { lines: 'Line', variants: 'Variant' };
  for (const issue of result.error.issues) {
    const field = issue.path[0] ?? 'form';
    // A problem inside a list names the row, e.g. "Line 2: Choose a product."
    const row = typeof issue.path[1] === 'number' && ROW[field] ? `${ROW[field]} ${issue.path[1] + 1}: ` : '';
    if (!errors[field]) errors[field] = row + issue.message;
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

// ---- Taxes and discounts ----

export const taxSchema = z.object({
  name: text('a tax name', 120),
  rate: z
    .number({ error: 'Enter the rate as a number.' })
    .min(0, 'The rate cannot be negative.')
    .max(100, 'The rate cannot be more than 100.')
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most 2 decimal places.'),
  apply_automatically: z.boolean().optional().default(false),
});

const optionalMoney = (label) => money(label).nullable().optional().default(null);

export const discountSchema = z
  .object({
    name: text('a discount name', 160),
    type: z.enum(['fixed', 'percentage'], { error: 'Choose a fixed amount or a percentage.' }),
    value: money('the discount value'),
    min_purchase: optionalMoney('the minimum purchase'),
    min_quantity: z
      .number({ error: 'Enter the minimum quantity as a whole number.' })
      .int('Enter the minimum quantity as a whole number.')
      .min(1, 'Minimum quantity must be at least 1.')
      .max(100000, 'Minimum quantity is too large.')
      .nullable()
      .optional()
      .default(null),
    start_date: isoDate('a start date'),
    end_date: isoDate('an end date').nullable().optional().default(null),
    usage_limit: z
      .number({ error: 'Enter the usage limit as a whole number.' })
      .int('Enter the usage limit as a whole number.')
      .min(1, 'The usage limit must be at least 1.')
      .max(10_000_000, 'The usage limit is too large.')
      .nullable()
      .optional()
      .default(null),
    applies_to: z.enum(['products', 'subscription'], { error: 'Choose what the discount applies to.' }),
    product_ids: z.array(z.number().int().positive()).max(500).optional().default([]),
  })
  .superRefine((d, ctx) => {
    if (d.value <= 0) ctx.addIssue({ code: 'custom', path: ['value'], message: 'The discount must be more than 0.' });
    if (d.type === 'percentage' && d.value > 100) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage cannot be more than 100.' });
    }
    if (d.end_date && d.end_date < d.start_date) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'The end date cannot be before the start date.' });
    }
    if (d.applies_to === 'products' && d.product_ids.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['product_ids'], message: 'Choose at least one product.' });
    }
  });

// ---- Quotation templates and subscriptions ----

const id = (message) => z.number({ error: message }).int(message).positive(message);

const line = z.object({
  product_id: id('Choose a product.'),
  variant: z
    .object({ attribute: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(60) })
    .nullable()
    .optional()
    .default(null),
  quantity: z
    .number({ error: 'Enter the quantity as a whole number.' })
    .int('Enter the quantity as a whole number.')
    .min(1, 'The quantity must be at least 1.')
    .max(100000, 'The quantity is too large.'),
  // Left out, the taxes marked "apply automatically" are used. Sent (even empty), exactly what was chosen is used.
  tax_ids: z.array(id('Choose a valid tax.')).max(10, 'Use at most 10 taxes on a line.').optional(),
});

const lines = z.array(line).min(1, 'Add at least one product line.').max(50, 'Use at most 50 lines.');

const validityDays = z
  .number({ error: 'Enter the number of days as a whole number.' })
  .int('Enter the number of days as a whole number.')
  .min(1, 'It must be valid for at least 1 day.')
  .max(365, 'It can be valid for at most 365 days.');

export const PAYMENT_TERMS = ['immediate', 'net_15', 'net_30', 'net_45'];

export const templateSchema = z.object({
  name: text('a template name', 160),
  plan_id: id('Choose a plan.'),
  validity_days: validityDays,
  lines,
});

export const subscriptionSchema = z
  .object({
    customer_id: id('Choose a customer.'),
    plan_id: id('Choose a plan.'),
    template_id: id('Choose a valid template.').nullable().optional().default(null),
    start_date: isoDate('a start date'),
    expiry_date: isoDate('an expiry date').nullable().optional().default(null),
    payment_terms: z.enum(PAYMENT_TERMS, { error: 'Choose the payment terms.' }),
    validity_days: validityDays.optional().default(30),
    lines,
  })
  .superRefine((s, ctx) => {
    if (s.expiry_date && s.expiry_date < s.start_date) {
      ctx.addIssue({ code: 'custom', path: ['expiry_date'], message: 'The expiry date cannot be before the start date.' });
    }
  });

export const transitionSchema = z.object({
  action: z.enum(['send', 'confirm', 'activate', 'close', 'pause', 'resume', 'renew'], { error: 'Choose a valid action.' }),
});

// ---- Invoices and payments ----

export const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'upi', 'cheque'];

export const invoiceActionSchema = z.object({
  action: z.enum(['confirm', 'cancel', 'send'], { error: 'Choose a valid action.' }),
});

export const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS, { error: 'Choose how the payment was made.' }),
  amount: z
    .number({ error: 'Enter the amount as a number.' })
    .gt(0, 'The amount must be more than 0.')
    .max(99_999_999.99, 'The amount is too large.')
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most 2 decimal places.'),
  paid_on: isoDate('the payment date'),
  note: z.string().trim().max(500, 'The note must be 500 characters or fewer.').optional().default(''),
});

// ---- Finance dashboard ----

export const dashboardQuerySchema = z.object({
  from: isoDate('a start date').optional(),
  to: isoDate('an end date').optional(),
  plan_id: z.coerce.number({ error: 'Choose a valid plan.' }).int('Choose a valid plan.').positive('Choose a valid plan.').optional(),
});

// ---- Customer profile ----

const optionalText = (label, max) =>
  z
    .string({ error: `Enter ${label} as text.` })
    .trim()
    .max(max, `${label[0].toUpperCase()}${label.slice(1)} must be ${max} characters or fewer.`)
    .optional()
    .default('');

export const profileSchema = z.object({
  name,
  company: optionalText('the company name', 160),
  phone: optionalText('the phone number', 30).refine((v) => v === '' || /^[+()\-.\s\d]{6,30}$/.test(v), 'Enter a valid phone number, for example +91 98765 43210.'),
  billing_address: optionalText('the billing address', 500),
});
