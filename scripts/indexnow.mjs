#!/usr/bin/env node
// Tells IndexNow search engines (Bing, Yandex and others) about your sitemap URLs.
// Google does not use IndexNow: submit the sitemap in Search Console for Google.
//
// Setup (once):
//   1. Make a key: 8-128 letters/digits, e.g. run:  node -e "console.log(crypto.randomUUID().replaceAll('-',''))"
//   2. Create public/<key>.txt containing only the key, deploy it, and check https://biorals.com/<key>.txt opens.
// Run:
//   INDEXNOW_KEY=<key> node scripts/indexnow.mjs https://biorals.com
import { argv, env } from 'node:process';

const base = (argv[2] || 'https://biorals.com').replace(/\/$/, '');
const key = env.INDEXNOW_KEY;
if (!key) { console.error('Set INDEXNOW_KEY first (see the comments at the top of this file).'); process.exit(1); }
const host = new URL(base).host;

const text = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.text(); };
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));

const index = locs(await text(`${base}/sitemap.xml`));
const maps = index.filter((u) => u.endsWith('.xml') && !/images/.test(u));
let urls = [];
for (const m of maps.length ? maps : [`${base}/sitemap.xml`]) urls.push(...locs(await text(m)).filter((u) => !u.endsWith('.xml')));
urls = [...new Set(urls)].filter((u) => new URL(u).host === host);
console.log(`Submitting ${urls.length} URLs`);

for (let i = 0; i < urls.length; i += 10000) {
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: `${base}/${key}.txt`, urlList: urls.slice(i, i + 10000) }),
  });
  console.log(`Batch ${i / 10000 + 1}: HTTP ${r.status} (200/202 = received, not indexed; 403 = key file not found; 422 = bad URLs)`);
}
