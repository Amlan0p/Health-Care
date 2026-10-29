'use strict';
const { z } = require('./common');
const { doctorsById, slots } = require('../services/content');

const isRealDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

const date = z.string({ error: 'Date is required.' }).refine(isRealDate, 'Date must be a valid YYYY-MM-DD date.');
const time = z.string({ error: 'Time is required.' }).refine((t) => slots.includes(t), 'Please choose one of the available time slots.');
const doctorId = z.string({ error: 'Doctor is required.' }).refine((id) => doctorsById.has(id), 'Unknown doctor.');

const create = z.object({ doctorId, date, time });
const update = z.object({ date: date.optional(), time: time.optional() })
  .refine((o) => o.date !== undefined || o.time !== undefined, 'Provide a new date and/or time.');

module.exports = { create, update, isRealDate };
