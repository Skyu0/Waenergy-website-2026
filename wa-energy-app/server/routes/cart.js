// server/routes/cart.js
// Every route here requires a logged-in user (mounted behind requireAuth in
// server.js) and reads/writes real rows in the cart_items table — so a
// customer's cart survives page reloads and comes back on any device once
// they log in again.
const express = require('express');
const db = require('../db/init');

const router = express.Router();

function getCartWithProducts(userId) {
  const rows = db.prepare(`
    SELECT ci.product_id as productId, ci.qty as qty,
           p.name, p.images_json, p.category, p.badge
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.user_id = ?
    ORDER BY ci.created_at ASC
  `).all(userId);

  return rows.map(r => ({
    productId: r.productId,
    qty: r.qty,
    name: r.name,
    image: JSON.parse(r.images_json)[0],
    category: r.category,
    badge: r.badge,
  }));
}

// GET /api/cart
router.get('/', (req, res) => {
  res.json({ items: getCartWithProducts(req.userId) });
});

// POST /api/cart  { productId, qty }
router.post('/', (req, res) => {
  const { productId, qty } = req.body || {};
  const quantity = Math.max(1, parseInt(qty, 10) || 1);
  if (!productId) return res.status(400).json({ error: 'productId is required.' });

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.userId, productId);
  if (existing) {
    db.prepare('UPDATE cart_items SET qty = qty + ? WHERE id = ?').run(quantity, existing.id);
  } else {
    db.prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)').run(req.userId, productId, quantity);
  }
  res.status(201).json({ items: getCartWithProducts(req.userId) });
});

// PATCH /api/cart/:productId  { qty }
router.patch('/:productId', (req, res) => {
  const qty = Math.max(1, parseInt((req.body || {}).qty, 10) || 1);
  const result = db.prepare('UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?')
    .run(qty, req.userId, req.params.productId);
  if (result.changes === 0) return res.status(404).json({ error: 'Item not in cart.' });
  res.json({ items: getCartWithProducts(req.userId) });
});

// DELETE /api/cart/:productId
router.delete('/:productId', (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.userId, req.params.productId);
  res.json({ items: getCartWithProducts(req.userId) });
});

// DELETE /api/cart  (clear whole cart, e.g. after an order is placed)
router.delete('/', (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.userId);
  res.json({ items: [] });
});

module.exports = router;
