'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/** Signs and verifies HS256 JWTs. The secret comes only from validated config. */
function createTokenService(config) {
  const { jwtSecret, issuer } = config.auth;
  return {
    sign(user, { demo = false } = {}) {
      return jwt.sign(
        demo ? { demo: true } : {},
        jwtSecret,
        {
          algorithm: 'HS256',
          issuer,
          subject: String(user.id),
          jwtid: crypto.randomUUID(),
          expiresIn: demo ? config.auth.demoTokenTtl : config.auth.jwtExpiresIn,
        },
      );
    },
    verify(token) {
      // Pin the algorithm and issuer so "alg: none" / foreign tokens are rejected.
      const p = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], issuer });
      const userId = Number(p.sub);
      if (!Number.isInteger(userId) || userId <= 0 || !p.jti) throw new Error('malformed token');
      return { userId, jti: p.jti, exp: p.exp, demo: p.demo === true };
    },
  };
}

module.exports = { createTokenService };
