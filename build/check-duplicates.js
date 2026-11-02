// Duplicate-content check: finds sentences that repeat across pages and reports pages with low unique text.
// Run after build:  npm run build && npm run check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'admin' && e.name !== 'assets' && e.name !== 'img') walk(p); } else if (e.name.endsWith('.html')) files.push(p); } })(DIST);

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const pages = {};
const seen = new Map();
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const m = html.match(/<main[^>]*>([\s\S]*?)<\/main>/); if (!m) continue;
  if (/name="robots" content="noindex/.test(html)) continue; // noindex pages cannot cause duplicate issues
  const text = m[1].replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
  const sents = text.split(/(?<=[.!?])\s+/).map(norm).filter((s) => s.split(' ').length >= 8);
  const rel = '/' + path.relative(DIST, f).replace(/index\.html$/, '').replace(/\\/g, '/');
  pages[rel] = [...new Set(sents)];
  for (const s of pages[rel]) { if (!seen.has(s)) seen.set(s, new Set()); seen.get(s).add(rel); }
}

let warn = 0;
console.log('Duplicate-content report\n------------------------');
for (const [p, sents] of Object.entries(pages)) {
  if (!sents.length) continue;
  const dup = sents.filter((s) => seen.get(s).size > 1);
  const unique = 1 - dup.length / sents.length;
  if (unique < 0.6) { warn++; console.log(`⚠ ${p}  ${Math.round(unique * 100)}% unique (${dup.length}/${sents.length} sentences repeat elsewhere)`); }
}
const shared = [...seen.entries()].filter(([, v]) => v.size >= 4).sort((a, b) => b[1].size - a[1].size).slice(0, 8);
if (shared.length) { console.log('\nMost repeated sentences (consider rewording or removing):'); for (const [s, v] of shared) console.log(`  ×${v.size}  ${s.slice(0, 110)}…`); }
console.log(warn ? `\n${warn} page(s) below 60% unique text. Add original descriptions and tips for those stores in the CMS.` : '\n✓ All indexable pages have at least 60% unique text.');
