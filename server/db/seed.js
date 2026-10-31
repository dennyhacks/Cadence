import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { pool, query, explainDbError } from '../src/db.js';

// Demo accounts for testing. Every password meets the signup rules.
const demoUsers = [
  { name: 'Asha Verma', email: 'admin@cadence.test', password: 'Admin@12345', role: 'admin' },
  { name: 'Sam Rivera', email: 'staff@cadence.test', password: 'Staff@12345', role: 'staff' },
  { name: 'Northwind Traders', email: 'customer@cadence.test', password: 'Customer@12345', role: 'customer' },
];

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
}

main()
  .catch((err) => {
    console.error(`\nSeeding failed: ${explainDbError(err)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
