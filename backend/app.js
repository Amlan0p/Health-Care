'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');

const { securityHeaders, corsMiddleware } = require('./middleware/security');
const { requestLogger, requestTimeout, noStore } = require('./middleware/misc');
const { createLimiters } = require('./middleware/rateLimit');
const { createAuth } = require('./middleware/auth');
const { notFoundApi, errorHandler } = require('./middleware/errorHandler');
const { createTokenService } = require('./services/tokens');
const { createGroqClient } = require('./services/ai/groq');
const { createAiService } = require('./services/ai/aiService');
const { buildApiRouter } = require('./routes');

/**
 * Builds the Express app. Dependencies (db, groq client) can be injected for tests.
 */
function createApp({ config, db, groq }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(securityHeaders());
  app.use(requestLogger(config));
  app.use(corsMiddleware(config));

  const tokens = createTokenService(config);
  const auth = createAuth({ tokens, db });
  const limiters = createLimiters(config);
  const ai = createAiService({ db, groq: groq || createGroqClient(config), config });

  // API
  app.use('/api', noStore, requestTimeout(config.limits.requestTimeoutMs), express.json({ limit: config.limits.bodyLimit }),
    buildApiRouter({ db, config, tokens, auth, ai, limiters }));
  // Unknown /api/* must be a JSON error, never the frontend HTML.
  app.use('/api', notFoundApi);

  // Static frontend (same-origin deployment). Disabled with SERVE_FRONTEND=false.
  if (config.frontend.serve) {
    const dir = config.frontend.dir ? path.resolve(config.frontend.dir) : path.join(__dirname, '..', 'frontend');
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      app.use(express.static(dir, {
        etag: true,
        setHeaders(res, filePath) {
          // Files are not content-hashed, so make browsers revalidate (cheap, ETag-based).
          res.setHeader('Cache-Control', /\.(svg|png|jpg|woff2?)$/.test(filePath) ? 'public, max-age=86400' : 'no-cache');
        },
      }));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(dir, 'index.html'));
      });
    } else {
      console.warn(`[server] Frontend directory not found at ${dir}; serving API only.`);
    }
  }

  app.use(errorHandler(config));
  return app;
}

module.exports = { createApp };
