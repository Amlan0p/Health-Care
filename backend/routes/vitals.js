// routes/vitals.js — Read/upsert user vitals
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/vitals  — returns { heartRate: "76", bloodPressure: "118/78", ... }
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT key, value FROM vitals WHERE user_id = ?'
  ).all(req.userId);

  const vitals = {};
  rows.forEach(r => { vitals[r.key] = r.value; });
  res.json(vitals);
});

// PUT /api/vitals  — body: { key, value }  (upsert single vital)
router.put('/', (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined || value === '') {
    return res.status(400).json({ error: 'key and value are required.' });
  }

  db.prepare(`
    INSERT INTO vitals (user_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(req.userId, key, String(value));

  res.json({ success: true, key, value });
});

module.exports = router;
