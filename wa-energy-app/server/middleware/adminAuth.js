// server/middleware/adminAuth.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'insecure-dev-secret';
const ADMIN_COOKIE = 'wa_admin_session';

// The admin password is hashed once, in memory, from the plain-text value in
// .env — so the real password never has to be pre-hashed by hand, but it's
// also never compared as plain text.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'waenergyadmin';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'energywithoutlimit', 10);

function verifyAdminCredentials(username, password) {
  if (!username || !password) return false;
  if (username !== ADMIN_USERNAME) return false;
  return bcrypt.compareSync(String(password), ADMIN_PASSWORD_HASH);
}

function signAdminToken() {
  return jwt.sign({ admin: true, username: ADMIN_USERNAME }, JWT_SECRET, { expiresIn: '12h' });
}

function setAdminSessionCookie(res) {
  const token = signAdminToken();
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000, // 12 hours
  });
}

function clearAdminSessionCookie(res) {
  res.clearCookie(ADMIN_COOKIE);
}

function optionalAdminAuth(req, res, next) {
  const token = req.cookies && req.cookies[ADMIN_COOKIE];
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload.admin) req.isAdmin = true;
    } catch (err) {
      // invalid/expired — treat as logged out
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.status(401).json({ error: 'Admin login required.' });
  }
  next();
}

module.exports = {
  verifyAdminCredentials, setAdminSessionCookie, clearAdminSessionCookie,
  optionalAdminAuth, requireAdmin, ADMIN_COOKIE,
};
