// Tests for the public coupon-submission function. Firebase, Google OAuth and the email API are mocked,
// so this proves the validation / spam / rate-limit / storage LOGIC, not a live Firebase connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../netlify/functions/submit-coupon.mjs');
let n = 0;
const load = async () => import(pathToFileURL(FILE).href + '?v=' + ++n); // fresh rate-limit + token cache per test
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = JSON.stringify({ client_email: 'svc@proj.iam.gserviceaccount.com', project_id: 'proj', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const SITE = 'https://site.test';
const body = (o = {}) => ({ store: 'Nike', title: '15% off first order', code: 'SAVE15', description: 'Works on full-price items.', url: 'https://nike.com/offer', email: 'a@b.co', markets: ['US', 'UK'], expires: '', consent: true, website: '', ts: String(Date.now() - 10000), ...o });
const ev = (o = {}, extra = {}) => ({ httpMethod: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', origin: SITE, 'x-nf-client-connection-ip': `192.0.2.${++n % 250}` }, body: JSON.stringify(body(o)), ...extra });
const env = (e = {}) => { for (const k of ['FIREBASE_SERVICE_ACCOUNT', 'SITE_URL', 'URL', 'RESEND_API_KEY', 'NOTIFY_EMAIL', 'NOTIFY_FROM']) delete process.env[k]; Object.assign(process.env, { FIREBASE_SERVICE_ACCOUNT: SA, SITE_URL: SITE }, e); };

function mock({ firestoreStatus = 200, emailStatus = 200 } = {}) {
  const rec = { firestore: [], email: [], tokenChecks: [], other: [] };
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url === 'https://oauth2.googleapis.com/token') {
      const [h, c, s] = new URLSearchParams(String(opts.body)).get('assertion').split('.');
      const ok = crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url'));
      rec.tokenChecks.push({ ok, claims: JSON.parse(Buffer.from(c, 'base64url').toString()) });
      return { ok: true, json: async () => ({ access_token: 'tok-123', expires_in: 3600 }) };
    }
    if (url.startsWith('https://firestore.googleapis.com/')) { rec.firestore.push({ url, auth: opts.headers.authorization, body: JSON.parse(opts.body) }); return { ok: firestoreStatus === 200, status: firestoreStatus }; }
    if (url === 'https://api.resend.com/emails') { rec.email.push(JSON.parse(opts.body)); return { ok: emailStatus === 200, status: emailStatus }; }
    rec.other.push(url); throw new Error('unexpected fetch ' + url);
  };
  return rec;
}
const fields = (rec) => Object.fromEntries(Object.entries(rec.firestore[0].body.fields).map(([k, v]) => [k, v.stringValue ?? v.arrayValue.values.map((x) => x.stringValue)]));

test('only POST is accepted', async () => { env(); mock(); const { handler } = await load(); assert.equal((await handler({ httpMethod: 'GET', headers: {} })).statusCode, 405); });
test('503 and no outside calls when the service account is not configured', async () => {
  env({ FIREBASE_SERVICE_ACCOUNT: '' }); const rec = mock(); const { handler } = await load();
  assert.equal((await handler(ev())).statusCode, 503); assert.equal(rec.firestore.length + rec.tokenChecks.length, 0);
});
test('valid submission is stored as PENDING in the private "submissions" collection', async () => {
  env(); const rec = mock(); const { handler } = await load();
  const res = await handler(ev()); assert.equal(res.statusCode, 200); assert.deepEqual(JSON.parse(res.body), { ok: true });
  assert.ok(rec.tokenChecks[0].ok, 'service-account JWT signature must verify');
  assert.equal(rec.tokenChecks[0].claims.scope, 'https://www.googleapis.com/auth/datastore'); assert.equal(rec.tokenChecks[0].claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(rec.firestore.length, 1); assert.ok(rec.firestore[0].url.endsWith('/documents/submissions'), rec.firestore[0].url);
  assert.equal(rec.firestore[0].auth, 'Bearer tok-123');
  const f = fields(rec); assert.equal(f.status, 'pending'); assert.equal(f.store, 'Nike'); assert.equal(f.code, 'SAVE15'); assert.equal(f.type, 'code'); assert.deepEqual(f.markets, ['US', 'UK']); assert.ok(f.createdAt);
});
test('a submission without a code is saved as a deal', async () => { env(); const rec = mock(); const { handler } = await load(); await handler(ev({ code: '' })); assert.equal(fields(rec).type, 'deal'); });
test('angle brackets and control characters are stripped before storage', async () => {
  env(); const rec = mock(); const { handler } = await load();
  await handler(ev({ store: '<b>Nike</b>\n', title: '<script>alert(1)</script> 10% off', description: 'a\u0000b' }));
  const f = fields(rec); for (const k of ['store', 'title', 'description']) assert.ok(!/[<>\u0000]/.test(f[k]), `${k}: ${f[k]}`);
});
test('invalid input returns 422 with field errors and stores nothing', async () => {
  env(); const rec = mock(); const { handler } = await load();
  const res = await handler(ev({ store: '', title: 'x', consent: false, url: 'http://insecure.test', email: 'nope', expires: '2001-01-01', code: '!!!' }));
  assert.equal(res.statusCode, 422); const e = JSON.parse(res.body).errors;
  for (const k of ['store', 'title', 'consent', 'url', 'email', 'expires', 'code']) assert.ok(e[k], `missing error for ${k}`);
  assert.equal(rec.firestore.length, 0);
});
test('links in the title and more than one link in the description are rejected', async () => {
  env(); mock(); const { handler } = await load();
  assert.ok(JSON.parse((await handler(ev({ title: 'Visit http://spam.test now' }))).body).errors.title);
  assert.ok(JSON.parse((await handler(ev({ description: 'http://a.test and https://b.test' }))).body).errors.description);
});
test('filled honeypot or an instant post gets a fake success and nothing is stored', async () => {
  env(); const rec = mock(); const { handler } = await load();
  assert.equal((await handler(ev({ website: 'http://spam.test' }))).statusCode, 200);
  assert.equal((await handler(ev({ ts: String(Date.now()) }))).statusCode, 200);
  assert.equal(rec.firestore.length, 0);
});
test('a different Origin is rejected', async () => {
  env(); const rec = mock(); const { handler } = await load();
  const e = ev(); e.headers.origin = 'https://evil.test'; assert.equal((await handler(e)).statusCode, 403); assert.equal(rec.firestore.length, 0);
});
test('rate limit: the 6th submission from one IP in an hour gets 429', async () => {
  env(); mock(); const { handler } = await load(); let last;
  for (let i = 0; i < 6; i++) { const e = ev(); e.headers['x-nf-client-connection-ip'] = '198.51.100.7'; last = await handler(e); }
  assert.equal(last.statusCode, 429); assert.equal(last.headers['Retry-After'], '3600');
});
test('plain HTML form post (no JavaScript) is accepted and redirects with a thank-you flag', async () => {
  env(); const rec = mock(); const { handler } = await load();
  const form = new URLSearchParams({ store: 'ASOS', title: 'Student discount 10%', consent: 'yes', ts: String(Date.now() - 9000), website: '' }); form.append('markets', 'UK'); form.append('markets', 'EU');
  const res = await handler({ httpMethod: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: SITE, 'x-nf-client-connection-ip': '203.0.113.50' }, body: form.toString() });
  assert.equal(res.statusCode, 303); assert.equal(res.headers.Location, '/submit-coupon/?sent=1'); assert.deepEqual(fields(rec).markets, ['UK', 'EU']);
});
test('a storage failure returns 502 with a friendly message (and no stack/details)', async () => {
  env(); mock({ firestoreStatus: 500 }); const { handler } = await load();
  const res = await handler(ev()); assert.equal(res.statusCode, 502); assert.ok(!/firestore|500/i.test(res.body));
});
test('admin email is sent only when configured, as plain text, and its failure does not lose the submission', async () => {
  env(); let rec = mock(); let { handler } = await load(); await handler(ev()); assert.equal(rec.email.length, 0);
  env({ RESEND_API_KEY: 'k', NOTIFY_EMAIL: 'admin@site.test', NOTIFY_FROM: 'Biorals <noreply@site.test>' }); rec = mock({ emailStatus: 500 }); ({ handler } = await load());
  const res = await handler(ev({ store: 'Boots' })); assert.equal(res.statusCode, 200); assert.equal(rec.firestore.length, 1);
  assert.equal(rec.email.length, 1); assert.deepEqual(rec.email[0].to, ['admin@site.test']); assert.match(rec.email[0].text, /Store: Boots/); assert.ok(!('html' in rec.email[0]));
});
