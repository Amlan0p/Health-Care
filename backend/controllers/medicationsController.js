'use strict';
const { badRequest, notFound } = require('../services/errors');

const MAX_PER_USER = 100;
const toApi = (r) => ({ id: r.id, name: r.name, time: r.schedule, status: r.status });

function createMedicationsController({ db }) {
  return {
    async list(req, res) {
      const { rows } = await db.query(
        'SELECT id, name, schedule, status FROM medications WHERE user_id = $1 ORDER BY id', [req.auth.userId]);
      res.json(rows.map(toApi));
    },

    async create(req, res) {
      const { name, time, status } = req.body;
      const { rows: cnt } = await db.query('SELECT count(*)::int AS n FROM medications WHERE user_id = $1', [req.auth.userId]);
      if (cnt[0].n >= MAX_PER_USER) throw badRequest(`You can store up to ${MAX_PER_USER} medications. Please remove some first.`, 'limit_reached');
      const { rows } = await db.query(
        'INSERT INTO medications (user_id, name, schedule, status) VALUES ($1, $2, $3, $4) RETURNING id, name, schedule, status',
        [req.auth.userId, name, time, status]);
      res.status(201).json(toApi(rows[0]));
    },

    async update(req, res) {
      const { name, time, status } = req.body;
      const { rows } = await db.query(
        `UPDATE medications SET
           name = COALESCE($1, name), schedule = COALESCE($2, schedule), status = COALESCE($3, status), updated_at = now()
         WHERE id = $4 AND user_id = $5 RETURNING id, name, schedule, status`,
        [name ?? null, time ?? null, status ?? null, req.params.id, req.auth.userId]);
      if (!rows[0]) throw notFound('Medication not found.');
      res.json(toApi(rows[0]));
    },

    async remove(req, res) {
      const r = await db.query('DELETE FROM medications WHERE id = $1 AND user_id = $2', [req.params.id, req.auth.userId]);
      if (!r.rowCount) throw notFound('Medication not found.');
      res.json({ success: true });
    },
  };
}

module.exports = { createMedicationsController };
