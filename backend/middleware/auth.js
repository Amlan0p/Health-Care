'use strict';
const { unauthorized, forbidden } = require('../services/errors');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Builds the authentication middleware.
 *  - Verifies the Bearer JWT (pinned algorithm + issuer, expiry enforced by jsonwebtoken).
 *  - Rejects tokens that were revoked by logout.
 *  - Sets req.auth = { userId, jti, exp, demo }.
 *  - Demo-session tokens are READ-ONLY: any non-safe method is refused here, server-side.
 */
function createAuth({ tokens, db }) {
  function requireAuth({ allowDemoWrites = false } = {}) {
    return async (req, _res, next) => {
      try {
        const header = req.headers.authorization || '';
        if (!header.startsWith('Bearer ')) throw unauthorized('Please sign in to continue.', 'missing_token');
        let auth;
        try { auth = tokens.verify(header.slice(7).trim()); }
        catch { throw unauthorized('Your session has expired or is invalid. Please sign in again.', 'invalid_token'); }

        const { rowCount } = await db.query('SELECT 1 FROM revoked_tokens WHERE jti = $1', [auth.jti]);
        if (rowCount) throw unauthorized('You have been signed out. Please sign in again.', 'revoked_token');

        if (auth.demo && !allowDemoWrites && !SAFE_METHODS.has(req.method)) {
          throw forbidden('Demo mode is read-only. Create a free account to save changes.', 'demo_read_only');
        }
        req.auth = auth;
        next();
      } catch (err) { next(err); }
    };
  }

  /** Use on routes a demo session must never reach at all (e.g. the AI proxy). */
  const denyDemo = (req, _res, next) => (req.auth?.demo
    ? next(forbidden('This feature is not available in demo mode. Create a free account to use it.', 'demo_not_allowed'))
    : next());

  return { requireAuth, denyDemo };
}

module.exports = { createAuth };
