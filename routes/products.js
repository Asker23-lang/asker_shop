const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database/init');

// GET /api/products/slides — public slides
router.get('/slides', (req, res) => {
  const db = getDatabase();
  try {
    const slides = db.prepare('SELECT * FROM slides ORDER BY sort_order ASC, id ASC').all();
    res.json(slides);
  } finally {
    db.close();
  }
});

// GET /api/products — list all products
router.get('/', (req, res) => {
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

module.exports = router;
