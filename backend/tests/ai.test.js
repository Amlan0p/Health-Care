'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, startMockAi, SKIP_DB } = require('./helpers');

test('AI proxy', { skip: SKIP_DB }, async (t) => {
  const mock = await startMockAi();
  const s = await startServer({ mockAi: mock, env: { GROQ_TIMEOUT_MS: '1000' } });
  t.after(async () => { await s.close(); await mock.close(); });
  const alice = await s.signup({ name: 'Alice' });
  const bob = await s.signup({ name: 'Bob' });
  const reset = () => { mock.mode = 'ok'; mock.calls.length = 0; mock.delayMs = 0; mock.reply = 'This is a mocked reply.'; };

  await t.test('chat: calls the provider server-side with the env key and never returns the key', async () => {
    reset();
    const r = await s.request('POST', '/api/chat', { token: alice.token, body: { message: 'What are the symptoms of dengue?' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.reply, 'This is a mocked reply.');
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].headers.authorization, 'Bearer test-groq-key-not-real');
    assert.equal(mock.calls[0].body.model, 'llama-3.3-70b-versatile');
    assert.equal(mock.calls[0].body.messages[0].role, 'system');
    assert.ok(!r.text.includes('test-groq-key-not-real'), 'key must not appear in API responses');
    assert.deepEqual(Object.keys(r.json).sort(), ['emergency', 'reply']);
  });

  await t.test('chat: history is stored per user and sent as context only for that user', async () => {
    reset();
    mock.reply = 'Reply to Alice';
    await s.request('POST', '/api/chat', { token: alice.token, body: { message: 'Alice question one' } });
    mock.reply = 'Reply to Bob';
    await s.request('POST', '/api/chat', { token: bob.token, body: { message: 'Bob question one' } });
    const bobCall = mock.calls[mock.calls.length - 1].body.messages.map((m) => m.content).join('\n');
    assert.ok(!bobCall.includes('Alice question one'), "Bob's AI context must not contain Alice's messages");
    assert.ok(!bobCall.includes('Reply to Alice'));
    const aliceHist = (await s.request('GET', '/api/chat/history', { token: alice.token })).json.messages.map((m) => m.content);
    const bobHist = (await s.request('GET', '/api/chat/history', { token: bob.token })).json.messages.map((m) => m.content);
    assert.ok(aliceHist.includes('Alice question one') && !aliceHist.includes('Bob question one'));
    assert.ok(bobHist.includes('Bob question one') && !bobHist.includes('Alice question one'));
    // follow-up carries Alice's own earlier turn
    await s.request('POST', '/api/chat', { token: alice.token, body: { message: 'Alice follow-up' } });
    const ctx = mock.calls[mock.calls.length - 1].body.messages.map((m) => m.content);
    assert.ok(ctx.includes('Alice question one') && ctx.includes('Reply to Alice'));
    // clearing only affects the caller
    assert.equal((await s.request('DELETE', '/api/chat/history', { token: alice.token })).status, 200);
    assert.equal((await s.request('GET', '/api/chat/history', { token: alice.token })).json.messages.length, 0);
    assert.ok((await s.request('GET', '/api/chat/history', { token: bob.token })).json.messages.length > 0);
  });

  await t.test('chat: failed provider calls do not leave dangling history', async () => {
    reset();
    await s.request('DELETE', '/api/chat/history', { token: bob.token });
    mock.mode = 'server_error';
    assert.equal((await s.request('POST', '/api/chat', { token: bob.token, body: { message: 'Will fail' } })).status, 502);
    assert.equal((await s.request('GET', '/api/chat/history', { token: bob.token })).json.messages.length, 0);
  });

  await t.test('chat: includeVitals shares only the caller\'s own vitals, only when asked', async () => {
    reset();
    await s.request('PUT', '/api/vitals', { token: alice.token, body: { key: 'heartRate', value: '88' } });
    await s.request('PUT', '/api/vitals', { token: bob.token, body: { key: 'heartRate', value: '55' } });
    await s.request('POST', '/api/chat', { token: alice.token, body: { message: 'Check my vitals risk' } });
    assert.ok(!JSON.stringify(mock.calls[0].body).includes('88'), 'vitals not sent unless requested');
    await s.request('POST', '/api/chat', { token: alice.token, body: { message: 'Check my vitals risk', includeVitals: true } });
    const sent = JSON.stringify(mock.calls[1].body);
    assert.ok(sent.includes('Heart Rate: 88 bpm'));
    assert.ok(!sent.includes('55 bpm'), "never includes another user's vitals");
  });

  await t.test('chat: emergency phrases get a deterministic emergency notice', async () => {
    reset();
    const r = await s.request('POST', '/api/chat', { token: alice.token, body: { message: 'I have crushing chest pain right now' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.emergency.category, 'cardiac_respiratory');
    assert.ok(r.json.emergency.actions.some((a) => a.tel === '112'));
  });

  await t.test('chat: provider errors are mapped without leaking details', async () => {
    reset();
    const msg = { message: 'hello there' };
    mock.mode = 'rate_limit';
    let r = await s.request('POST', '/api/chat', { token: alice.token, body: msg });
    assert.equal(r.status, 429); assert.equal(r.json.code, 'ai_provider_rate_limited'); assert.equal(r.json.retryAfterSeconds, 7);
    mock.mode = 'unauthorized';
    r = await s.request('POST', '/api/chat', { token: alice.token, body: msg });
    assert.equal(r.status, 502); assert.equal(r.json.code, 'ai_unavailable');
    assert.ok(!/Invalid API Key|401|Bearer/.test(r.text), 'provider detail is not exposed');
    mock.mode = 'bad_json';
    r = await s.request('POST', '/api/chat', { token: alice.token, body: msg });
    assert.equal(r.status, 502); assert.equal(r.json.code, 'ai_invalid_response');
    mock.mode = 'empty';
    r = await s.request('POST', '/api/chat', { token: alice.token, body: msg });
    assert.equal(r.status, 502); assert.equal(r.json.code, 'ai_invalid_response');
    reset(); mock.delayMs = 1600;
    r = await s.request('POST', '/api/chat', { token: alice.token, body: msg });
    assert.equal(r.status, 504); assert.equal(r.json.code, 'ai_timeout');
  });

  await t.test('chat: input validation', async () => {
    reset();
    for (const body of [{}, { message: '' }, { message: '   ' }, { message: 'x'.repeat(2001) }, { message: 123 }]) {
      assert.equal((await s.request('POST', '/api/chat', { token: alice.token, body })).status, 400, JSON.stringify(body).slice(0, 40));
    }
    assert.equal(mock.calls.length, 0, 'invalid requests never reach the provider');
    assert.equal((await s.request('POST', '/api/chat', { body: { message: 'hi' } })).status, 401);
  });

  await t.test('symptoms: valid analysis returns structured result + fixed disclaimer', async () => {
    reset();
    mock.reply = '```json\n{"mostLikely":{"name":"Viral fever","severity":"low","advice":"Rest and fluids."},"alsoConsider":["Flu"],"warning":""}\n```';
    const r = await s.request('POST', '/api/symptoms/analyze', { token: alice.token, body: { symptoms: ['fever', 'cough'] } });
    assert.equal(r.status, 200);
    assert.equal(r.json.result.mostLikely.name, 'Viral fever');
    assert.match(r.json.disclaimer, /not a diagnosis/i);
    assert.equal(r.json.emergency, null);
    const sent = mock.calls[0].body.messages[1].content;
    assert.ok(sent.includes('Fever') && sent.includes('Cough'));
    assert.ok(!sent.includes('Alice'), 'no identity sent to the provider');
  });

  await t.test('symptoms: red-flag symptoms always show an emergency notice, even if the model says nothing', async () => {
    reset();
    mock.reply = '{"mostLikely":{"name":"Muscle strain","severity":"low","advice":"Rest."},"alsoConsider":[],"warning":""}';
    const r = await s.request('POST', '/api/symptoms/analyze', { token: alice.token, body: { symptoms: ['chest-pain'] } });
    assert.equal(r.status, 200);
    assert.equal(r.json.emergency.category, 'symptom_red_flag');
  });

  await t.test('symptoms: validation and malformed model output', async () => {
    reset();
    for (const body of [{}, { symptoms: [] }, { symptoms: ['made-up'] }, { symptoms: 'fever' }, { symptoms: Array(16).fill('fever') }]) {
      assert.equal((await s.request('POST', '/api/symptoms/analyze', { token: alice.token, body })).status, 400);
    }
    mock.reply = 'I am not JSON at all';
    const r = await s.request('POST', '/api/symptoms/analyze', { token: alice.token, body: { symptoms: ['fever'] } });
    assert.equal(r.status, 502);
    assert.equal(r.json.code, 'ai_invalid_response');
  });
});

test('AI proxy without GROQ_API_KEY', { skip: SKIP_DB }, async (t) => {
  const s = await startServer(); // no key configured
  t.after(() => s.close());
  const u = await s.signup();
  const r = await s.request('POST', '/api/chat', { token: u.token, body: { message: 'hello' } });
  assert.equal(r.status, 503);
  assert.equal(r.json.code, 'ai_not_configured');
  const r2 = await s.request('POST', '/api/symptoms/analyze', { token: u.token, body: { symptoms: ['fever'] } });
  assert.equal(r2.status, 503);
});

test('AI rate limiting is per user', { skip: SKIP_DB }, async (t) => {
  const mock = await startMockAi();
  const s = await startServer({ mockAi: mock, env: { AI_RATE_LIMIT_MAX: '2' } });
  t.after(async () => { await s.close(); await mock.close(); });
  const a = await s.signup(); const b = await s.signup();
  const post = (tok) => s.request('POST', '/api/chat', { token: tok, body: { message: 'hello' } });
  assert.deepEqual([(await post(a.token)).status, (await post(a.token)).status, (await post(a.token)).status], [200, 200, 429]);
  assert.equal((await post(b.token)).status, 200, "another user is not affected by Alice's limit");
});
