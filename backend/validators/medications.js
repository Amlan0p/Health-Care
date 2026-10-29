'use strict';
const { z, text } = require('./common');

const status = z.enum(['pending', 'taken', 'missed'], { error: 'Status must be pending, taken, or missed.' });

const create = z.object({
  name: text(1, 100, 'Medication name'),
  time: text(1, 100, 'Schedule'),
  status: status.optional().default('pending'),
});

const update = z.object({
  name: text(1, 100, 'Medication name').optional(),
  time: text(1, 100, 'Schedule').optional(),
  status: status.optional(),
}).refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update.');

module.exports = { create, update };
