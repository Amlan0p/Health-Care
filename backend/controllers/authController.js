'use strict';
const bcrypt = require('bcryptjs');
const { badRequest, unauthorized, conflict, notFound, HttpError } = require('../services/errors');

function createAuthController({ db, tokens, config }) {
  // Used to keep sign-in timing similar whether or not the email exists.
  const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.auth.bcryptRounds);
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, isDemo: Boolean(u.is_demo) });

  return {
    async signup(req, res) {
      const { name, email, password } = req.body;
      if (email === config.auth.demoEmail) throw badRequest('This email is reserved. Please use a different email address.', 'reserved_email');
      const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
      let user;
      try {
        const { rows } = await db.query(
          'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, is_demo',
          [name, email, hash],
        );
        user = rows[0];
      } catch (err) {
        if (err.code === '23505') throw conflict('An account with this email already exists. Please sign in.', 'email_taken');
        throw err;
      }
      res.status(201).json({ token: tokens.sign(user), user: publicUser(user) });
    },

    async signin(req, res) {
      const { email, password } = req.body;
      const { rows } = await db.query(
        'SELECT id, name, email, password_hash, is_demo FROM users WHERE lower(email) = $1', [email]);
      const row = rows[0];
      // Always run one bcrypt comparison; demo accounts can never sign in with a password.
      const ok = await bcrypt.compare(password, row && !row.is_demo ? row.password_hash : DUMMY_HASH);
      if (!row || row.is_demo || !ok) throw unauthorized('Invalid email or password. Please try again.', 'invalid_credentials');
      res.json({ token: tokens.sign(row), user: publicUser(row) });
    },

    async me(req, res) {
      const { rows } = await db.query('SELECT id, name, email, is_demo FROM users WHERE id = $1', [req.auth.userId]);
      if (!rows[0]) throw unauthorized('Account no longer exists. Please sign in again.', 'user_gone');
      res.json({ user: publicUser(rows[0]) });
    },

    async logout(req, res) {
      await db.query(
        'INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, to_timestamp($2)) ON CONFLICT (jti) DO NOTHING',
        [req.auth.jti, req.auth.exp],
      );
      await db.query('DELETE FROM revoked_tokens WHERE expires_at < now()');
      res.json({ success: true });
    },

    /** Starts a read-only demo session for the seeded, synthetic demo account. */
    async demo(_req, res) {
      if (!config.auth.demoEnabled) throw notFound('Demo mode is not enabled on this server.', 'demo_disabled');
      const { rows } = await db.query('SELECT id, name, email, is_demo FROM users WHERE is_demo = TRUE AND lower(email) = $1', [config.auth.demoEmail]);
      if (!rows[0]) throw new HttpError(503, 'demo_unavailable', 'Demo data is not available right now.');
      res.json({ token: tokens.sign(rows[0], { demo: true }), user: publicUser(rows[0]) });
    },
  };
}

module.exports = { createAuthController };
