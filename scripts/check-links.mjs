#!/usr/bin/env node
// Checks every store link on a live site and writes a CSV report.
//
//   node scripts/check-links.mjs https://biorals.com
//   node scripts/check-links.mjs https://biorals.com --limit 50 --concurrency 6 --out link-report.csv
//
// It reads the sitemap, opens each /coupons/ page, collects the "Go to store" link and every offer link,
// then checks each distinct URL once. Needs Node 20+ and internet access (run it on your own computer).
import { writeFileSync } from 'node:fs';

const [, , base = 'https://biorals.com', ...flags] = process.argv;
const arg = (name, fallback) => { const i = flags.indexOf(name); return i >= 0 ? flags[i + 1] : fallback; };
const LIMIT = Number(arg('--limit', 1e9));
const CONC = Number(arg('--concurrency', 6));
const OUT = arg('--out', 'link-report.csv');
const UA = 'Mozilla/5.0 (compatible; StoreLinkCheck/1.0; site owner audit)';
const root = base.replace(/\/$/, '');

const getText = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

function storeLinks(html) {
  const urls = new Set();
  const go = html.match(/href="([^"]+)" target="_blank" rel="sponsored nofollow noopener">Go to/);
  if (go) urls.add(go[1].replace(/&amp;/g, '&'));
  const js = html.match(/<script type="application\/json" id="offers-json">([\s\S]*?)<\/script>/);
  if (js) { try { for (const o of Object.values(JSON.parse(js[1]))) if (o.u) urls.add(o.u); } catch { /* ignore */ } }
  return [...urls];
}

async function checkUrl(url) {
  const attempt = async (method) => {
    const r = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    return { status: r.status, finalUrl: r.url };
  };
  let res;
  try {
    res = await attempt('HEAD');
    if ([403, 405, 501].includes(res.status)) res = await attempt('GET');
  } catch (e) {
    try { res = await attempt('GET'); } catch (e2) { return { url, status: 0, klass: /timeout|abort/i.test(String(e2)) ? 'timeout' : 'unreachable', finalUrl: '' }; }
  }
  const { status, finalUrl } = res;
  let klass = 'ok';
  if ([401, 403, 429, 999].includes(status)) klass = 'blocked-by-site (check by hand)';
  else if (status === 404 || status === 410 || status >= 500) klass = 'broken';
  else if (status >= 400) klass = 'error';
  else {
    try { if (new URL(finalUrl).hostname.replace(/^www\./, '') !== new URL(url).hostname.replace(/^www\./, '')) klass = 'redirects-to-other-domain'; } catch { /* ignore */ }
  }
  return { url, status, klass, finalUrl };
}

const sitemapIndex = await getText(`${root}/sitemap.xml`);
const mainUrl = locs(sitemapIndex).find((u) => /sitemap-main\.xml/.test(u)) || `${root}/sitemap-main.xml`;
const storePages = locs(await getText(mainUrl)).filter((u) => /\/coupons\/[^/]+\/$/.test(u)).slice(0, LIMIT);
console.log(`Found ${storePages.length} store pages. Collecting links...`);

const linkToStores = new Map();
await pool(storePages, CONC, async (page) => {
  try {
    for (const u of storeLinks(await getText(page))) (linkToStores.get(u) || linkToStores.set(u, []).get(u)).push(page);
  } catch (e) { console.warn(`Could not read ${page}: ${e.message}`); }
});

const urls = [...linkToStores.keys()];
console.log(`Checking ${urls.length} distinct links...`);
let done = 0;
const results = await pool(urls, CONC, async (u) => {
  const r = await checkUrl(u);
  if (++done % 50 === 0) console.log(`  ${done}/${urls.length}`);
  return r;
});

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const rows = [['url', 'status', 'result', 'final_url', 'pages_using_it', 'example_page'].join(',')];
for (const r of results) {
  const pages = linkToStores.get(r.url);
  rows.push([q(r.url), r.status, q(r.klass), q(r.finalUrl), pages.length, q(pages[0])].join(','));
}
writeFileSync(OUT, rows.join('\n') + '\n');

const tally = {};
for (const r of results) tally[r.klass] = (tally[r.klass] || 0) + 1;
console.log('\nResult summary:', tally);
console.log(`Report written to ${OUT}. Fix or remove everything marked broken, unreachable or timeout first.`);
