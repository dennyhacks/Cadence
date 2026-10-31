import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';
import { outbox } from '../src/utils/mailer.js';

const run = Date.now();
const email = (tag) => `test.${tag}.${run}@cadence.test`;
const GOOD = 'Str0ng!Pass';

let server;
let base;

async function call(method, path, { body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, data, cookie: setCookie ? setCookie.split(';')[0] : undefined, setCookie };
}

before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await query("DELETE FROM users WHERE email LIKE 'test.%@cadence.test'");
  server.close();
  await pool.end();
});

describe('signup', () => {
  test('rejects each weak password and names what is missing', async () => {
    const cases = [
      ['Ab!defgh', 'more than 8 characters'], // exactly 8 characters is not enough
      ['alllower!1x', 'an uppercase letter'],
      ['ALLUPPER!1X', 'a lowercase letter'],
      ['NoSpecial123', 'a special character'],
    ];
    for (const [password, expected] of cases) {
      const res = await call('POST', '/api/auth/signup', { body: { name: 'Test User', email: email('weak'), password } });
      assert.equal(res.status, 400, password);
      assert.match(res.data.errors.password, new RegExp(expected), password);
    }
  });

  test('accepts a nine character password that meets every rule', async () => {
    const res = await call('POST', '/api/auth/signup', { body: { name: 'Nine Chars', email: email('nine'), password: 'Abcdefg!h' } });
    assert.equal(res.status, 201);
  });

  test('rejects bad email, empty name and missing body', async () => {
    const res = await call('POST', '/api/auth/signup', { body: { name: '', email: 'nope', password: GOOD } });
    assert.equal(res.status, 400);
    assert.ok(res.data.errors.email);
    assert.ok(res.data.errors.name);
    const empty = await call('POST', '/api/auth/signup');
    assert.equal(empty.status, 400);
  });

  test('creates a customer, signs them in, and never exposes the password hash', async () => {
    const res = await call('POST', '/api/auth/signup', { body: { name: 'New Customer', email: email('ok'), password: GOOD } });
    assert.equal(res.status, 201);
    assert.equal(res.data.user.role, 'customer');
    assert.equal(res.data.user.password_hash, undefined);
    assert.match(res.setCookie, /HttpOnly/i);
    const me = await call('GET', '/api/auth/me', { cookie: res.cookie });
    assert.equal(me.data.user.email, email('ok'));
  });

  test('allows only one account per email, ignoring letter case', async () => {
    const first = await call('POST', '/api/auth/signup', { body: { name: 'First', email: email('dup'), password: GOOD } });
    assert.equal(first.status, 201);
    const again = await call('POST', '/api/auth/signup', {
      body: { name: 'Second', email: email('dup').toUpperCase(), password: GOOD },
    });
    assert.equal(again.status, 409);
    assert.ok(again.data.errors.email);
  });

  test('cannot be used to pick your own role', async () => {
    const res = await call('POST', '/api/auth/signup', {
      body: { name: 'Sneaky', email: email('role'), password: GOOD, role: 'admin' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.user.role, 'customer');
  });
});

describe('login', () => {
  test('gives the same error for a wrong password and an unknown email', async () => {
    await call('POST', '/api/auth/signup', { body: { name: 'Login User', email: email('login'), password: GOOD } });
    const wrongPass = await call('POST', '/api/auth/login', { body: { email: email('login'), password: 'Wrong!Pass1' } });
    const unknown = await call('POST', '/api/auth/login', { body: { email: email('ghost'), password: GOOD } });
    assert.equal(wrongPass.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrongPass.data.message, unknown.data.message);
  });

  test('signs in with the right password, and logout clears the session', async () => {
    const ok = await call('POST', '/api/auth/login', { body: { email: email('login').toUpperCase(), password: GOOD } });
    assert.equal(ok.status, 200);
    assert.ok(ok.cookie);
    const me = await call('GET', '/api/auth/me', { cookie: ok.cookie });
    assert.equal(me.data.user.role, 'customer');
    const out = await call('POST', '/api/auth/logout', { cookie: ok.cookie });
    assert.equal(out.status, 200);
    assert.match(out.setCookie, /cadence_token=;/);
  });

  test('me returns null when signed out, and a forged cookie is ignored', async () => {
    const none = await call('GET', '/api/auth/me');
    assert.equal(none.status, 200);
    assert.equal(none.data.user, null);
    const forged = await call('GET', '/api/auth/me', { cookie: 'cadence_token=not.a.token' });
    assert.equal(forged.data.user, null);
  });

  test('blocks a turned-off account', async () => {
    await call('POST', '/api/auth/signup', { body: { name: 'Off User', email: email('off'), password: GOOD } });
    await query('UPDATE users SET is_active = 0 WHERE email = ?', [email('off')]);
    const res = await call('POST', '/api/auth/login', { body: { email: email('off'), password: GOOD } });
    assert.equal(res.status, 403);
  });
});

describe('password reset', () => {
  test('answers the same for an unknown email and sends nothing', async () => {
    const before = outbox.length;
    const res = await call('POST', '/api/auth/forgot-password', { body: { email: email('nobody') } });
    assert.equal(res.status, 200);
    assert.equal(outbox.length, before);
  });

  test('emails a single-use link that sets a new password', async () => {
    await call('POST', '/api/auth/signup', { body: { name: 'Reset User', email: email('reset'), password: GOOD } });
    const res = await call('POST', '/api/auth/forgot-password', { body: { email: email('reset') } });
    assert.equal(res.status, 200);
    await new Promise((r) => setTimeout(r, 50)); // the email is sent after the response
    const mail = outbox.at(-1);
    assert.equal(mail.to, email('reset'));
    const token = new URL(mail.link).searchParams.get('token');

    const check = await call('GET', `/api/auth/reset-password/validate?token=${token}`);
    assert.equal(check.data.valid, true);

    const weak = await call('POST', '/api/auth/reset-password', { body: { token, password: 'weak' } });
    assert.equal(weak.status, 400);

    const NEW = 'Fresh#Pass99';
    const done = await call('POST', '/api/auth/reset-password', { body: { token, password: NEW } });
    assert.equal(done.status, 200);

    const old = await call('POST', '/api/auth/login', { body: { email: email('reset'), password: GOOD } });
    assert.equal(old.status, 401);
    const fresh = await call('POST', '/api/auth/login', { body: { email: email('reset'), password: NEW } });
    assert.equal(fresh.status, 200);

    const reuse = await call('POST', '/api/auth/reset-password', { body: { token, password: 'Another#Pass1' } });
    assert.equal(reuse.status, 400);
    const stale = await call('GET', `/api/auth/reset-password/validate?token=${token}`);
    assert.equal(stale.data.valid, false);
  });

  test('a newer link replaces the older one', async () => {
    await call('POST', '/api/auth/signup', { body: { name: 'Twice User', email: email('twice'), password: GOOD } });
    await call('POST', '/api/auth/forgot-password', { body: { email: email('twice') } });
    await new Promise((r) => setTimeout(r, 50));
    const first = new URL(outbox.at(-1).link).searchParams.get('token');
    await call('POST', '/api/auth/forgot-password', { body: { email: email('twice') } });
    await new Promise((r) => setTimeout(r, 50));
    const second = new URL(outbox.at(-1).link).searchParams.get('token');
    assert.notEqual(first, second);
    const old = await call('GET', `/api/auth/reset-password/validate?token=${first}`);
    assert.equal(old.data.valid, false);
    const current = await call('GET', `/api/auth/reset-password/validate?token=${second}`);
    assert.equal(current.data.valid, true);
  });

  test('rejects an expired link', async () => {
    await call('POST', '/api/auth/signup', { body: { name: 'Late User', email: email('late'), password: GOOD } });
    await call('POST', '/api/auth/forgot-password', { body: { email: email('late') } });
    await new Promise((r) => setTimeout(r, 50));
    const token = new URL(outbox.at(-1).link).searchParams.get('token');
    await query(
      'UPDATE password_resets SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE user_id = (SELECT id FROM users WHERE email = ?)',
      [email('late')]
    );
    const res = await call('POST', '/api/auth/reset-password', { body: { token, password: 'Fresh#Pass99' } });
    assert.equal(res.status, 400);
  });
});

describe('roles', () => {
  let adminCookie;
  let customerCookie;

  before(async () => {
    const hash = await bcrypt.hash(GOOD, 4);
    await query("INSERT INTO users (name, email, password_hash, role) VALUES ('Test Admin', ?, ?, 'admin')", [email('admin'), hash]);
    adminCookie = (await call('POST', '/api/auth/login', { body: { email: email('admin'), password: GOOD } })).cookie;
    customerCookie = (await call('POST', '/api/auth/login', { body: { email: email('ok'), password: GOOD } })).cookie;
  });

  test('only the admin can add staff', async () => {
    const body = { name: 'New Staff', email: email('staff'), password: GOOD };
    assert.equal((await call('POST', '/api/users/staff', { body })).status, 401);
    assert.equal((await call('POST', '/api/users/staff', { body, cookie: customerCookie })).status, 403);

    const created = await call('POST', '/api/users/staff', { body, cookie: adminCookie });
    assert.equal(created.status, 201);
    assert.equal(created.data.user.role, 'staff');

    const dup = await call('POST', '/api/users/staff', { body, cookie: adminCookie });
    assert.equal(dup.status, 409);
  });

  test('staff cannot add staff either', async () => {
    const staff = await call('POST', '/api/auth/login', { body: { email: email('staff'), password: GOOD } });
    const res = await call('POST', '/api/users/staff', {
      body: { name: 'Other', email: email('staff2'), password: GOOD },
      cookie: staff.cookie,
    });
    assert.equal(res.status, 403);
  });

  test('the admin can filter the user list by role', async () => {
    const admin = await call('POST', '/api/auth/login', { body: { email: 'admin@cadence.test', password: 'Admin@12345' } });
    const res = await call('GET', '/api/users?role=staff', { cookie: admin.cookie });
    assert.equal(res.status, 200);
    assert.ok(res.data.users.length > 0);
    assert.ok(res.data.users.every((u) => u.role === 'staff'));
    const bad = await call('GET', '/api/users?role=owner', { cookie: admin.cookie });
    assert.equal(bad.status, 400);
  });

  test('only the admin can list users', async () => {
    assert.equal((await call('GET', '/api/users', { cookie: customerCookie })).status, 403);
    const list = await call('GET', '/api/users', { cookie: adminCookie });
    assert.equal(list.status, 200);
    assert.ok(list.data.users.every((u) => u.password_hash === undefined));
  });
});
