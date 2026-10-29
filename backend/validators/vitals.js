'use strict';
const { z } = require('./common');
const { vitalsByKey } = require('../services/content');
const { badRequest } = require('../services/errors');

const keySchema = z.string().refine((k) => vitalsByKey.has(k), 'Unknown vital.');
const put = z.object({
  key: keySchema,
  value: z.union([z.string(), z.number()], { error: 'Value is required.' }).transform((v) => String(v).trim()),
});
const keyParam = z.object({ key: keySchema });

/**
 * Validates a raw value against the vital's definition and returns the canonical string to store.
 * Throws an HttpError(400) with a user-facing message on failure.
 */
function canonicalizeVital(def, raw) {
  const fail = (msg) => { throw badRequest(msg, 'validation_error'); };
  if (!raw) fail(`${def.label} value is required.`);
  if (def.type === 'int') {
    if (!/^\d{1,4}$/.test(raw)) fail(`${def.label} must be a whole number.`);
    const n = Number(raw);
    if (n < def.min || n > def.max) fail(`${def.label} must be between ${def.min} and ${def.max} ${def.unit}.`);
    return String(n);
  }
  if (def.type === 'float') {
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) fail(`${def.label} must be a number like 98.6.`);
    const n = Number(raw);
    if (n < def.min || n > def.max) fail(`${def.label} must be between ${def.min} and ${def.max} ${def.unit}.`);
    return String(n);
  }
  if (def.type === 'bp') {
    const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(raw);
    if (!m) fail('Blood pressure must look like 120/80.');
    const sys = Number(m[1]); const dia = Number(m[2]);
    if (sys < 50 || sys > 260 || dia < 30 || dia > 160 || sys <= dia) fail('Blood pressure values are outside the plausible range (systolic 50–260, diastolic 30–160, systolic above diastolic).');
    return `${sys}/${dia}`;
  }
  return fail('Unsupported vital type.');
}

module.exports = { put, keyParam, canonicalizeVital };
