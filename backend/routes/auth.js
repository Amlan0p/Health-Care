// routes/auth.js — Sign up / Sign in / Me
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const SALT_ROUNDS = 10;
const TOKEN_TTL   = '7d';

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required.' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (email.toLowerCase() === 'demo@healthcare.app') {
      return res.status(400).json({ error: 'This email is reserved. Please use a different email.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name, email, hash);
    const user = { id: result.lastInsertRowid, name, email };
    const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: TOKEN_TTL });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('signup error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/auth/signin
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row) {
      return res.status(401).json({ error: 'Invalid email or password. Please try again.' });
    }

    const match = await bcrypt.compare(password, row.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password. Please try again.' });
    }

    const user = { id: row.id, name: row.name, email: row.email };
    const token = jwt.sign({ userId: row.id, email: row.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });

    res.json({ token, user });
  } catch (err) {
    console.error('signin error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/auth/me  — verify token & return current user
router.get('/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(req.userId);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: row });
});

module.exports = router;
