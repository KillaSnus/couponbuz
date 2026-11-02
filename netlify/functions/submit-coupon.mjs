// Netlify Function: public "submit a coupon" endpoint.
// - Validates everything on the server (the browser form is only a convenience).
// - Blocks obvious spam (honeypot field, too-fast posts, wrong Origin) and rate-limits by IP.
// - Saves the submission as PENDING in the private Firestore collection "submissions". It is never published
//   automatically: an admin reviews it in the CMS and turns it into a draft offer.
// - Optionally emails the admin through Resend when RESEND_API_KEY, NOTIFY_EMAIL and NOTIFY_FROM are set.
//
// Environment variables (names only; values go in Netlify, never in the repo):
//   FIREBASE_SERVICE_ACCOUNT  service-account JSON on one line (required to store submissions)
//   SITE_URL                  public site URL, e.g. https://example.com (required; also used for the Origin check)
//   RESEND_API_KEY, NOTIFY_EMAIL, NOTIFY_FROM   optional admin email notification
import crypto from 'node:crypto';

const hits = new Map(); // in-memory, per function instance: a speed bump, not a guarantee
const LIMIT = 5, WINDOW = 60 * 60 * 1000;
let tokenCache = { token: '', exp: 0 };
const MARKETS = ['US', 'UK', 'CA', 'EU'];

const json = (status, body, headers = {}) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const URLISH = /https?:\/\/|www\./gi;

export function validate(input) {
  const errors = {}, v = {};
  v.store = clean(input.store, 80); if (v.store.length < 2) errors.store = 'Please enter the store name.';
  v.title = clean(input.title, 120);
  if (v.title.length < 5) errors.title = 'Please describe the offer (at least 5 characters).';
  else if ((v.title.match(URLISH) || []).length) errors.title = 'Please keep links out of the title.';
  v.code = clean(input.code, 40);
  if (v.code && !/^[A-Za-z0-9][A-Za-z0-9_.\- ]*$/.test(v.code)) errors.code = 'Codes can use letters, numbers, spaces, dashes, dots and underscores.';
  v.description = clean(input.description, 500);
  if ((v.description.match(URLISH) || []).length > 1) errors.description = 'Please include at most one link.';
  v.url = '';
  if (input.url) {
    try {
      const u = new URL(String(input.url).trim());
      if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password || u.href.length > 300) throw new Error('bad');
      v.url = u.href;
    } catch { errors.url = 'Please enter a valid https:// link.'; }
  }
  v.email = clean(input.email, 120);
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) errors.email = 'That email address does not look right.';
  v.markets = [...new Set([].concat(input.markets || []))].filter((m) => MARKETS.includes(m));
  v.expires = '';
  if (input.expires) {
    const s = String(input.expires), d = new Date(s + 'T00:00:00Z');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(d) && d > new Date(Date.now() - 86400000) && d < new Date(Date.now() + 2 * 365 * 86400000)) v.expires = s;
    else errors.expires = 'Expiry must be a future date within two years.';
  }
  if (![true, 'yes', 'on', 'true'].includes(input.consent)) errors.consent = 'Please confirm that you checked the offer.';
  return { errors, value: v };
}

function parseBody(event) {
  const ct = String(event.headers['content-type'] || '').toLowerCase();
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  if (raw.length > 20000) throw new Error('too large');
  if (ct.includes('application/json')) return JSON.parse(raw);
  const p = new URLSearchParams(raw), o = {};
  for (const k of new Set(p.keys())) o[k] = k === 'markets' ? p.getAll(k) : p.get(k);
  return o;
}

const b64url = (b) => Buffer.from(b).toString('base64url');
async function accessToken(sa) {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  if (!res.ok) throw new Error('token ' + res.status);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}
const fsVal = (v) => (Array.isArray(v) ? { arrayValue: { values: v.map(fsVal) } } : { stringValue: String(v) });
async function save(sa, doc) {
  const token = await accessToken(sa);
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/databases/(default)/documents/submissions`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, fsVal(v)])) }),
  });
  if (!res.ok) throw new Error('firestore ' + res.status);
}

async function notify(doc, site) {
  const key = process.env.RESEND_API_KEY, to = process.env.NOTIFY_EMAIL, from = process.env.NOTIFY_FROM;
  if (!key || !to || !from) return;
  const text = `New coupon submission (pending review)\n\nStore: ${doc.store}\nTitle: ${doc.title}\nCode: ${doc.code || '(none)'}\nLink: ${doc.url || '(none)'}\nRegions: ${doc.markets.join(', ') || '(not given)'}\nExpires: ${doc.expires || '(not given)'}\n\n${doc.description}\n\nReview it in the admin: ${site}/admin/`;
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject: `Coupon submission: ${doc.store}`, text }) });
  if (!res.ok) throw new Error('email ' + res.status);
}

const page = (msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Submission</title><body style="font-family:system-ui;max-width:560px;margin:12vh auto;padding:0 18px"><p>${msg.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p><p><a href="/submit-coupon/">Back to the form</a></p>`;

export const handler = async (event) => {
  const h = event.headers || {};
  const wantsJson = String(h.accept || '').includes('application/json') || String(h['content-type'] || '').includes('json');
  const reply = (status, body, headers) => (wantsJson ? json(status, body, headers) : { statusCode: status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers }, body: page(body.error || Object.values(body.errors || {}).join(' ') || 'Thank you!') });
  const ok = () => (wantsJson ? json(200, { ok: true }) : { statusCode: 303, headers: { Location: '/submit-coupon/?sent=1' }, body: '' });

  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  const site = (process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '');
  let sa;
  try { sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ''); } catch { sa = null; }
  if (!sa || !sa.client_email || !sa.private_key || !sa.project_id || !/^https?:\/\/[^\s/]+$/.test(site)) return reply(503, { error: 'Submissions are not switched on yet. Please use the contact page instead.' });

  if (h.origin && h.origin !== site) return reply(403, { error: 'Request not allowed.' });

  const ip = String(h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || 'x').split(',')[0].trim();
  const now = Date.now(), rec = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  if (rec.length >= LIMIT) return reply(429, { error: 'Too many submissions from your connection. Please try again later.' }, { 'Retry-After': '3600' });
  rec.push(now); hits.set(ip, rec);

  let input;
  try { input = parseBody(event); } catch { return reply(400, { error: 'Could not read your submission.' }); }
  if (!input || typeof input !== 'object') return reply(400, { error: 'Could not read your submission.' });

  // Bots: a filled honeypot or a post within 3 seconds of the page loading gets a fake "thank you" and is dropped.
  if (clean(input.website, 200) || (Number(input.ts) && now - Number(input.ts) < 3000)) return ok();

  const { errors, value } = validate(input);
  if (Object.keys(errors).length) return reply(422, { errors });

  const doc = { ...value, type: value.code ? 'code' : 'deal', status: 'pending', createdAt: new Date().toISOString() };
  try { await save(sa, doc); } catch (e) { console.error('submit-coupon: save failed:', e.message); return reply(502, { error: 'Could not save your submission right now. Please try again later.' }); }
  try { await notify(doc, site); } catch (e) { console.error('submit-coupon: notify failed:', e.message); }
  return ok();
};
