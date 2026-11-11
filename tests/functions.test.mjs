// Calls the real Cloudflare Pages Function files the way the platform does (a context object with request/env/params).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequest as publicSite } from '../functions/[[path]].js';
import { onRequest as cmsFn } from '../functions/api/cms.js';
import { onRequest as formFn } from '../functions/api/form.js';
import { onRequest as submitFn } from '../functions/api/submit-coupon.js';
import { onRequest as chatFn } from '../functions/api/chat.js';
import { onRequestGet as mediaFn } from '../functions/media/[[path]].js';
import { resetRuntimeCache } from '../src/runtime.js';
import { makeEnv, post, req, PASSWORD } from './_fakes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = (request, env, extra = {}) => ({ request, env, params: {}, waitUntil: () => {}, ...extra });

test('GET /api/cms is a safe setup check; wrong methods are refused', async () => {
  const env = makeEnv();
  const r = await cmsFn(ctx(req('/api/cms'), env)); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.kv, true); assert.equal(j.passwordSet, true);
  assert.equal((await cmsFn(ctx(req('/api/cms', { method: 'DELETE' }), env))).status, 405);
  assert.equal((await formFn(ctx(req('/api/form'), env))).status, 405);
  assert.equal((await submitFn(ctx(req('/api/submit-coupon'), env))).status, 405);
  assert.equal((await chatFn(ctx(req('/api/chat'), env))).status, 405);
});

test('full admin flow through the real function: login -> save -> public page changes', async () => {
  resetRuntimeCache();
  const env = makeEnv();
  const login = await (await cmsFn(ctx(post('/api/cms', { op: 'login', email: 'owner@biorals.test', password: PASSWORD }), env))).json();
  assert.ok(login.token);
  const auth = { authorization: 'Bearer ' + login.token };
  await cmsFn(ctx(post('/api/cms', { op: 'set', col: 'categories', id: 'pets', data: { slug: 'pets', name: 'Pets', icon: '🐾', description: 'Pet deals.', status: 'published' } }, auth), env));
  await cmsFn(ctx(post('/api/cms', { op: 'set', col: 'stores', id: 'pawco', data: { slug: 'pawco', name: 'PawCo', domain: 'pawco.example', category: 'pets', markets: ['US'], status: 'published', description: 'Treats for dogs.' } }, auth), env));
  const page = await publicSite(ctx(req('/coupons/pawco/'), env));
  assert.equal(page.status, 200); assert.match(await page.text(), /Treats for dogs\./);
  await cmsFn(ctx(post('/api/cms', { op: 'set', col: 'stores', id: 'pawco', data: { slug: 'pawco', name: 'PawCo', domain: 'pawco.example', category: 'pets', markets: ['US'], status: 'published', description: 'Treats and toys for dogs.' } }, auth), env));
  assert.match(await (await publicSite(ctx(req('/coupons/pawco/'), env))).text(), /Treats and toys for dogs\./);
});

test('uploaded images are served from /media with safe headers', async () => {
  const env = makeEnv();
  const login = await (await cmsFn(ctx(post('/api/cms', { op: 'login', email: 'owner@biorals.test', password: PASSWORD }), env))).json();
  const up = await (await cmsFn(ctx(post('/api/cms', { op: 'upload', name: 'logo.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }, { authorization: 'Bearer ' + login.token }), env))).json();
  const r = await mediaFn(ctx(req(up.url), env, { params: { path: up.path.split('/') } }));
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(new Uint8Array(await r.arrayBuffer()).length, 8);
  assert.equal((await mediaFn(ctx(req('/media/uploads/nope.png'), env, { params: { path: ['uploads', 'nope.png'] } }))).status, 404);
  assert.equal((await mediaFn(ctx(req('/media/../x'), env, { params: { path: ['..', 'x'] } }))).status, 404);
});

test('the Cloudflare project files are present and valid', () => {
  const routes = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/_routes.json'), 'utf8'));
  assert.equal(routes.version, 1); assert.ok(routes.exclude.includes('/admin/*') && routes.exclude.includes('/assets/*'));
  for (const f of ['public/admin/index.html', 'public/admin/admin.js', 'public/assets/site.js', 'public/assets/style.css', 'public/_headers', 'wrangler.toml']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const toml = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
  assert.match(toml, /pages_build_output_dir\s*=\s*"public"/); assert.match(toml, /binding\s*=\s*"CMS"/);
});

test('no Netlify / Firebase leftovers anywhere in the project', () => {
  const bad = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.git', '.wrangler'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs|html|json|toml|css)$/.test(e.name) && !p.startsWith(path.join(ROOT, 'tests'))) { const t = fs.readFileSync(p, 'utf8'); if (/netlify|firebase|firestore/i.test(t)) bad.push(path.relative(ROOT, p)); } } };
  walk(ROOT);
  assert.deepEqual(bad, []);
});

test('admin scripts parse as ES modules', async () => {
  for (const f of ['admin.js', 'js/core.js', 'js/fields.js', 'js/schemas.js', 'js/views.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'public/admin', f), 'utf8');
    assert.doesNotThrow(() => new Function(src.replace(/^\s*import\s[^;]*;?/gm, '').replace(/export\s+(async\s+)?(function|const|let|class)/g, '$1$2')), f); // syntax only
  }
});
