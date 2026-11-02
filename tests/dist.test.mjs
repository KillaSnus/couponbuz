// Build the site into a temp folder and check what a crawler would see (no JavaScript).
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://example.test';
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-dist-'));

const build = spawnSync(process.execPath, ['build/build.js'], { cwd: ROOT, env: { ...process.env, DIST_DIR: OUT, SITE_URL: SITE, FIREBASE_PROJECT_ID: '' }, encoding: 'utf8' });

// ---- collect pages ----
const pages = []; // { urlPath, html, indexable }
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'admin' && e.name !== 'assets' && e.name !== 'img') walk(p); }
    else if (e.name.endsWith('.html')) {
      const rel = path.relative(OUT, p).replace(/\\/g, '/');
      const urlPath = rel === 'index.html' ? '/' : rel.endsWith('/index.html') ? '/' + rel.slice(0, -'index.html'.length) : '/' + rel;
      const html = fs.readFileSync(p, 'utf8');
      pages.push({ urlPath, html, indexable: !/<meta name="robots" content="noindex/.test(html) });
    }
  }
})(OUT);
const indexable = pages.filter((p) => p.indexable);
const one = (html, re) => (html.match(re) || [])[1];
const titleOf = (h) => (one(h, /<title>([^<]*)<\/title>/) || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
const descOf = (h) => one(h, /<meta name="description" content="([^"]*)"/);
const exists = (u) => {
  const clean = u.split('#')[0].split('?')[0];
  if (clean.startsWith('/.netlify/')) return true;
  const f = path.join(OUT, clean);
  if (clean.endsWith('/')) return fs.existsSync(path.join(f, 'index.html'));
  return fs.existsSync(f) || fs.existsSync(f + '.html') || fs.existsSync(path.join(f, 'index.html'));
};

test('build completes without error', () => { assert.equal(build.status, 0, build.stderr || build.stdout); });

test('critical routes exist', () => {
  for (const r of ['/', '/stores/', '/categories/', '/promo-codes/', '/promo-codes/us/', '/promo-codes/uk/', '/promo-codes/canada/', '/promo-codes/europe/', '/deals/', '/guides/', '/about/', '/contact/', '/privacy/', '/terms/', '/how-we-verify/', '/how-we-make-money/', '/coupons/nike/', '/categories/fashion-coupons/', '/guides/how-to-tell-if-a-promo-code-will-work/', '/404.html', '/robots.txt', '/sitemap.xml', '/sitemap-main.xml', '/admin/index.html']) assert.ok(exists(r), `missing ${r}`);
});

test('every page has the SEO basics in raw HTML', () => {
  const bad = [];
  for (const p of pages) {
    const h = p.html, why = [];
    if (!/<html lang="[a-z-]+"/.test(h)) why.push('no lang');
    if (!/<meta name="viewport"/.test(h)) why.push('no viewport');
    if ((h.match(/<h1[ >]/g) || []).length !== 1) why.push(`h1 count ${(h.match(/<h1[ >]/g) || []).length}`);
    const canon = one(h, /<link rel="canonical" href="([^"]*)"/);
    if (!canon) why.push('no canonical'); else if (!/^https:\/\//.test(canon)) why.push('canonical not absolute https');
    else if (p.indexable && canon !== SITE + p.urlPath) why.push(`canonical ${canon} != ${SITE + p.urlPath}`);
    if (!one(h, /<meta property="og:title" content="([^"]+)"/)) why.push('no og:title');
    for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch { why.push('invalid JSON-LD'); } }
    const ids = [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]); const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    if (dup.length) why.push('duplicate id ' + [...new Set(dup)].join(','));
    for (const m of h.matchAll(/<img\b[^>]*>/g)) if (!/ alt=/.test(m[0])) why.push('img without alt');
    if (why.length) bad.push(`${p.urlPath}: ${why.join('; ')}`);
  }
  assert.deepEqual(bad, []);
});

test('titles are 10-60 characters and descriptions 50-160 on indexable pages', () => {
  const bad = [];
  for (const p of indexable) {
    const t = titleOf(p.html), d = descOf(p.html) || '';
    if (t.length < 10 || t.length > 60) bad.push(`${p.urlPath}: title ${t.length} "${t}"`);
    if (d.length < 50 || d.length > 160) bad.push(`${p.urlPath}: description ${d.length}`);
  }
  assert.deepEqual(bad, []);
});

test('indexable pages have unique titles and unique descriptions', () => {
  for (const [name, fn] of [['title', titleOf], ['description', descOf]]) {
    const seen = {}; const dups = [];
    for (const p of indexable) { const v = fn(p.html); (seen[v] ||= []).push(p.urlPath); }
    for (const [v, u] of Object.entries(seen)) if (u.length > 1) dups.push(`${name} "${v.slice(0, 50)}" on ${u.join(', ')}`);
    assert.deepEqual(dups, [], `duplicate ${name}s`);
  }
});

test('no broken internal links or assets', () => {
  const bad = new Set();
  for (const p of pages) for (const m of p.html.matchAll(/(?:href|src)="(\/[^"/][^"]*|\/)"/g)) if (!exists(m[1])) bad.add(`${p.urlPath} -> ${m[1]}`);
  assert.deepEqual([...bad], []);
});

test('sitemap lists exactly the indexable pages', () => {
  const xml = fs.readFileSync(path.join(OUT, 'sitemap-main.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, ''));
  const have = new Set(locs), want = new Set(indexable.map((p) => p.urlPath));
  assert.deepEqual(locs.filter((l) => !want.has(l)), [], 'in sitemap but not indexable/existing');
  assert.deepEqual([...want].filter((w) => !have.has(w) && w !== '/404.html'), [], 'indexable but missing from sitemap');
  for (const f of ['sitemap.xml']) for (const m of fs.readFileSync(path.join(OUT, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) assert.ok(exists(m[1].replace(SITE, '')), `sitemap index points to missing ${m[1]}`);
  assert.ok(!locs.some((l) => l.startsWith('/admin') || l.startsWith('/search')));
});

test('robots.txt blocks admin and points to the sitemap', () => {
  const r = fs.readFileSync(path.join(OUT, 'robots.txt'), 'utf8');
  assert.match(r, /Disallow: \/admin\//); assert.match(r, new RegExp(`Sitemap: ${SITE}/sitemap.xml`));
  assert.match(fs.readFileSync(path.join(OUT, 'admin/index.html'), 'utf8'), /noindex/);
  assert.match(fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8'), /X-Robots-Tag = "noindex, nofollow"/);
});

test('no indexable page is an orphan', () => {
  const linked = new Set();
  for (const p of pages) for (const m of p.html.matchAll(/href="(\/[^"#?]*)"/g)) if (m[1] !== p.urlPath) linked.add(m[1]);
  assert.deepEqual(indexable.filter((p) => p.urlPath !== '/' && !linked.has(p.urlPath)).map((p) => p.urlPath), []);
});

test('sample offers are always labelled and never reach the bot as real codes', () => {
  const k = JSON.parse(fs.readFileSync(path.join(OUT, 'bot-knowledge.json'), 'utf8'));
  for (const s of k.stores) for (const o of s.offers) if (o.sample) assert.equal(o.code, '', `${s.name} sample code leaked to bot`);
  assert.match(fs.readFileSync(path.join(OUT, 'coupons/nike/index.html'), 'utf8'), /Sample listing/);
});
