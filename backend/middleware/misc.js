'use strict';

/** Minimal request log: method, path (no query string), status, duration. No bodies, no headers. */
function requestLogger(config) {
  return (req, res, next) => {
    if (config.isTest) return next();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/api/health') return;
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(0)}ms`);
    });
    next();
  };
}

/** Responds 503 if a handler does not finish in time. */
function requestTimeout(ms) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) res.status(503).json({ error: 'The request took too long. Please try again.', code: 'request_timeout' });
    }, ms);
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
}

const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

module.exports = { requestLogger, requestTimeout, noStore };
