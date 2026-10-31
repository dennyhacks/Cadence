import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { pool, query, explainDbError } from '../src/db.js';

// Loads a large, realistic data set to check that every page stays fast with thousands of subscriptions:
//   npm run db:seed:volume            (defaults: 400 customers, 5000 subscriptions, about 40000 invoices)
//   npm run db:seed:volume -- 10000   (a different number of subscriptions)
// Everything it makes belongs to customers named vol.N@cadence.test. `npm run db:reset` removes it again.
// The invoices are summarised to one line each, which is all the list and dashboard pages need.

const SUBSCRIPTIONS = Number(process.argv[2]) || 5000;
const CUSTOMERS = Math.max(50, Math.round(SUBSCRIPTIONS / 12));
const BATCH = 1000;

let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const dateOf = (d) => d.toISOString().slice(0, 10);
const addMonths = (d, m) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, Math.min(d.getUTCDate(), 28)));

async function insertBatches(sql, rows) {
  for (let i = 0; i < rows.length; i += BATCH) await pool.query(sql, [rows.slice(i, i + BATCH)]);
}

async function main() {
  const [{ n }] = await query("SELECT COUNT(*) AS n FROM users WHERE email LIKE 'vol.%@cadence.test'");
  if (n > 0) {
    console.log('Volume data is already loaded. Run `npm run db:reset` first to start over.');
    return;
  }
  const started = Date.now();
  const now = new Date();
  const todayStr = dateOf(now);

  // Monthly and yearly plans only, each billed on its own cycle, so the billing job finds nothing missing.
  const allPlans = await query("SELECT id, price, billing_period FROM plans WHERE billing_period IN ('monthly', 'yearly')");
  const products = await query('SELECT id, sales_price FROM products');
  if (!allPlans.length || !products.length) throw new Error('Run npm run db:setup first, so there are plans and products to use.');

  // Customers
  const hash = await bcrypt.hash('Customer@12345', config.bcryptRounds);
  const users = Array.from({ length: CUSTOMERS }, (_, i) => [`Volume Customer ${i + 1}`, `vol.${i + 1}@cadence.test`, hash, 'customer']);
  await insertBatches('INSERT INTO users (name, email, password_hash, role) VALUES ?', users);
  const customerIds = (await query("SELECT id FROM users WHERE email LIKE 'vol.%@cadence.test' ORDER BY id")).map((r) => r.id);

  // Subscriptions: mostly active, with a realistic spread of every other status
  const terms = ['immediate', 'net_15', 'net_30', 'net_45'];
  const subs = [];
  for (let i = 0; i < SUBSCRIPTIONS; i += 1) {
    const roll = rand();
    const status = roll < 0.55 ? 'active' : roll < 0.8 ? 'closed' : roll < 0.85 ? 'confirmed' : roll < 0.9 ? 'quotation' : roll < 0.95 ? 'draft' : 'active';
    const paused = status === 'active' && roll >= 0.95 ? 1 : 0;
    const plan = pick(allPlans);
    const start = addMonths(now, -Math.floor(rand() * (plan.billing_period === 'yearly' ? 30 : 24)));
    const expiry = status === 'closed' ? addMonths(start, 3 + Math.floor(rand() * 10)) : rand() < 0.5 ? addMonths(now, 1 + Math.floor(rand() * 12)) : null;
    subs.push([pick(customerIds), plan.id, plan.price, status, paused, dateOf(start), expiry ? dateOf(expiry) : null, pick(terms)]);
  }
  await insertBatches(
    'INSERT INTO subscriptions (customer_id, plan_id, plan_price, status, is_paused, start_date, expiry_date, payment_terms) VALUES ?',
    subs
  );
  await query("UPDATE subscriptions SET number = CONCAT('SUB-', LPAD(id, 5, '0')) WHERE number IS NULL");
  const created = await query(
    `SELECT s.id, s.customer_id, s.status, s.plan_price, s.payment_terms, p.billing_period, DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(s.expiry_date, '%Y-%m-%d') AS expiry_date, u.name, u.email, p.name AS plan_name
       FROM subscriptions s JOIN users u ON u.id = s.customer_id JOIN plans p ON p.id = s.plan_id
      WHERE u.email LIKE 'vol.%@cadence.test' ORDER BY s.id`
  );

  // One or two lines on each subscription
  const lineRows = [];
  const subtotal = new Map();
  for (const s of created) {
    let sum = 0;
    for (let k = 0; k < 1 + Math.floor(rand() * 2); k += 1) {
      const product = pick(products);
      const qty = 1 + Math.floor(rand() * 5);
      lineRows.push([s.id, product.id, qty, product.sales_price]);
      sum += qty * Number(product.sales_price);
    }
    subtotal.set(s.id, sum);
  }
  await insertBatches('INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price) VALUES ?', lineRows);

  // Monthly invoices for every subscription that has been billed
  const invoices = [];
  const dueDays = { immediate: 0, net_15: 15, net_30: 30, net_45: 45 };
  for (const s of created) {
    if (!['active', 'closed'].includes(s.status)) continue;
    const begin = new Date(`${s.start_date}T00:00:00Z`);
    const stop = s.expiry_date && s.expiry_date < todayStr ? s.expiry_date : todayStr;
    const step = s.billing_period === 'yearly' ? 12 : 1;
    for (let k = 0; k < 36; k += 1) {
      const periodStart = addMonths(begin, k * step);
      const day = dateOf(periodStart);
      if (day > stop) break;
      const base = subtotal.get(s.id);
      const untaxed = Math.round((base + Number(s.plan_price)) * 100) / 100;
      const tax = Math.round(base * 0.18 * 100) / 100;
      const total = Math.round((untaxed + tax) * 100) / 100;
      const age = (now - periodStart) / 86400000;
      const r = rand();
      const status = age < 30 ? (r < 0.3 ? 'draft' : 'confirmed') : r < 0.86 ? 'paid' : r < 0.98 ? 'confirmed' : 'cancelled';
      const due = new Date(periodStart.getTime() + dueDays[s.payment_terms] * 86400000);
      invoices.push([
        s.id, s.customer_id, status, day, dateOf(new Date(addMonths(periodStart, step).getTime() - 86400000)), day, dateOf(due),
        s.name, s.email, s.plan_name, untaxed, 0, tax, total, status === 'paid' ? total : 0,
      ]);
    }
  }
  await insertBatches(
    `INSERT INTO invoices (subscription_id, customer_id, status, period_start, period_end, invoice_date, due_date, customer_name,
                           customer_email, plan_name, untaxed_total, discount_total, tax_total, total, amount_paid) VALUES ?`,
    invoices
  );
  const volume = "customer_id IN (SELECT id FROM users WHERE email LIKE 'vol.%@cadence.test')";
  await query(`UPDATE invoices SET number = CONCAT('INV-', LPAD(id, 5, '0')) WHERE number IS NULL AND ${volume}`);
  // Tell the billing job these periods are already invoiced, so it does not try them again.
  await query(
    `UPDATE subscriptions s JOIN (SELECT subscription_id, COUNT(*) AS c FROM invoices WHERE ${volume} GROUP BY subscription_id) x
         ON x.subscription_id = s.id SET s.next_period_index = x.c`
  );

  // Some old unpaid invoices are part paid; every paid or part-paid invoice gets a payment
  await query(
    `UPDATE invoices SET amount_paid = ROUND(total * 0.4, 2) WHERE status = 'confirmed' AND amount_paid = 0 AND id % 4 = 0 AND ${volume}`
  );
  await query(
    `INSERT INTO payments (invoice_id, method, amount, paid_on)
     SELECT id, ELT(1 + id % 5, 'cash', 'card', 'bank_transfer', 'upi', 'cheque'), amount_paid, LEAST(DATE_ADD(invoice_date, INTERVAL id % 20 DAY), CURDATE())
       FROM invoices WHERE amount_paid > 0 AND ${volume}`
  );
  await query(
    `INSERT INTO invoice_lines (invoice_id, kind, description, quantity, unit_price, discount_amount, tax_label, tax_amount, amount)
     SELECT id, 'product', 'Subscription charges', 1, untaxed_total, 0, 'GST 18%', tax_total, total FROM invoices WHERE ${volume}`
  );

  const [counts] = await query(
    `SELECT (SELECT COUNT(*) FROM subscriptions) AS subscriptions, (SELECT COUNT(*) FROM invoices) AS invoices, (SELECT COUNT(*) FROM payments) AS payments`
  );
  console.log(`Loaded ${CUSTOMERS} customers. Totals now: ${counts.subscriptions} subscriptions, ${counts.invoices} invoices, ${counts.payments} payments (${((Date.now() - started) / 1000).toFixed(1)}s).`);
}

main()
  .catch((err) => {
    console.error(`\nVolume seeding failed: ${explainDbError(err)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
