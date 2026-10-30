'use strict';
const rateLimit = require('express-rate-limit');

function limiter({ windowMs, limit, code, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: keyGenerator || ((req) => req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1'),
    handler: (req, res) => {
      const retryAfter = Math.ceil(windowMs / 1000);
      res.status(429).json({ error: message, code, retryAfterSeconds: res.getHeader('Retry-After') ? Number(res.getHeader('Retry-After')) : retryAfter });
    },
  });
}

/** In-memory limiters (per instance). Fine for a single Render instance; use a shared store if you scale out. */
function createLimiters(config) {
  const { limits } = config;
  return {
    api: limiter({ windowMs: 15 * 60 * 1000, limit: limits.apiMax, code: 'rate_limited', message: 'Too many requests. Please slow down and try again shortly.' }),
    auth: limiter({ windowMs: limits.authWindowMs, limit: limits.authMax, code: 'auth_rate_limited', message: 'Too many attempts. Please wait a few minutes and try again.' }),
    publicForm: limiter({ windowMs: 60 * 60 * 1000, limit: limits.publicFormMax, code: 'form_rate_limited', message: 'Too many submissions from your network. Please try again later.' }),
    // AI is limited per signed-in user (mounted after auth) so one user cannot burn the shared Groq quota.
    ai: limiter({ windowMs: 60 * 1000, limit: limits.aiMax, code: 'ai_rate_limited', message: 'You are sending messages too quickly. Please wait a moment.', keyGenerator: (req) => `user:${req.auth.userId}` }),
  };
}

module.exports = { createLimiters };
