'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, SKIP_DB } = require('./helpers');

test('appointments, medications, vitals and user isolation', { skip: SKIP_DB }, async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  const alice = await s.signup({ name: 'Alice' });
  const bob = await s.signup({ name: 'Bob' });

  await t.test('appointments: create / list / update / delete', async () => {
    const date = s.futureDate(10);
    const c = await s.request('POST', '/api/appointments', { token: alice.token, body: { doctorId: 'doc-001', date, time: '10:30' } });
    assert.equal(c.status, 201);
    assert.deepEqual({ ...c.json, id: undefined }, { id: undefined, doctorId: 'doc-001', doctor: 'Dr. Subhash Mondal', spec: 'Cardiologist', hospital: 'SSKM Hospital', date, time: '10:30' });
    const list = await s.request('GET', '/api/appointments', { token: alice.token });
    assert.equal(list.json.length, 1);
    const up = await s.request('PATCH', `/api/appointments/${c.json.id}`, { token: alice.token, body: { time: '15:00' } });
    assert.equal(up.status, 200);
    assert.equal(up.json.time, '15:00');
    assert.equal(up.json.date, date);
    const del = await s.request('DELETE', `/api/appointments/${c.json.id}`, { token: alice.token });
    assert.equal(del.status, 200);
    assert.equal((await s.request('GET', '/api/appointments', { token: alice.token })).json.length, 0);
    assert.equal((await s.request('DELETE', `/api/appointments/${c.json.id}`, { token: alice.token })).status, 404);
  });

  await t.test('appointments: validation (past date, unknown doctor, bad slot, bad date, duplicates)', async () => {
    const post = (body) => s.request('POST', '/api/appointments', { token: alice.token, body });
    assert.equal((await post({ doctorId: 'doc-001', date: s.pastDate(), time: '10:00' })).json.code, 'date_in_past');
    assert.equal((await post({ doctorId: 'doc-999', date: s.futureDate(), time: '10:00' })).status, 400);
    assert.equal((await post({ doctorId: 'doc-001', date: s.futureDate(), time: '03:17' })).status, 400);
    assert.equal((await post({ doctorId: 'doc-001', date: '2026-02-31', time: '10:00' })).status, 400);
    assert.equal((await post({ doctorId: 'doc-001', date: 'tomorrow', time: '10:00' })).status, 400);
    assert.equal((await post({})).status, 400);
    const ok = await post({ doctorId: 'doc-002', date: s.futureDate(), time: '09:00' });
    assert.equal(ok.status, 201);
    const dup = await post({ doctorId: 'doc-002', date: s.futureDate(), time: '09:00' });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.code, 'appointment_exists');
  });

  await t.test('appointments: client-supplied doctor details are ignored (taken from the server catalogue)', async () => {
    const r = await s.request('POST', '/api/appointments', { token: alice.token, body: { doctorId: 'doc-003', date: s.futureDate(3), time: '11:00', doctor: 'Dr. Fake', hospital: 'Fake Hospital' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.doctor, 'Dr. Ritu Ghosh');
    assert.equal(r.json.hospital, 'Fortis Hospital');
  });

  await t.test('medications: create / list / update / delete', async () => {
    const c = await s.request('POST', '/api/medications', { token: alice.token, body: { name: '  Metformin 500mg ', time: 'Morning with breakfast' } });
    assert.equal(c.status, 201);
    assert.equal(c.json.name, 'Metformin 500mg');
    assert.equal(c.json.status, 'pending');
    const p = await s.request('PATCH', `/api/medications/${c.json.id}`, { token: alice.token, body: { status: 'taken' } });
    assert.equal(p.json.status, 'taken');
    assert.equal(p.json.name, 'Metformin 500mg');
    assert.equal((await s.request('PATCH', `/api/medications/${c.json.id}`, { token: alice.token, body: { status: 'bogus' } })).status, 400);
    assert.equal((await s.request('PATCH', `/api/medications/${c.json.id}`, { token: alice.token, body: {} })).status, 400);
    assert.equal((await s.request('POST', '/api/medications', { token: alice.token, body: { name: '', time: 'x' } })).status, 400);
    assert.equal((await s.request('POST', '/api/medications', { token: alice.token, body: { name: 'x'.repeat(101), time: 'x' } })).status, 400);
    assert.equal((await s.request('DELETE', `/api/medications/${c.json.id}`, { token: alice.token })).status, 200);
    assert.equal((await s.request('DELETE', `/api/medications/${c.json.id}`, { token: alice.token })).status, 404);
    assert.equal((await s.request('DELETE', '/api/medications/abc', { token: alice.token })).status, 400);
  });

  await t.test('vitals: upsert / list / delete with validation', async () => {
    const put = (key, value) => s.request('PUT', '/api/vitals', { token: alice.token, body: { key, value } });
    assert.equal((await put('heartRate', '72')).status, 200);
    assert.equal((await put('heartRate', 75)).json.value, '75', 'upsert replaces');
    assert.equal((await put('bloodPressure', '120 / 80')).json.value, '120/80');
    assert.equal((await put('heartRate', '9999')).status, 400);
    assert.equal((await put('notAVital', '1')).status, 400);
    assert.equal((await put('spo2', '')).status, 400);
    const got = await s.request('GET', '/api/vitals', { token: alice.token });
    assert.deepEqual(got.json, { heartRate: '75', bloodPressure: '120/80' });
    assert.equal((await s.request('DELETE', '/api/vitals/heartRate', { token: alice.token })).status, 200);
    assert.deepEqual((await s.request('GET', '/api/vitals', { token: alice.token })).json, { bloodPressure: '120/80' });
  });

  await t.test('ISOLATION: one user can never read or modify another user\'s records', async () => {
    const appt = await s.request('POST', '/api/appointments', { token: alice.token, body: { doctorId: 'doc-004', date: s.futureDate(20), time: '16:00' } });
    const med = await s.request('POST', '/api/medications', { token: alice.token, body: { name: 'Private med', time: 'Night' } });
    await s.request('PUT', '/api/vitals', { token: alice.token, body: { key: 'spo2', value: '96' } });

    // Bob sees none of it
    assert.equal((await s.request('GET', '/api/appointments', { token: bob.token })).json.length, 0);
    assert.equal((await s.request('GET', '/api/medications', { token: bob.token })).json.length, 0);
    assert.deepEqual((await s.request('GET', '/api/vitals', { token: bob.token })).json, {});
    // Bob cannot touch Alice's rows by id
    assert.equal((await s.request('DELETE', `/api/appointments/${appt.json.id}`, { token: bob.token })).status, 404);
    assert.equal((await s.request('PATCH', `/api/appointments/${appt.json.id}`, { token: bob.token, body: { time: '09:00' } })).status, 404);
    assert.equal((await s.request('PATCH', `/api/medications/${med.json.id}`, { token: bob.token, body: { status: 'taken' } })).status, 404);
    assert.equal((await s.request('DELETE', `/api/medications/${med.json.id}`, { token: bob.token })).status, 404);
    // …and a user_id in the body is ignored
    const sneaky = await s.request('POST', '/api/medications', { token: bob.token, body: { name: 'Bobs', time: 'Now', user_id: alice.user.id, userId: alice.user.id } });
    assert.equal(sneaky.status, 201);
    const aliceMeds = (await s.request('GET', '/api/medications', { token: alice.token })).json;
    assert.ok(!aliceMeds.some((m) => m.name === 'Bobs'));
    // Alice's data is intact
    assert.ok((await s.request('GET', '/api/appointments', { token: alice.token })).json.some((a) => a.id === appt.json.id));
    assert.ok(aliceMeds.some((m) => m.id === med.json.id && m.status === 'pending'));
  });

  await t.test('SQL injection strings are stored/handled as plain text', async () => {
    const evil = "Robert'); DROP TABLE medications;--";
    const r = await s.request('POST', '/api/medications', { token: alice.token, body: { name: evil, time: "' OR '1'='1" } });
    assert.equal(r.status, 201);
    assert.equal(r.json.name, evil);
    assert.equal((await s.request('GET', '/api/medications', { token: alice.token })).status, 200);
  });

  await t.test('public content endpoints label sample data and need no auth', async () => {
    const d = await s.request('GET', '/api/content/doctors');
    assert.equal(d.status, 200);
    assert.equal(d.json.synthetic, true);
    assert.match(d.json.notice, /fictional/i);
    assert.equal(d.json.doctors.length, 15);
    assert.ok((await s.request('GET', '/api/content/symptoms')).json.symptoms.length >= 10);
    assert.equal((await s.request('GET', '/api/content/vitals')).json.vitals.length, 4);
  });

  await t.test('cascade: deleting a user removes their records', async () => {
    const carol = await s.signup({ name: 'Carol' });
    await s.request('POST', '/api/medications', { token: carol.token, body: { name: 'M', time: 'T' } });
    await s.db.query('DELETE FROM users WHERE id = $1', [carol.user.id]);
    const { rows } = await s.db.query('SELECT count(*)::int AS n FROM medications WHERE user_id = $1', [carol.user.id]);
    assert.equal(rows[0].n, 0);
  });
});
