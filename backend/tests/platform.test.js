'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, SKIP_DB } = require('./helpers');
const { migrate } = require('../db/migrate');

test('platform behaviour: health, 404s, CORS, headers, forms, migrations', { skip: SKIP_DB }, async (t) => {
  const s = await startServer({ env: { FRONTEND_ORIGIN: 'https://app.example.com' } });
  t.after(() => s.close());

  await t.test('GET /api/health is public, minimal and does not leak configuration', async () => {
    const r = await s.request('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { status: 'ok', db: 'up' });
  });

  await t.test('unknown /api/* routes return a JSON 404, never HTML', async () => {
    for (const [m, p] of [['GET', '/api/nothing'], ['POST', '/api/auth/nothing'], ['GET', '/api']]) {
      const r = await s.request(m, p);
      assert.equal(r.status, 404, `${m} ${p}`);
      assert.match(r.headers.get('content-type'), /application\/json/);
      assert.equal(r.json.code, 'not_found');
    }
  });

  await t.test('security headers are present and X-Powered-By is removed', async () => {
    const r = await s.request('GET', '/api/health');
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  await t.test('CORS: only the configured origin is allowed cross-origin', async () => {
    const ok = await s.request('GET', '/api/health', { headers: { Origin: 'https://app.example.com' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.example.com');
    const bad = await s.request('GET', '/api/health', { headers: { Origin: 'https://evil.example.org' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
    const pre = await s.request('OPTIONS', '/api/medications', { headers: { Origin: 'https://app.example.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/i);
    const preBad = await s.request('OPTIONS', '/api/medications', { headers: { Origin: 'https://evil.example.org', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(preBad.headers.get('access-control-allow-origin'), null);
  });

  await t.test('contact form stores the message; invalid input is rejected', async () => {
    const ok = await s.request('POST', '/api/contact', { body: { name: 'Jo', email: 'Jo@Example.com', subject: 'Hi', message: 'I have a question about the app.' } });
    assert.equal(ok.status, 201);
    const { rows } = await s.db.query('SELECT name, email, message FROM contact_messages');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'jo@example.com');
    assert.equal((await s.request('POST', '/api/contact', { body: { name: 'Jo', email: 'bad', message: 'long enough message' } })).status, 400);
    assert.equal((await s.request('POST', '/api/contact', { body: { name: 'Jo', email: 'jo@example.com', message: 'hey' } })).status, 400);
  });

  await t.test('newsletter is idempotent and honest about duplicates', async () => {
    const a = await s.request('POST', '/api/newsletter', { body: { email: 'News@Example.com' } });
    const b = await s.request('POST', '/api/newsletter', { body: { email: 'news@example.com' } });
    assert.equal(a.status, 201); assert.equal(a.json.status, 'subscribed');
    assert.equal(b.status, 200); assert.equal(b.json.status, 'already_subscribed');
    assert.equal((await s.request('POST', '/api/newsletter', { body: { email: 'nope' } })).status, 400);
  });

  await t.test('migrations are idempotent and create the expected tables', async () => {
    assert.deepEqual(await migrate(s.db, { log: () => {} }), [], 'second run applies nothing');
    const { rows } = await s.db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1");
    const names = rows.map((r) => r.table_name);
    for (const tbl of ['users', 'appointments', 'medications', 'vitals', 'chat_messages', 'revoked_tokens', 'contact_messages', 'newsletter_subscribers', 'schema_migrations']) {
      assert.ok(names.includes(tbl), `missing table ${tbl}`);
    }
  });

  await t.test('error responses never leak internals (forced DB failure → generic 500)', async () => {
    const u = await s.signup();
    await s.db.query('ALTER TABLE medications RENAME TO medications_x');
    try {
      const r = await s.request('GET', '/api/medications', { token: u.token });
      assert.equal(r.status, 500);
      assert.equal(r.json.code, 'internal_error');
      assert.ok(!/medications|relation|pg|select/i.test(r.json.error));
    } finally { await s.db.query('ALTER TABLE medications_x RENAME TO medications'); }
  });
});

test('static frontend serving never shadows the API', { skip: SKIP_DB }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-front-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>HC</title>');
  const s = await startServer({ env: { FRONTEND_DIR: dir } });
  t.after(async () => { await s.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const home = await s.request('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.text, /<title>HC<\/title>/);
  const api = await s.request('GET', '/api/definitely-missing');
  assert.equal(api.status, 404);
  assert.match(api.headers.get('content-type'), /json/);
  assert.ok(!api.text.includes('<!doctype'));
});
