'use strict';

function createPublicController({ db }) {
  return {
    async contact(req, res) {
      const { name, email, subject, message } = req.body;
      await db.query('INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)', [name, email, subject, message]);
      // Stored for the site owner to read in the database. No email is sent by this application.
      res.status(201).json({ success: true, message: 'Your message has been received.' });
    },

    async newsletter(req, res) {
      const r = await db.query(
        'INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (lower(email)) DO NOTHING', [req.body.email]);
      res.status(r.rowCount ? 201 : 200).json({ success: true, status: r.rowCount ? 'subscribed' : 'already_subscribed' });
    },
  };
}

module.exports = { createPublicController };
