// server/middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'wa_session';

if (!JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set in your .env file. Sessions will not be secure. Copy .env.example to .env and fill it in.');
}

function signToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET || 'insecure-dev-secret', { expiresIn: '30d' });
}

function setSessionCookie(res, user) {
  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Attaches req.userId if a valid session cookie is present; does not block the request either way.
function optionalAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET || 'insecure-dev-secret');
      req.userId = payload.uid;
    } catch (err) {
      // invalid/expired token — treat as logged out
    }
  }
  next();
}

// Blocks the request with 401 if there is no valid session.
function requireAuth(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  next();
}

module.exports = { signToken, setSessionCookie, clearSessionCookie, optionalAuth, requireAuth, COOKIE_NAME };
