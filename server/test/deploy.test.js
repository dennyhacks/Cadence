import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Each test file runs in its own process, so this secret is set before the app loads.
process.env.CRON_SECRET = 'test-cron-secret-123';
process.env.TRUST_PROXY = '1';

const { createApp } = await import('../src/app.js');
const { pool, query } = await import('../src/db.js');

let server;
let base;

before(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await pool.end();
});

describe('the billing job endpoint', () => {
  const call = (headers = {}) => fetch(`${base}/api/cron/billing`, { headers });

  test('refuses requests without the secret', async () => {
    assert.equal((await call()).status, 401);
    assert.equal((await call({ authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await call({ authorization: 'Bearer test-cron-secret-12' })).status, 401); // too short
    assert.equal((await call({ authorization: 'test-cron-secret-123' })).status, 200); // the word Bearer is optional
  });

  test('runs the job with the secret, and running it twice bills nothing twice', async () => {
    const headers = { authorization: 'Bearer test-cron-secret-123' };
    const first = await call(headers);
    assert.equal(first.status, 200);
    const body = await first.json();
    for (const key of ['closed', 'created', 'subscriptions', 'skipped']) assert.equal(typeof body[key], 'number', key);
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM invoices');
    const second = await (await call(headers)).json();
    assert.equal(second.created, 0);
    assert.equal((await query('SELECT COUNT(*) AS n FROM invoices'))[0].n, n);
  });

  test('is closed when no secret is configured', () => {
    const out = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', "process.env.CRON_SECRET=''; const { config } = await import('./src/config.js'); console.log(config.cronSecret === '')"],
      { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env, CRON_SECRET: '' } }
    );
    assert.equal(out.trim(), 'true'); // the route refuses everything when this is empty
  });
});

describe('database settings for a hosted database', () => {
  const read = (env) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ['--input-type=module', '-e', "const { config } = await import('./src/config.js'); console.log(JSON.stringify({ db: config.db, ssl: config.dbSsl, pool: config.dbPoolSize }))"],
        { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { PATH: process.env.PATH, ENV_FILE: '.env.does-not-exist', ...env } }
      )
    );

  test('a connection URL fills in every setting, including special characters in the password', () => {
    const { db } = read({ DATABASE_URL: 'mysql://app%40user:p%3Ass%2Fw%40rd@db.example.com:4000/shop' });
    assert.deepEqual(db, { host: 'db.example.com', port: 4000, user: 'app@user', password: 'p:ss/w@rd', database: 'shop' });
  });

  test('plain settings still work, SSL is opt in, and a serverless host gets a small pool', () => {
    const local = read({ DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'd' });
    assert.deepEqual(local.db, { host: 'h', port: 3306, user: 'u', password: 'p', database: 'd' });
    assert.equal(local.ssl, false);
    assert.equal(local.pool, 10);
    assert.equal(read({ DB_SSL: 'true' }).ssl, true);
    assert.equal(read({ VERCEL: '1' }).pool, 3);
    assert.equal(read({ VERCEL: '1', DB_POOL: '5' }).pool, 5);
  });
});

describe('work after the reply', () => {
  test('a failing background job is logged, never thrown, and the work still finishes', async () => {
    const { afterReply } = await import('../src/utils/background.js');
    let finished = false;
    await afterReply(
      new Promise((resolve) => setTimeout(() => { finished = true; resolve(); }, 20)),
      'Test job'
    );
    assert.equal(finished, true);
    const original = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args.join(' '));
    try {
      await afterReply(Promise.reject(new Error('boom')), 'Test job');
    } finally {
      console.error = original;
    }
    assert.match(logged[0], /Test job failed: boom/);
  });
});

describe('behind a proxy', () => {
  const forgot = (ip) =>
    fetch(`${base}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ email: 'nobody.at.all@example.com' }),
    });

  test('each visitor is limited on their own address, not everyone together', async () => {
    let blocked = 0;
    for (let i = 0; i < 20 && !blocked; i += 1) {
      if ((await forgot('203.0.113.7')).status === 429) blocked = i + 1;
    }
    assert.ok(blocked > 1, 'the first visitor is eventually limited, but not on their first try');
    assert.equal((await forgot('203.0.113.7')).status, 429);
    assert.equal((await forgot('198.51.100.9')).status, 200); // a different visitor is unaffected
  });
});
