'use strict';
const { z, text, email } = require('./common');

// bcrypt only uses the first 72 BYTES of a password, so longer inputs are rejected rather than silently truncated.
const newPassword = z.string({ error: 'Password is required.' })
  .min(8, 'Password must be at least 8 characters.')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes.');

const signup = z.object({
  name: text(1, 100, 'Name').transform((s) => s.replace(/\s+/g, ' ')),
  email,
  password: newPassword,
});

// Sign-in intentionally does NOT enforce the new minimum length, so accounts
// created under the old 6-character rule can still sign in.
const signin = z.object({
  email,
  password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(200, 'Password is too long.'),
});

module.exports = { signup, signin };
