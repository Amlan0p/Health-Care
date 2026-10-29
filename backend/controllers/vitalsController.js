'use strict';
const { vitalsByKey } = require('../services/content');
const { canonicalizeVital } = require('../validators/vitals');

function createVitalsController({ db }) {
  return {
    /** Returns { heartRate: "72", bloodPressure: "120/80", ... } for the signed-in user only. */
    async list(req, res) {
      const { rows } = await db.query('SELECT key, value FROM vitals WHERE user_id = $1', [req.auth.userId]);
      const out = {};
      for (const r of rows) if (vitalsByKey.has(r.key)) out[r.key] = r.value;
      res.json(out);
    },

    async put(req, res) {
      const def = vitalsByKey.get(req.body.key);
      const value = canonicalizeVital(def, req.body.value);
      await db.query(
        `INSERT INTO vitals (user_id, key, value, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        [req.auth.userId, def.key, value]);
      res.json({ success: true, key: def.key, value });
    },

    async remove(req, res) {
      await db.query('DELETE FROM vitals WHERE user_id = $1 AND key = $2', [req.auth.userId, req.params.key]);
      res.json({ success: true });
    },
  };
}

module.exports = { createVitalsController };
