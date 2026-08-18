// server/routes/chat.js
//
// Watt normally runs as a scripted, rule-based assistant — no external API,
// no cost, works instantly out of the box. It's seeded with real knowledge
// about the company, products, plans and WZN pulled straight from the
// database, and any question it doesn't recognise gets a graceful "here's
// our phone number, or ask me about X/Y/Z instead" reply rather than a dead
// end.
//
// If you ever add ANTHROPIC_API_KEY to your .env, Watt automatically
// upgrades to live Claude-powered answers instead — no code changes needed,
// just add the key and restart the server.
const express = require('express');
const db = require('../db/init');

const router = express.Router();

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

/* ============ Rule-based knowledge engine (no API key needed) ============ */

function norm(s) { return String(s || '').toLowerCase(); }
function matchAny(text, words) { return words.some(w => text.includes(w)); }

function scriptedReply(message) {
  const text = norm(message);
  const company = getConfig('company') || {};
  const phone = company.phone || getConfig('waPhone') || '';
  const name = company.name || 'WA Energy';

  const closer = `Reach our team directly on WhatsApp at ${phone} for that.`;

  // Greetings
  if (matchAny(text, ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'])) {
    return "Hello! How may I help you today? You can ask me about our solar panels, inverters, batteries, CCTV, solar plans, or the WZN rewards program.";
  }

  // Farewells / thanks
  if (matchAny(text, ['bye', 'goodbye', 'thank you', 'thanks', 'appreciate it'])) {
    return `You're welcome! Feel free to ask me anything else, or reach our team on WhatsApp at ${phone} anytime.`;
  }

  // Pricing — the one thing Watt should never guess at
  if (matchAny(text, ['price', 'cost', 'how much', '\u20a6', 'naira', 'cheap', 'expensive', 'discount', 'pay for'])) {
    return `I don't have live pricing here \u2014 our sales team handles quotes directly so you always get accurate, current pricing. ${closer} In the meantime, I'm happy to tell you about our products, solar plans, services, or the WZN rewards program \u2014 what would you like to know?`;
  }

  // Product categories (checked before the generic "about" rule below, so
  // "tell me about inverters" matches the inverter answer, not the company one)
  if (matchAny(text, ['solar panel', ' panel', 'panels'])) {
    return `We stock monocrystalline solar panels from trusted brands like Jinko and Africell, in a range of wattages. Browse the "Solar Panels" category on our Products page, or ${closer.toLowerCase()}`;
  }
  if (matchAny(text, ['inverter'])) {
    return `We carry hybrid and pure sine wave inverters from Felicity, C-Worth, Itel and Fireman in a range of sizes. Check the "Inverters" category on our Products page, or ${closer.toLowerCase()}`;
  }
  if (matchAny(text, ['battery', 'batteries'])) {
    return `Our lithium batteries (Deye, Felicity, Itel, C-Worth, SRNE) range from small backup units to full-day storage. See the "Batteries" category on our Products page, or ${closer.toLowerCase()}`;
  }
  if (matchAny(text, ['cctv', 'camera', 'security'])) {
    return `We install CCTV cameras \u2014 including solar-powered options \u2014 for homes and businesses. Check the "CCTV" category on our Products page, or ${closer.toLowerCase()}`;
  }
  if (matchAny(text, ['street light'])) {
    return `We supply all-in-one solar street lights with motion sensing, great for estates and compounds. See the "Street Lights" category on our Products page, or ${closer.toLowerCase()}`;
  }

  // About the company (kept narrower than a generic "tell me about X", which
  // should fall through to the more specific product/plan/WZN rules above/below)
  if (matchAny(text, ['who are you', 'what are you', 'about wa energy', 'what is wa energy', 'what do you do', 'your company', 'tell me about wa energy', 'about you'])) {
    return `${name} is a solar and inverter solutions company based in Abuja, Nigeria, helping homes and businesses across the country break free from unreliable power. We offer solar panels, inverters, batteries, CCTV and street lights, plus flexible installment plans. Ask me about our services, products, or solar plans!`;
  }

  // Services
  if (matchAny(text, ['service', 'survey', 'installation', 'install ', 'maintenance', 'repair', 'consult'])) {
    const services = db.prepare('SELECT title FROM services ORDER BY sort_order').all();
    const list = services.map(s => `\u2022 ${s.title}`).join('\n');
    return `Here's what we offer:\n${list}\n\nWant more detail on any of these, or ready to get started? ${closer}`;
  }

  // Plans / recommendation
  if (matchAny(text, ['plan', 'recommend', 'which system', 'what do i need', 'size my system'])) {
    return `We offer six solar plans \u2014 Basic, Essential, Standard, Premium, Business and Mega \u2014 sized for everything from a single room to a full estate. Sign up and use the "Get Your Solar Recommendation" tool on our homepage for a plan matched to your appliances, or ${closer.toLowerCase()}`;
  }

  // WZN / referrals
  if (matchAny(text, ['wzn', 'wizenium', 'token', 'referral', 'refer a friend', 'refer '])) {
    return "WZN (Wizenium) is our reward token \u2014 you get 2,500 WZN free when you sign up, plus 500 more for every friend who joins using your referral link from your dashboard. WZN doesn't have an official launch date for real-world redemption yet, but a banner will appear right on your dashboard the moment it does!";
  }

  // Delivery / warranty / returns / installment
  if (matchAny(text, ['warranty', 'return policy', 'returns', 'delivery', 'shipping', 'installment', 'instalment'])) {
    return `We offer a 7-day return policy on eligible products, flexible installment payment plans, and fast, reliable delivery to your home, office or project site. For specifics on your order, ${closer.toLowerCase()}`;
  }

  // Contact / location
  if (matchAny(text, ['phone', 'number', 'contact', 'address', 'location', 'whatsapp', 'email', 'where are you', 'where is your', 'office', 'shop'])) {
    return `You can reach ${name} at ${phone} (call or WhatsApp), by email at ${company.email || 'our support email'}, or visit us at ${company.address || 'our Abuja office'}.`;
  }

  // Fallback — never a dead end
  return `I don't have an answer for that one, but our team can help directly \u2014 ${closer.toLowerCase()} I can also tell you about our products, solar plans, services, or the WZN rewards program \u2014 just ask!`;
}

/* ============ Optional live-AI upgrade path (only if a key is set) ============ */

async function liveAiReply(message, history) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const company = getConfig('company') || {};
  const systemPrompt =
    `You are Watt, the friendly solar energy assistant for ${company.name || 'WA Energy'}, a solar and inverter company ` +
    `in Abuja, Nigeria (address: ${company.address || ''}, phone ${company.phone || ''}). Help users pick solar panels, ` +
    `inverters, batteries, CCTV or street lights, explain the Basic/Essential/Standard/Premium/Business/Mega solar plans, ` +
    `and the WZN token rewards program (2,500 WZN on signup, 500 WZN per referral). Keep answers short, warm and ` +
    `practical. If asked for pricing, tell them to request a quote via WhatsApp since prices are provided by the sales team.`;

  const safeHistory = Array.isArray(history)
    ? history.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-12)
    : [];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 600,
      system: systemPrompt,
      messages: [...safeHistory, { role: 'user', content: message }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('Anthropic API error:', response.status, errText);
    throw new Error('live AI request failed');
  }

  const data = await response.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

/* ============ Route ============ */

router.post('/', async (req, res) => {
  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required.' });
  }

  // No key configured: use the free, instant, scripted knowledge base.
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ reply: scriptedReply(message) });
  }

  // Key configured: try live AI first, and quietly fall back to the
  // scripted knowledge base if the API call fails for any reason (bad key,
  // network hiccup, rate limit, etc.) so Watt never goes silent.
  try {
    const reply = await liveAiReply(message, history);
    res.json({ reply: reply || scriptedReply(message) });
  } catch (err) {
    res.json({ reply: scriptedReply(message) });
  }
});

module.exports = router;
