// routes/appointments.js — CRUD for user appointments
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// All routes require auth
router.use(requireAuth);

// GET /api/appointments
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM appointments WHERE user_id = ? ORDER BY date_raw ASC'
  ).all(req.userId);

  // Return camelCase to match the frontend shape
  const appts = rows.map(r => ({
    id:       r.id,
    doctor:   r.doctor,
    spec:     r.spec,
    hospital: r.hospital,
    day:      r.day,
    mon:      r.mon,
    time:     r.time,
    dateRaw:  r.date_raw,
  }));
  res.json(appts);
});

// POST /api/appointments
router.post('/', (req, res) => {
  const { doctor, spec, hospital, day, mon, time, dateRaw } = req.body;
  if (!doctor || !dateRaw) {
    return res.status(400).json({ error: 'doctor and dateRaw are required.' });
  }

  const result = db.prepare(`
    INSERT INTO appointments (user_id, doctor, spec, hospital, day, mon, time, date_raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.userId, doctor, spec || '', hospital || '', day || '', mon || '', time || '', dateRaw);

  res.status(201).json({
    id: result.lastInsertRowid,
    doctor, spec, hospital, day, mon, time, dateRaw,
  });
});

// DELETE /api/appointments/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare(
    'DELETE FROM appointments WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.userId);

  if (info.changes === 0) {
    return res.status(404).json({ error: 'Appointment not found.' });
  }
  res.json({ success: true });
});

module.exports = router;
