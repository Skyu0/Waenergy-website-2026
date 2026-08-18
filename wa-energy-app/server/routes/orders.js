// server/routes/orders.js
// Real orders, stored per user in the `orders` table. Two kinds:
//   - "quote"       -> customer wants a WhatsApp quote for one or more items
//   - "wzn_attempt" -> customer tried to pay with WZN tokens at checkout
//
// NOTE ON PRICING: the site does not yet have real product prices or a
// payment gateway (Paystack/Flutterwave etc.), so there is no real amount to
// deduct from a customer's WZN balance yet. REQUIRED_WZN below is a
// placeholder threshold that is intentionally higher than the free signup
// bonus, so a WZN checkout genuinely (and correctly) reports "not enough
// tokens" and hands the customer to WhatsApp — exactly like the original
// site spec asked for. When you add real prices, replace REQUIRED_WZN with
// each product's actual WZN cost and this route will "just work".
const express = require('express');
const db = require('../db/init');

const router = express.Router();
const REQUIRED_WZN = 50000; // placeholder until real product pricing exists

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function buildWhatsappUrl(items) {
  const phone = getConfig('waPhone') || '';
  const lines = items.map(i => `\u2022 ${i.name} x${i.qty}`).join('\n');
  const msg = `Hi WA Energy, I'd like a quote for:\n${lines}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

function resolveItems(userId, body) {
  // Either explicit items, a single productId+qty, or "use my current cart"
  if (body.fromCart) {
    return db.prepare(`
      SELECT ci.product_id as productId, ci.qty as qty, p.name as name
      FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.user_id = ?
    `).all(userId);
  }
  if (body.productId) {
    const p = db.prepare('SELECT id, name FROM products WHERE id = ?').get(body.productId);
    if (!p) return [];
    return [{ productId: p.id, name: p.name, qty: Math.max(1, parseInt(body.qty, 10) || 1) }];
  }
  return [];
}

// POST /api/orders   { kind: 'quote' | 'wzn_attempt', productId?, qty?, fromCart? }
router.post('/', (req, res) => {
  const { kind } = req.body || {};
  if (!['quote', 'wzn_attempt'].includes(kind)) {
    return res.status(400).json({ error: "kind must be 'quote' or 'wzn_attempt'." });
  }

  const items = resolveItems(req.userId, req.body || {});
  if (!items.length) {
    return res.status(400).json({ error: 'No items to order. Add a product or pass productId/fromCart.' });
  }

  const user = db.prepare('SELECT wzn_balance FROM users WHERE id = ?').get(req.userId);

  if (kind === 'wzn_attempt') {
    if (user.wzn_balance >= REQUIRED_WZN) {
      // Sufficient balance: deduct and mark the order confirmed.
      db.prepare('UPDATE users SET wzn_balance = wzn_balance - ? WHERE id = ?').run(REQUIRED_WZN, req.userId);
      const info = db.prepare(`INSERT INTO orders (user_id, kind, items_json, status) VALUES (?, 'wzn_attempt', ?, 'processing')`)
        .run(req.userId, JSON.stringify(items));
      return res.status(201).json({
        ok: true, sufficient: true, orderId: info.lastInsertRowid,
        wznBalance: user.wzn_balance - REQUIRED_WZN,
      });
    }
    // Insufficient: record the attempt, tell the client to fall back to WhatsApp.
    const info = db.prepare(`INSERT INTO orders (user_id, kind, items_json, status) VALUES (?, 'wzn_attempt', ?, 'insufficient_wzn')`)
      .run(req.userId, JSON.stringify(items));
    return res.status(200).json({
      ok: true, sufficient: false, orderId: info.lastInsertRowid,
      wznBalance: user.wzn_balance, required: REQUIRED_WZN,
      whatsappUrl: buildWhatsappUrl(items),
    });
  }

  // kind === 'quote'
  const info = db.prepare(`INSERT INTO orders (user_id, kind, items_json, status) VALUES (?, 'quote', ?, 'quote_requested')`)
    .run(req.userId, JSON.stringify(items));
  res.status(201).json({ ok: true, orderId: info.lastInsertRowid, whatsappUrl: buildWhatsappUrl(items) });
});

// GET /api/orders/mine
router.get('/mine', (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json({
    orders: rows.map(r => ({
      id: r.id, kind: r.kind, status: r.status,
      items: JSON.parse(r.items_json), createdAt: r.created_at,
    })),
  });
});

module.exports = router;
