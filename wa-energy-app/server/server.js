// server/server.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const seed = require('./db/seed');
const { optionalAuth, requireAuth } = require('./middleware/auth');
const { optionalAdminAuth } = require('./middleware/adminAuth');

const authRoutes = require('./routes/auth');
const catalogRoutes = require('./routes/catalog');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');

// Keep the catalog/content tables in sync with the seed JSON files on every boot.
// This never touches users, cart_items or orders — see server/db/seed.js.
// Wrapped so that if seeding fails (e.g. a seed file is missing because it
// didn't get copied over to this machine), the error is printed clearly
// instead of crashing the whole process with a cryptic, unhandled exception —
// the server still starts, and static pages still load, so the site isn't
// completely dead while you fix the underlying file issue.
try {
  seed();
} catch (err) {
  console.error('==============================================');
  console.error('SEEDING FAILED — the site will still start, but products, plans,');
  console.error('categories, services, testimonials and FAQs may be empty or stale');
  console.error('until this is fixed. Run "npm run doctor" to check for missing files.');
  console.error('Underlying error:', err.message);
  console.error('==============================================');
}

const app = express();
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(optionalAuth);
app.use(optionalAdminAuth);

// ---- API routes ----
app.use('/api/auth', authRoutes);
app.use('/api', catalogRoutes); // /api/products, /api/plans, /api/categories, etc.
app.use('/api/cart', requireAuth, cartRoutes);
app.use('/api/orders', requireAuth, orderRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

// ---- Static frontend ----
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// Admin panel lives at /admin (its own small page, separate from the customer SPA).
app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// Everything else (the customer-facing site) falls back to index.html.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WA Energy server running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('Note: ANTHROPIC_API_KEY is not set, so the Watt chat assistant will use its fallback reply. See .env.example.');
  }
});
