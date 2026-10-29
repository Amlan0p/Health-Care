'use strict';
const { z, text, email } = require('./common');

const contact = z.object({
  name: text(1, 100, 'Name'),
  email,
  subject: text(0, 150, 'Subject').optional().default(''),
  message: text(5, 2000, 'Message'),
});

const newsletter = z.object({ email });

module.exports = { contact, newsletter };
