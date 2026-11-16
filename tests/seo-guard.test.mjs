import test from 'node:test';
import assert from 'node:assert/strict';
import { createSite } from '../src/site.js';
import { sanitizeData, guardSite, softenClaims, cleanDescription } from '../src/seo-guard.js';

const BOILER = '## Complete Acme Store Guide & Money-Saving Tips\n\nGeneric text.';
const today = new Date().toISOString().slice(0, 10);

const data = () => ({
  categories: [{ slug: 'fashion', name: 'Fashion', description: 'Fashion deals', status: 'published' }],
  stores: [
    { slug: 'acme', name: 'Acme', domain: 'acme.com', category: 'fashion', markets: ['US', 'DE', 'RU'], description: 'Acme shop.', body: BOILER, ogTitle: 'Different OG title', status: 'published' },
    { slug: 'ikearthgrdfth', name: 'IKEAfgdfgd', domain: 'ikea.example', category: 'fashion', markets: ['US'], description: 'junk', status: 'published' },
  ],
  coupons: [
    { id: 'a1', storeSlug: 'acme', type: 'code', code: 'SAVE20', discount: '20% Off', title: '20% Off Acme', markets: ['US'], status: 'published', verified: true, verifiedAt: '2026-11-01' },
    { id: 'a2', storeSlug: 'acme', type: 'code', code: 'save20', discount: '20% off', title: '20% Off Acme', markets: ['US'], status: 'published' },
    { id: 'j1', storeSlug: 'ikearthgrdfth', type: 'code', code: 'X1', discount: '5% Off', title: 'x', markets: ['US'], status: 'published' },
  ],
  redirects: [],
});

const build = (env = {}) => guardSite(createSite(sanitizeData(data(), env), { siteUrl: 'https://x.test', showDemo: true }), env);

test('sanitizeData removes duplicate offers, hidden stores and regions a store has no offers for', () => {
  const d = sanitizeData(data(), {});
  assert.equal(d.coupons.length, 1);
  assert.equal(d.stores.length, 1);
  assert.deepEqual(d.stores[0].markets, ['US']);
});

test('templated store with fewer than 3 offers is noindexed and left out of the sitemap', () => {
  const g = build();
  assert.match(g.render('/coupons/acme/').body, /<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(g.render('/sitemap-main.xml').body, /\/coupons\/acme\//);
});

test('regions without offers are noindexed and not in the sitemap; regions with offers stay', () => {
  const g = build();
  assert.match(g.render('/promo-codes/russia/').body, /noindex, follow/);
  const sm = g.render('/sitemap-main.xml').body;
  assert.doesNotMatch(sm, /\/promo-codes\/russia\//);
  assert.match(sm, /\/promo-codes\/us\//);
  assert.doesNotMatch(g.render('/promo-codes/us/').body, /noindex, follow/);
});

test('sitemap no longer reports today as lastmod', () => {
  const sm = build().render('/sitemap-main.xml').body;
  assert.doesNotMatch(sm, new RegExp(`<lastmod>${today}</lastmod>`));
});

test('og and twitter tags match the real title and description', () => {
  const html = build().render('/coupons/acme/').body;
  const title = html.match(/<title>([^<]*)<\/title>/)[1];
  assert.equal(html.match(/<meta property="og:title" content="([^"]*)"/)[1], title);
  assert.equal(html.match(/<meta name="twitter:title" content="([^"]*)"/)[1], title);
  const desc = html.match(/<meta name="description" content="([^"]*)"/)[1];
  assert.equal(html.match(/<meta property="og:description" content="([^"]*)"/)[1], desc);
});

test('unprovable claims are softened and can be switched off', () => {
  const src = '<p>Hand-verified daily so you never encounter dead codes.</p><p>Join over 25,000 smart shoppers receiving weekly coupon drops and secret flash sale alerts.</p>';
  const out = softenClaims(src);
  assert.doesNotMatch(out, /Hand-verified daily|25,000/);
  assert.match(out, /checked/i);
});

test('cleanDescription trims an ellipsis back to a whole sentence', () => {
  const d = 'Save with coupon codes for top stores today. We list 1499 stores, 15667 live…';
  assert.equal(cleanDescription(d), 'Save with coupon codes for top stores today.');
  assert.equal(cleanDescription('Already fine.'), 'Already fine.');
});
