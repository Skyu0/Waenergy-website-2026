// server/routes/catalog.js
// Read-only routes for the product catalog and marketing content — all served
// straight from the SQLite database, so editing the seed JSON files (or the
// database directly) and re-seeding is all it takes to update the site.
const express = require('express');
const db = require('../db/init');

const router = express.Router();

function rowToProduct(row) {
  return {
    id: row.id,
    cat: row.category,
    badge: row.badge,
    name: row.name,
    desc: row.description,
    images: JSON.parse(row.images_json),
    specs: JSON.parse(row.specs_json),
  };
}

function rowToPlan(row) {
  return {
    key: row.key,
    name: row.name,
    image: row.image,
    specs: JSON.parse(row.specs_json),
    suitable: row.suitable,
    capacity: JSON.parse(row.capacity_json),
  };
}

// GET /api/categories
router.get('/categories', (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
  res.json(rows.map(r => ({ id: r.id, name: r.name, icon: r.icon })));
});

// GET /api/products?category=panels&page=1&pageSize=12&sort=name-asc
router.get('/products', (req, res) => {
  const { category, sort } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 12));

  let rows = category && category !== 'all'
    ? db.prepare('SELECT * FROM products WHERE category = ?').all(category)
    : db.prepare('SELECT * FROM products').all();

  let products = rows.map(rowToProduct);
  if (sort === 'name-asc') products.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'name-desc') products.sort((a, b) => b.name.localeCompare(a.name));

  const total = products.length;
  const start = (page - 1) * pageSize;
  const pageItems = products.slice(start, start + pageSize);

  res.json({ products: pageItems, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

// GET /api/products/:id
router.get('/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found.' });
  const product = rowToProduct(row);

  const related = db.prepare('SELECT * FROM products WHERE category = ? AND id != ? LIMIT 4')
    .all(product.cat, product.id).map(rowToProduct);

  res.json({ product, related });
});

// GET /api/plans
router.get('/plans', (req, res) => {
  const rows = db.prepare('SELECT * FROM plans ORDER BY sort_order ASC').all();
  res.json(rows.map(rowToPlan));
});

// GET /api/plans/:key
router.get('/plans/:key', (req, res) => {
  const row = db.prepare('SELECT * FROM plans WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Plan not found.' });
  res.json(rowToPlan(row));
});

// GET /api/services
router.get('/services', (req, res) => {
  const rows = db.prepare('SELECT * FROM services ORDER BY sort_order ASC').all();
  res.json(rows.map(r => ({ icon: r.icon, title: r.title, text: r.text, more: r.more })));
});

// GET /api/testimonials
router.get('/testimonials', (req, res) => {
  const rows = db.prepare('SELECT * FROM testimonials ORDER BY id ASC').all();
  res.json(rows.map(r => ({ name: r.name, state: r.state, stars: r.stars, text: r.text })));
});

// GET /api/faqs
router.get('/faqs', (req, res) => {
  const rows = db.prepare('SELECT * FROM faqs ORDER BY sort_order ASC').all();
  res.json(rows.map(r => ({ question: r.question, answer: r.answer })));
});

// GET /api/config  (phone number, address, under-plan content etc.)
router.get('/config', (req, res) => {
  const rows = db.prepare('SELECT * FROM config').all();
  const out = {};
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  res.json(out);
});

module.exports = router;
