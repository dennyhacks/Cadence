import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { pool, query, explainDbError } from '../src/db.js';

// Demo accounts for testing. Every password meets the signup rules.
const demoUsers = [
  { name: 'Asha Verma', email: 'admin@cadence.test', password: 'Admin@12345', role: 'admin' },
  { name: 'Sam Rivera', email: 'staff@cadence.test', password: 'Staff@12345', role: 'staff' },
  { name: 'Northwind Traders', email: 'customer@cadence.test', password: 'Customer@12345', role: 'customer' },
  { name: 'Kite Studio', email: 'kite@cadence.test', password: 'Customer@12345', role: 'customer' },
  { name: 'Orbit Labs', email: 'orbit@cadence.test', password: 'Customer@12345', role: 'customer' },
];

const demoProducts = [
  {
    name: 'Team Workspace Suite', type: 'service', sales_price: 2400, cost_price: 900,
    notes: 'Shared workspace for small teams.',
    variants: [['Brand', 'Odoo', 560], ['Brand', 'Zoho', 320], ['Brand', 'Custom', 0]],
  },
  {
    name: 'Analytics Add-on', type: 'service', sales_price: 1200, cost_price: 350,
    notes: 'Dashboards and scheduled reports.',
    variants: [['Support', 'Priority', 400]],
  },
  { name: 'Onboarding Kit', type: 'goods', sales_price: 799, cost_price: 420, notes: 'Printed guides and a welcome pack.', variants: [] },
  { name: 'Priority Support', type: 'service', sales_price: 600, cost_price: 150, notes: null, variants: [] },
];

const demoPlans = [
  ['Starter monthly', 499, 'monthly', 1, '2026-01-01', null, 0, 1, 1, 1],
  ['Growth yearly', 4999, 'yearly', 1, '2026-01-01', '2027-12-31', 1, 1, 0, 1],
  ['Team weekly', 149, 'weekly', 3, '2026-01-01', null, 0, 1, 1, 0],
  ['Trial daily', 19, 'daily', 1, '2026-10-01', '2026-12-31', 1, 0, 0, 0],
  ['Enterprise yearly', 19999, 'yearly', 5, '2026-01-01', null, 0, 1, 0, 1],
];

const demoTaxes = [
  ['GST 5%', 5],
  ['GST 12%', 12],
  ['GST 18%', 18],
  ['Service charge', 2.5],
];

// [name, type, value, min_purchase, min_quantity, start, end, usage_limit, times_used, applies_to, product names]
const demoDiscounts = [
  ['Welcome 10%', 'percentage', 10, null, null, '2026-01-01', '2026-12-31', 100, 12, 'subscription', []],
  ['Annual commitment', 'fixed', 500, 2000, null, '2026-01-01', null, null, 0, 'subscription', []],
  ['Workspace bulk offer', 'percentage', 15, null, 5, '2026-01-01', '2026-12-31', 50, 3, 'products', ['Team Workspace Suite', 'Analytics Add-on']],
  ['Summer sale', 'percentage', 20, null, null, '2026-04-01', '2026-06-30', null, 40, 'subscription', []],
  ['Launch week', 'fixed', 250, null, null, '2026-02-01', '2026-12-31', 10, 10, 'subscription', []],
  ['Festive offer', 'percentage', 12, 1000, null, '2026-11-15', '2026-12-31', 200, 0, 'products', ['Onboarding Kit', 'Priority Support']],
];

async function seedTaxesAndDiscounts() {
  for (const [name, rate] of demoTaxes) {
    const [existing] = await query('SELECT id FROM taxes WHERE name = ?', [name]);
    if (existing) continue;
    await query('INSERT INTO taxes (name, rate) VALUES (?, ?)', [name, rate]);
    console.log(`Created  tax      ${name}`);
  }
  for (const [name, type, value, minPurchase, minQty, start, end, limit, used, appliesTo, products] of demoDiscounts) {
    const [existing] = await query('SELECT id FROM discounts WHERE name = ?', [name]);
    if (existing) continue;
    const result = await query(
      `INSERT INTO discounts (name, type, value, min_purchase, min_quantity, start_date, end_date,
                              usage_limit, times_used, applies_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, type, value, minPurchase, minQty, start, end, limit, used, appliesTo]
    );
    for (const productName of products) {
      const [product] = await query('SELECT id FROM products WHERE name = ?', [productName]);
      if (product) await query('INSERT INTO discount_products (discount_id, product_id) VALUES (?, ?)', [result.insertId, product.id]);
    }
    console.log(`Created  discount ${name}`);
  }
}

// [product, 'Attribute: Value' or null, quantity, tax names]
const demoTemplates = [
  ['Team starter bundle', 'Starter monthly', 14, [['Team Workspace Suite', 'Brand: Odoo', 1, ['GST 18%']], ['Priority Support', null, 1, ['GST 18%']]]],
  ['Growth annual bundle', 'Growth yearly', 30, [['Team Workspace Suite', 'Brand: Zoho', 3, ['GST 18%']], ['Analytics Add-on', null, 1, ['GST 18%']]]],
  ['Onboarding pack', 'Team weekly', 7, [['Onboarding Kit', null, 3, ['GST 12%']]]],
];

// [customer email, plan, status, paused, start, expiry, terms, quote valid until, lines]
const demoSubscriptions = [
  ['orbit@cadence.test', 'Starter monthly', 'draft', 0, '2026-11-01', '2026-11-30', 'net_30', null, [['Team Workspace Suite', 'Brand: Odoo', 2, ['GST 18%']]]],
  ['kite@cadence.test', 'Growth yearly', 'quotation', 0, '2026-10-25', '2027-10-24', 'net_15', '2026-11-10', [['Team Workspace Suite', 'Brand: Zoho', 3, ['GST 18%']], ['Analytics Add-on', null, 1, ['GST 18%']]]],
  ['customer@cadence.test', 'Team weekly', 'confirmed', 0, '2026-10-28', '2027-01-31', 'immediate', null, [['Onboarding Kit', null, 3, ['GST 12%']]]],
  ['customer@cadence.test', 'Starter monthly', 'active', 0, '2026-03-01', '2026-11-30', 'net_15', null, [['Team Workspace Suite', 'Brand: Odoo', 1, ['GST 18%']], ['Priority Support', null, 1, ['GST 18%']]]],
  ['kite@cadence.test', 'Starter monthly', 'active', 1, '2026-05-15', '2026-12-14', 'net_30', null, [['Analytics Add-on', 'Support: Priority', 2, ['GST 18%', 'Service charge']]]],
  ['orbit@cadence.test', 'Growth yearly', 'active', 0, '2026-01-01', '2027-01-01', 'net_45', null, [['Team Workspace Suite', 'Brand: Custom', 5, ['GST 18%']], ['Priority Support', null, 5, ['GST 18%']]]],
  ['kite@cadence.test', 'Trial daily', 'closed', 0, '2026-10-01', '2026-10-15', 'immediate', null, [['Priority Support', null, 1, []]]],
];

async function seedSubscriptions() {
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM subscriptions');
  if (n > 0) return;

  const idOf = async (table, name) => (await query(`SELECT id FROM ${table} WHERE name = ?`, [name]))[0]?.id;
  const taxIds = async (names) => Promise.all(names.map((t) => idOf('taxes', t)));
  const split = (label) => (label ? label.split(': ') : [null, null]);

  for (const [name, planName, validity, lines] of demoTemplates) {
    const planId = await idOf('plans', planName);
    const result = await query('INSERT INTO quotation_templates (name, plan_id, validity_days) VALUES (?, ?, ?)', [name, planId, validity]);
    for (const [product, variant, qty, taxes] of lines) {
      const [attribute, value] = split(variant);
      const line = await query(
        'INSERT INTO template_lines (template_id, product_id, variant_attribute, variant_value, quantity) VALUES (?, ?, ?, ?, ?)',
        [result.insertId, await idOf('products', product), attribute, value, qty]
      );
      for (const taxId of await taxIds(taxes)) await query('INSERT INTO template_line_taxes (line_id, tax_id) VALUES (?, ?)', [line.insertId, taxId]);
    }
    console.log(`Created  template ${name}`);
  }

  for (const [email, planName, status, paused, start, expiry, terms, quoteUntil, lines] of demoSubscriptions) {
    const [customer] = await query('SELECT id FROM users WHERE email = ?', [email]);
    const result = await query(
      `INSERT INTO subscriptions (customer_id, plan_id, status, is_paused, start_date, expiry_date, payment_terms, quote_valid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer.id, await idOf('plans', planName), status, paused, start, expiry, terms, quoteUntil]
    );
    await query("UPDATE subscriptions SET number = CONCAT('SUB-', LPAD(id, 5, '0')) WHERE id = ?", [result.insertId]);
    for (const [product, variant, qty, taxes] of lines) {
      const productId = await idOf('products', product);
      const [attribute, value] = split(variant);
      const [{ sales_price }] = await query('SELECT sales_price FROM products WHERE id = ?', [productId]);
      const extra = attribute
        ? Number((await query('SELECT extra_price FROM product_variants WHERE product_id = ? AND attribute = ? AND value = ?', [productId, attribute, value]))[0].extra_price)
        : 0;
      const line = await query(
        'INSERT INTO subscription_lines (subscription_id, product_id, variant_label, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
        [result.insertId, productId, variant, qty, Number(sales_price) + extra]
      );
      for (const taxId of await taxIds(taxes)) await query('INSERT INTO subscription_line_taxes (line_id, tax_id) VALUES (?, ?)', [line.insertId, taxId]);
    }
    console.log(`Created  subscription ${status.padEnd(9)} ${email}`);
  }
}

async function seedCatalog() {
  for (const p of demoProducts) {
    const [existing] = await query('SELECT id FROM products WHERE name = ?', [p.name]);
    if (existing) continue;
    const result = await query('INSERT INTO products (name, type, sales_price, cost_price, notes) VALUES (?, ?, ?, ?, ?)', [
      p.name, p.type, p.sales_price, p.cost_price, p.notes,
    ]);
    for (const [attribute, value, extra] of p.variants) {
      await query('INSERT INTO product_variants (product_id, attribute, value, extra_price) VALUES (?, ?, ?, ?)', [
        result.insertId, attribute, value, extra,
      ]);
    }
    console.log(`Created  product  ${p.name}`);
  }
  for (const plan of demoPlans) {
    const [existing] = await query('SELECT id FROM plans WHERE name = ?', [plan[0]]);
    if (existing) continue;
    await query(
      `INSERT INTO plans (name, price, billing_period, min_quantity, start_date, end_date,
                          auto_close, closable, pausable, renewable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      plan
    );
    console.log(`Created  plan     ${plan[0]}`);
  }
}

async function main() {
  for (const user of demoUsers) {
    const [existing] = await query('SELECT id FROM users WHERE email = ?', [user.email]);
    if (existing) {
      console.log(`Exists   ${user.role.padEnd(8)} ${user.email}`);
      continue;
    }
    const hash = await bcrypt.hash(user.password, config.bcryptRounds);
    await query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
      user.name,
      user.email,
      hash,
      user.role,
    ]);
    console.log(`Created  ${user.role.padEnd(8)} ${user.email}  /  ${user.password}`);
  }
  await seedCatalog();
  await seedTaxesAndDiscounts();
  await seedSubscriptions();
}

main()
  .catch((err) => {
    console.error(`\nSeeding failed: ${explainDbError(err)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
