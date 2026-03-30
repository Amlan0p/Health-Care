// routes/medications.js — CRUD for user medications
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/medications
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM medications WHERE user_id = ? ORDER BY created_at ASC'
  ).all(req.userId);

  const meds = rows.map(r => ({
    id:     r.id,
    name:   r.name,
    time:   r.time,
    status: r.status,
  }));
  res.json(meds);
});

// POST /api/medications
router.post('/', (req, res) => {
  const { name, time, status } = req.body;
  if (!name || !time) {
    return res.status(400).json({ error: 'name and time are required.' });
  }
  const validStatuses = ['pending', 'taken', 'missed'];
  const s = validStatuses.includes(status) ? status : 'pending';

  const result = db.prepare(
    'INSERT INTO medications (user_id, name, time, status) VALUES (?, ?, ?, ?)'
  ).run(req.userId, name, time, s);

  res.status(201).json({ id: result.lastInsertRowid, name, time, status: s });
});

// PATCH /api/medications/:id/status  — cycle status
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'taken', 'missed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'status must be pending, taken, or missed.' });
  }

  const info = db.prepare(
    'UPDATE medications SET status = ? WHERE id = ? AND user_id = ?'
  ).run(status, req.params.id, req.userId);

  if (info.changes === 0) return res.status(404).json({ error: 'Medication not found.' });
  res.json({ success: true, status });
});

// DELETE /api/medications/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare(
    'DELETE FROM medications WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.userId);

  if (info.changes === 0) return res.status(404).json({ error: 'Medication not found.' });
  res.json({ success: true });
});

module.exports = router;
