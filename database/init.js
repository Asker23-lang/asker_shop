const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'shop.db');

function initDatabase() {
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL,
      image TEXT DEFAULT '',
      sizes TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      in_stock INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      payment_method TEXT DEFAULT 'card',
      total REAL NOT NULL,
      status TEXT DEFAULT 'новый',
      device_id TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      size TEXT DEFAULT '',
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT DEFAULT '',
      subtitle TEXT DEFAULT '',
      btn_text TEXT DEFAULT '',
      btn_link TEXT DEFAULT '#products',
      image TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );
  `);

  // Add device_id column if missing
  try {
    db.exec('ALTER TABLE orders ADD COLUMN device_id TEXT DEFAULT ""');
  } catch { /* column already exists */ }

  // Add stripe_session_id column if missing
  try {
    db.exec('ALTER TABLE orders ADD COLUMN stripe_session_id TEXT DEFAULT ""');
  } catch { /* column already exists */ }

  // Add stock_quantity column if missing (NULL = unlimited)
  try {
    db.exec('ALTER TABLE products ADD COLUMN stock_quantity INTEGER DEFAULT NULL');
  } catch { /* column already exists */ }

  // Insert demo products if table is empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM products').get();
  if (count.cnt === 0) {
    const insert = db.prepare(`
      INSERT INTO products (name, description, price, image, sizes, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const demo = [
      ['Футболка Oversize', 'Хлопковая футболка свободного кроя', 5990, '', '["S","M","L","XL","XXL"]', '["Хит"]'],
      ['Худи Classic', 'Базовое худи с капюшоном из плотного хлопка', 12490, '', '["S","M","L","XL"]', '["Новинка"]'],
      ['Джинсы Straight', 'Прямые джинсы из плотного денима', 14990, '', '["S","M","L","XL"]', '["Новинка","Хит"]'],
      ['Брюки Cargo', 'Широкие карго-брюки с накладными карманами', 11990, '', '["S","M","L","XL"]', '[]'],
      ['Куртка-рубашка', 'Плотная куртка-рубашка в клетку', 18990, '', '["S","M","L","XL"]', '["Новинка"]'],
      ['Свитшот Washed', 'Свитшот с эффектом стирки', 9990, '', '["S","M","L","XL"]', '["Скидка"]'],
      ['Шорты Bermuda', 'Бермуды длиной до колена из хлопка', 7490, '', '["S","M","L","XL"]', '[]'],
      ['Поло Pique', 'Классическое поло из пике-трикотажа', 6990, '', '["S","M","L","XL"]', '["Хит"]'],
      ['Бомбер Urban', 'Нейлоновый бомбер с подкладкой', 24990, '', '["S","M","L","XL"]', '["Новинка"]'],
      ['Лонгслив Basic', 'Базовый лонгслив из хлопка', 4990, '', '["S","M","L","XL","XXL"]', '[]'],
      ['Жилет Puffer', 'Стёганый утеплённый жилет', 16990, '', '["S","M","L","XL"]', '["Скидка"]'],
      ['Тренч Casual', 'Лёгкий тренч из водоотталкивающей ткани', 29990, '', '["S","M","L","XL"]', '["Новинка"]'],
    ];

    const insertMany = db.transaction((products) => {
      for (const p of products) {
        insert.run(...p);
      }
    });

    insertMany(demo);
  }

  // Seed admin user if table is empty
  const adminCount = db.prepare('SELECT COUNT(*) as cnt FROM admins').get();
  if (adminCount.cnt === 0) {
    const hash = crypto.createHash('sha256').update('1234').digest('hex');
    db.prepare('INSERT INTO admins (email, password) VALUES (?, ?)').run('taic5567@gmail.com', hash);
  }

  // Seed default slides if table is empty
  const slideCount = db.prepare('SELECT COUNT(*) as cnt FROM slides').get();
  if (slideCount.cnt === 0) {
    const insertSlide = db.prepare(`
      INSERT INTO slides (title, subtitle, btn_text, btn_link, image, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertSlide.run('Новая коллекция', 'Весна-лето 2026', 'Смотреть коллекцию', '#products', 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1400&h=500&fit=crop', 1);
    insertSlide.run('Casual стиль', 'Комфорт на каждый день', 'В каталог', '#products', 'https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=1400&h=500&fit=crop&crop=center', 2);
    insertSlide.run('Скидки до 30%', 'На избранные модели', 'Воспользоваться', '#products', 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=1400&h=500&fit=crop&crop=center', 3);
  }

  return db;
}

function getDatabase() {
  return new Database(dbPath);
}

module.exports = { initDatabase, getDatabase };
