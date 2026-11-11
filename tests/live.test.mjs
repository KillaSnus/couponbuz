// The proof that matters: edit in the CMS -> the public website shows it on the very next request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCmsPost, errorResponse, issueToken } from '../src/cms.js';
import { handlePublic, resetRuntimeCache } from '../src/runtime.js';
import { makeEnv, FakeCache, post, req } from './_fakes.mjs';

async function setup() {
  resetRuntimeCache();
  const env = makeEnv(); const cache = new FakeCache();
  const token = await issueToken(env, 'owner@biorals.test');
  const cms = async (body) => { try { return await (await handleCmsPost(post('/api/cms', body, { authorization: 'Bearer ' + token }), env)).json(); } catch (e) { return await errorResponse(e).json(); } };
  const get = async (path, init) => { const r = await handlePublic(req(path, init), env, { cache, waitUntil: () => {} }); return { status: r.status, text: await r.text(), headers: r.headers, res: r }; };
  return { env, cache, cms, get };
}
const store = (o = {}) => ({ slug: 'acme-shop', name: 'Acme Shop', domain: 'acme.example', category: 'fashion', markets: ['US', 'UK'], status: 'published', description: 'Acme sells anvils and rockets.', tips: ['Check the sale section first.'], ...o });
const category = { slug: 'fashion', name: 'Fashion & Apparel', icon: '👟', description: 'Clothes and shoes.', status: 'published' };

test('empty CMS still serves the starter site (first deploy is never blank)', async () => {
  const { get } = await setup();
  const home = await get('/'); assert.equal(home.status, 200); assert.match(home.text, /<h1/);
  assert.equal((await get('/stores/')).status, 200);
});

test('new store added in the CMS appears on the public site immediately', async () => {
  const { cms, get } = await setup();
  await cms({ op: 'set', col: 'categories', id: 'fashion', data: category });
  await cms({ op: 'set', col: 'stores', id: 'other', data: store({ slug: 'other', name: 'Other Co', domain: 'other.example' }) });
  assert.equal((await get('/coupons/acme-shop/')).status, 404);          // does not exist yet (404s are never cached)
  await cms({ op: 'set', col: 'stores', id: 'acme-shop', data: store() });
  const page = await get('/coupons/acme-shop/');
  assert.equal(page.status, 200); assert.match(page.text, /Acme sells anvils and rockets\./);
  assert.match((await get('/stores/')).text, /Acme Shop/);
  // a store without offers is deliberately kept out of the sitemap (noindex, thin page); adding an offer lists it
  assert.doesNotMatch((await get('/sitemap-main.xml')).text, /acme-shop/);
  await cms({ op: 'set', col: 'coupons', id: 'c1', data: { id: 'c1', storeSlug: 'acme-shop', title: 'Free shipping', type: 'deal', discount: 'Free shipping', description: 'On all orders.', status: 'published', markets: ['US'], tags: [] } });
  assert.match((await get('/sitemap-main.xml')).text, /\/coupons\/acme-shop\//);
});

test('editing a store updates a page that was already cached', async () => {
  const { cms, get, cache } = await setup();
  await cms({ op: 'set', col: 'categories', id: 'fashion', data: category });
  await cms({ op: 'set', col: 'stores', id: 'acme-shop', data: store() });
  const a = await get('/coupons/acme-shop/'); assert.equal(a.headers.get('x-cache'), 'MISS');
  const b = await get('/coupons/acme-shop/'); assert.equal(b.headers.get('x-cache'), 'HIT'); // really cached...
  assert.ok(cache.m.size > 0);
  await cms({ op: 'set', col: 'stores', id: 'acme-shop', data: store({ description: 'Acme now sells jetpacks.' }) });
  const c = await get('/coupons/acme-shop/');
  assert.equal(c.headers.get('x-cache'), 'MISS');                       // ...and the save invalidated it
  assert.match(c.text, /Acme now sells jetpacks\./); assert.doesNotMatch(c.text, /anvils and rockets/);
});

test('adding a coupon, then drafting and deleting it, is reflected right away', async () => {
  const { cms, get } = await setup();
  await cms({ op: 'set', col: 'categories', id: 'fashion', data: category });
  await cms({ op: 'set', col: 'stores', id: 'acme-shop', data: store() });
  const coupon = { id: 'c1', storeSlug: 'acme-shop', title: 'Take 20% off rockets', type: 'code', code: 'ROCKET20', discount: '20% off', description: 'Valid on rockets.', status: 'published', markets: ['US'], verified: true, verifiedAt: '2026-10-30', terms: 'Rockets only.', tags: [] };
  await cms({ op: 'set', col: 'coupons', id: 'c1', data: coupon });
  assert.match((await get('/coupons/acme-shop/')).text, /Take 20% off rockets/);
  await cms({ op: 'set', col: 'coupons', id: 'c1', data: { ...coupon, status: 'draft' } });
  assert.doesNotMatch((await get('/coupons/acme-shop/')).text, /Take 20% off rockets/);
  await cms({ op: 'set', col: 'coupons', id: 'c1', data: coupon });
  await cms({ op: 'del', col: 'coupons', id: 'c1' });
  assert.doesNotMatch((await get('/coupons/acme-shop/')).text, /ROCKET20/);
});

test('deleting or drafting a store removes its page and sitemap entry', async () => {
  const { cms, get } = await setup();
  await cms({ op: 'set', col: 'categories', id: 'fashion', data: category });
  await cms({ op: 'set', col: 'stores', id: 'acme-shop', data: store() });
  assert.equal((await get('/coupons/acme-shop/')).status, 200);
  await cms({ op: 'set', col: 'stores', id: 'acme-shop', data: store({ status: 'draft' }) });
  assert.equal((await get('/coupons/acme-shop/')).status, 404);
  assert.doesNotMatch((await get('/sitemap-main.xml')).text, /acme-shop/);
});

test('site settings (name, menu) and CMS redirects take effect immediately', async () => {
  const { cms, get } = await setup();
  await cms({ op: 'set', col: 'settings', id: 'site', data: { siteName: 'DealHive', tagline: 'Hive of deals' } });
  assert.match((await get('/')).text, /DealHive/);
  await cms({ op: 'set', col: 'redirects', id: 'r1', data: { from: '/old-page/', to: '/stores/', code: '301', active: true } });
  const r = await get('/old-page/'); assert.equal(r.status, 301); assert.equal(r.headers.get('location'), '/stores/');
});

test('editor content is escaped (no script injection from CMS fields)', async () => {
  const { cms, get } = await setup();
  await cms({ op: 'set', col: 'categories', id: 'fashion', data: category });
  await cms({ op: 'set', col: 'stores', id: 'evil', data: store({ slug: 'evil', name: '<script>alert(1)</script>', description: '"><img src=x onerror=alert(1)>', body: 'Hello <script>alert(2)</script> [x](javascript:alert(3))' }) });
  const t = (await get('/coupons/evil/')).text;
  assert.doesNotMatch(t, /<script>alert/); assert.doesNotMatch(t, /<img src=x onerror/); assert.doesNotMatch(t, /href="javascript:/i);
});

test('routing details: trailing slash, /admin, HEAD, methods, 404 page', async () => {
  const { get, env } = await setup();
  const a = await get('/stores'); assert.equal(a.status, 301); assert.equal(a.headers.get('location'), 'https://biorals.test/stores/');
  const b = await get('/admin'); assert.equal(b.status, 301); assert.match(b.headers.get('location'), /\/admin\/$/);
  const c = await get('/definitely-not-a-page/'); assert.equal(c.status, 404); assert.match(c.text, /Page not found/);
  const d = await handlePublic(req('/', { method: 'POST' }), env, {}); assert.equal(d.status, 405);
  const e = await handlePublic(req('/', { method: 'HEAD' }), env, {}); assert.equal(e.status, 200); assert.equal(await e.text(), '');
});

test('static files in /public take priority over generated routes', async () => {
  const { env } = await setup();
  env.ASSETS = { fetch: async (r) => (new URL(r.url).pathname === '/img/og-default.png' ? new Response('PNGDATA', { status: 200 }) : new Response('nf', { status: 404 })) };
  const r = await handlePublic(req('/img/og-default.png'), env, {}); assert.equal(await r.text(), 'PNGDATA');
  const g = await handlePublic(req('/robots.txt'), env, {}); assert.match(await g.text(), /Sitemap: https:\/\/biorals\.test\/sitemap\.xml/);
});

test('without a KV binding the site still renders from the starter data', async () => {
  resetRuntimeCache();
  const env = makeEnv(); delete env.CMS;
  const r = await handlePublic(req('/'), env, {}); assert.equal(r.status, 200);
});
