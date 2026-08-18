// server/db/seed.js
// Populates the database from the JSON seed files in this folder.
// Safe to run any time — it clears and re-inserts the catalog/content
// tables (products, plans, categories, services, testimonials, faqs, config)
// so the site always matches the seed files, but it NEVER touches users,
// cart_items or orders, so real customer accounts and orders are never
// wiped out by re-seeding.
//
// Run manually with: npm run seed
// The server also calls this once automatically every time it boots, so the
// catalog is always in sync with the JSON files in this folder.

const fs = require('fs');
const path = require('path');
const db = require('./init');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

function seed() {
  const products = loadJSON('products_seed.json');
  const plans = loadJSON('plans_seed.json');
  const categories = loadJSON('categories_seed.json');
  const services = loadJSON('services_seed.json');
  const testimonials = loadJSON('testimonials_seed.json');
  const faqs = loadJSON('faqs_seed.json');
  const config = loadJSON('config_seed.json');

  const run = db.transaction(() => {
    db.exec('DELETE FROM products; DELETE FROM plans; DELETE FROM categories; DELETE FROM services; DELETE FROM testimonials; DELETE FROM faqs; DELETE FROM config;');

    const insProduct = db.prepare(`INSERT INTO products (id, category, badge, name, description, images_json, specs_json)
      VALUES (@id, @category, @badge, @name, @description, @images_json, @specs_json)`);
    for (const p of products) {
      insProduct.run({
        id: p.id, category: p.cat, badge: p.badge, name: p.name, description: p.desc,
        images_json: JSON.stringify(p.images), specs_json: JSON.stringify(p.specs),
      });
    }

    const insPlan = db.prepare(`INSERT INTO plans (key, name, image, specs_json, suitable, capacity_json, sort_order)
      VALUES (@key, @name, @image, @specs_json, @suitable, @capacity_json, @sort_order)`);
    for (const pl of plans) {
      insPlan.run({
        key: pl.key, name: pl.name, image: pl.image, specs_json: JSON.stringify(pl.specs),
        suitable: pl.suitable, capacity_json: JSON.stringify(pl.capacity), sort_order: pl.sort_order,
      });
    }

    const insCat = db.prepare(`INSERT INTO categories (id, name, icon, sort_order) VALUES (@id, @name, @icon, @sort_order)`);
    for (const c of categories) insCat.run(c);

    const insSvc = db.prepare(`INSERT INTO services (icon, title, text, more, sort_order) VALUES (@icon, @title, @text, @more, @sort_order)`);
    for (const s of services) insSvc.run(s);

    const insTesti = db.prepare(`INSERT INTO testimonials (name, state, stars, text) VALUES (@name, @state, @stars, @text)`);
    for (const t of testimonials) insTesti.run(t);

    const insFaq = db.prepare(`INSERT INTO faqs (question, answer, sort_order) VALUES (@question, @answer, @sort_order)`);
    for (const f of faqs) insFaq.run(f);

    const insConfig = db.prepare(`INSERT INTO config (key, value) VALUES (?, ?)`);
    insConfig.run('waPhone', config.waPhone);
    insConfig.run('company', JSON.stringify(config.company));
    insConfig.run('underPlan', JSON.stringify(config.underPlan));
  });

  run();
  console.log(`Seeded: ${products.length} products, ${plans.length} plans, ${categories.length} categories, ${services.length} services, ${testimonials.length} testimonials, ${faqs.length} faqs.`);
}

module.exports = seed;

// Allow running this file directly: `node server/db/seed.js` (or `npm run seed`)
if (require.main === module) {
  seed();
}

