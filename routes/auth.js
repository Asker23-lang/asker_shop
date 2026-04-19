const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getDatabase } = require('../database/init');

// POST /api/auth/register - Регистрация пользователя
router.post('/register', (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  // Валидация
  if (!name || !email || !password || !confirmPassword) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Пароли не совпадают' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
  }

  // Проверка email формата
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Введите корректный email' });
  }

  const db = getDatabase();
  try {
    // Проверка существования пользователя
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' });
    }

    // Хеширование пароля
    const hash = crypto.createHash('sha256').update(password).digest('hex');

    // Создание пользователя
    const result = db.prepare(`
      INSERT INTO users (name, email, password)
      VALUES (?, ?, ?)
    `).run(name, email, hash);

    // Генерация токена сессии
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO user_sessions (user_id, token) VALUES (?, ?)').run(result.lastInsertRowid, token);

    res.json({
      success: true,
      message: 'Регистрация успешна!',
      token,
      user: { id: result.lastInsertRowid, name, email }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Ошибка регистрации. Повторите попытку.' });
  } finally {
    db.close();
  }
});

// POST /api/auth/login - Вход администратора
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Введите email и пароль' });
  }

  const db = getDatabase();
  try {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const admin = db.prepare('SELECT * FROM admins WHERE email = ? AND password = ?').get(email, hash);

    if (!admin) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Generate session token
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO admin_sessions (admin_id, token) VALUES (?, ?)').run(admin.id, token);

    res.json({ success: true, token });
  } finally {
    db.close();
  }
});

// GET /api/auth/check
router.get('/check', (req, res) => {
  const token = req.headers['x-admin-token'];

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  const db = getDatabase();
  try {
    const session = db.prepare(
      "SELECT s.*, a.email FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token = ? AND s.created_at > datetime('now', '-24 hours')"
    ).get(token);

    if (!session) {
      return res.status(401).json({ authenticated: false });
    }

    res.json({ authenticated: true, email: session.email });
  } finally {
    db.close();
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.headers['x-admin-token'];

  if (token) {
    const db = getDatabase();
    try {
      db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
    } finally {
      db.close();
    }
  }

  res.json({ success: true });
});

// POST /api/auth/user/login - Вход пользователя
router.post('/user/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Введите email и пароль' });
  }

  const db = getDatabase();
  try {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const user = db.prepare('SELECT id, name, email FROM users WHERE email = ? AND password = ?').get(email, hash);

    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Generate session token
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO user_sessions (user_id, token) VALUES (?, ?)').run(user.id, token);

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } finally {
    db.close();
  }
});

// GET /api/auth/user/check - Проверка сессии пользователя
router.get('/user/check', (req, res) => {
  const token = req.headers['x-user-token'];

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  const db = getDatabase();
  try {
    const session = db.prepare(
      "SELECT s.*, u.name, u.email FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.created_at > datetime('now', '-30 days')"
    ).get(token);

    if (!session) {
      return res.status(401).json({ authenticated: false });
    }

    res.json({ authenticated: true, user: { id: session.user_id, name: session.name, email: session.email } });
  } finally {
    db.close();
  }
});

// POST /api/auth/user/logout - Выход пользователя
router.post('/user/logout', (req, res) => {
  const token = req.headers['x-user-token'];

  if (token) {
    const db = getDatabase();
    try {
      db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token);
    } finally {
      db.close();
    }
  }

  res.json({ success: true });
});

module.exports = router;
