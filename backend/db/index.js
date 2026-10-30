'use strict';

const { Pool } = require('pg');

/**
 * Creates an in-memory SQL mock database that supports the exact queries used by HealthCare.
 * Allows the entire application (auth, appointments, meds, vitals, demo data) to run without external Postgres.
 */
function createInMemoryDb() {
  let nextUserId = 1;
  let nextApptId = 1;
  let nextMedId = 1;
  let nextChatId = 1;
  let nextContactId = 1;
  let nextNewsId = 1;

  const users = new Map(); // id -> user
  const appointments = new Map(); // id -> appt
  const medications = new Map(); // id -> med
  const vitals = new Map(); // `${userId}:${key}` -> { userId, key, value, updated_at }
  const chatMessages = []; // array of { id, user_id, role, content, created_at }
  const revokedTokens = new Map(); // jti -> expiresAt
  const contactMessages = [];
  const newsletterSubscribers = new Set();
  const schemaMigrations = new Set();

  async function execute(sql, params = []) {
    const q = sql.trim().replace(/\s+/g, ' ');

    // Ping / check
    if (/^SELECT 1$/i.test(q)) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }

    // Advisory lock for migrations
    if (/pg_advisory_lock/i.test(q)) {
      return { rows: [{ pg_advisory_lock: true }], rowCount: 1 };
    }
    if (/pg_advisory_unlock/i.test(q)) {
      return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
    }

    // Transactions
    if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(q)) {
      return { rows: [], rowCount: 0 };
    }

    // Schema migrations
    if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(q)) {
      return { rows: [], rowCount: 0 };
    }
    if (/SELECT name FROM schema_migrations/i.test(q)) {
      return {
        rows: Array.from(schemaMigrations).map((name) => ({ name })),
        rowCount: schemaMigrations.size,
      };
    }
    if (/INSERT INTO schema_migrations/i.test(q)) {
      schemaMigrations.add(params[0]);
      return { rows: [], rowCount: 1 };
    }
    if (/CREATE TABLE/i.test(q) || /CREATE INDEX/i.test(q) || /CREATE UNIQUE INDEX/i.test(q)) {
      return { rows: [], rowCount: 0 };
    }

    // Revoked tokens
    if (/SELECT 1 FROM revoked_tokens WHERE jti = \$1/i.test(q)) {
      const exp = revokedTokens.get(params[0]);
      const active = exp && exp > Date.now();
      return { rows: active ? [{ '?column?': 1 }] : [], rowCount: active ? 1 : 0 };
    }
    if (/INSERT INTO revoked_tokens/i.test(q)) {
      revokedTokens.set(params[0], params[1] * 1000);
      return { rows: [], rowCount: 1 };
    }
    if (/DELETE FROM revoked_tokens/i.test(q)) {
      const now = Date.now();
      for (const [jti, exp] of revokedTokens.entries()) {
        if (exp < now) revokedTokens.delete(jti);
      }
      return { rows: [], rowCount: 0 };
    }

    // Users
    if (/SELECT id FROM users WHERE lower\(email\) = \$1/i.test(q)) {
      const emailLower = String(params[0]).toLowerCase();
      for (const u of users.values()) {
        if (u.email.toLowerCase() === emailLower) {
          return { rows: [{ id: u.id }], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (/SELECT id, name, email, password_hash, is_demo FROM users WHERE lower\(email\) = \$1/i.test(q)) {
      const emailLower = String(params[0]).toLowerCase();
      for (const u of users.values()) {
        if (u.email.toLowerCase() === emailLower) {
          return { rows: [{ ...u }], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (/SELECT id, name, email, is_demo FROM users WHERE is_demo = TRUE AND lower\(email\) = \$1/i.test(q)) {
      const emailLower = String(params[0]).toLowerCase();
      for (const u of users.values()) {
        if (u.is_demo && u.email.toLowerCase() === emailLower) {
          return { rows: [{ ...u }], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (/SELECT id, name, email, is_demo FROM users WHERE id = \$1/i.test(q)) {
      const u = users.get(Number(params[0]));
      return { rows: u ? [{ id: u.id, name: u.name, email: u.email, is_demo: u.is_demo }] : [], rowCount: u ? 1 : 0 };
    }

    if (/SELECT count\(\*\)::int AS n FROM users WHERE is_demo = FALSE/i.test(q)) {
      let count = 0;
      for (const u of users.values()) if (!u.is_demo) count++;
      return { rows: [{ n: count }], rowCount: 1 };
    }

    if (/INSERT INTO users \(name, email, password_hash, is_demo\) VALUES \(\$1, \$2, \$3, TRUE\) RETURNING id/i.test(q)) {
      const id = nextUserId++;
      const user = { id, name: params[0], email: params[1], password_hash: params[2], is_demo: true, created_at: new Date() };
      users.set(id, user);
      return { rows: [{ id }], rowCount: 1 };
    }

    if (/INSERT INTO users \(name, email, password_hash\) VALUES \(\$1, \$2, \$3\) RETURNING id, name, email, is_demo/i.test(q)) {
      const emailLower = String(params[1]).toLowerCase();
      for (const u of users.values()) {
        if (u.email.toLowerCase() === emailLower) {
          const err = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          throw err;
        }
      }
      const id = nextUserId++;
      const user = { id, name: params[0], email: params[1], password_hash: params[2], is_demo: false, created_at: new Date() };
      users.set(id, user);
      return { rows: [{ id: user.id, name: user.name, email: user.email, is_demo: user.is_demo }], rowCount: 1 };
    }

    if (/UPDATE users SET is_demo = TRUE, password_hash = '!no-password-login!' WHERE id = \$1/i.test(q)) {
      const u = users.get(Number(params[0]));
      if (u) {
        u.is_demo = true;
        u.password_hash = '!no-password-login!';
      }
      return { rows: [], rowCount: u ? 1 : 0 };
    }

    // Appointments
    if (/SELECT id, doctor_id, doctor, spec, hospital, to_char\(appt_date, 'YYYY-MM-DD'\) AS date, to_char\(appt_time, 'HH24:MI'\) AS time FROM appointments WHERE user_id = \$1/i.test(q)) {
      const userId = Number(params[0]);
      const list = [];
      for (const a of appointments.values()) {
        if (a.user_id === userId) {
          list.push({
            id: a.id,
            doctor_id: a.doctor_id,
            doctor: a.doctor,
            spec: a.spec,
            hospital: a.hospital,
            date: a.appt_date,
            time: a.appt_time,
          });
        }
      }
      list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.id - b.id);
      return { rows: list, rowCount: list.length };
    }

    if (/SELECT count\(\*\)::int AS n FROM appointments WHERE user_id = \$1/i.test(q)) {
      const userId = Number(params[0]);
      let count = 0;
      for (const a of appointments.values()) if (a.user_id === userId) count++;
      return { rows: [{ n: count }], rowCount: 1 };
    }

    if (/SELECT .+ FROM appointments WHERE id = \$1 AND user_id = \$2/i.test(q)) {
      const id = Number(params[0]);
      const userId = Number(params[1]);
      const a = appointments.get(id);
      if (a && a.user_id === userId) {
        return {
          rows: [{
            id: a.id,
            doctor_id: a.doctor_id,
            doctor: a.doctor,
            spec: a.spec,
            hospital: a.hospital,
            date: a.appt_date,
            time: a.appt_time,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }

    if (/INSERT INTO appointments/i.test(q)) {
      const userId = Number(params[0]);
      const doctorId = params[1];
      const doctor = params[2];
      const spec = params[3];
      const hospital = params[4];
      const date = String(params[5]).slice(0, 10);
      const time = String(params[6]).slice(0, 5);

      for (const a of appointments.values()) {
        if (a.user_id === userId && a.doctor_id === doctorId && a.appt_date === date && a.appt_time === time) {
          const err = new Error('duplicate appointment');
          err.code = '23505';
          throw err;
        }
      }

      const id = nextApptId++;
      const record = { id, user_id: userId, doctor_id: doctorId, doctor, spec, hospital, appt_date: date, appt_time: time, created_at: new Date() };
      appointments.set(id, record);
      return {
        rows: [{
          id: record.id,
          doctor_id: record.doctor_id,
          doctor: record.doctor,
          spec: record.spec,
          hospital: record.hospital,
          date: record.appt_date,
          time: record.appt_time,
        }],
        rowCount: 1,
      };
    }

    if (/UPDATE appointments SET appt_date = \$1, appt_time = \$2 WHERE id = \$3 AND user_id = \$4/i.test(q)) {
      const date = String(params[0]).slice(0, 10);
      const time = String(params[1]).slice(0, 5);
      const id = Number(params[2]);
      const userId = Number(params[3]);
      const a = appointments.get(id);
      if (!a || a.user_id !== userId) return { rows: [], rowCount: 0 };

      for (const other of appointments.values()) {
        if (other.id !== id && other.user_id === userId && other.doctor_id === a.doctor_id && other.appt_date === date && other.appt_time === time) {
          const err = new Error('duplicate appointment');
          err.code = '23505';
          throw err;
        }
      }

      a.appt_date = date;
      a.appt_time = time;
      return {
        rows: [{
          id: a.id,
          doctor_id: a.doctor_id,
          doctor: a.doctor,
          spec: a.spec,
          hospital: a.hospital,
          date: a.appt_date,
          time: a.appt_time,
        }],
        rowCount: 1,
      };
    }

    if (/DELETE FROM appointments WHERE id = \$1 AND user_id = \$2/i.test(q)) {
      const id = Number(params[0]);
      const userId = Number(params[1]);
      const a = appointments.get(id);
      if (a && a.user_id === userId) {
        appointments.delete(id);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (/DELETE FROM appointments WHERE user_id = \$1/i.test(q)) {
      const userId = Number(params[0]);
      let deleted = 0;
      for (const [id, a] of appointments.entries()) {
        if (a.user_id === userId) {
          appointments.delete(id);
          deleted++;
        }
      }
      return { rows: [], rowCount: deleted };
    }

    // Medications
    if (/SELECT id, name, schedule, status FROM medications WHERE user_id = \$1/i.test(q)) {
      const userId = Number(params[0]);
      const list = [];
      for (const m of medications.values()) {
        if (m.user_id === userId) {
          list.push({ id: m.id, name: m.name, schedule: m.schedule, status: m.status });
        }
      }
      list.sort((a, b) => a.id - b.id);
      return { rows: list, rowCount: list.length };
    }

    if (/SELECT count\(\*\)::int AS n FROM medications WHERE user_id = \$1/i.test(q)) {
      const userId = Number(params[0]);
      let count = 0;
      for (const m of medications.values()) if (m.user_id === userId) count++;
      return { rows: [{ n: count }], rowCount: 1 };
    }

    if (/INSERT INTO medications \(user_id, name, schedule, status\) VALUES/i.test(q)) {
      const userId = Number(params[0]);
      const name = params[1];
      const schedule = params[2];
      const status = params[3] || 'pending';
      const id = nextMedId++;
      const med = { id, user_id: userId, name, schedule, status, created_at: new Date(), updated_at: new Date() };
      medications.set(id, med);
      return { rows: [{ id: med.id, name: med.name, schedule: med.schedule, status: med.status }], rowCount: 1 };
    }

    if (/UPDATE medications SET/i.test(q)) {
      // UPDATE medications SET name = COALESCE($1, name), schedule = COALESCE($2, schedule), status = COALESCE($3, status), updated_at = now() WHERE id = $4 AND user_id = $5
      const name = params[0];
      const schedule = params[1];
      const status = params[2];
      const id = Number(params[3]);
      const userId = Number(params[4]);
      const m = medications.get(id);
      if (!m || m.user_id !== userId) return { rows: [], rowCount: 0 };
      if (name !== null && name !== undefined) m.name = name;
      if (schedule !== null && schedule !== undefined) m.schedule = schedule;
      if (status !== null && status !== undefined) m.status = status;
      m.updated_at = new Date();
      return { rows: [{ id: m.id, name: m.name, schedule: m.schedule, status: m.status }], rowCount: 1 };
    }

    if (/DELETE FROM medications WHERE id = \$1 AND user_id = \$2/i.test(q)) {
      const id = Number(params[0]);
      const userId = Number(params[1]);
      const m = medications.get(id);
      if (m && m.user_id === userId) {
        medications.delete(id);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (/DELETE FROM medications WHERE user_id = \$1/i.test(q)) {
      const userId = Number(params[0]);
      let deleted = 0;
      for (const [id, m] of medications.entries()) {
        if (m.user_id === userId) {
          medications.delete(id);
          deleted++;
        }
      }
      return { rows: [], rowCount: deleted };
    }

    // Vitals
    if (/SELECT key, value FROM vitals WHERE user_id = \$1/i.test(q)) {
      const userId = Number(params[0]);
      const list = [];
      for (const v of vitals.values()) {
        if (v.user_id === userId) list.push({ key: v.key, value: v.value });
      }
      return { rows: list, rowCount: list.length };
    }

    if (/INSERT INTO vitals/i.test(q)) {
      const userId = Number(params[0]);
      const key = params[1];
      const value = params[2];
      const mapKey = `${userId}:${key}`;
      vitals.set(mapKey, { user_id: userId, key, value, updated_at: new Date() });
      return { rows: [], rowCount: 1 };
    }

    if (/DELETE FROM vitals WHERE user_id = \$1 AND key = \$2/i.test(q)) {
      const userId = Number(params[0]);
      const key = params[1];
      const mapKey = `${userId}:${key}`;
      const existed = vitals.delete(mapKey);
      return { rows: [], rowCount: existed ? 1 : 0 };
    }

    if (/DELETE FROM vitals WHERE user_id = \$1/i.test(q)) {
      const userId = Number(params[0]);
      let deleted = 0;
      for (const [k, v] of vitals.entries()) {
        if (v.user_id === userId) {
          vitals.delete(k);
          deleted++;
        }
      }
      return { rows: [], rowCount: deleted };
    }

    // Chat messages
    if (/SELECT role, content FROM \( SELECT id, role, content FROM chat_messages WHERE user_id = \$1/i.test(q)) {
      const userId = Number(params[0]);
      const limit = Number(params[1]) || 20;
      const userMsgs = chatMessages.filter((m) => m.user_id === userId);
      const slice = userMsgs.slice(-limit);
      return {
        rows: slice.map((m) => ({ role: m.role, content: m.content })),
        rowCount: slice.length,
      };
    }

    if (/SELECT role, content, created_at FROM \( SELECT id, role, content, created_at FROM chat_messages WHERE user_id = \$1/i.test(q)) {
      const userId = Number(params[0]);
      const limit = Number(params[1]) || 50;
      const userMsgs = chatMessages.filter((m) => m.user_id === userId);
      const slice = userMsgs.slice(-limit);
      return {
        rows: slice.map((m) => ({ role: m.role, content: m.content, created_at: m.created_at })),
        rowCount: slice.length,
      };
    }

    if (/INSERT INTO chat_messages/i.test(q)) {
      const userId = Number(params[0]);
      if (params.length === 5) {
        // ($1, $2, $3), ($1, $4, $5)
        chatMessages.push({ id: nextChatId++, user_id: userId, role: params[1], content: params[2], created_at: new Date() });
        chatMessages.push({ id: nextChatId++, user_id: userId, role: params[3], content: params[4], created_at: new Date() });
      } else {
        chatMessages.push({ id: nextChatId++, user_id: userId, role: params[1], content: params[2], created_at: new Date() });
      }
      return { rows: [], rowCount: 1 };
    }

    if (/DELETE FROM chat_messages WHERE user_id = \$1/i.test(q)) {
      const userId = Number(params[0]);
      let count = 0;
      for (let i = chatMessages.length - 1; i >= 0; i--) {
        if (chatMessages[i].user_id === userId) {
          chatMessages.splice(i, 1);
          count++;
        }
      }
      return { rows: [], rowCount: count };
    }

    // Contact messages
    if (/INSERT INTO contact_messages/i.test(q)) {
      contactMessages.push({
        id: nextContactId++,
        name: params[0],
        email: params[1],
        subject: params[2] || '',
        message: params[3],
        created_at: new Date(),
      });
      return { rows: [], rowCount: 1 };
    }

    // Newsletter
    if (/INSERT INTO newsletter_subscribers/i.test(q)) {
      const email = String(params[0]).toLowerCase();
      if (newsletterSubscribers.has(email)) {
        const err = new Error('duplicate newsletter subscriber');
        err.code = '23505';
        throw err;
      }
      newsletterSubscribers.add(email);
      return { rows: [], rowCount: 1 };
    }

    // Fallback for unhandled queries
    console.warn('[mock-db] Unhandled query:', q);
    return { rows: [], rowCount: 0 };
  }

  const clientMock = {
    query: execute,
    release: () => {},
  };

  return {
    query: execute,
    tx: async (fn) => fn(clientMock),
    ping: async () => true,
    close: async () => {},
    pool: {
      connect: async () => clientMock,
      query: execute,
    },
  };
}

/**
 * Creates database connection: PostgreSQL pool if DATABASE_URL is set, otherwise built-in in-memory mock.
 */
function createDb(config) {
  if (!config.db.url) {
    console.log('[db] DATABASE_URL not set — activating in-memory database mock (all features operational)');
    return createInMemoryDb();
  }

  try {
    const pool = new Pool({
      connectionString: config.db.url,
      max: config.db.poolMax,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,
    });

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
        try {
          await pool.query('SELECT 1');
          return true;
        } catch {
          return false;
        }
      },
      close: () => pool.end(),
    };
  } catch (err) {
    console.warn('[db] Failed to initialize Postgres pool, falling back to mock:', err.message);
    return createInMemoryDb();
  }
}

module.exports = { createDb, createInMemoryDb };
