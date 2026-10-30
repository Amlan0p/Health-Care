'use strict';
const helmet = require('helmet');
const cors = require('cors');

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function securityHeaders() {
  const helmetMiddleware = helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  return (req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=*');
    helmetMiddleware(req, res, next);
  };
}

/**
 * CORS: only configured origins (FRONTEND_ORIGIN) are allowed cross-origin.
 * In development, any localhost port is allowed. Same-origin requests never need CORS.
 */
function corsMiddleware(config) {
  const allowed = new Set(config.cors.origins);
  return cors({
    origin(origin, cb) {
      if (!origin) return cb(null, false);                       // non-browser / same-origin: no CORS headers needed
      if (allowed.has(origin)) return cb(null, true);
      if (config.cors.allowLocalhostInDev && LOCALHOST_RE.test(origin)) return cb(null, true);
      return cb(null, false);                                    // omit headers → browser blocks the response
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
}

module.exports = { securityHeaders, corsMiddleware };
