const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database/init');

// GET /api/database/tables - получить список всех таблиц
router.get('/tables', (req, res) => {
  const db = getDatabase();
  try {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `).all();

    const tableInfo = {};
    
    for (const table of tables) {
      const count = db.prepare(`SELECT COUNT(*) as cnt FROM ${table.name}`).get();
      tableInfo[table.name] = count.cnt;
    }

    res.json({ success: true, tables: tableInfo });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Ошибка чтения БД' });
  } finally {
    db.close();
  }
});

// GET /api/database/:tableName - получить данные таблицы
router.get('/:tableName', (req, res) => {
  const tableName = req.params.tableName;
  
  // Защита от SQL injection
  const validTables = ['users', 'products', 'orders', 'order_items'];
  if (!validTables.includes(tableName)) {
    return res.status(400).json({ error: 'Недопустимая таблица' });
  }

  const db = getDatabase();
  try {
    const data = db.prepare(`SELECT * FROM ${tableName} LIMIT 100`).all();
    const count = db.prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`).get();

    res.json({
      success: true,
      tableName,
      totalCount: count.cnt,
      data
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Ошибка чтения таблицы' });
  } finally {
    db.close();
  }
});

// GET /api/database/:tableName/schema - получить схему таблицы
router.get('/:tableName/schema', (req, res) => {
  const tableName = req.params.tableName;
  
  const validTables = ['users', 'products', 'orders', 'order_items', 'admins', 'admin_sessions', 'user_sessions', 'slides'];
  if (!validTables.includes(tableName)) {
    return res.status(400).json({ error: 'Недопустимая таблица' });
  }

  const db = getDatabase();
  try {
    const schema = db.prepare(`PRAGMA table_info(${tableName})`).all();
    res.json({ success: true, tableName, columns: schema });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка чтения схемы' });
  } finally {
    db.close();
  }
});

module.exports = router;
