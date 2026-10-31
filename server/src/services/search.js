import { query } from '../db.js';

const LIMIT = 5;

// Search text is matched as plain text, so a % or _ typed by someone is not treated as a wildcard.
const like = (q) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

/** Looks across subscriptions, invoices, products and plans for the team. A customer's name or email finds their subscriptions and invoices. */
export async function searchAll(q) {
  const term = like(q);
  const [subs, invoices, products, plans] = await Promise.all([
    query(
      `SELECT s.id, s.number, s.status, c.name AS customer FROM subscriptions s JOIN users c ON c.id = s.customer_id
        WHERE s.number LIKE ? OR c.name LIKE ? OR c.email LIKE ? ORDER BY s.id DESC LIMIT ${LIMIT}`,
      [term, term, term]
    ),
    query(
      `SELECT id, number, status, customer_name FROM invoices
        WHERE number LIKE ? OR customer_name LIKE ? OR customer_email LIKE ? ORDER BY id DESC LIMIT ${LIMIT}`,
      [term, term, term]
    ),
    query(`SELECT id, name, type FROM products WHERE name LIKE ? ORDER BY name LIMIT ${LIMIT}`, [term]),
    query(`SELECT id, name, billing_period FROM plans WHERE name LIKE ? ORDER BY name LIMIT ${LIMIT}`, [term]),
  ]);

  return [
    ...subs.map((r) => ({ type: 'Subscription', label: r.number ?? `Draft ${r.id}`, detail: `${r.customer} · ${r.status}`, to: `/subscriptions/${r.id}` })),
    ...invoices.map((r) => ({ type: 'Invoice', label: r.number, detail: `${r.customer_name} · ${r.status}`, to: `/invoices/${r.id}` })),
    ...products.map((r) => ({ type: 'Product', label: r.name, detail: r.type, to: `/products/${r.id}` })),
    ...plans.map((r) => ({ type: 'Plan', label: r.name, detail: `Billed ${r.billing_period}`, to: `/plans/${r.id}` })),
  ];
}
