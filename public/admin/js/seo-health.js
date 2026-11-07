// Read-only SEO and coupon data-quality checks for the authenticated CMS.
// This module intentionally flags suspicious records for a human; it never rewrites factual data.
const TOKEN_KEY = 'cb_cms_token';
const API = '/api/cms';
const collections = ['stores', 'coupons', 'categories', 'posts', 'pages', 'collections'];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const words = (value) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/[#*_`~\[\]()>|]/g, ' ').toLowerCase().match(/[\p{L}\p{N}%]+/gu) || [];
const normalized = (value) => words(value).join(' ').replace(/\s+/g, ' ').trim();
const pct = (value) => [...String(value ?? '').matchAll(/(?:\b(\d{1,3})\s*%|%\s*(\d{1,3})\b)/g)].map((m) => Number(m[1] || m[2])).filter((n) => n > 0 && n <= 100);
const published = (item) => (item.status || 'published') === 'published';
const contentFields = {
  stores: ['description', 'body', 'seoTitle', 'seoDescription', 'faqs'],
  coupons: ['title', 'description', 'terms'],
  categories: ['description', 'seoTitle', 'seoDescription'],
  posts: ['title', 'excerpt', 'body', 'seoTitle', 'seoDescription', 'faqs'],
  pages: ['title', 'body', 'seoTitle', 'seoDescription'],
  collections: ['name', 'intro', 'body', 'seoTitle', 'seoDescription'],
};
function textOf(value) {
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(textOf).join(' ');
  return String(value ?? '');
}
function shingles(text) {
  const tokens = normalized(text).split(' ').filter(Boolean);
  const out = new Set();
  if (!tokens.length) return out;
  if (tokens.length < 4) return new Set([tokens.join(' ')]);
  for (let i = 0; i <= tokens.length - 4; i++) out.add(tokens.slice(i, i + 4).join(' '));
  return out;
}
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap++;
  return overlap / (a.size + b.size - overlap);
}
function identity(col, item) {
  return item.name || item.title || item.slug || item.id || col;
}
function canonicalPath(item, col) {
  if (col === 'stores') return `/coupons/${item.slug}/`;
  if (col === 'categories') return `/categories/${item.slug}-coupons/`;
  if (col === 'posts') return `/guides/${item.slug}/`;
  if (col === 'collections') return `/deals/${item.slug}/`;
  if (col === 'pages') return `/${item.slug}/`;
  return '';
}

export function auditContent(data, storeOnly = '') {
  const issues = [];
  const add = (severity, collection, item, issue, recommendation, field = '') => issues.push({
    severity, collection, id: item.id || item.slug || item.name || item.title,
    label: identity(collection, item), url: canonicalPath(item, collection), issue, recommendation, field,
  });
  const stores = new Map((data.stores || []).map((s) => [s.slug, s]));
  const selected = (col, item) => !storeOnly || (col === 'stores' ? item.slug === storeOnly : col === 'coupons' ? item.storeSlug === storeOnly : true);

  // Compare only like fields within the same content type to avoid false positives between unrelated formats.
  for (const col of Object.keys(contentFields)) {
    const records = (data[col] || []).filter(published).filter((item) => selected(col, item));
    for (const field of contentFields[col]) {
      const exact = new Map();
      const candidates = [];
      for (const item of records) {
        const raw = textOf(item[field]);
        const text = normalized(raw);
        if (!text) {
          if (['description', 'body', 'intro', 'title', 'name'].includes(field)) add('warning', col, item, `Empty ${field}`, 'Review the source record; do not generate factual copy without verified information.', field);
          continue;
        }
        if (text.length < 30) continue;
        const key = `${col}:${field}:${text}`;
        if (exact.has(key)) {
          add('high', col, item, `Exact duplicate ${field} (also used by ${identity(col, exact.get(key))})`, 'Manually verify both records. Replace duplicated copy only with brand-verified information.', field);
        } else exact.set(key, item);
        if (text.length >= 100) candidates.push({ item, text, tokens: shingles(text), field });
      }
      // Cap comparisons per field to prevent quadratic work on large CMS catalogs. Exact duplicates are always checked.
      const sample = candidates.length > 1200 ? candidates.filter((_, i) => i % Math.ceil(candidates.length / 1200) === 0) : candidates;
      for (let i = 0; i < sample.length; i++) {
        for (let j = i + 1; j < sample.length; j++) {
          const a = sample[i], b = sample[j];
          if (a.item.id === b.item.id || a.item.slug === b.item.slug) continue;
          const score = similarity(a.tokens, b.tokens);
          if (score >= 0.82 && a.text !== b.text) {
            add('warning', col, b.item, `Near-duplicate ${field} (${Math.round(score * 100)}% similarity to ${identity(col, a.item)})`, 'Compare the records and retain only accurate, independently sourced details.', field);
          }
        }
      }
    }
  }

  // Coupon consistency checks are warnings only: percentages and expiry data are never invented or changed.
  for (const coupon of (data.coupons || []).filter(published).filter((c) => selected('coupons', c))) {
    const store = stores.get(coupon.storeSlug);
    if (!store) add('high', 'coupons', coupon, 'Coupon references a missing store', 'Select the correct existing store before publishing.', 'storeSlug');
    if (coupon.type === 'code' && !String(coupon.code || '').trim()) add('high', 'coupons', coupon, 'Code-type coupon has no code', 'Verify the offer source and enter the actual code, or change the offer type.', 'code');
    if (coupon.type === 'deal' && String(coupon.code || '').trim()) add('warning', 'coupons', coupon, 'Deal-type coupon contains a code', 'Confirm whether this should be a code offer or a code-free deal.', 'type');
    const claims = [...new Set([...pct(coupon.title), ...pct(coupon.discount), ...pct(coupon.description)])];
    if (claims.length > 1) add('high', 'coupons', coupon, `Conflicting percentage claims: ${claims.map((n) => `${n}%`).join(', ')}`, 'Check the original merchant terms and make the title, discount label, and description consistent.', 'title');
    if (coupon.expires && !/^\d{4}-\d{2}-\d{2}$/.test(coupon.expires)) add('warning', 'coupons', coupon, 'Expiry date is not a valid YYYY-MM-DD date', 'Verify the expiry date against the offer source.', 'expires');
    if (coupon.expires && /^\d{4}-\d{2}-\d{2}$/.test(coupon.expires) && Number.isNaN(Date.parse(`${coupon.expires}T00:00:00Z`))) add('warning', 'coupons', coupon, 'Expiry date is invalid', 'Verify the expiry date against the offer source.', 'expires');
    if (coupon.verified && !coupon.verifiedAt) add('warning', 'coupons', coupon, 'Marked verified but has no verification date', 'Add the real check date only after the offer has been checked.', 'verifiedAt');
    if (coupon.verifiedAt && !coupon.verified) add('warning', 'coupons', coupon, 'Verification date exists but offer is not marked verified', 'Confirm the offer status and verification history.', 'verified');
    const regionList = coupon.markets || [];
    if (!Array.isArray(regionList) || regionList.some((m) => !['US', 'UK', 'CA', 'EU'].includes(m))) add('warning', 'coupons', coupon, 'Unknown or malformed region value', 'Confirm the offer’s eligible region from its terms.', 'markets');
    if (store && coupon.title && store.name && /\b(?:promo code|coupon code)\b/i.test(coupon.title) && coupon.title.toLowerCase().includes(store.name.toLowerCase()) === false) {
      // A store name may be omitted from a perfectly valid offer title. This is informational, not an error.
      add('info', 'coupons', coupon, `Offer title does not mention linked store ${store.name}`, 'Check that the coupon is attached to the intended brand; no automatic rename is applied.', 'storeSlug');
    }
  }

  // Duplicate page metadata and bad canonical overrides are reported independently of body duplicates.
  for (const col of ['stores', 'categories', 'posts', 'pages', 'collections']) {
    const seenTitle = new Map(), seenDesc = new Map();
    for (const item of (data[col] || []).filter(published).filter((x) => selected(col, x))) {
      for (const [field, seen] of [['seoTitle', seenTitle], ['seoDescription', seenDesc]]) {
        const value = normalized(item[field]);
        if (!value) {
          if (field === 'seoDescription') add('warning', col, item, 'Missing custom SEO description (runtime fallback may still render)', 'Review the generated page description; add a unique one when adequate verified context exists.', field);
        } else if (seen.has(value)) add('high', col, item, `Duplicate ${field} (also used by ${identity(col, seen.get(value))})`, 'Write unique, accurate metadata based on this page’s verified content.', field);
        else seen.set(value, item);
      }
      if (item.canonicalUrl) {
        let canonical;
        try { canonical = new URL(item.canonicalUrl); } catch { canonical = null; }
        const expected = canonicalPath(item, col);
        if (!canonical || canonical.protocol !== 'https:' || canonical.hostname !== 'couponbuz.pro' || canonical.search || canonical.hash || canonical.pathname !== expected) {
          add('high', col, item, 'Canonical override is non-preferred, parameterized, or not self-referencing', `Review the canonical manually. Expected self URL: https://couponbuz.pro${expected}`, 'canonicalUrl');
        }
      }
    }
  }
  return issues;
}

async function cmsList(col) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Admin session missing. Sign in, then reload the SEO Health section.');
  const response = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ op: 'list', col }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `CMS request failed (${response.status})`);
  return result.items || [];
}
function toCsv(rows) {
  const cols = ['severity', 'collection', 'id', 'label', 'url', 'issue', 'recommendation', 'field'];
  const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((row) => cols.map((key) => quote(row[key])).join(','))].join('\r\n');
}
function renderDashboard(host, state) {
  const { data, issues, error, selectedStore } = state;
  const stores = data?.stores || [];
  const counts = { scanned: collections.reduce((sum, col) => sum + (data?.[col]?.length || 0), 0), canonical: issues.filter((x) => /canonical/i.test(x.issue)).length, duplicates: issues.filter((x) => /duplicate/i.test(x.issue)).length, coupon: issues.filter((x) => x.collection === 'coupons').length, missing: issues.filter((x) => /empty|missing/i.test(x.issue)).length };
  const severityColor = (s) => s === 'high' ? '#b42318' : s === 'warning' ? '#b54708' : '#475467';
  host.innerHTML = `<section class="panel"><div class="top"><h1>SEO &amp; Content Health</h1><div class="topr"><button class="btn" data-scan>Scan all content</button> <button class="btn sec" data-export ${issues.length ? '' : 'disabled'}>Export CSV</button></div></div>
    <p>Checks published CMS records for duplicate copy and metadata, canonical overrides, and coupon-data inconsistencies. No factual fields are changed automatically.</p>
    <label for="seo-store">Scan individual store and its coupons:</label> <select id="seo-store" class="s"><option value="">All stores</option>${stores.map((s) => `<option value="${esc(s.slug)}" ${s.slug === selectedStore ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select> <button class="btn sec" data-one>Scan selected store</button>
    ${error ? `<p role="alert" style="color:#b42318">${esc(error)}</p>` : ''}
    <div class="grid"><div class="stat"><b>${counts.scanned}</b>CMS records scanned</div><div class="stat"><b>${counts.canonical}</b>Canonical warnings</div><div class="stat"><b>${counts.duplicates}</b>Duplicate-content findings</div><div class="stat"><b>${counts.missing}</b>Missing/empty fields</div><div class="stat"><b>${counts.coupon}</b>Coupon validation warnings</div></div>
    <h2>Findings (${issues.length})</h2>${issues.length ? `<div class="panel flush"><table><thead><tr><th>Severity</th><th>Record</th><th>Issue</th><th>Recommended review</th></tr></thead><tbody>${issues.map((row) => `<tr><td style="color:${severityColor(row.severity)}"><b>${esc(row.severity)}</b></td><td>${esc(row.collection)} · ${esc(row.label)}${row.url ? `<br><small>${esc(row.url)}</small>` : ''}</td><td>${esc(row.issue)}</td><td>${esc(row.recommendation)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No findings in the last scan. This does not certify external URLs or production HTTP status.'}</section>`;
  host.querySelector('[data-scan]')?.addEventListener('click', () => scan(host, state, ''));
  host.querySelector('[data-one]')?.addEventListener('click', () => scan(host, state, host.querySelector('#seo-store').value));
  host.querySelector('[data-export]')?.addEventListener('click', () => {
    const blob = new Blob([toCsv(issues)], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `couponbuz-seo-audit-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
}
async function scan(host, state, selectedStore) {
  state.error = ''; state.selectedStore = selectedStore;
  host.innerHTML = '<section class="panel"><h1>SEO &amp; Content Health</h1><p>Scanning CMS records…</p></section>';
  try {
    const entries = await Promise.all(collections.map(async (col) => [col, await cmsList(col)]));
    state.data = Object.fromEntries(entries);
    state.issues = auditContent(state.data, selectedStore);
  } catch (error) { state.error = error.message || 'Audit failed.'; state.data ||= Object.fromEntries(collections.map((col) => [col, []])); state.issues ||= []; }
  renderDashboard(host, state);
}
function install() {
  const sidebar = document.querySelector('.side');
  if (!sidebar || sidebar.querySelector('[data-seo-health]')) return;
  const link = document.createElement('a'); link.href = '#seo-health'; link.dataset.seoHealth = 'true'; link.innerHTML = '<span>🧪</span>SEO &amp; Content Health';
  sidebar.insertBefore(link, sidebar.querySelector('.out'));
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    const main = document.querySelector('.main'); if (!main) return;
    const host = document.createElement('div'); host.id = 'seo-health-root'; main.replaceChildren(host);
    const state = { data: null, issues: [], error: '', selectedStore: '' };
    await scan(host, state, '');
  });
}
new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
install();
