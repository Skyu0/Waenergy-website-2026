// server/db/init.js
// Opens the SQLite database (creating the file on first run) and makes sure
// every table exists. SQLite is a real, file-based SQL database — perfectly
// production-capable for a site of this size, and it needs no separate
// database server to install or manage. If you outgrow it later, the SQL
// here is close enough to Postgres/MySQL that migrating is straightforward.

const fs = require('fs');
const path = require('path');
const Database = require('./sqlite-adapter');

// The database file lives here by default. On most hosts this is fine as-is.
// On platforms like Railway that require a separate persistent volume (so
// your data survives redeploys), set DB_PATH to wherever that volume is
// mounted (e.g. DB_PATH=/data/waenergy.sqlite) and it's used automatically.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'waenergy.sqlite');

// Make sure the folder holding the database exists before SQLite tries to
// create the file in it. Without this, a DB_PATH pointing at a volume whose
// mount folder isn't there yet fails with a bare "unable to open database
// file" that says nothing about which folder is missing or why.
const DB_DIR = path.dirname(DB_PATH);
try {
  fs.mkdirSync(DB_DIR, { recursive: true });
} catch (err) {
  console.error(`Could not create the database folder ${DB_DIR}: ${err.message}`);
  console.error('Check that DB_PATH in your .env points somewhere this app is allowed to write.');
  throw err;
}

let db;
try {
  db = new Database(DB_PATH);
} catch (err) {
  console.error(`Could not open the database file at ${DB_PATH}: ${err.message}`);
  console.error(process.env.DB_PATH
    ? 'This path came from DB_PATH in your .env — check it points at a writable location (on a host, that usually means a mounted persistent volume).'
    : 'This is the default location inside the project folder — check the folder is writable.');
  throw err;
}

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  property_type TEXT,
  appliances_json TEXT DEFAULT '{}',
  wzn_balance INTEGER NOT NULL DEFAULT 2500,
  referral_code TEXT UNIQUE,
  referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  badge TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  images_json TEXT NOT NULL,
  specs_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  specs_json TEXT NOT NULL,
  suitable TEXT NOT NULL,
  capacity_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  icon TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  more TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  stars INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                 -- 'quote' | 'wzn_attempt'
  items_json TEXT NOT NULL,           -- [{productId, name, qty}]
  status TEXT NOT NULL DEFAULT 'quote_requested',
  -- status progresses: quote_requested -> processing -> out_for_delivery -> delivered
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Every WZN credit an admin manually sends to a user, kept as an audit trail
-- (so "how much has this admin sent, and to whom" is always answerable).
CREATE TABLE IF NOT EXISTS admin_wzn_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  note TEXT,
  admin_username TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One-time 500 WZN referral rewards, logged so a referrer's reward is never
-- granted twice for the same referred signup.
CREATE TABLE IF NOT EXISTS referral_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(referred_id)
);
`);

// --- Lightweight schema migration ---
// "CREATE TABLE IF NOT EXISTS" only creates brand-new tables — it does NOT
// add new columns to a table that already exists. If this database file was
// copied from an earlier point in development (before a column was added),
// it would otherwise be stuck permanently missing that column, breaking any
// code that relies on it. This checks for and adds any columns the current
// code expects but an existing users table might be missing, so an old
// copied database file self-heals to the current schema automatically.
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  const hasColumn = existing.some(col => col.name === column);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db] Migrated: added missing column ${table}.${column}`);
  }
}
ensureColumn('users', 'referral_code', 'TEXT');
ensureColumn('users', 'referred_by', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');

module.exports = db;
