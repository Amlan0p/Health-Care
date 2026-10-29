'use strict';
const { HttpError } = require('../services/errors');

function notFoundApi(req, res) {
  res.status(404).json({ error: `No such API endpoint: ${req.method} ${req.path}`, code: 'not_found' });
}

/**
 * Final error handler. Never leaks internals: unexpected errors become a generic 500.
 * Logs only error name/code (and the message for non-database errors) — never request bodies or headers.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(config) {
  return (err, req, res, _next) => {
    if (res.headersSent) return;

    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body is not valid JSON.', code: 'invalid_json' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.', code: 'payload_too_large' });
    }
    if (err.code === '23505') { // unique_violation not handled by a route
      return res.status(409).json({ error: 'That record already exists.', code: 'conflict' });
    }

    const isDbError = typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code);
    if (!config.isTest) {
      console.error(`[error] ${req.method} ${req.path} → ${err.name}${err.code ? ' ' + err.code : ''}${isDbError ? '' : ': ' + String(err.message).slice(0, 200)}`);
    }
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.', code: 'internal_error' });
  };
}

module.exports = { notFoundApi, errorHandler };
