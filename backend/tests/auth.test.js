'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startServer, SKIP_DB, TEST_SECRET } = require('./helpers');

test('auth', { skip: SKIP_DB }, async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  await t.test('signup normalises email/name, hashes the password and returns a token', async () => {
    const r = await s.request('POST', '/api/auth/signup', { body: { name: '  Ada   Lovelace ', email: '  ADA@Example.COM ', password: 'analytical-engine' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.user.email, 'ada@example.com');
    assert.equal(r.json.user.name, 'Ada Lovelace');
    assert.ok(r.json.token.split('.').length === 3);
    assert.equal(r.json.user.password, undefined);
    assert.equal(r.json.user.password_hash, undefined);
    const { rows } = await s.db.query("SELECT password_hash FROM users WHERE email = 'ada@example.com'");
    assert.match(rows[0].password_hash, /^\$2[aby]\$/, 'bcrypt hash stored');
    assert.ok(!rows[0].password_hash.includes('analytical'));
  });

  await t.test('duplicate email (any casing) is rejected with 409', async () => {
    const r = await s.request('POST', '/api/auth/signup', { body: { name: 'Ada Two', email: 'ADA@example.com', password: 'another-password' } });
    assert.equal(r.status, 409);
    assert.equal(r.json.code, 'email_taken');
  });

  await t.test('signup validation', async () => {
    const bad = [
      [{ name: '', email: 'a@b.co', password: 'longenough1' }, /Name is required/],
      [{ name: 'X', email: 'not-an-email', password: 'longenough1' }, /valid email/],
      [{ name: 'X', email: 'x@y.co', password: 'short' }, /at least 8/],
      [{ name: 'X', email: 'x@y.co', password: 'p'.repeat(80) }, /72 bytes/],
      [{ email: 'x@y.co', password: 'longenough1' }, /Name is required/],
      [{ name: 'X\u0000Y', email: 'x@y.co', password: 'longenough1' }, /invalid characters/],
    ];
    for (const [body, re] of bad) {
      const r = await s.request('POST', '/api/auth/signup', { body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.match(r.json.error, re);
    }
  });

  await t.test('the reserved demo email cannot be registered', async () => {
    const r = await s.request('POST', '/api/auth/signup', { body: { name: 'Mallory', email: 'Demo@Healthcare.app', password: 'longenough1' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.code, 'reserved_email');
  });

  await t.test('signin works with any email casing; wrong password and unknown user get the same 401', async () => {
    const u = await s.signup({ email: 'login@example.com', password: 'my-long-password' });
    const ok = await s.request('POST', '/api/auth/signin', { body: { email: 'LOGIN@example.com', password: 'my-long-password' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.user.id, u.user.id);
    const wrong = await s.request('POST', '/api/auth/signin', { body: { email: 'login@example.com', password: 'nope-nope-nope' } });
    const ghost = await s.request('POST', '/api/auth/signin', { body: { email: 'ghost@example.com', password: 'nope-nope-nope' } });
    assert.equal(wrong.status, 401);
    assert.equal(ghost.status, 401);
    assert.equal(wrong.json.error, ghost.json.error, 'no account enumeration via sign-in');
  });

  await t.test('the demo account cannot sign in with a password', async () => {
    for (const pw of ['', '!no-password-login!', 'demo1234']) {
      const r = await s.request('POST', '/api/auth/signin', { body: { email: 'demo@healthcare.app', password: pw || 'x' } });
      assert.equal(r.status, 401);
    }
  });

  await t.test('protected routes require a valid token', async () => {
    for (const p of ['/api/auth/me', '/api/appointments', '/api/medications', '/api/vitals', '/api/chat/history']) {
      const r = await s.request('GET', p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.code, 'missing_token');
    }
    const r = await s.request('GET', '/api/appointments', { token: 'garbage.token.value' });
    assert.equal(r.status, 401);
    assert.equal(r.json.code, 'invalid_token');
  });

  await t.test('the old client-side demo token format is rejected', async () => {
    const r = await s.request('GET', '/api/medications', { token: 'demo-session-1700000000000' });
    assert.equal(r.status, 401);
  });

  await t.test('forged tokens are rejected (wrong secret, alg none, wrong issuer, expired)', async () => {
    const u = await s.signup();
    const claims = { sub: String(u.user.id), jti: 'forged-1' };
    const wrongSecret = jwt.sign(claims, require('crypto').randomBytes(32).toString('hex'), { issuer: 'healthcare-api' });
    const noIssuer = jwt.sign(claims, TEST_SECRET);
    const expired = jwt.sign({ ...claims, jti: 'forged-2' }, TEST_SECRET, { issuer: 'healthcare-api', expiresIn: -10 });
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...claims, iss: 'healthcare-api' })).toString('base64url')}.`;
    for (const tok of [wrongSecret, noIssuer, expired, none]) {
      const r = await s.request('GET', '/api/auth/me', { token: tok });
      assert.equal(r.status, 401);
    }
  });

  await t.test('GET /auth/me returns the signed-in user', async () => {
    const u = await s.signup({ name: 'Me Myself' });
    const r = await s.request('GET', '/api/auth/me', { token: u.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.user.name, 'Me Myself');
    assert.equal(r.json.user.isDemo, false);
  });

  await t.test('logout revokes that token (and only that token)', async () => {
    const u = await s.signup();
    const second = await s.request('POST', '/api/auth/signin', { body: { email: u.email, password: u.password } });
    assert.equal((await s.request('GET', '/api/auth/me', { token: u.token })).status, 200);
    assert.equal((await s.request('POST', '/api/auth/logout', { token: u.token })).status, 200);
    const after = await s.request('GET', '/api/auth/me', { token: u.token });
    assert.equal(after.status, 401);
    assert.equal(after.json.code, 'revoked_token');
    assert.equal((await s.request('GET', '/api/auth/me', { token: second.json.token })).status, 200, 'other session unaffected');
  });

  await t.test('malformed JSON → 400, oversized body → 413', async () => {
    const bad = await s.request('POST', '/api/auth/signin', { raw: '{"email": ' });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.code, 'invalid_json');
    const big = await s.request('POST', '/api/auth/signin', { raw: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(100_000) }) });
    assert.equal(big.status, 413);
  });

  await t.test('demo session: read-only, seeded with synthetic data, no AI', async () => {
    const d = await s.request('POST', '/api/auth/demo');
    assert.equal(d.status, 200);
    assert.equal(d.json.user.isDemo, true);
    const tok = d.json.token;
    const meds = await s.request('GET', '/api/medications', { token: tok });
    assert.equal(meds.status, 200);
    assert.ok(meds.json.length >= 1);
    assert.ok(meds.json.every((m) => /demo data/i.test(m.name)), 'sample data is labelled');
    for (const [method, path, body] of [
      ['POST', '/api/medications', { name: 'X', time: 'Y' }],
      ['DELETE', `/api/medications/${meds.json[0].id}`],
      ['PUT', '/api/vitals', { key: 'heartRate', value: '70' }],
      ['POST', '/api/appointments', { doctorId: 'doc-001', date: s.futureDate(), time: '09:00' }],
    ]) {
      const r = await s.request(method, path, { token: tok, body });
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.json.code, 'demo_read_only');
    }
    assert.equal((await s.request('GET', '/api/medications', { token: tok })).json.length, meds.json.length, 'nothing was modified');
    const chat = await s.request('POST', '/api/chat', { token: tok, body: { message: 'hello' } });
    assert.equal(chat.status, 403);
    assert.ok(['demo_read_only', 'demo_not_allowed'].includes(chat.json.code));
    assert.equal((await s.request('POST', '/api/auth/logout', { token: tok })).status, 200, 'demo can sign out');
  });

  await t.test('demo can be disabled', async () => {
    const off = await startServer({ env: { ENABLE_DEMO: 'false' } });
    try {
      const r = await off.request('POST', '/api/auth/demo');
      assert.equal(r.status, 404);
      assert.equal(r.json.code, 'demo_disabled');
    } finally { await off.close(); }
  });
});

test('auth rate limiting', { skip: SKIP_DB }, async (t) => {
  const s = await startServer({ env: { AUTH_RATE_LIMIT_MAX: '3' } });
  t.after(() => s.close());
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    statuses.push((await s.request('POST', '/api/auth/signin', { body: { email: 'x@example.com', password: 'wrong-password' } })).status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
  const r = await s.request('POST', '/api/auth/signin', { body: { email: 'x@example.com', password: 'wrong-password' } });
  assert.equal(r.json.code, 'auth_rate_limited');
});
