import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { pool, query, explainDbError } from '../src/db.js';

// Demo accounts for testing. Every password meets the signup rules.
const demoUsers = [
  { name: 'Asha Verma', email: 'admin@cadence.test', password: 'Admin@12345', role: 'admin' },
  { name: 'Sam Rivera', email: 'staff@cadence.test', password: 'Staff@12345', role: 'staff' },
  { name: 'Northwind Traders', email: 'customer@cadence.test', password: 'Customer@12345', role: 'customer' },
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
}

main()
  .catch((err) => {
    console.error(`\nSeeding failed: ${explainDbError(err)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
