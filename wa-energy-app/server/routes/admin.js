// server/routes/admin.js
const express = require('express');
const db = require('../db/init');
const {
  verifyAdminCredentials, setAdminSessionCookie, clearAdminSessionCookie, requireAdmin,
} = require('../middleware/adminAuth');

const router = express.Router();

// POST /api/admin/login   { username, password }
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!verifyAdminCredentials(username, password)) {
    return res.status(401).json({ error: 'Incorrect admin username or password.' });
  }
  setAdminSessionCookie(res);
  res.json({ ok: true });
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  clearAdminSessionCookie(res);
  res.json({ ok: true });
});

// GET /api/admin/me
router.get('/me', (req, res) => {
  res.json({ isAdmin: !!req.isAdmin });
});

// Everything below requires a valid admin session.
router.use(requireAdmin);

// GET /api/admin/users — every registered user, with cart summary and referral info.
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.*, referrer.name as referrer_name, referrer.email as referrer_email
    FROM users u
    LEFT JOIN users referrer ON referrer.id = u.referred_by
    ORDER BY u.created_at DESC
  `).all();

  const cartCounts = db.prepare(`
    SELECT user_id, COUNT(*) as itemCount, COALESCE(SUM(qty),0) as totalQty
    FROM cart_items GROUP BY user_id
  `).all();
  const cartByUser = Object.fromEntries(cartCounts.map(c => [c.user_id, c]));

  const referralCounts = db.prepare(`
    SELECT referrer_id, COUNT(*) as count, COALESCE(SUM(amount),0) as totalEarned
    FROM referral_rewards GROUP BY referrer_id
  `).all();
  const referralsByUser = Object.fromEntries(referralCounts.map(r => [r.referrer_id, r]));

  res.json({
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      propertyType: u.property_type,
      appliances: JSON.parse(u.appliances_json || '{}'),
      wznBalance: u.wzn_balance,
      referralCode: u.referral_code,
      referredBy: u.referred_by ? { id: u.referred_by, name: u.referrer_name, email: u.referrer_email } : null,
      referralsMade: referralsByUser[u.id]?.count || 0,
      referralWznEarned: referralsByUser[u.id]?.totalEarned || 0,
      cartItemCount: cartByUser[u.id]?.itemCount || 0,
      cartTotalQty: cartByUser[u.id]?.totalQty || 0,
      createdAt: u.created_at,
    })),
  });
});

// GET /api/admin/users/:id — full detail: profile, cart, orders, referral rewards given.
router.get('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const cart = db.prepare(`
    SELECT ci.product_id as productId, ci.qty, p.name, p.images_json, p.category
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.user_id = ?
  `).all(user.id).map(r => ({ ...r, image: JSON.parse(r.images_json)[0], images_json: undefined }));

  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(user.id)
    .map(o => ({ id: o.id, kind: o.kind, status: o.status, items: JSON.parse(o.items_json), createdAt: o.created_at }));

  const grants = db.prepare('SELECT * FROM admin_wzn_grants WHERE user_id = ? ORDER BY created_at DESC').all(user.id);

  const referrals = db.prepare(`
    SELECT rr.*, u.name as referred_name, u.email as referred_email
    FROM referral_rewards rr JOIN users u ON u.id = rr.referred_id
    WHERE rr.referrer_id = ? ORDER BY rr.created_at DESC
  `).all(user.id);

  res.json({
    user: {
      id: user.id, name: user.name, email: user.email, phone: user.phone,
      propertyType: user.property_type, appliances: JSON.parse(user.appliances_json || '{}'),
      wznBalance: user.wzn_balance, referralCode: user.referral_code, createdAt: user.created_at,
    },
    cart, orders, grants, referrals,
  });
});

// POST /api/admin/users/:id/wzn   { amount, note }
// Sends (or deducts, with a negative amount) WZN tokens to exactly one user.
router.post('/users/:id/wzn', (req, res) => {
  const { amount, note } = req.body || {};
  const amt = parseInt(amount, 10);
  if (!amt || !Number.isFinite(amt) || amt === 0) {
    return res.status(400).json({ error: 'amount must be a non-zero number.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const newBalance = user.wzn_balance + amt;
  if (newBalance < 0) {
    return res.status(400).json({ error: `That would take ${user.name}'s balance below zero.` });
  }

  const run = db.transaction(() => {
    db.prepare('UPDATE users SET wzn_balance = ? WHERE id = ?').run(newBalance, user.id);
    db.prepare('INSERT INTO admin_wzn_grants (user_id, amount, note, admin_username) VALUES (?, ?, ?, ?)')
      .run(user.id, amt, note || null, ADMIN_USERNAME_FOR_LOG());
  });
  run();

  res.json({ ok: true, wznBalance: newBalance });
});

function ADMIN_USERNAME_FOR_LOG() {
  return process.env.ADMIN_USERNAME || 'waenergyadmin';
}

module.exports = router;
