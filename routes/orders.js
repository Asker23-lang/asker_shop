const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database/init');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// POST /api/orders — create a new order
router.post('/', async (req, res) => {
  const { customer_name, customer_phone, customer_address, payment_method, items, device_id } = req.body;

  if (!customer_name || !customer_phone || !customer_address) {
    return res.status(400).json({ error: 'Заполните все поля: имя, телефон, адрес' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Корзина пуста' });
  }

  const allowedPayments = ['card', 'cash', 'sbp'];
  const method = allowedPayments.includes(payment_method) ? payment_method : 'card';

  const db = getDatabase();
  try {
    // Validate items and get real prices from DB
    const getProduct = db.prepare('SELECT id, name, price, stock_quantity FROM products WHERE id = ? AND in_stock = 1');
    const validatedItems = [];
    for (const item of items) {
      if (!item.product_id || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
        return res.status(400).json({ error: 'Неверные данные товара' });
      }
      const product = getProduct.get(item.product_id);
      if (!product) {
        return res.status(400).json({ error: `Товар не найден или нет в наличии (id: ${item.product_id})` });
      }
      if (product.stock_quantity !== null && item.quantity > product.stock_quantity) {
        return res.status(400).json({
          error: `Недостаточно товара "${product.name}" на складе. Доступно: ${product.stock_quantity} шт.`
        });
      }
      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        quantity: item.quantity,
        size: item.size || '',
      });
    }

    const total = validatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const insertOrder = db.prepare(`
      INSERT INTO orders (customer_name, customer_phone, customer_address, payment_method, total, device_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, quantity, size, price)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const deductStock = db.prepare(`
      UPDATE products SET stock_quantity = stock_quantity - ?
      WHERE id = ? AND stock_quantity IS NOT NULL
    `);
    const markOutOfStock = db.prepare(`
      UPDATE products SET in_stock = 0 WHERE id = ? AND stock_quantity IS NOT NULL AND stock_quantity <= 0
    `);

    // Card payments go through Stripe Checkout
    if (method === 'card') {
      const initialStatus = 'ожидает оплаты';

      const createOrder = db.transaction(() => {
        const result = insertOrder.run(customer_name, customer_phone, customer_address, method, total, device_id || '', initialStatus);
        const orderId = result.lastInsertRowid;

        for (const item of validatedItems) {
          insertItem.run(orderId, item.product_id, item.product_name, item.quantity, item.size, item.price);
        }

        return orderId;
      });

      const orderId = createOrder();

      // Create Stripe Checkout Session
      const line_items = validatedItems.map(item => ({
        price_data: {
          currency: 'kzt',
          product_data: {
            name: item.product_name + (item.size ? ` (${item.size})` : ''),
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      }));

      let session;
      try {
        session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items,
          mode: 'payment',
          success_url: `${req.protocol}://${req.get('host')}/cart.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.protocol}://${req.get('host')}/cart.html?payment=cancelled`,
          metadata: { order_id: String(orderId) },
        });
      } catch (stripeErr) {
        // Stripe failed — delete orphaned order
        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
        db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);
        console.error('Stripe session error:', stripeErr.message);
        return res.status(500).json({ error: 'Ошибка создания платежа' });
      }

      db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').run(session.id, orderId);

      res.json({ success: true, checkout_url: session.url });
    } else {
      // SBP / Cash — deduct stock immediately
      const createOrder = db.transaction(() => {
        const result = insertOrder.run(customer_name, customer_phone, customer_address, method, total, device_id || '', 'новый');
        const orderId = result.lastInsertRowid;

        for (const item of validatedItems) {
          insertItem.run(orderId, item.product_id, item.product_name, item.quantity, item.size, item.price);
          deductStock.run(item.quantity, item.product_id);
          markOutOfStock.run(item.product_id);
        }

        return orderId;
      });

      const orderId = createOrder();
      res.json({ success: true, order_id: orderId, total });
    }
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Ошибка при создании заказа' });
  } finally {
    db.close();
  }
});

// GET /api/orders/verify-payment?session_id= — verify Stripe payment
router.get('/verify-payment', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Не указан session_id' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    const db = getDatabase();
    try {
      const order = db.prepare('SELECT id, status FROM orders WHERE stripe_session_id = ?').get(session_id);
      if (!order) return res.status(404).json({ error: 'Заказ не найден' });

      if (session.payment_status === 'paid' && order.status === 'ожидает оплаты') {
        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('новый', order.id);
        // Deduct stock for card-paid orders
        const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(order.id);
        for (const item of items) {
          db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity IS NOT NULL').run(item.quantity, item.product_id);
          db.prepare('UPDATE products SET in_stock = 0 WHERE id = ? AND stock_quantity IS NOT NULL AND stock_quantity <= 0').run(item.product_id);
        }
        return res.json({ success: true, order_id: order.id, status: 'paid' });
      }

      if (order.status !== 'отменён') {
        // Already verified / processed
        return res.json({ success: true, order_id: order.id, status: 'paid' });
      }

      res.json({ success: false, status: 'cancelled' });
    } finally {
      db.close();
    }
  } catch (err) {
    console.error('Payment verification error:', err);
    res.status(500).json({ error: 'Ошибка проверки оплаты' });
  }
});

// GET /api/orders/resume-payment?order_id=&device_id= — get Stripe checkout URL to resume payment
router.get('/resume-payment', async (req, res) => {
  const { order_id, device_id } = req.query;
  if (!order_id || !device_id) return res.status(400).json({ error: 'Не указан заказ' });

  const db = getDatabase();
  try {
    const order = db.prepare('SELECT id, status, device_id, stripe_session_id FROM orders WHERE id = ?').get(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    if (order.device_id !== device_id) return res.status(403).json({ error: 'Нет доступа' });
    if (order.status !== 'ожидает оплаты') return res.status(400).json({ error: 'Заказ не ожидает оплаты' });
    if (!order.stripe_session_id) return res.status(400).json({ error: 'Нет сессии оплаты' });

    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    if (session.status === 'expired') {
      return res.status(410).json({ error: 'Сессия оплаты истекла. Оформите заказ заново.' });
    }

    res.json({ success: true, checkout_url: session.url });
  } catch (err) {
    console.error('Resume payment error:', err.message);
    res.status(500).json({ error: 'Ошибка получения ссылки на оплату' });
  } finally {
    db.close();
  }
});

// GET /api/orders/my?device_id= — orders for this device
router.get('/my', (req, res) => {
  const { device_id } = req.query;
  if (!device_id) return res.json({ success: true, orders: [] });

  const db = getDatabase();
  try {
    const orders = db.prepare(`
      SELECT id, total, status, created_at FROM orders
      WHERE device_id = ?
      ORDER BY id DESC
      LIMIT 20
    `).all(device_id);

    // Load items for each order
    const getItems = db.prepare('SELECT product_name, quantity, size, price FROM order_items WHERE order_id = ?');
    for (const order of orders) {
      order.items = getItems.all(order.id);
    }

    res.json({ success: true, orders });
  } finally {
    db.close();
  }
});

// POST /api/orders/cancel — cancel order (only if status is "новый" or "ожидает оплаты")
router.post('/cancel', (req, res) => {
  const { id, device_id } = req.body;
  if (!id || !device_id) return res.status(400).json({ error: 'Не указан заказ' });

  const db = getDatabase();
  try {
    const order = db.prepare('SELECT id, status, device_id FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    if (order.device_id !== device_id) return res.status(403).json({ error: 'Нет доступа' });
    if (order.status !== 'новый' && order.status !== 'ожидает оплаты') {
      return res.status(400).json({ error: 'Отменить можно только новый заказ' });
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('отменён', id);
    res.json({ success: true });
  } finally {
    db.close();
  }
});

module.exports = router;
