const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../database/init');

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1000) + ext);
  },
});
const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (allowedMimes.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Допускаются только изображения (jpeg, png, gif, webp)'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ===================== PRODUCTS =====================

// GET /api/admin/products
router.get('/products', (req, res) => {
  const db = getDatabase();
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
    const parsed = products.map(p => ({
      ...p,
      sizes: JSON.parse(p.sizes),
      tags: JSON.parse(p.tags),
    }));
    res.json(parsed);
  } finally {
    db.close();
  }
});

// POST /api/admin/products
router.post('/products', upload.single('image'), (req, res) => {
  const { name, description, price, sizes, tags, in_stock, stock_quantity } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: 'Название и цена обязательны' });
  }

  const db = getDatabase();
  try {
    const image = req.file ? '/uploads/' + req.file.filename : '';
    const qty = stock_quantity !== undefined && stock_quantity !== '' ? parseInt(stock_quantity) : null;
    const stmt = db.prepare(`
      INSERT INTO products (name, description, price, image, sizes, tags, in_stock, stock_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      name,
      description || '',
      parseFloat(price),
      image,
      sizes || '[]',
      tags || '[]',
      in_stock !== undefined ? parseInt(in_stock) : 1,
      qty
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } finally {
    db.close();
  }
});

// PUT /api/admin/products/:id
router.put('/products/:id', upload.single('image'), (req, res) => {
  const { name, description, price, sizes, tags, in_stock, stock_quantity } = req.body;
  const { id } = req.params;

  const db = getDatabase();
  try {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    const image = req.file ? '/uploads/' + req.file.filename : existing.image;

    // Delete old image if new one uploaded
    if (req.file && existing.image) {
      const oldPath = path.join(__dirname, '..', existing.image);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const qty = stock_quantity !== undefined && stock_quantity !== '' ? parseInt(stock_quantity) : null;

    db.prepare(`
      UPDATE products SET name=?, description=?, price=?, image=?, sizes=?, tags=?, in_stock=?, stock_quantity=?
      WHERE id=?
    `).run(
      name || existing.name,
      description !== undefined ? description : existing.description,
      price ? parseFloat(price) : existing.price,
      image,
      sizes || existing.sizes,
      tags || existing.tags,
      in_stock !== undefined ? parseInt(in_stock) : existing.in_stock,
      qty,
      id
    );
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// DELETE /api/admin/products/:id
router.delete('/products/:id', (req, res) => {
  const db = getDatabase();
  try {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    // Delete image file
    if (existing.image) {
      const imgPath = path.join(__dirname, '..', existing.image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }

    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// ===================== SLIDES =====================

// GET /api/admin/slides
router.get('/slides', (req, res) => {
  const db = getDatabase();
  try {
    const slides = db.prepare('SELECT * FROM slides ORDER BY sort_order ASC, id ASC').all();
    res.json(slides);
  } finally {
    db.close();
  }
});

// POST /api/admin/slides
router.post('/slides', upload.single('image'), (req, res) => {
  const { title, subtitle, btn_text, btn_link, image_url, sort_order } = req.body;
  const db = getDatabase();
  try {
    const image = req.file ? '/uploads/' + req.file.filename : (image_url || '');
    const result = db.prepare(`
      INSERT INTO slides (title, subtitle, btn_text, btn_link, image, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      title || '',
      subtitle || '',
      btn_text || '',
      btn_link || '#products',
      image,
      parseInt(sort_order) || 0
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } finally {
    db.close();
  }
});

// PUT /api/admin/slides/:id
router.put('/slides/:id', upload.single('image'), (req, res) => {
  const { title, subtitle, btn_text, btn_link, image_url, sort_order } = req.body;
  const { id } = req.params;
  const db = getDatabase();
  try {
    const existing = db.prepare('SELECT * FROM slides WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Слайд не найден' });

    let image = existing.image;
    if (req.file) {
      // Delete old uploaded image (not external URLs)
      if (existing.image && existing.image.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '..', existing.image);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      image = '/uploads/' + req.file.filename;
    } else if (image_url !== undefined) {
      image = image_url;
    }

    db.prepare(`
      UPDATE slides SET title=?, subtitle=?, btn_text=?, btn_link=?, image=?, sort_order=? WHERE id=?
    `).run(
      title !== undefined ? title : existing.title,
      subtitle !== undefined ? subtitle : existing.subtitle,
      btn_text !== undefined ? btn_text : existing.btn_text,
      btn_link !== undefined ? btn_link : existing.btn_link,
      image,
      sort_order !== undefined ? parseInt(sort_order) : existing.sort_order,
      id
    );
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// DELETE /api/admin/slides/:id
router.delete('/slides/:id', (req, res) => {
  const db = getDatabase();
  try {
    const existing = db.prepare('SELECT * FROM slides WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Слайд не найден' });
    if (existing.image && existing.image.startsWith('/uploads/')) {
      const imgPath = path.join(__dirname, '..', existing.image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    db.prepare('DELETE FROM slides WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// ===================== ORDERS =====================

// GET /api/admin/orders
router.get('/orders', (req, res) => {
  const db = getDatabase();
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');

    const result = orders.map(order => ({
      ...order,
      items: orderItems.all(order.id),
    }));

    res.json(result);
  } finally {
    db.close();
  }
});

// PUT /api/admin/orders/:id — update status
router.put('/orders/:id', (req, res) => {
  const { status } = req.body;
  const allowed = ['новый', 'обработан', 'отправлен', 'отменён'];

  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: 'Статус должен быть: ' + allowed.join(', ') });
  }

  const db = getDatabase();
  try {
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    if (existing.status === 'отменён') {
      return res.status(400).json({ error: 'Отменённый заказ нельзя изменить' });
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// ===================== STATISTICS =====================

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  const db = getDatabase();
  try {
    // General summary
    const totalOrders = db.prepare('SELECT COUNT(*) as cnt FROM orders').get().cnt;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE status NOT IN ('отменён','ожидает оплаты')").get().s;
    const avgCheck = totalOrders > 0
      ? db.prepare("SELECT COALESCE(AVG(total),0) as a FROM orders WHERE status NOT IN ('отменён','ожидает оплаты')").get().a
      : 0;
    const totalCustomers = db.prepare('SELECT COUNT(DISTINCT customer_phone) as cnt FROM orders').get().cnt;

    // Orders by status
    const byStatus = db.prepare('SELECT status, COUNT(*) as cnt FROM orders GROUP BY status').all();

    // Orders by payment method (exclude cancelled & pending)
    const byPayment = db.prepare("SELECT payment_method, COUNT(*) as cnt, SUM(total) as total FROM orders WHERE status NOT IN ('отменён','ожидает оплаты') GROUP BY payment_method").all();

    // Top products
    const topProducts = db.prepare(`
      SELECT product_name, SUM(quantity) as sold, SUM(price * quantity) as revenue
      FROM order_items
      JOIN orders ON orders.id = order_items.order_id
      WHERE orders.status NOT IN ('отменён','ожидает оплаты')
      GROUP BY product_name
      ORDER BY sold DESC
      LIMIT 10
    `).all();

    // Top sizes
    const topSizes = db.prepare(`
      SELECT size, SUM(quantity) as sold
      FROM order_items
      JOIN orders ON orders.id = order_items.order_id
      WHERE orders.status NOT IN ('отменён','ожидает оплаты') AND size != ''
      GROUP BY size
      ORDER BY sold DESC
    `).all();

    // Recent orders (last 30 days, daily — exclude cancelled & pending)
    const daily = db.prepare(`
      SELECT DATE(created_at) as day, COUNT(*) as cnt, SUM(total) as revenue
      FROM orders
      WHERE created_at >= DATE('now','-30 days') AND status NOT IN ('отменён','ожидает оплаты')
      GROUP BY DATE(created_at)
      ORDER BY day
    `).all();

    // Top customers
    const topCustomers = db.prepare(`
      SELECT customer_name, customer_phone, customer_address,
        COUNT(*) as orders_count, SUM(total) as total_spent
      FROM orders
      WHERE status NOT IN ('отменён','ожидает оплаты')
      GROUP BY customer_phone
      ORDER BY total_spent DESC
      LIMIT 10
    `).all();

    // Cancellations stats
    const cancelledCount = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status = 'отменён'").get().cnt;
    const cancelledSum = db.prepare("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE status = 'отменён'").get().s;
    const cancelledProducts = db.prepare(`
      SELECT product_name, SUM(quantity) as qty, SUM(price * quantity) as lost
      FROM order_items
      JOIN orders ON orders.id = order_items.order_id
      WHERE orders.status = 'отменён'
      GROUP BY product_name
      ORDER BY qty DESC
      LIMIT 10
    `).all();

    res.json({
      summary: { totalOrders, totalRevenue, avgCheck: Math.round(avgCheck), totalCustomers },
      byStatus,
      byPayment,
      topProducts,
      topSizes,
      daily,
      topCustomers,
      cancellations: { count: cancelledCount, sum: cancelledSum, products: cancelledProducts },
    });
  } finally {
    db.close();
  }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message.includes('Допускаются только')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
