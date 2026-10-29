'use strict';
const helmet = require('helmet');
const cors = require('cors');

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        // The existing UI relies on inline style attributes; scripts stay strictly same-origin.
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
        'connect-src': ["'self'", 'https://overpass-api.de'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // map tiles are cross-origin images
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
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
