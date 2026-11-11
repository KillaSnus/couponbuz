import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCmsData } from './lib/cms-source.js';
import { md, esc, stripTags, truncate } from './lib/md.js';
import {
  configure, layout, breadcrumbs, breadcrumbSchema, offerCard, offerPayload, storeTile, postCard,
  faqBlock, faqSchema, newsletterForm, storeUrl, catUrl, regionUrl, dealUrl, postUrl, storeLogo,
  monthYear, monShort, fmtDate, REGIONS, jsonLd,
} from './lib/templates.js';
import { renderSection } from './lib/sections.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, 'dist');
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);

const write = (rel, content) => { const f = path.join(DIST, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
const copyDir = (src, dst) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) { const s = path.join(src, e.name), d = path.join(dst, e.name); e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d); }
};
const byName = (a, b) => String(a.name).localeCompare(String(b.name));
const published = (x) => (x.status || 'published') === 'published';
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const deepMerge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = isObj(v) && isObj(a?.[k]) ? deepMerge(a[k], v) : v; return o; };
const jsonSafe = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

// ---------- data ----------
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seed.json'), 'utf8'));
const SETTING_IDS = ['site', 'theme', 'nav', 'home', 'seo', 'code', 'bot'];
async function loadData() {
  const src = (process.env.CMS_URL || process.env.URL || '').replace(/\/$/, '');
  if (!src) { console.log('• No site URL (URL / CMS_URL): building from data/seed.json'); return { ...seed, redirects: [] }; }
  console.log(`• Loading CMS content from ${src}/api/cms`);
  const data = await fetchCmsData(src);
  if (!data) { console.log('• CMS not deployed yet (first deploy): using data/seed.json'); return { ...seed, redirects: [] }; }
  if (!data.stores.length && !data.categories.length) { console.log('• CMS is empty: using data/seed.json (use Dashboard > Import starter data in /admin/)'); return { ...seed, redirects: [] }; }
  return data;
}
const data = await loadData();
const set = {};
for (const id of SETTING_IDS) set[id] = deepMerge(seed.settings[id] || {}, (data.settings || {})[id] || {});
// arrays from the CMS replace seed arrays entirely
if ((data.settings || {}).nav?.header) set.nav.header = data.settings.nav.header;
if ((data.settings || {}).nav?.footer) set.nav.footer = data.settings.nav.footer;
if ((data.settings || {}).home?.sections) set.home.sections = data.settings.home.sections;
if ((data.settings || {}).bot?.faqs) set.bot.faqs = data.settings.bot.faqs;
set.site.url = (process.env.SITE_URL || set.site.url || '').replace(/\/$/, '');

// ---------- collections ----------
const cats = (data.categories || []).filter(published).sort(byName);
const catBy = Object.fromEntries(cats.map((c) => [c.slug, c]));
const storesAll = (data.stores || []).filter(published).sort(byName);
const storeBy = Object.fromEntries(storesAll.map((s) => [s.slug, s]));
const posts = (data.posts || []).filter(published).filter((p) => !p.date || p.date <= TODAY).sort((a, b) => String(b.date).localeCompare(String(a.date)));
const pages = (data.pages || []).filter(published);
const collections = (data.collections || []).filter(published).sort(byName);
const showDemo = process.env.SHOW_DEMO !== 'false';
const coupons = (data.coupons || []).filter(published).filter((c) => storeBy[c.storeSlug]).filter((c) => !c.expires || c.expires >= TODAY).filter((c) => showDemo || !c.demo)
  .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || String(b.verifiedAt || '').localeCompare(String(a.verifiedAt || '')));
const couponsOf = (slug) => coupons.filter((c) => c.storeSlug === slug);

const botPublic = {
  name: set.bot.name, greeting: set.bot.greeting, color: set.bot.color || set.theme.primary, contactEmail: set.bot.contactEmail,
  quickReplies: set.bot.quickReplies || [], faqs: (set.bot.faqs || []).map((f) => ({ q: f.q, a: f.a, k: f.k || '' })), endpoint: '/.netlify/functions/chat',
};
configure({ site: set.site, theme: set.theme, nav: set.nav, seo: set.seo, code: set.code, stores: storesAll, categories: cats, botEnabled: set.bot.enabled !== false, botPublic }, NOW);

// ---------- output ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
copyDir(path.join(ROOT, 'public'), DIST);
copyDir(path.join(ROOT, 'admin'), path.join(DIST, 'admin'));
fs.copyFileSync(path.join(ROOT, 'data/seed.json'), path.join(DIST, 'admin/seed.json'));

function hueOf(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
const storeSvg = (name) => { const h = hueOf(name); const ini = name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${esc(name)} logo"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 72% 50%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360} 72% 38%)"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#g)"/><text x="32" y="41" text-anchor="middle" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="24" font-weight="700" fill="#fff">${esc(ini)}</text></svg>`; };
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Biorals"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${esc(set.theme.primary)}"/><stop offset="1" stop-color="${esc(set.theme.primaryDark)}"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#a)"/><path d="M22 14h12c7 0 11 3.6 11 9 0 3.6-1.8 6.2-4.8 7.5C44.2 32 47 35 47 39.8 47 46 42.4 50 35 50H22z M29 20v8h4.5c2.8 0 4.3-1.5 4.3-4s-1.5-4-4.3-4zm0 14v9h5.5c3 0 4.8-1.700 4.8-4.5S37.5 34 34.5 34z" fill="#fff" fill-rule="evenodd"/><circle cx="48" cy="17" r="4" fill="${esc(set.theme.accent)}"/></svg>`;
write('img/logo.svg', LOGO); write('img/favicon.svg', LOGO);
for (const s of storesAll) if (!s.logo) write(`img/stores/${s.slug}-coupons.svg`, storeSvg(s.name));

const siteUrl = set.site.url;
const sm = []; // sitemap entries {p, lastmod, images}
const addPage = (p, html, { index = true, lastmod = TODAY, images = [] } = {}) => {
  write(p === '/' ? 'index.html' : p.replace(/^\//, '') + 'index.html', html);
  if (index) sm.push({ p, lastmod, images });
};
const lm = (o) => (o && String(o.updatedAt || '').slice(0, 10)) || TODAY;
const orgSchema = { '@context': 'https://schema.org', '@type': 'Organization', name: set.site.siteName, url: siteUrl, logo: siteUrl + '/img/logo.svg', ...(set.seo.sameAs?.length ? { sameAs: set.seo.sameAs } : {}) };
const offersJson = (list) => `<script type="application/json" id="offers-json">${jsonSafe(Object.fromEntries(list.map((c) => [c.id, offerPayload(c, storeBy[c.storeSlug])])))}</script>`;
const storeGrid = (list) => `<div class="tile-grid">${list.map((s) => storeTile(s, couponsOf(s.slug).length)).join('')}</div>`;
const stackHtml = (list, ctx) => `<div class="stack">${list.map((c) => offerCard(c, storeBy[c.storeSlug], ctx)).join('')}</div>`;
const pageHead = (h1, lead, extra = '') => `<section class="wrap page-head"><h1>${esc(h1)}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}${extra}</section>`;
const crumbSchema = breadcrumbSchema;
// Per-page SEO overrides set in the CMS: social title/description/image, canonical URL, noindex, extra head code.
const hasCanon = (o) => /^https?:\/\/\S+$/.test((o && o.canonicalUrl) || '');
const seoX = (o = {}) => ({ noindex: o.noindex === true, canonical: hasCanon(o) ? o.canonicalUrl : '', ogTitle: o.ogTitle || '', ogDescription: o.ogDescription || '', ogImage: o.ogImage || '', headExtra: o.customHead || '' });
// A page belongs in the sitemap only if it is indexable, not hidden by the editor, and not canonicalised elsewhere.
const listable = (o, base = true) => base && o.noindex !== true && !hasCanon(o);

// ----- Home -----
{
  const x = { site: set.site, stores: storesAll, coupons, cats, posts, collections, storeBy, couponsOf, logo: storeLogo };
  let body = '', schema = [orgSchema, { '@context': 'https://schema.org', '@type': 'WebSite', name: set.site.siteName, url: siteUrl, potentialAction: { '@type': 'SearchAction', target: `${siteUrl}/search/?q={search_term_string}`, 'query-input': 'required name=search_term_string' } }];
  for (const sec of set.home.sections || []) { if (sec.enabled === false) continue; const r = renderSection(sec, x); body += r.html; schema.push(...r.schema); }
  const hero = (set.home.sections || []).find((s) => s.type === 'hero') || {};
  addPage('/', layout({
    title: `${set.site.siteName}: Promo Codes & Coupons for US, UK, Canada & Europe`, titleFull: true,
    description: `${hero.subtitle || set.site.tagline} ${storesAll.length} stores, ${coupons.length} live offers, updated ${monthYear()}.`,
    path: '/', schema, body: body + offersJson(coupons.filter((c) => c.featured)),
  }));
}

// ----- Stores A-Z -----
{
  const groups = {};
  for (const s of storesAll) (groups[/^[A-Za-z]/.test(s.name) ? s.name[0].toUpperCase() : '#'] ||= []).push(s);
  const letters = Object.keys(groups).sort();
  const crumbs = [['Home', '/'], ['Stores', '/stores/']];
  const body = `${breadcrumbs(crumbs)}${pageHead('All stores A–Z', `Browse ${storesAll.length} stores alphabetically and open a store page to see its current promo codes and deals.`, `<p class="az">${letters.map((l) => `<a href="#l-${l}">${l}</a>`).join('')}</p>`)}
<section class="wrap block">${letters.map((l) => `<h2 id="l-${l}" class="letter">${l}</h2>${storeGrid(groups[l])}`).join('')}</section>`;
  addPage('/stores/', layout({ title: 'All Stores A–Z: Promo Codes & Coupons', description: `Browse ${storesAll.length} stores alphabetically and find current promo codes and deals for the US, UK, Canada and Europe.`, path: '/stores/', body, schema: [crumbSchema(crumbs)] }));
}

// ----- Store pages -----
const imagesForSitemap = [];
for (const s of storesAll) {
  const list = couponsOf(s.slug);
  const cat = catBy[s.category];
  const codeCount = list.filter((c) => c.type === 'code' && c.code).length;
  const verified = list.filter((c) => c.verifiedAt).map((c) => c.verifiedAt).sort().pop();
  const related = storesAll.filter((x) => x.category === s.category && x.slug !== s.slug).slice(0, 6);
  const crumbs = [['Home', '/'], ...(cat ? [[cat.name, catUrl(cat)]] : []), [s.name, storeUrl(s)]];
  const mk = (s.markets || []).map((m) => (REGIONS[m] || {}).name || m);
  const faqs = [
    [`Does ${s.name} have a promo code right now?`, list.length ? `We currently list ${list.length} ${s.name} offer${list.length > 1 ? 's' : ''}, ${codeCount} of which use a code. ${verified ? `The most recent check was on ${fmtDate(verified)}.` : 'Each offer shows its own terms.'}` : `We have no active ${s.name} offers listed at the moment. This page is updated when new offers are added.`],
    [`What should I know before using a ${s.name} offer?`, (s.tips || []).join(' ') || 'Read the terms on each offer for exclusions, minimum spend and regional limits.'],
    [`Which countries does this ${s.name} page cover?`, mk.length ? `Offers here are marked for ${mk.join(', ')}. Each offer shows its own region badges, so confirm yours before you shop.` : 'Each offer shows region badges. Confirm yours before you shop.'],
    ...((s.faqs || []).filter((f) => f.q && f.a).map((f) => [f.q, f.a])),
  ];
  const tabs = `<div class="filters" data-filters><div class="tabs" role="tablist"><button class="on" data-f="all">All <i>${list.length}</i></button><button data-f="code">Codes <i>${codeCount}</i></button><button data-f="deal">Deals <i>${list.length - codeCount}</i></button></div>${(s.markets || []).length > 1 ? `<div class="regions" aria-label="Region"><button class="on" data-m="">All regions</button>${s.markets.map((m) => `<button data-m="${m}">${m}</button>`).join('')}</div>` : ''}</div>`;
  const body = `${breadcrumbs(crumbs)}
<section class="wrap store-hero">
  <img src="${esc(storeLogo(s))}" alt="${esc(s.logoAlt || s.name + ' logo')}" width="88" height="88">
  <div><h1>${esc(s.name)} Promo Codes & Coupons (${esc(monthYear())})</h1>
  <p class="lead">${esc(s.description)}</p>
  <div class="o-meta"><span class="pill">${list.length} offer${list.length === 1 ? '' : 's'}</span>${verified ? `<span class="pill ok">Last checked ${esc(fmtDate(verified))}</span>` : ''}${regionPillsHtml(s.markets)}</div></div>
</section>
<section class="wrap layout2">
  <div>
    ${list.length ? tabs : ''}
    <div class="stack" data-list>${list.length ? list.map((c) => offerCard(c, s, 'store')).join('') : `<div class="empty"><strong>No active offers right now</strong><p>We have nothing to list for ${esc(s.name)} yet. See other stores in ${esc(cat ? cat.name : 'this category')} below.</p></div>`}</div>
    <div class="empty" data-none hidden><strong>No offers match this filter</strong></div>
    <h2>About ${esc(s.name)}</h2>
    <p>${esc(s.description)}</p>
    ${s.body ? `<div class="prose">${md(s.body)}</div>` : ''}
    ${(s.tips || []).length ? `<h2>Savings tips for ${esc(s.name)}</h2><ul class="ticks">${s.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    <h2>${esc(s.name)} offers: frequently asked questions</h2>
    ${faqBlock(faqs)}
    <p class="fine">${esc(set.site.disclosure)} Offers can change or end at any time.</p>
  </div>
  <aside>
    <div class="card"><h3>Shop at ${esc(s.name)}</h3><a class="btn accent full" href="${esc(s.affiliateUrl || 'https://' + s.domain)}" target="_blank" rel="sponsored nofollow noopener">Go to ${esc(s.domain)}</a></div>
    <div class="card"><h3>Quick facts</h3><dl class="facts"><dt>Category</dt><dd>${cat ? `<a href="${catUrl(cat)}">${esc(cat.name)}</a>` : '—'}</dd><dt>Regions</dt><dd>${esc(mk.join(', ') || '—')}</dd><dt>Live offers</dt><dd>${list.length}</dd>${verified ? `<dt>Last checked</dt><dd>${esc(fmtDate(verified))}</dd>` : ''}</dl></div>
    ${related.length ? `<div class="card"><h3>Similar stores</h3><ul class="plain">${related.map((r) => `<li><a href="${storeUrl(r)}"><img src="${esc(storeLogo(r))}" alt="" width="24" height="24" loading="lazy"> ${esc(r.name)}</a></li>`).join('')}</ul></div>` : ''}
  </aside>
</section>${offersJson(list)}`;
  const title = s.seoTitle || (list.length ? `${s.name} Promo Codes: ${list.length} Offer${list.length > 1 ? 's' : ''} (${monShort()})` : `${s.name} Promo Codes & Savings Tips`);
  const desc = s.seoDescription || `${list.length ? `${list.length} ${s.name} offer${list.length > 1 ? 's' : ''} for ${(s.markets || []).join(', ')}, checked ${verified ? fmtDate(verified) : monShort()}.` : `${s.name} savings tips and offers.`} ${s.description}`;
  const indexable = list.length > 0 || set.seo.noindexThin === false;
  addPage(storeUrl(s), layout({
    title, description: desc, path: storeUrl(s), body, ...seoX(s), noindex: !indexable || s.noindex === true,
    schema: [crumbSchema(crumbs), faqSchema(faqs), { '@context': 'https://schema.org', '@type': 'WebPage', name: title, about: { '@type': 'Brand', name: s.name, url: 'https://' + s.domain }, mainEntity: { '@type': 'ItemList', itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title })) } }],
  }), { index: listable(s, indexable), lastmod: lm(s), images: [{ loc: /^https?:/.test(storeLogo(s)) ? storeLogo(s) : siteUrl + storeLogo(s), title: `${s.name} logo` }] });
}
function regionPillsHtml(m) { return (m || []).map((x) => `<span class="rp">${esc(x)}</span>`).join(''); }

// ----- Categories -----
{
  const crumbs = [['Home', '/'], ['Categories', '/categories/']];
  addPage('/categories/', layout({ title: 'Coupon Categories: Browse Promo Codes by Type', description: 'Browse promo codes and deals by category: fashion, electronics, software, travel, food delivery, beauty and more.', path: '/categories/', schema: [crumbSchema(crumbs)],
    body: `${breadcrumbs(crumbs)}${pageHead('Shop by category', 'Pick a category to see stores and current offers.')}<section class="wrap block"><div class="cat-grid big">${cats.map((c) => `<a class="cat" href="${catUrl(c)}"><span class="ico">${esc(c.icon || '🏷️')}</span><div><strong>${esc(c.name)}</strong><small>${storesAll.filter((s) => s.category === c.slug).length} stores</small></div></a>`).join('')}</div></section>` }));
}
for (const c of cats) {
  const list = storesAll.filter((s) => s.category === c.slug);
  const offers = coupons.filter((o) => storeBy[o.storeSlug].category === c.slug).slice(0, 8);
  const crumbs = [['Home', '/'], ['Categories', '/categories/'], [c.name, catUrl(c)]];
  const body = `${breadcrumbs(crumbs)}${pageHead(`${c.name} Coupons & Promo Codes`, c.description)}
<section class="wrap block">${offers.length ? `<h2>Top ${esc(c.name)} offers</h2>${stackHtml(offers, 'home')}` : ''}<h2>${esc(c.name)} stores</h2>${list.length ? storeGrid(list) : '<p>No stores in this category yet.</p>'}</section>${offersJson(offers)}`;
  addPage(catUrl(c), layout({ title: c.seoTitle || `${c.name} Coupons & Promo Codes (${monShort()})`, description: c.seoDescription || truncate(c.description, 155), path: catUrl(c), body, ...seoX(c), noindex: !list.length || c.noindex === true, schema: [crumbSchema(crumbs)] }), { index: listable(c, list.length > 0), lastmod: lm(c) });
}

// ----- Regions -----
const REGION_TEXT = {
  US: 'Prices on US stores are usually shown before sales tax, which is added at checkout and varies by state. Free-shipping thresholds are common, so compare the final total rather than the headline discount.',
  UK: 'UK retailers usually show prices including VAT, and many call promo codes "voucher codes" or "discount codes". Check delivery charges and click-and-collect options, which can change the real saving.',
  CA: 'Canadian stores often price in Canadian dollars and add GST or provincial tax at checkout. When buying from a US store, check duties and cross-border shipping before applying a code.',
  EU: 'European shoppers often have country-specific shops with their own prices and sales, so use the shop that matches your delivery address. Prices normally include VAT, and EU distance-selling rules give you a right to withdraw from most online purchases.',
};
{
  const crumbs = [['Home', '/'], ['Regions', '/promo-codes/']];
  addPage('/promo-codes/', layout({ title: 'Promo Codes by Country: US, UK, Canada & Europe', description: 'Find promo codes and coupons for your country. Offers are tagged for the United States, United Kingdom, Canada and Europe.', path: '/promo-codes/', schema: [crumbSchema(crumbs)],
    body: `${breadcrumbs(crumbs)}${pageHead('Promo codes by country', 'Many codes only work in one country. Pick yours to see offers tagged for your region.')}<section class="wrap block"><div class="region-grid">${Object.entries(REGIONS).map(([k, r]) => `<a class="region" href="${regionUrl(k)}"><strong>${esc(r.name)}</strong><span>${storesAll.filter((s) => (s.markets || []).includes(k)).length} stores</span></a>`).join('')}</div></section>` }));
  for (const [k, r] of Object.entries(REGIONS)) {
    const list = storesAll.filter((s) => (s.markets || []).includes(k));
    const offers = coupons.filter((o) => (o.markets || []).includes(k)).slice(0, 8);
    const cr = [['Home', '/'], ['Regions', '/promo-codes/'], [r.name, regionUrl(k)]];
    const body = `${breadcrumbs(cr)}${pageHead(`${r.name} Promo Codes & Coupons`, `Offers and stores tagged for ${r.name}. Updated ${monthYear()}.`)}
<section class="wrap block">${offers.length ? `<h2>Latest ${esc(r.short)} offers</h2>${stackHtml(offers, 'home')}` : ''}<h2>Stores with ${esc(r.name)} offers</h2>${storeGrid(list)}<h2>Shopping tips for ${esc(r.name)}</h2><p>${esc(REGION_TEXT[k])}</p></section>${offersJson(offers)}`;
    addPage(regionUrl(k), layout({ title: `${r.name} Promo Codes & Coupons (${monShort()})`, description: `Promo codes and coupons for ${r.name}: ${list.length} stores and ${offers.length} live offers, with region-specific shopping tips.`, path: regionUrl(k), body, schema: [crumbSchema(cr)] }));
  }
}

// ----- Seasonal collections -----
{
  const crumbs = [['Home', '/'], ['Deals', '/deals/']];
  addPage('/deals/', layout({ title: 'Seasonal Deals & Sales Events', description: 'Seasonal deal hubs: Black Friday, Christmas and more, with stores that usually run the biggest sales.', path: '/deals/', schema: [crumbSchema(crumbs)],
    body: `${breadcrumbs(crumbs)}${pageHead('Seasonal deals', 'Plan ahead for the biggest sales of the year.')}<section class="wrap block"><div class="coll-grid">${collections.map((d) => `<a class="coll" href="${dealUrl(d)}"><strong>${esc(d.name)}</strong><span>${esc(d.intro || '')}</span></a>`).join('')}</div></section>` }), { index: collections.length > 0 });
  for (const d of collections) {
    const st = (d.stores || []).map((s) => storeBy[s]).filter(Boolean);
    const offers = coupons.filter((o) => (d.stores || []).includes(o.storeSlug)).slice(0, 10);
    const cr = [['Home', '/'], ['Deals', '/deals/'], [d.name, dealUrl(d)]];
    const body = `${breadcrumbs(cr)}${pageHead(`${d.name} Deals & Promo Codes ${NOW.getFullYear()}`, d.intro)}
<section class="wrap block">${offers.length ? `<h2>${esc(d.name)} offers</h2>${stackHtml(offers, 'home')}` : ''}<h2>Stores to watch</h2>${storeGrid(st)}${d.body ? `<div class="prose">${md(d.body)}</div>` : ''}</section>${offersJson(offers)}`;
    addPage(dealUrl(d), layout({ title: d.seoTitle || `${d.name} Deals & Promo Codes ${NOW.getFullYear()}`, description: d.seoDescription || truncate(d.intro, 155), path: dealUrl(d), body, ...seoX(d), schema: [crumbSchema(cr)] }), { index: listable(d), lastmod: lm(d) });
  }
}

// ----- Guides -----
{
  const crumbs = [['Home', '/'], ['Guides', '/guides/']];
  addPage('/guides/', layout({ title: 'Saving Guides & Shopping Tips', description: 'Practical guides on using promo codes, preparing for sales and avoiding common checkout problems.', path: '/guides/', schema: [crumbSchema(crumbs)],
    body: `${breadcrumbs(crumbs)}${pageHead('Saving guides', 'Practical advice on promo codes, sales and getting more for your money.')}<section class="wrap block"><div class="post-grid">${posts.map(postCard).join('')}</div></section>` }));
  for (const p of posts) {
    const cr = [['Home', '/'], ['Guides', '/guides/'], [p.title, postUrl(p)]];
    const related = posts.filter((x) => x.slug !== p.slug).slice(0, 2);
    const body = `${breadcrumbs(cr)}<article class="wrap page narrow"><h1>${esc(p.title)}</h1><p class="muted">By ${esc(p.author || set.site.siteName)} · <time datetime="${esc(p.date)}">${esc(fmtDate(p.date))}</time></p>${p.image ? `<img class="hero-img" src="${esc(p.image)}" alt="${esc(p.imageAlt || p.title)}" width="1200" height="630">` : ''}<div class="prose">${md(p.body)}</div><p class="fine">${esc(set.site.disclosure)}</p></article>${related.length ? `<section class="wrap block"><h2>More guides</h2><div class="post-grid">${related.map(postCard).join('')}</div></section>` : ''}`;
    addPage(postUrl(p), layout({ title: p.seoTitle || p.title, description: p.seoDescription || p.excerpt, path: postUrl(p), body, ...seoX(p), type: 'article', ogImage: p.ogImage || p.image,
      schema: [crumbSchema(cr), { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, datePublished: p.date, dateModified: lm(p) !== TODAY ? lm(p) : p.date, author: { '@type': 'Organization', name: p.author || set.site.siteName }, publisher: orgSchema, mainEntityOfPage: siteUrl + postUrl(p), ...(p.image ? { image: p.image } : {}) }] }),
      { index: listable(p), lastmod: p.date || lm(p), images: p.image ? [{ loc: /^https?:/.test(p.image) ? p.image : siteUrl + p.image, title: p.imageAlt || p.title }] : [] });
  }
}

// ----- Static pages -----
for (const pg of pages) {
  const url = `/${pg.slug}/`, cr = [['Home', '/'], [pg.title, url]];
  const form = pg.slug === 'contact' ? `<form class="contact" name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field" data-nl><input type="hidden" name="form-name" value="contact"><p hidden><label>Do not fill: <input name="bot-field"></label></p><label>Name<input name="name" required></label><label>Email<input type="email" name="email" required></label><label>Message<textarea name="message" rows="5" required></textarea></label><button class="btn accent" type="submit">Send message</button><p class="nl-msg" role="status" hidden>Thanks! We will get back to you soon.</p></form>` : '';
  const body = `${breadcrumbs(cr)}<article class="wrap page narrow"><h1>${esc(pg.title)}</h1><div class="prose">${md(pg.body)}</div>${form}</article>`;
  addPage(url, layout({ title: pg.seoTitle || pg.title, description: pg.seoDescription || truncate(stripTags(md(pg.body)), 155), path: url, body, ...seoX(pg), schema: [crumbSchema(cr)] }), { index: listable(pg), lastmod: lm(pg) });
}

// ----- Submit a coupon: posts to a Netlify Function; submissions wait in the CMS for a person to review -----
{
  const url = '/submit-coupon/', cr = [['Home', '/'], ['Submit a coupon', url]];
  const f = (id, label, input) => `<div class="fld"><label for="${id}">${label}</label>${input}</div>`;
  const body = `${breadcrumbs(cr)}<article class="wrap page narrow"><h1>Submit a coupon or deal</h1><p class="lead">Found a working code? Send it to us. A person checks every submission before anything is published, and we may edit or decline it.</p>
<form class="contact" id="submit-form" action="/.netlify/functions/submit-coupon" method="POST" data-submit novalidate>
  <p class="trap" aria-hidden="true"><label>Leave this empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></p>
  <input type="hidden" name="ts" value="">
  ${f('sc-store', 'Store name *', '<input id="sc-store" name="store" required maxlength="80">')}
  ${f('sc-title', 'Offer title *', '<input id="sc-title" name="title" required minlength="5" maxlength="120" placeholder="e.g. 15% off your first order">')}
  ${f('sc-code', 'Promo code (leave empty for a deal without a code)', '<input id="sc-code" name="code" maxlength="40" autocapitalize="characters">')}
  ${f('sc-url', 'Link to the offer (optional)', '<input id="sc-url" name="url" type="url" maxlength="300" placeholder="https://">')}
  ${f('sc-desc', 'Details or restrictions (optional)', '<textarea id="sc-desc" name="description" rows="4" maxlength="500"></textarea>')}
  <fieldset><legend>Where does it work?</legend>${['US', 'UK', 'CA', 'EU'].map((m) => `<label><input type="checkbox" name="markets" value="${m}"> ${m}</label>`).join(' ')}</fieldset>
  ${f('sc-exp', 'Expiry date (optional)', '<input id="sc-exp" name="expires" type="date">')}
  ${f('sc-mail', 'Your email (optional, only used if we need to ask a question)', '<input id="sc-mail" name="email" type="email" maxlength="120" autocomplete="email">')}
  <label class="check"><input type="checkbox" name="consent" value="yes" required> I checked this offer and I am allowed to share it.</label>
  <button class="btn accent" type="submit">Send for review</button>
  <p class="nl-msg" role="status" aria-live="polite" hidden></p>
</form><p class="fine">We store your submission so we can review it. See the <a href="/privacy/">privacy policy</a>.</p></article>`;
  addPage(url, layout({ title: 'Submit a Coupon or Deal', description: 'Share a working promo code or deal with Biorals. Every submission is reviewed by a person before it is published.', path: url, body, noindex: true, schema: [crumbSchema(cr)] }), { index: false });
}

// ----- Search + 404 -----
write('search/index.html', layout({ title: 'Search Stores', description: 'Search stores and promo codes on ' + set.site.siteName + ' to find a working discount.', path: '/search/', noindex: true,
  body: `${breadcrumbs([['Home', '/'], ['Search', '/search/']])}${pageHead('Search results')}<section class="wrap block"><form class="hero-search dark" action="/search/" role="search"><input type="search" name="q" placeholder="Search stores" aria-label="Search stores" data-q><button class="btn accent" type="submit">Search</button></form><div class="tile-grid" data-results></div><p class="muted" data-empty hidden>No stores match your search. Try a shorter name or browse <a href="/categories/">categories</a>.</p></section>` }));
write('404.html', layout({ title: 'Page not found', description: 'This page could not be found.', path: '/404.html', noindex: true, body: `<section class="wrap page narrow"><h1>Page not found</h1><p class="lead">The page you are looking for does not exist or has moved.</p><p><a class="btn accent" href="/">Back to home</a> <a class="btn ghost" href="/stores/">Browse stores</a></p></section>` }));

// ----- data files, sitemaps, robots, redirects -----
write('search.json', JSON.stringify(storesAll.map((s) => ({ n: s.name, s: s.slug, d: s.domain, c: (catBy[s.category] || {}).name || '', o: couponsOf(s.slug).length, l: storeLogo(s), u: storeUrl(s) }))));
write('bot-knowledge.json', JSON.stringify({
  site: { name: set.site.siteName, url: siteUrl, email: set.bot.contactEmail || set.site.email, disclosure: set.site.disclosure },
  regions: Object.values(REGIONS).map((r) => r.name),
  stores: storesAll.map((s) => ({ name: s.name, url: storeUrl(s), category: (catBy[s.category] || {}).name, markets: s.markets, description: s.description, offers: couponsOf(s.slug).map((c) => ({ title: c.title, discount: c.discount, type: c.type, code: c.demo ? '' : c.code, expires: c.expires, terms: c.terms, sample: !!c.demo })) })),
  faqs: (set.bot.faqs || []).map((f) => ({ q: f.q, a: f.a })), instructions: set.bot.instructions || '',
}));
const loc = (p) => esc(siteUrl + p);
write('sitemap-main.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sm.map((e) => `  <url><loc>${loc(e.p)}</loc><lastmod>${e.lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`);
const imgEntries = sm.filter((e) => e.images.length);
if (imgEntries.length) write('sitemap-images.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${imgEntries.map((e) => `  <url><loc>${loc(e.p)}</loc>${e.images.map((i) => `<image:image><image:loc>${esc(i.loc)}</image:loc><image:title>${esc(i.title)}</image:title></image:image>`).join('')}</url>`).join('\n')}\n</urlset>\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${loc('/sitemap-main.xml')}</loc><lastmod>${TODAY}</lastmod></sitemap>${imgEntries.length ? `\n  <sitemap><loc>${loc('/sitemap-images.xml')}</loc><lastmod>${TODAY}</lastmod></sitemap>` : ''}\n</sitemapindex>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /search/\n${set.seo.robotsExtra ? set.seo.robotsExtra + '\n' : ''}\nSitemap: ${siteUrl}/sitemap.xml\n`);
const redirects = (data.redirects || []).filter((r) => r.active !== false && /^\/\S*$/.test(r.from || '') && /^(\/\S*|https?:\/\/\S+)$/.test(r.to || '')).map((r) => `${r.from} ${r.to} ${r.code === '302' || r.code === 302 ? 302 : 301}`);
write('_redirects', redirects.join('\n') + (redirects.length ? '\n' : ''));

console.log(`✓ Built ${sm.length} indexable pages (${storesAll.length} stores, ${coupons.length} offers, ${posts.length} guides, ${redirects.length} redirects) → ${path.relative(ROOT, DIST) || '.'}`);
