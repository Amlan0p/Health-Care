'use strict';
/**
 * (Re)creates the read-only demo account with SYNTHETIC sample data.
 * Runs on every startup when ENABLE_DEMO is true, so sample appointments never go stale.
 * The demo account has an unusable password hash and its tokens are read-only (enforced in middleware/auth.js).
 */
const { todayIn, addDays } = require('../services/dates');

async function seedDemo(db, config) {
  if (!config.auth.demoEnabled) return false;
  const today = todayIn(config.appTimezone);
  await db.tx(async (c) => {
    const found = await c.query('SELECT id FROM users WHERE lower(email) = $1', [config.auth.demoEmail]);
    let id = found.rows[0]?.id;
    if (!id) {
      const ins = await c.query(
        'INSERT INTO users (name, email, password_hash, is_demo) VALUES ($1, $2, $3, TRUE) RETURNING id',
        ['Demo User', config.auth.demoEmail, '!no-password-login!']);
      id = ins.rows[0].id;
    } else {
      await c.query("UPDATE users SET is_demo = TRUE, password_hash = '!no-password-login!' WHERE id = $1", [id]);
    }
    await c.query('DELETE FROM medications WHERE user_id = $1', [id]);
    await c.query('DELETE FROM appointments WHERE user_id = $1', [id]);
    await c.query('DELETE FROM vitals WHERE user_id = $1', [id]);
    await c.query('DELETE FROM chat_messages WHERE user_id = $1', [id]);

    const meds = [
      ['Sample medication A (demo data)', 'Morning with breakfast', 'taken'],
      ['Sample medication B (demo data)', 'Evening after dinner', 'pending'],
      ['Sample supplement C (demo data)', 'Night before sleep', 'missed'],
    ];
    for (const [n, t, s] of meds) await c.query('INSERT INTO medications (user_id, name, schedule, status) VALUES ($1,$2,$3,$4)', [id, n, t, s]);

    const appts = [
      ['doc-002', addDays(today, 5), '10:30'],
      ['doc-001', addDays(today, 12), '15:00'],
    ];
    const { doctorsById } = require('../services/content');
    for (const [docId, date, time] of appts) {
      const d = doctorsById.get(docId);
      await c.query(
        'INSERT INTO appointments (user_id, doctor_id, doctor, spec, hospital, appt_date, appt_time) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, d.id, d.name, d.spec, d.hospital, date, time]);
    }
    const vitals = [['heartRate', '72'], ['bloodPressure', '118/76'], ['temperature', '98.4'], ['spo2', '98']];
    for (const [k, val] of vitals) await c.query('INSERT INTO vitals (user_id, key, value) VALUES ($1,$2,$3)', [id, k, val]);
  });
  return true;
}

module.exports = { seedDemo };
