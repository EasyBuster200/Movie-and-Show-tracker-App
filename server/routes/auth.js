const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();

const insertUser = db.prepare(
  'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
);
const insertDefaultList = db.prepare(
  "INSERT INTO lists (user_id, name, is_default) VALUES (?, 'Bookmarks', 1)"
);
const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const findUserById = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?');

router.post('/signup', async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'email, password, and displayName are required' });
  }
  if (findUserByEmail.get(email)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { lastInsertRowid: userId } = insertUser.run(email, passwordHash, displayName);
  insertDefaultList.run(userId);

  req.session.userId = userId;
  res.status(201).json({ id: userId, email, displayName });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = findUserByEmail.get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  req.session.userId = user.id;
  res.json({ id: user.id, email: user.email, displayName: user.display_name });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.status(204).end();
  });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = findUserById.get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ id: user.id, email: user.email, displayName: user.display_name });
});

module.exports = router;
