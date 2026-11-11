import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSite, SEED } from '../src/site.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = createSite({ ...SEED, redirects: [] }, { siteUrl: 'https://biorals.test', showDemo: true });
const pages = [...site.routes.keys()];
const html = Object.fromEntries(pages.map((p) => [p, site.render(p).body]));
const meta = (h, re) => (h.match(re) || [])[1] || '';
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

test('every route renders a complete HTML document', () => {
  for (const p of pages) assert.ok(/^<!doctype html>/i.test(html[p]) && html[p].includes('</html>'), p);
  assert.ok(['/', '/stores/', '/categories/', '/promo-codes/', '/guides/', '/deals/', '/submit-coupon/', '/search/', '/contact/', '/about/', '/privacy/', '/terms/'].every((p) => site.routes.has(p)));
});

test('titles and descriptions are present, unique and not too long', () => {
  const titles = new Map(), descs = new Map();
  for (const p of pages) {
    const t = decode(meta(html[p], /<title>([^<]*)<\/title>/)), d = decode(meta(html[p], /<meta name="description" content="([^"]*)"/));
    assert.ok(t.length > 5 && t.length <= 70, `title length ${p}: ${t.length}`);
    assert.ok(d.length > 40 && d.length <= 165, `description length ${p}: ${d.length}`);
    assert.ok(!titles.has(t), `duplicate title ${t} (${p} / ${titles.get(t)})`); titles.set(t, p);
    assert.ok(!descs.has(d), `duplicate description (${p} / ${descs.get(d)})`); descs.set(d, p);
  }
});

test('each page has one h1, a canonical URL on the site domain, and valid JSON-LD', () => {
  for (const p of pages) {
    const h = html[p];
    assert.equal((h.match(/<h1[ >]/g) || []).length, 1, 'h1 count ' + p);
    assert.match(h, new RegExp(`<link rel="canonical" href="https://biorals\\.test${p === '/' ? '/' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`), 'canonical ' + p);
    for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
  }
});

test('internal links all resolve (page, generated file, logo, or static file)', () => {
  const missing = [];
  const files = new Set(['/search.json', '/sitemap.xml', '/robots.txt', '/img/logo.svg', '/img/favicon.svg']);
  for (const p of pages) for (const m of html[p].matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const u = m[1];
    if (u.startsWith('//') || site.routes.has(u) || files.has(u) || site.render(u)) continue;
    if (fs.existsSync(path.join(ROOT, 'public', u))) continue;
    missing.push(`${p} -> ${u}`);
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('sitemap lists exactly the indexable pages', () => {
  const xml = site.render('/sitemap-main.xml').body;
  const inMap = new Set([...xml.matchAll(/<loc>https:\/\/biorals\.test([^<]*)<\/loc>/g)].map((m) => m[1]));
  const indexable = new Set(pages.filter((p) => !/noindex/.test(meta(html[p], /<meta name="robots" content="([^"]*)"/)) && meta(html[p], /<link rel="canonical" href="([^"]*)"/) === 'https://biorals.test' + p));
  assert.deepEqual([...inMap].sort(), [...indexable].sort());
  assert.match(site.render('/sitemap.xml').body, /sitemap-main\.xml/);
});

test('robots.txt blocks the admin and points to the sitemap', () => {
  const r = site.render('/robots.txt').body;
  assert.match(r, /Disallow: \/admin\//); assert.match(r, /Sitemap: https:\/\/biorals\.test\/sitemap\.xml/);
});

test('sample offers are clearly labelled and hidden when SHOW_DEMO=false', () => {
  assert.match(html['/coupons/nike/'], /Sample/i);
  const live = createSite({ ...SEED, redirects: [] }, { siteUrl: 'https://biorals.test', showDemo: false });
  assert.doesNotMatch(live.render('/coupons/nike/').body, /Sample: /);
});

test('forms and widgets point at the Cloudflare endpoints (no Netlify leftovers)', () => {
  assert.match(html['/submit-coupon/'], /action="\/api\/submit-coupon"/);
  assert.match(html['/contact/'], /action="\/api\/form"/);
  assert.match(html['/'], /action="\/api\/form"/);
  for (const p of pages) assert.doesNotMatch(html[p], /netlify/i, p);
  assert.match(html['/'], /\/api\/chat/);
});

test('search index and bot knowledge are generated', () => {
  const s = JSON.parse(site.render('/search.json').body); assert.ok(s.length >= 20 && s[0].n && s[0].u);
  const k = site.botKnowledge(); assert.ok(k.stores.length >= 20 && k.site.url === 'https://biorals.test');
});

test('generated store logos are served for stores without an uploaded logo', () => {
  const r = site.render('/img/stores/nike-coupons.svg'); assert.equal(r.status, 200); assert.match(r.type, /svg/);
  assert.equal(site.render('/img/stores/does-not-exist-coupons.svg'), null);
});

test('rendering one page is fast even with ~600 stores and ~900 offers', () => {
  const stores = Array.from({ length: 600 }, (_, i) => ({ slug: 's' + i, name: 'Store ' + String(i).padStart(3, '0'), domain: `s${i}.example`, category: SEED.categories[i % SEED.categories.length].slug, markets: ['US', 'UK'], status: 'published', description: 'A store. '.repeat(20), tips: ['Tip one', 'Tip two'], body: 'Body text. '.repeat(100) }));
  const coupons = Array.from({ length: 900 }, (_, i) => ({ id: 'c' + i, storeSlug: 's' + (i % 600), title: 'Offer ' + i, type: 'code', code: 'CODE' + i, discount: '10% off', description: 'Desc', status: 'published', markets: ['US'], verified: true, verifiedAt: '2026-10-30', terms: 'Terms', tags: [] }));
  const data = { ...SEED, stores, coupons, redirects: [] };
  const t0 = performance.now();
  const big = createSite(data, { siteUrl: 'https://biorals.test' });
  const tCreate = performance.now() - t0;
  const t1 = performance.now(); big.render('/coupons/s42/'); const tStore = performance.now() - t1;
  const t2 = performance.now(); big.render('/'); const tHome = performance.now() - t2;
  const t3 = performance.now(); big.render('/stores/'); const tAz = performance.now() - t3;
  const t4 = performance.now(); big.render('/sitemap-main.xml'); const tMap = performance.now() - t4;
  console.log(`# perf (600 stores, 900 offers): createSite ${tCreate.toFixed(1)} ms, store page ${tStore.toFixed(1)} ms, home ${tHome.toFixed(1)} ms, A-Z ${tAz.toFixed(1)} ms, sitemap ${tMap.toFixed(1)} ms`);
  assert.ok(tCreate + tStore < 400, 'cold render too slow');
  assert.equal(big.sitemapEntries().length > 600, true);
});

test('public/admin/seed.json matches src/seed.js (the admin "Import starter data" source)', () => {
  const adminSeed = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/admin/seed.json'), 'utf8'));
  assert.deepEqual(adminSeed, JSON.parse(JSON.stringify(SEED)));
});
