# WA Energy — Solar and Inverter Solution

A real, deployable website for WA Energy with:

- A **Node.js + Express** backend
- A **real SQLite database** using Node's own built-in SQLite support (no separate database server, and no C++ compiler needed to install it) storing users, products, plans, cart items and orders
- **Real user accounts** — passwords are hashed with bcrypt, sessions use signed JWT cookies
- A **real shopping cart** and **order records**, stored per user, that survive page reloads and logins from any device
- The full 69-product catalog (110 photos) served from the database
- A **Watt chat assistant** that works out of the box with zero cost, using a built-in scripted knowledge base — with an optional upgrade to live AI answers if you ever add an Anthropic API key
- A password-protected **admin panel** at `/admin` for managing users, WZN tokens and referrals
- A **`npm run doctor`** health-check script — run this any time you move the project to a new computer to catch missing files before they cause confusing problems (see section 9)

---

## 1. Installing Node.js

- Go to [nodejs.org](https://nodejs.org/) and download the current version — **version 22.5 or newer is required** (not just any version). This is important: the database uses Node's own built-in SQLite support, added in that version, specifically so nobody ever has to install a C++ compiler or Visual Studio Build Tools just to run this site.
- Install it like any normal program (default options are fine).
- Confirm it worked by opening a terminal/Command Prompt and running:
  ```
  node --version
  ```
  If it shows something below `v22.5.0`, reinstall from nodejs.org.

## 2. Copying / cloning the project

Get the complete project folder onto your computer or server — either:
- **Clone it from GitHub** (recommended, most reliable): `git clone <your-repo-url>`, or
- **Copy the folder directly** (zip, USB, cloud drive, etc.)

**If copying manually, this is the single most common source of problems** — this project has a `public/assets/products/` folder containing 110 images spread across 69 subfolders, and file managers / browser upload tools frequently skip files silently when copying deeply nested folders like this, with no warning that anything went wrong. The symptoms show up later as things like "product images not showing" or "the FAQ section is empty" — not as an obvious copy error.

**Always run `npm run doctor` immediately after copying, before doing anything else** (see section 9) — it checks that every file actually made it over, including every single product image, and tells you exactly what's missing if anything didn't.

Leave these out of any copy (they're either regenerated automatically or specific to one machine):
- `node_modules/` — reinstalled fresh by `npm install` on any machine
- `.env` — contains machine-specific secrets, see section 4
- `server/db/waenergy.sqlite` — a local database file; see section 5 for why you generally want a fresh one on a new machine, not a copied one

## 3. Running npm install

Open a terminal in the project folder and run:

```
npm install
```

This downloads Express, the database driver, and the other small libraries the server needs (see `package.json`). No native compiling required — every dependency here is pure JavaScript. Do this once per machine (and again any time dependencies change).

## 4. Setting up .env

Copy `.env.example` to a new file named `.env` in the same folder, then fill it in:

1. **Generate a `JWT_SECRET`** (a long random string used to sign login sessions):
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   Paste the output as `JWT_SECRET=...` in `.env`. **Use a different one on every machine/deployment** — never copy this value between environments.

2. **Set your admin panel login** (`ADMIN_USERNAME` and `ADMIN_PASSWORD`) — change these from the defaults before going live.

3. **(Optional) Add `ANTHROPIC_API_KEY`** only if you want Watt to give live AI-generated answers instead of its built-in scripted ones (see section 4 of the in-app documentation, or just leave this blank — Watt works great without it).

4. Set `NODE_ENV=production` once you're running on your real domain over HTTPS (this makes login cookies HTTPS-only).

`.env` is intentionally excluded from git/copies — it must be created fresh on every machine.

## 5. Setting up / initializing the database

**Nothing to do manually here in the normal case.** The first time you run `npm start` (next section), the server automatically:
- Creates `server/db/waenergy.sqlite` if it doesn't already exist
- Creates every table it needs
- Loads your products, plans, categories, services, testimonials and FAQs from the JSON files in `server/db/`

**The one thing to watch for:** if you're moving this project to a new computer or server, do **not** carry over an old `server/db/waenergy.sqlite` file from a different machine unless you specifically want to keep the accounts/orders already inside it. The server does automatically detect and fix an old database's structure if it's missing newer columns (this used to be a real bug — copying an old database file could silently break signup and login — it's now fixed with an automatic migration step). But the simplest, safest choice when setting up on a fresh machine is to just delete `server/db/waenergy.sqlite` if you see it there before your first `npm start`, and let the server create a brand new one.

To manually re-load just the content (products, plans, etc.) without touching real user accounts:
```
npm run seed
```

## 6. Running the website locally with npm start

```
npm start
```

You'll see:
```
WA Energy server running at http://localhost:3000
```

Open that URL in your browser — the whole site is live: home page, products, signup, login, dashboard, cart, admin panel at `/admin`, everything.

For development, `npm run dev` uses `nodemon` to auto-restart the server whenever you edit a file.

## 7. Building for production

**There is no separate build step for this project** — unlike some frontend frameworks (React, Vue, etc.), this site is plain HTML/CSS/JavaScript served directly by the Node server, so there's nothing to compile or bundle. "Production-ready" here just means:

1. Run `npm run doctor` one more time on the production machine/server to confirm everything copied correctly (section 9).
2. Make sure `.env` on the production server has `NODE_ENV=production`, a freshly-generated `JWT_SECRET`, and a changed `ADMIN_PASSWORD`.
3. Run `npm install` (this also works identically in production — no separate production install process).
4. Start the app with `npm start` — for it to stay running permanently and restart automatically if it ever crashes or the server reboots, use a process manager like [PM2](https://pm2.keymetrics.io/) instead of running `npm start` directly:
   ```
   npm install -g pm2
   pm2 start server/server.js --name waenergy
   pm2 save
   pm2 startup
   ```

## 8. Deploying to a live host

This is a normal Node.js app, so it runs on almost any hosting provider. A few notes based on real experience getting this specific project deployed:

- **Your database needs persistent storage.** Some platforms (Render's free tier, DigitalOcean's App Platform) wipe local files like `waenergy.sqlite` on every restart/redeploy — avoid those for this app, or make sure to attach real persistent storage/a volume if the platform offers one.
- **Platform-as-a-service options** (Railway, Render's paid Starter plan + disk, Fly.io) — connect your GitHub repo, set the environment variables from `.env` in their dashboard, and they build + run `npm start` for you. Easiest option if available and your payment method is accepted.
- **A VPS** (Vultr, DigitalOcean Droplets, a cPanel host with a VPS/Cloud Server option) — real persistent storage always included since it's a full server. Copy the project over (section 2), then follow sections 3-7 directly on the server, then set up Nginx as a reverse proxy and point your domain's DNS at the server's IP address.
- **Shared/cPanel hosting** — only works if the host specifically offers a "Setup Node.js App" tool (look under the Software section in cPanel). Plain HTML/PHP-only hosting plans cannot run this project at all, no matter how the files are uploaded — the site needs a persistently-running Node.js process, not just static files.

Whichever you choose: point your domain's DNS at the host, set up HTTPS (most platforms above do this for you automatically via Let's Encrypt), and set real environment variables (don't upload your actual `.env` file to a public git repo — enter the values directly in your host's dashboard/environment settings instead).

## 9. Project health check (`npm run doctor`)

Run this any time you copy the project to a new computer or server, **before** running `npm start`:

```
npm run doctor
```

It checks, and tells you exactly what's wrong if anything fails:
- Your Node.js version is new enough
- Every core server and frontend file is present
- `.env` exists
- Every content file (`server/db/*_seed.json`) is present and valid
- **Every single one of the 110 product images referenced in the catalog actually exists on disk** — this is the check that would have caught the "product images not showing" problem immediately, by name, instead of leaving you to guess
- Whether an old database file is sitting there that you might want to delete before a fresh setup

If it reports problems, fix the specific items listed (usually: re-copy a missing folder) and run it again to confirm before starting the server.

## 10. Admin panel

Visit **`/admin`** on your site (e.g. `http://localhost:3000/admin` locally, or `https://yourdomain.com/admin` once deployed).

Log in with whatever you set `ADMIN_USERNAME` / `ADMIN_PASSWORD` to in your `.env` (defaults to `waenergyadmin` / `energywithoutlimit` — **change this before going live**).

From here you can see every registered user, their WZN balance, cart, and referral activity; expand any user for full detail (appliances, cart, orders, referral history, WZN grant history); and send or deduct WZN tokens for any individual user, with every grant permanently logged for an audit trail.

## 11. Teaching Watt new answers

Watt's scripted answers live in `server/routes/chat.js`, inside the `scriptedReply()` function — a simple ordered list of "if the message contains any of these words, reply with this" rules. To add a new topic, add a new block anywhere before the final fallback reply:

```js
if (matchAny(text, ['keyword one', 'keyword two'])) {
  return "Whatever you want Watt to say here.";
}
```

Put more specific rules above broader ones so specific questions don't get swallowed by a catch-all phrase. If you ever add `ANTHROPIC_API_KEY`, this scripted version automatically becomes the safety net used only if the live AI call ever fails.

## 12. Editing your content later

Everything customers see — products, solar plans, services, testimonials, FAQs, your phone/address — lives in the JSON files inside `server/db/`. Edit any of these, then restart the server (it re-seeds automatically on every boot) or run `npm run seed`. This **never** deletes real customer accounts, carts, or orders — only the catalog/content tables are refreshed.

To add or remove product photos, drop images into `public/assets/products/` and update the matching entry's `images` array in `products_seed.json` — then run `npm run doctor` to confirm every referenced image actually exists before deploying.

## 13. Project structure

```
waenergy-app/
├── package.json
├── .env                    # your local config (never commit the real one)
├── .env.example            # documented template
├── public/                 # everything the customer's browser loads
│   ├── index.html
│   ├── styles.css
│   ├── app.js               # talks to the API below
│   ├── admin.html            # admin panel page (served at /admin)
│   ├── admin.css
│   ├── admin.js              # talks to /api/admin/*
│   └── assets/               # logos, icons, product photos, illustrations
└── server/
    ├── server.js            # app entrypoint
    ├── doctor.js            # preflight health check (npm run doctor)
    ├── db/
    │   ├── init.js           # creates + migrates the SQLite schema
    │   ├── sqlite-adapter.js # wraps Node's built-in SQLite — no native compiling needed
    │   ├── seed.js           # loads the JSON files below into the database
    │   └── *_seed.json       # your editable content
    ├── middleware/
    │   ├── auth.js           # customer session cookie + JWT helpers
    │   └── adminAuth.js      # separate admin session cookie + JWT helpers
    └── routes/
        ├── auth.js           # signup (+ referral crediting), login, logout, me
        ├── catalog.js        # products, plans, categories, services, testimonials, faqs, config
        ├── cart.js           # per-user cart
        ├── orders.js         # quote requests + WZN checkout attempts
        ├── chat.js           # Watt's scripted knowledge base (+ optional live-AI upgrade)
        └── admin.js          # admin login + user management + WZN grants
```

## 14. A note on testing

This project was written in a sandboxed environment without internet access, so real-world file transfers (git uploads, manual copies between computers) couldn't be fully tested end-to-end before handing it over — which is exactly how the database-migration and missing-file bugs described in section 9 surfaced in real use. Both are now fixed and verified: the migration was tested against a simulated old-schema database (confirmed signup and login both work correctly afterward), and the `npm run doctor` script was tested against a deliberately broken copy (confirmed it correctly identifies every missing file by name). If anything else comes up, `npm run doctor` is the first thing to run — it catches the most common category of problem (incomplete file copies) immediately and specifically.
