'use strict';

/** Error carrying an HTTP status and a stable machine-readable code. */
class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const badRequest = (message, code = 'bad_request', extra) => new HttpError(400, code, message, extra);
const unauthorized = (message = 'Authentication required.', code = 'unauthorized') => new HttpError(401, code, message);
const forbidden = (message, code = 'forbidden') => new HttpError(403, code, message);
const notFound = (message = 'Not found.', code = 'not_found') => new HttpError(404, code, message);
const conflict = (message, code = 'conflict') => new HttpError(409, code, message);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
