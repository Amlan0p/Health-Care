'use strict';
/**
 * One-off migration of an existing SQLite database (the original app's healthcare.db) into PostgreSQL.
 *
 *   cd backend
 *   npm install --no-save better-sqlite3        # only needed for this script; not a runtime dependency
 *   DATABASE_URL=postgresql://... node scripts/migrate-sqlite-to-postgres.js --sqlite /path/to/healthcare.db [--dry-run]
 *
 * - Preserves user ids and bcrypt password hashes (existing users can keep signing in).
 * - Converts appointments (day/mon/time/date_raw) to proper date + time columns and links doctors from the catalogue by name.
 * - Never drops data silently: every row that cannot be migrated is listed in the report.
 * - Refuses to run if the target already contains non-demo users (so it cannot duplicate or overwrite data).
 */
require('dotenv').config();
const { loadConfig } = require('../config');
const { createDb } = require('../db');
const { migrate } = require('../db/migrate');
const { doctorsFile, vitalsByKey } = require('../services/content');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

function parseTime(label) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(label || '');
  if (!m) return null;
  let h = Number(m[1]) % 12; if (m[3].toUpperCase() === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

async function main() {
  const sqlitePath = opt('--sqlite');
  if (!sqlitePath) { console.error('Usage: node scripts/migrate-sqlite-to-postgres.js --sqlite <file> [--dry-run]'); process.exit(2); }
  let Database;
  try { Database = require('better-sqlite3'); }
  catch { console.error('better-sqlite3 is required for this script. Run: npm install --no-save better-sqlite3'); process.exit(2); }

  const src = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const config = loadConfig();
  const db = createDb(config);
  await migrate(db, { log: () => {} });

  const existing = await db.query('SELECT count(*)::int AS n FROM users WHERE is_demo = FALSE');
  if (existing.rows[0].n > 0) throw new Error('Target database already contains users. Refusing to migrate into a non-empty database.');

  const skipped = [];
  const doctorByName = new Map(doctorsFile.doctors.map((d) => [d.name, d]));
  const users = src.prepare('SELECT id, name, email, password, created_at FROM users ORDER BY id').all();
  const userIds = new Set(users.map((u) => u.id));
  const counts = { users: 0, appointments: 0, medications: 0, vitals: 0 };

  const run = async (c) => {
    for (const u of users) {
      const email = String(u.email || '').trim().toLowerCase();
      const name = String(u.name || '').trim().slice(0, 100);
      if (!email || !name || !u.password) { skipped.push(`user id=${u.id}: missing name/email/password`); userIds.delete(u.id); continue; }
      await c.query('INSERT INTO users (id, name, email, password_hash, created_at) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5)',
        [u.id, name, email, u.password, u.created_at ? new Date(u.created_at.replace(' ', 'T') + 'Z') : new Date()]);
      counts.users += 1;
    }
    for (const a of src.prepare('SELECT * FROM appointments ORDER BY id').all()) {
      const date = String(a.date_raw || '').slice(0, 10); const time = parseTime(a.time);
      if (!userIds.has(a.user_id) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) { skipped.push(`appointment id=${a.id}: unusable user/date/time (${a.date_raw} ${a.time})`); continue; }
      const doc = doctorByName.get(a.doctor);
      try {
        await c.query('SAVEPOINT s');
        await c.query('INSERT INTO appointments (id, user_id, doctor_id, doctor, spec, hospital, appt_date, appt_time) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [a.id, a.user_id, doc ? doc.id : 'legacy', a.doctor, a.spec, a.hospital, date, time]);
        await c.query('RELEASE SAVEPOINT s'); counts.appointments += 1;
      } catch (e) { await c.query('ROLLBACK TO SAVEPOINT s'); skipped.push(`appointment id=${a.id}: ${e.code === '23505' ? 'duplicate booking' : e.message}`); }
    }
    for (const m of src.prepare('SELECT * FROM medications ORDER BY id').all()) {
      if (!userIds.has(m.user_id) || !m.name || !m.time) { skipped.push(`medication id=${m.id}: unusable`); continue; }
      if (m.name.length > 100 || m.time.length > 100) skipped.push(`medication id=${m.id}: text truncated to 100 characters (migrated)`);
      await c.query('INSERT INTO medications (id, user_id, name, schedule, status) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5)',
        [m.id, m.user_id, String(m.name).slice(0, 100), String(m.time).slice(0, 100), m.status]);
      counts.medications += 1;
    }
    for (const v of src.prepare('SELECT * FROM vitals ORDER BY id').all()) {
      if (!userIds.has(v.user_id) || !vitalsByKey.has(v.key) || !v.value || String(v.value).length > 40) { skipped.push(`vital id=${v.id} key=${v.key}: unknown key or unusable value`); continue; }
      await c.query('INSERT INTO vitals (user_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (user_id, key) DO NOTHING', [v.user_id, v.key, String(v.value)]);
      counts.vitals += 1;
    }
    for (const t of ['users', 'appointments', 'medications']) {
      await c.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t}), 1))`);
    }
    if (flag('--dry-run')) throw Object.assign(new Error('dry-run'), { dry: true });
  };

  try { await db.tx(run); }
  catch (e) { if (!e.dry) throw e; console.log('Dry run: nothing was written.'); }
  finally { await db.close(); src.close(); }

  console.log(`${flag('--dry-run') ? 'Would migrate' : 'Migrated'}:`, counts);
  if (skipped.length) { console.log(`\n${skipped.length} item(s) need attention:`); skipped.forEach((s) => console.log(' - ' + s)); }
  else console.log('No rows skipped.');
}
main().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
