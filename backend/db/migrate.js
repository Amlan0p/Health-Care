'use strict';
/**
 * Minimal forward-only SQL migration runner.
 *   - Files in db/migrations/*.sql are applied in filename order.
 *   - Applied names are recorded in schema_migrations.
 *   - A Postgres advisory lock prevents two instances migrating at once.
 *
 * CLI:  npm run migrate     (reads DATABASE_URL from the environment / .env)
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_ID = 7_265_001; // arbitrary constant for pg_advisory_lock

async function migrate(db, { log = console.log } = {}) {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const client = await db.pool.connect();
  const applied = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        log(`[migrate] applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
  return applied;
}

module.exports = { migrate };

if (require.main === module) {
  require('dotenv').config();
  const { loadConfig } = require('../config');
  const { createDb } = require('./index');
  (async () => {
    const config = loadConfig();
    const db = createDb(config);
    try {
      const applied = await migrate(db);
      console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.');
    } finally {
      await db.close();
    }
  })().catch((err) => { console.error(err.message); process.exit(1); });
}
