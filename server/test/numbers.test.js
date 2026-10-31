import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../src/db.js';
import { paddedId } from '../src/utils/numbers.js';

after(() => pool.end());

// A hosted database can hand out very large ids. Padding must never cut them short, or two rows would share a number.
test('numbers keep five digits for small ids and are never cut short for large ones', async () => {
  const rows = await query(
    `SELECT id, ${paddedId} AS padded FROM (SELECT 4 AS id UNION ALL SELECT 99999 UNION ALL SELECT 100000 UNION ALL SELECT 120001 UNION ALL SELECT 120002) t ORDER BY id`
  );
  assert.deepEqual(rows.map((r) => r.padded), ['00004', '99999', '100000', '120001', '120002']);
});
