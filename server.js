require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDatabase } = require('./database/init');

// Initialize database
const db = initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Auth middleware for admin routes
const { getDatabase } = require('./database/init');
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const db = getDatabase();
  try {
    const session = db.prepare("SELECT * FROM admin_sessions WHERE token = ? AND created_at > datetime('now', '-24 hours')").get(token);
    if (!session) {
      return res.status(401).json({ error: 'Сессия истекла' });
    }
    next();
  } finally {
    db.close();
  }
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/database', require('./routes/database'));
app.use('/api/admin', requireAdmin, require('./routes/admin'));

// Cleanup expired "ожидает оплаты" orders (older than 24h)
function cleanupExpiredOrders() {
  const db = getDatabase();
  try {
    const expired = db.prepare(`
      SELECT id FROM orders
      WHERE status = 'ожидает оплаты'
        AND created_at <= datetime('now', '-24 hours')
    `).all();

    if (expired.length > 0) {
      const cancelOrder = db.prepare("UPDATE orders SET status = 'отменён' WHERE id = ?");
      const cleanup = db.transaction(() => {
        for (const { id } of expired) {
          cancelOrder.run(id);
        }
      });
      cleanup();
      console.log(`Отменено просроченных заказов: ${expired.length}`);
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  } finally {
    db.close();
  }
}

// Run cleanup on start and every hour
cleanupExpiredOrders();
setInterval(cleanupExpiredOrders, 60 * 60 * 1000);

// Start server
app.listen(PORT, () => {
  console.log(`KENDRICK Shop: http://localhost:${PORT}`);
  console.log(`Админка: http://localhost:${PORT}/admin.html`);
});
