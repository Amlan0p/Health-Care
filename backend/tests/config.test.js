'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, ConfigError } = require('../config');

const GOOD_SECRET = 'a'.repeat(8) + 'Zx9Qw3Er5Ty7Ui1Op2As4Df6Gh8Jk0Lm';
const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

test('production refuses to start without JWT_SECRET', () => {
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production' }), (e) => e instanceof ConfigError && /JWT_SECRET is required/.test(e.message));
});

test('production refuses short, placeholder and low-variety JWT secrets', () => {
  for (const bad of ['short', 'change_me_to_a_long_random_secret_value_123456', 'hc_dev_secret_change_in_production', 'a'.repeat(40)]) {
    assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production', JWT_SECRET: bad }), ConfigError, `should reject ${bad}`);
  }
});

test('production accepts a strong JWT secret', () => {
  const cfg = loadConfig({ ...base, NODE_ENV: 'production', JWT_SECRET: GOOD_SECRET });
  assert.equal(cfg.auth.jwtSecret, GOOD_SECRET);
  assert.equal(cfg.isProd, true);
  assert.equal(cfg.trustProxy, 1);
});

test('development without JWT_SECRET uses a random ephemeral secret (never a hardcoded fallback)', () => {
  const a = loadConfig({ ...base, NODE_ENV: 'development' });
  const b = loadConfig({ ...base, NODE_ENV: 'development' });
  assert.equal(a.auth.jwtSecretIsEphemeral, true);
  assert.notEqual(a.auth.jwtSecret, b.auth.jwtSecret);
  assert.ok(a.auth.jwtSecret.length >= 64);
  assert.ok(a.warnings.some((w) => /JWT_SECRET/.test(w)));
});

test('DATABASE_URL is required and must be a postgres URL', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'development' }), /DATABASE_URL is required/);
  assert.throws(() => loadConfig({ NODE_ENV: 'development', DATABASE_URL: 'mysql://x' }), /must start with postgres/);
});

test('PORT is read from the environment and validated', () => {
  assert.equal(loadConfig({ ...base, PORT: '10000' }).port, 10000);
  assert.equal(loadConfig(base).port, 3001);
  assert.throws(() => loadConfig({ ...base, PORT: 'abc' }), /PORT/);
});

test('FRONTEND_ORIGIN is normalised and validated', () => {
  const cfg = loadConfig({ ...base, FRONTEND_ORIGIN: 'https://app.example.com/, http://localhost:5173' });
  assert.deepEqual(cfg.cors.origins, ['https://app.example.com', 'http://localhost:5173']);
  assert.throws(() => loadConfig({ ...base, FRONTEND_ORIGIN: 'not a url' }), /FRONTEND_ORIGIN/);
});

test('missing GROQ_API_KEY is a warning, not a startup failure', () => {
  const cfg = loadConfig(base);
  assert.equal(cfg.ai.apiKey, '');
  assert.ok(cfg.warnings.some((w) => /GROQ_API_KEY/.test(w)));
});

test('TLS auto-detection: internal (bare) hostnames off, public hostnames on in production', () => {
  const secret = { JWT_SECRET: GOOD_SECRET, NODE_ENV: 'production' };
  assert.equal(loadConfig({ ...secret, DATABASE_URL: 'postgresql://u:p@dpg-abc123-a/db' }).db.ssl, false);
  assert.equal(loadConfig({ ...secret, DATABASE_URL: 'postgresql://u:p@dpg-abc123-a.oregon-postgres.render.com/db' }).db.ssl, true);
  assert.equal(loadConfig({ ...secret, DATABASE_URL: 'postgresql://u:p@dpg-abc123-a/db', DATABASE_SSL: 'true' }).db.ssl, true);
});

test('config object is frozen', () => {
  assert.throws(() => { 'use strict'; loadConfig(base).port = 1; }, TypeError);
});
