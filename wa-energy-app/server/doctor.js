// server/doctor.js
//
// A preflight health check — run this any time you copy this project to a
// new computer or server, BEFORE running npm start. It catches the exact
// kind of problem that's hard to diagnose from the running site itself:
// files that silently didn't get copied over, a Node version that's too
// old, a missing .env, etc. — and tells you exactly what's wrong and where,
// instead of leaving you to guess from a broken-looking page.
//
// Run with: npm run doctor

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Load .env the same way server.js does, so the checks below see exactly the
// settings the real server will see (DB_PATH especially). Pointing dotenv at
// an explicit path means `npm run doctor` behaves the same no matter which
// folder you happen to run it from. A missing .env is not an error here —
// it's reported as its own check further down.
require('dotenv').config({ path: path.join(ROOT, '.env') });

let problems = 0;
let warnings = 0;

function pass(msg) { console.log(`  \u2713 ${msg}`); }
function fail(msg) { console.log(`  \u2717 ${msg}`); problems++; }
function warn(msg) { console.log(`  ! ${msg}`); warnings++; }

console.log('WA Energy — project health check\n');

// ---- 1. Node version ----
console.log('Node.js version');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 5)) {
  pass(`Node ${process.versions.node} (>= 22.5 required for the built-in database — OK)`);
} else {
  fail(`Node ${process.versions.node} is too old. This project needs Node 22.5 or newer (it uses Node's built-in SQLite support). Install a newer Node.js from nodejs.org.`);
}

// ---- 2. Core project files ----
console.log('\nCore files');
const coreFiles = [
  'package.json', 'server/server.js', 'server/db/init.js', 'server/db/seed.js',
  'server/db/sqlite-adapter.js', 'server/middleware/auth.js', 'server/middleware/adminAuth.js',
  'server/routes/auth.js', 'server/routes/catalog.js', 'server/routes/cart.js',
  'server/routes/orders.js', 'server/routes/chat.js', 'server/routes/admin.js',
  'public/index.html', 'public/styles.css', 'public/app.js',
  'public/admin.html', 'public/admin.css', 'public/admin.js',
];
for (const f of coreFiles) {
  if (fs.existsSync(path.join(ROOT, f))) pass(f);
  else fail(`MISSING: ${f} — this file didn't make it into the copy. Re-copy the project (see README section 2).`);
}

// ---- 3. .env file ----
console.log('\nEnvironment configuration');
if (fs.existsSync(path.join(ROOT, '.env'))) {
  pass('.env file found');
} else {
  warn('.env file not found. Copy .env.example to .env and fill it in (JWT_SECRET at minimum) before running in production. The site will still start without it, using an insecure default secret.');
}

// ---- 4. Seed JSON files (content) ----
console.log('\nContent seed files');
const seedFiles = [
  'categories_seed.json', 'plans_seed.json', 'services_seed.json',
  'testimonials_seed.json', 'faqs_seed.json', 'config_seed.json', 'products_seed.json',
];
let products = null;
for (const f of seedFiles) {
  const p = path.join(ROOT, 'server/db', f);
  if (!fs.existsSync(p)) {
    fail(`MISSING: server/db/${f} — the server will fail to start until this is restored.`);
    continue;
  }
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    pass(`server/db/${f} (${Array.isArray(data) ? data.length + ' entries' : 'valid'})`);
    if (f === 'products_seed.json') products = data;
  } catch (err) {
    fail(`server/db/${f} exists but isn't valid JSON: ${err.message}`);
  }
}

// ---- 5. Product images referenced by products_seed.json actually exist ----
console.log('\nProduct images');
if (products) {
  let missingImages = 0;
  let totalImages = 0;
  for (const p of products) {
    for (const imgPath of p.images || []) {
      totalImages++;
      const localPath = path.join(ROOT, 'public', imgPath.replace(/^\//, ''));
      if (!fs.existsSync(localPath)) {
        missingImages++;
        if (missingImages <= 10) fail(`Missing image: public${imgPath}  (used by "${p.name}")`);
      }
    }
  }
  if (missingImages === 0) {
    pass(`All ${totalImages} product images present`);
  } else {
    if (missingImages > 10) console.log(`  ... and ${missingImages - 10} more missing images`);
    fail(`${missingImages} of ${totalImages} product images are missing from public/assets/products/. This is almost always caused by an incomplete copy (folders full of images are easy to accidentally skip when copying manually). Re-copy the public/assets/products folder specifically.`);
  }
} else {
  warn('Could not check product images because products_seed.json is missing (see above).');
}

// ---- 6. Existing database file — warn if it looks stale/pre-existing ----
console.log('\nDatabase file');
const usingCustomDbPath = !!process.env.DB_PATH;
const dbPath = process.env.DB_PATH || path.join(ROOT, 'server/db/waenergy.sqlite');
const dbDir = path.dirname(dbPath);

if (usingCustomDbPath) {
  pass(`Using the DB_PATH setting: ${dbPath}`);
} else {
  pass(`Using the default location: ${dbPath}`);
}

// The server creates this folder on boot if it's missing, so a folder that
// doesn't exist yet is fine — what actually breaks the server is a folder it
// isn't allowed to write into. Check the nearest parent that does exist.
let checkDir = dbDir;
while (!fs.existsSync(checkDir) && path.dirname(checkDir) !== checkDir) {
  checkDir = path.dirname(checkDir);
}
try {
  fs.accessSync(checkDir, fs.constants.W_OK);
  pass(`Database folder is writable (${checkDir})`);
} catch {
  fail(`The database folder ${checkDir} is not writable, so the server won't be able to create or update the database. Fix the folder's permissions, or point DB_PATH somewhere this app can write.`);
}

if (fs.existsSync(dbPath)) {
  warn(`An existing database file was found at ${dbPath}. If this was copied over from another computer along with the code, it's safer to delete it and let the server create a fresh one on first run — the server does automatically fix old database files, but deleting it is the simplest option if you're setting this up fresh and don't need to keep any existing accounts/orders in it.`);
} else {
  pass('No pre-existing database file — a fresh one will be created on first run');
}

// A database sitting inside the project folder is wiped every time these
// hosts redeploy, taking all accounts and orders with it — worth catching
// before it happens rather than after.
if (!usingCustomDbPath && process.env.NODE_ENV === 'production') {
  warn('DB_PATH is not set while NODE_ENV=production, so the database will live inside the project folder. On hosts that replace the app folder on each deploy (Railway, Render, Fly), every account, cart and order is lost on the next redeploy. Attach a persistent volume and set DB_PATH to a path on it — see .env.example.');
}

// ---- Summary ----
console.log('\n' + '='.repeat(50));
if (problems === 0 && warnings === 0) {
  console.log('All checks passed! You\'re good to run: npm start');
} else if (problems === 0) {
  console.log(`No blocking problems found, but ${warnings} thing(s) worth a look above.`);
  console.log('You can proceed with: npm start');
} else {
  console.log(`Found ${problems} problem(s) that need fixing before the site will work correctly.`);
  console.log('Fix the items marked with \u2717 above, then run "npm run doctor" again to confirm.');
}
console.log('='.repeat(50));

process.exit(problems > 0 ? 1 : 0);
