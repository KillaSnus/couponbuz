// Unit tests: markdown safety, theme safety, accessibility contrast, seed data integrity, security-rule lint.
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { md } from '../build/lib/md.js';
import { themeCss } from '../build/lib/theme.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const seed = JSON.parse(read('data/seed.json'));

// ---------- markdown / theme safety ----------
test('markdown escapes HTML and refuses javascript: links', () => {
  assert.ok(md('<script>alert(1)</script>').includes('&lt;script&gt;'));
  assert.ok(!/href="javascript:/i.test(md('[x](javascript:alert(1))')));
  // the quote in the alt text must stay escaped inside the attribute value (no new onerror attribute)
  const tag = md('![a" onerror="alert(1)](https://x.test/a.png)').match(/<img[^>]*>/)[0];
  assert.ok(!/\sonerror=/i.test(tag.replace(/"[^"]*"/g, '""')), tag);
});
test('theme CSS rejects values that could inject CSS', () => {
  const css = themeCss({ primary: 'red;}body{display:none', font: 'nope', radius: 9999, darkMode: 'auto' });
  assert.ok(!css.includes('display:none')); assert.ok(css.includes('--radius:28px'));
});

// ---------- accessibility: text contrast of the default theme ----------
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('default theme: white text on primary and accent buttons meets WCAG AA (4.5:1)', () => {
  const t = seed.settings.theme;
  assert.ok(ratio(t.primary, '#ffffff') >= 4.5, `primary ${ratio(t.primary, '#ffffff').toFixed(2)}`);
  assert.ok(ratio(t.accent, '#ffffff') >= 4.5, `accent ${ratio(t.accent, '#ffffff').toFixed(2)}`);
  assert.ok(ratio(t.muted, t.bg) >= 4.5, 'muted text on page background');
});

// ---------- seed data integrity ----------
test('seed data: slugs are URL-safe and unique, references resolve', () => {
  const slugOk = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  for (const col of ['stores', 'categories', 'posts', 'pages', 'collections']) {
    const slugs = seed[col].map((x) => x.slug);
    assert.equal(new Set(slugs).size, slugs.length, `${col}: duplicate slug`);
    for (const s of slugs) assert.match(s, slugOk, `${col}: bad slug ${s}`);
  }
  const stores = new Set(seed.stores.map((s) => s.slug)), cats = new Set(seed.categories.map((c) => c.slug));
  for (const s of seed.stores) assert.ok(cats.has(s.category), `store ${s.slug}: unknown category`);
  for (const c of seed.coupons) assert.ok(stores.has(c.storeSlug), `coupon ${c.id}: unknown store`);
  for (const d of seed.collections) for (const s of d.stores) assert.ok(stores.has(s), `collection ${d.slug}: unknown store ${s}`);
  for (const c of seed.coupons) if (c.code) assert.ok(c.demo, `coupon ${c.id} has a code but is not marked as a sample`);
});

// ---------- security rules lint (static: the Firebase emulator cannot run offline) ----------
test('firestore.rules: writes are admin-only, private collections are not publicly readable', () => {
  const r = read('firestore.rules');
  assert.ok(!/if\s+true/.test(r), 'rules contain "if true"');
  const writes = r.match(/allow\s+(?:read,\s*)?write[^;]*;/g) || [];
  assert.ok(writes.length > 0);
  for (const w of writes) assert.match(w, /isAdmin\(\)/, `write rule not admin-gated: ${w}`);
  const publicRead = (r.match(/allow read: if collection in \[([^\]]*)\]/) || [])[1] || '';
  for (const c of ['activity', 'submissions']) assert.ok(!publicRead.includes(`'${c}'`), `${c} must not be publicly readable`);
  assert.match(r, /request\.auth\.uid in \['ADMIN_UID_HERE'\]/, 'admin check should use the account UID, not the email');
});
test('storage.rules: uploads need the admin, are images and are size-limited', () => {
  const r = read('storage.rules');
  assert.ok(!/allow\s+write:\s*if\s+true/.test(r));
  assert.match(r, /request\.auth\.uid in \['ADMIN_UID_HERE'\]/); assert.match(r, /contentType\.matches\('image\/\.\*'\)/); assert.match(r, /size < /);
});
