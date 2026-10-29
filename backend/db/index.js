'use strict';
const { Pool } = require('pg');

/**
 * Thin wrapper around a pg Pool.
 *  - query(text, params)  → pg result (always parameterized by callers)
 *  - tx(fn)               → runs fn(client) inside BEGIN/COMMIT, ROLLBACK on error
 *  - ping()               → boolean connectivity check for /api/health
 */
function createDb(config) {
  const pool = new Pool({
    connectionString: config.db.url,
    max: config.db.poolMax,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
  });
  // An idle client erroring must not crash the process.
  pool.on('error', (err) => console.error('[db] idle client error:', err.code || err.message));

  return {
    pool,
    query: (text, params) => pool.query(text, params),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async ping() {
      try { await pool.query('SELECT 1'); return true; } catch { return false; }
    },
    close: () => pool.end(),
  };
}

module.exports = { createDb };
