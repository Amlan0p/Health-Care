'use strict';
const { doctorsById } = require('../services/content');
const { badRequest, conflict, notFound } = require('../services/errors');
const { todayIn } = require('../services/dates');

const MAX_PER_USER = 100;
const COLUMNS = `id, doctor_id, doctor, spec, hospital,
  to_char(appt_date, 'YYYY-MM-DD') AS date, to_char(appt_time, 'HH24:MI') AS time`;
const toApi = (r) => ({ id: r.id, doctorId: r.doctor_id, doctor: r.doctor, spec: r.spec, hospital: r.hospital, date: r.date, time: r.time });

function createAppointmentsController({ db, config }) {
  const assertNotPast = (date) => {
    if (date < todayIn(config.appTimezone)) throw badRequest('Appointments cannot be scheduled in the past.', 'date_in_past');
  };
  const dupe = () => conflict('You already have an appointment with this doctor at that date and time.', 'appointment_exists');

  return {
    async list(req, res) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM appointments WHERE user_id = $1 ORDER BY appt_date, appt_time, id`, [req.auth.userId]);
      res.json(rows.map(toApi));
    },

    async create(req, res) {
      const { doctorId, date, time } = req.body;
      assertNotPast(date);
      const { rows: cnt } = await db.query('SELECT count(*)::int AS n FROM appointments WHERE user_id = $1', [req.auth.userId]);
      if (cnt[0].n >= MAX_PER_USER) throw badRequest(`You can store up to ${MAX_PER_USER} appointments. Please remove some first.`, 'limit_reached');
      const d = doctorsById.get(doctorId); // doctor details come from the server catalogue, never from the client
      try {
        const { rows } = await db.query(
          `INSERT INTO appointments (user_id, doctor_id, doctor, spec, hospital, appt_date, appt_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
          [req.auth.userId, d.id, d.name, d.spec, d.hospital, date, time],
        );
        res.status(201).json(toApi(rows[0]));
      } catch (err) { throw err.code === '23505' ? dupe() : err; }
    },

    async update(req, res) {
      const { rows: cur } = await db.query(
        `SELECT ${COLUMNS} FROM appointments WHERE id = $1 AND user_id = $2`, [req.params.id, req.auth.userId]);
      if (!cur[0]) throw notFound('Appointment not found.');
      const date = req.body.date ?? cur[0].date;
      const time = req.body.time ?? cur[0].time;
      assertNotPast(date);
      try {
        const { rows } = await db.query(
          `UPDATE appointments SET appt_date = $1, appt_time = $2 WHERE id = $3 AND user_id = $4 RETURNING ${COLUMNS}`,
          [date, time, req.params.id, req.auth.userId]);
        res.json(toApi(rows[0]));
      } catch (err) { throw err.code === '23505' ? dupe() : err; }
    },

    async remove(req, res) {
      const r = await db.query('DELETE FROM appointments WHERE id = $1 AND user_id = $2', [req.params.id, req.auth.userId]);
      if (!r.rowCount) throw notFound('Appointment not found.');
      res.json({ success: true });
    },
  };
}

module.exports = { createAppointmentsController };
