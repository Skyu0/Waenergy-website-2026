// server/routes/auth.js
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db/init');
const { setSessionCookie, clearSessionCookie } = require('../middleware/auth');

const router = express.Router();
const WELCOME_WZN = 2500;
const REFERRAL_REWARD_WZN = 500;

function publicUser(row) {
  const stats = db.prepare(
    'SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM referral_rewards WHERE referrer_id = ?'
  ).get(row.id);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    propertyType: row.property_type,
    appliances: JSON.parse(row.appliances_json || '{}'),
    wznBalance: row.wzn_balance,
    referralCode: row.referral_code,
    referralsMade: stats.count,
    referralWznEarned: stats.total,
  };
}

// Generates a short, unique, easy-to-share referral code like "WA7K2QRT".
function generateReferralCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = 'WA';
    for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
    const exists = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(code);
    if (!exists) return code;
  }
  // astronomically unlikely fallback
  return 'WA' + Date.now().toString(36).toUpperCase();
}

// POST /api/auth/signup   { name, email, phone, password, propertyType, appliances, ref? }
router.post('/signup', (req, res) => {
  const { name, email, phone, password, propertyType, appliances, ref } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists. Try logging in instead.' });
  }

  // Resolve the referrer (if a valid referral code was passed in), before we
  // start the transaction, so a bad/unknown code just means "no referrer"
  // rather than failing the whole signup.
  let referrer = null;
  if (ref && typeof ref === 'string') {
    referrer = db.prepare('SELECT * FROM users WHERE referral_code = ?').get(ref.trim().toUpperCase());
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const referralCode = generateReferralCode();

  const run = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO users (name, email, phone, password_hash, property_type, appliances_json, wzn_balance, referral_code, referred_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(name).trim(),
      normalizedEmail,
      phone ? String(phone).trim() : null,
      passwordHash,
      propertyType || null,
      JSON.stringify(appliances || {}),
      WELCOME_WZN,
      referralCode,
      referrer ? referrer.id : null
    );

    if (referrer) {
      db.prepare('UPDATE users SET wzn_balance = wzn_balance + ? WHERE id = ?').run(REFERRAL_REWARD_WZN, referrer.id);
      db.prepare('INSERT INTO referral_rewards (referrer_id, referred_id, amount) VALUES (?, ?, ?)')
        .run(referrer.id, info.lastInsertRowid, REFERRAL_REWARD_WZN);
    }

    return info.lastInsertRowid;
  });

  const newUserId = run();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(newUserId);
  setSessionCookie(res, user);
  res.status(201).json({ user: publicUser(user), welcomeWzn: WELCOME_WZN });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  setSessionCookie(res, user);
  res.json({ user: publicUser(user) });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.userId) return res.json({ user: null });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.json({ user: null });
  res.json({ user: publicUser(user) });
});

module.exports = router;
