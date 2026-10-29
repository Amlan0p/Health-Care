'use strict';
const { z } = require('zod');
const { badRequest } = require('../services/errors');

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Trimmed single-line-ish text with length bounds and no control characters. */
const text = (min, max, label) => z.string({ error: `${label} is required.` })
  .trim()
  .min(min, min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`)
  .max(max, `${label} must be at most ${max} characters.`)
  .refine((s) => !CONTROL_CHARS.test(s), `${label} contains invalid characters.`);

const email = z.string({ error: 'Email is required.' })
  .trim().toLowerCase()
  .max(254, 'Email is too long.')
  .pipe(z.email('Please enter a valid email address.'));

const idParam = z.object({
  id: z.string().regex(/^\d{1,9}$/, 'Invalid id.').transform(Number),
});

/** Express middleware: validate req[source] against a zod schema and replace it with the parsed value. */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(badRequest(issues[0]?.message || 'Invalid request.', 'validation_error', { details: issues }));
    }
    // req.query is a getter in Express 5-style objects; assign defensively.
    if (source === 'query') Object.defineProperty(req, 'query', { value: result.data, writable: true });
    else req[source] = result.data;
    next();
  };
}

module.exports = { z, text, email, idParam, validate };
