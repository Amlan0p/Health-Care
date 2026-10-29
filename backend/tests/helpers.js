'use strict';
/**
 * Test helpers. DB-backed tests need TEST_DATABASE_URL pointing at a database whose name contains "test"
 * (the schema is dropped and recreated, so this guard prevents wiping a real database).
 */
const http = require('http');
const { loadConfig } = require('../config');
const { createDb } = require('../db');
const { migrate } = require('../db/migrate');
const { seedDemo } = require('../db/seedDemo');
const { createApp } = require('../app');
const { todayIn, addDays } = require('../services/dates');

const TEST_DB = process.env.TEST_DATABASE_URL || '';
const SKIP_DB = TEST_DB ? false : 'TEST_DATABASE_URL is not set (see README → Running tests)';
const TEST_SECRET = require('crypto').randomBytes(48).toString('hex'); // random per test run; never a literal

function dbNameOf(url) { try { return new URL(url).pathname.slice(1); } catch { return ''; } }

async function startServer({ env = {}, groq, mockAi } = {}) {
  if (!TEST_DB) throw new Error('TEST_DATABASE_URL is required');
  if (!/test/i.test(dbNameOf(TEST_DB))) throw new Error('Refusing to run: TEST_DATABASE_URL database name must contain "test".');

  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    JWT_SECRET: TEST_SECRET,
    BCRYPT_ROUNDS: '4',
    AUTH_RATE_LIMIT_MAX: '1000',
    AI_RATE_LIMIT_MAX: '1000',
    PUBLIC_FORM_RATE_LIMIT_MAX: '1000',
    API_RATE_LIMIT_MAX: '100000',
    GROQ_API_KEY: mockAi ? 'test-groq-key-not-real' : '',
    GROQ_API_URL: mockAi ? mockAi.url : '',
    ...env,
  });
  const db = createDb(config);
  await db.query('DROP SCHEMA IF EXISTS public CASCADE');
  await db.query('CREATE SCHEMA public');
  await migrate(db, { log: () => {} });
  await seedDemo(db, config);

  const app = createApp({ config, db, groq });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { token, body, headers, raw } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: raw !== undefined ? raw : (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  let n = 0;
  async function signup(overrides = {}) {
    n += 1;
    const body = { name: `User ${n}`, email: `user${n}-${Date.now()}@example.com`, password: 'correct-horse-9', ...overrides };
    const r = await request('POST', '/api/auth/signup', { body });
    if (r.status !== 201) throw new Error(`signup failed: ${r.status} ${r.text}`);
    return { token: r.json.token, user: r.json.user, email: body.email, password: body.password };
  }

  return {
    base, config, db, request, signup,
    futureDate: (days = 7) => addDays(todayIn(config.appTimezone), days),
    pastDate: (days = 3) => addDays(todayIn(config.appTimezone), -days),
    async close() { await new Promise((r) => server.close(r)); await db.close(); },
  };
}

/** Local mock of the Groq chat-completions endpoint. Behaviour is switched via mock.mode. */
async function startMockAi() {
  const mock = { mode: 'ok', calls: [], reply: 'This is a mocked reply.', delayMs: 0, url: '' };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = null; try { parsed = JSON.parse(body); } catch { /* ignore */ }
      mock.calls.push({ headers: req.headers, body: parsed });
      const send = (status, payload, headers = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
      };
      const respond = () => {
        switch (mock.mode) {
          case 'ok': return send(200, { choices: [{ message: { content: mock.reply } }] });
          case 'rate_limit': return send(429, { error: { message: 'rate limit' } }, { 'retry-after': '7' });
          case 'unauthorized': return send(401, { error: { message: 'Invalid API Key' } });
          case 'server_error': return send(500, { error: { message: 'boom' } });
          case 'bad_json': return send(200, 'this is not json');
          case 'empty': return send(200, { choices: [] });
          default: return send(200, { choices: [{ message: { content: mock.reply } }] });
        }
      };
      mock.delayMs ? setTimeout(respond, mock.delayMs) : respond();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  mock.url = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  mock.close = () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
  return mock;
}

module.exports = { startServer, startMockAi, SKIP_DB, TEST_SECRET };
