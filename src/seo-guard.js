// Runtime SEO and trust guards. They run on top of the CMS data, so they take effect without editing every record.
//
// Optional Cloudflare environment variables:
//   HIDDEN_STORE_SLUGS   comma-separated store slugs to hide completely (the junk store is hidden by default)
//   MIN_DISTINCT_OFFERS  stores with templated content and fewer distinct offers than this are noindexed (default 3)
//   VERIFIED_CLAIMS      set to "true" ONLY if you really verify every offer daily; it switches the claim softening off
import { REGIONS, regionUrl, storeUrl } from './lib/templates.js';

// INTERIM: this store has a malformed name ("IKEAfgdfgd"). It is hidden until the intended merchant is confirmed from
// reliable source data and the CMS record is corrected. Do not leave it hidden forever: fix the record, then remove this entry.
export const DEFAULT_HIDDEN_SLUGS = ['ikearthgrdfth'];

// The generic "Complete <Store> Store Guide & Money-Saving Tips" block that is copy-pasted across stores.
const BOILERPLATE = /Complete .{1,80}? Store Guide & Money-Saving Tips/;

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const published = (x) => (x.status || 'published') === 'published';


const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };

/** Replaces the copy-pasted store text with a summary built only from this store's own offer data (nothing invented). */
export function storeSummaryHtml(store, offers) {
  if (!offers.length) return '';
  const codes = offers.filter((c) => c.type === 'code' && c.code);
  const deals = offers.length - codes.length;
  const pct = offers.map((c) => Number(String(c.discount || '').match(/(\d{1,3})\s*%/)?.[1] || 0)).filter(Boolean);
  const expiries = offers.map((c) => c.expires).filter((d) => fmt(d)).sort();
  const minSpend = offers.filter((c) => c.minSpend);
  const regions = [...new Set(offers.flatMap((c) => c.markets || []))].map((m) => (REGIONS[m] || {}).name || m);
  const checked = offers.map((c) => c.verifiedAt).filter((d) => fmt(d)).sort().pop();
  const facts = [
    `${offers.length} offer${offers.length === 1 ? '' : 's'} listed: ${codes.length} with a code and ${deals} ${deals === 1 ? 'deal that needs' : 'deals that need'} no code.`,
    pct.length ? `Percentage discounts range from ${Math.min(...pct)}% to ${Math.max(...pct)}%.` : '',
    expiries.length ? `The next listed end date is ${fmt(expiries[0])}; offers without a date have no end date shown.` : 'No end dates are shown for these offers, so they can end without notice.',
    minSpend.length ? `${minSpend.length} of the offers state a minimum spend; check it before you add items to your basket.` : '',
    regions.length ? `Offers are marked for ${regions.join(', ')}.` : '',
    checked ? `The most recent check on this page was on ${fmt(checked)}.` : '',
  ].filter(Boolean);
  return `<h2>${esc(store.name)} offers at a glance</h2><ul class="ticks">${facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
    + `<h2>How to use a ${esc(store.name)} code</h2><ol><li>Choose "Show code" on the offer and copy the code.</li><li>Add items to your basket at ${esc(store.name)} and open the checkout.</li><li>Paste the code in the promo or discount box and apply it.</li><li>Check the total changed. If it did not, read the offer's terms for exclusions, minimum spend or region limits.</li></ol>`;
}

/** Clean the CMS data before the site is built: drop hidden stores, remove duplicate offers, make store regions match their offers. */
export function sanitizeData(data, env = {}) {
  const hidden = new Set([...DEFAULT_HIDDEN_SLUGS, ...String(env.HIDDEN_STORE_SLUGS || '').split(',').map((s) => s.trim()).filter(Boolean)]);
  const stores = (data.stores || []).filter((s) => !hidden.has(s.slug));
  const live = new Set(stores.map((s) => s.slug));

  // Only offers that are identical in EVERY field that makes an offer distinct are treated as duplicates: store, type,
  // title, discount, code, regions, terms, expiry, destination and minimum spend. A same-percentage offer with a different
  // code, region, terms or date is a different offer and is kept. Removed records are listed in `auditLog`, never destroyed:
  // the CMS data in KV is not modified, the guard only hides the repeat at render time.
  const seen = new Map();
  const coupons = [];
  const auditLog = [];
  for (const c of data.coupons || []) {
    if (!live.has(c.storeSlug)) continue;
    if (published(c)) {
      const key = [
        c.storeSlug, norm(c.type), norm(c.title), norm(c.discount), norm(c.code),
        [...(c.markets || [])].map(norm).sort().join(','), norm(c.terms), norm(c.expires), norm(c.url), norm(c.minSpend),
      ].join('|');
      if (seen.has(key)) { auditLog.push({ removed: c.id, keptInstead: seen.get(key), store: c.storeSlug, reason: 'identical in all offer fields' }); continue; }
      seen.set(key, c.id);
    }
    coupons.push(c);
  }

  // A store only claims the regions its own offers are tagged for. Otherwise region pages list stores with no offers there.
  const regionsByStore = {};
  for (const c of coupons) if (published(c)) for (const m of c.markets || []) (regionsByStore[c.storeSlug] ||= new Set()).add(m);
  const cleanStores = stores.map((s) => (regionsByStore[s.slug]?.size ? { ...s, markets: [...regionsByStore[s.slug]] } : s));

  return { ...data, stores: cleanStores, coupons, auditLog };
}

// Claims the site cannot prove are replaced with statements that are true for any listing.
const CLAIM_RULES = [
  [/Hand-verified daily so you never encounter dead codes\.?/gi, 'We check offers regularly and show when each one was last checked.'],
  [/hand-verified daily/gi, 'checked regularly'],
  [/Updated Daily/g, 'Updated regularly'],
  [/Join over [\d,]+ (?:smart )?shoppers receiving weekly coupon drops and secret flash sale alerts\.?/gi, 'Get new coupon and deal alerts by email.'],
  [/Our automated testing systems and editorial team test coupon codes directly at store checkouts daily\. We verify discount application, minimum spend conditions, and expiry dates before marking codes as verified\./g,
    'Each offer shows the date it was last checked. Retailers can end or change offers at any time, so a code may not work for every order.'],
  [/tested and confirmed working today/gi, 'with the date each one was last checked'],
  [/tested and working for/gi, 'listed for'],
  // "Verified" with nothing behind it: say what is true instead. Per-offer "Checked <date>" pills are untouched.
  [/Verified (Promo Codes|Coupons|Discount Codes)/g, '$1'],
  [/\b(find|browse|get) verified (\w+ )?(promo codes|coupon codes|coupons|discount codes)/gi, (m, a, b = '', c) => `${a} ${b}${c}`],
  [/with verified (\w+ )?(promo codes|coupon codes|coupons)/gi, (m, a = '', c) => `with ${a}${c}`],
  [/with our tested offers/gi, 'with the offers we list'],
  [/(\d+) stores\b/g, (m, n) => (n === '1' ? '1 store' : m)],
];
export const softenClaims = (html) => CLAIM_RULES.reduce((h, [re, to]) => h.replace(re, to), html);

/** Descriptions that were cut off with an ellipsis are trimmed back to a whole sentence. */
export function cleanDescription(d) {
  if (!/(…|\.\.\.)$/.test(d)) return d;
  const base = d.replace(/(…|\.\.\.)$/, '').trimEnd();
  const dot = Math.max(base.lastIndexOf('. '), base.lastIndexOf('! '));
  if (dot > 40) return base.slice(0, dot + 1);
  const sp = base.lastIndexOf(' ');
  return (sp > 40 ? base.slice(0, sp) : base).replace(/[,;:\-–]$/, '') + '.';
}

const setMeta = (html, name, value) => html.replace(new RegExp(`(<meta (?:property|name)="${name}" content=")[^"]*(")`), (_, a, b) => `${a}${value}${b}`);

export function guardSite(site, env = {}) {
  const min = Number(env.MIN_DISTINCT_OFFERS ?? 3);
  const verifiedClaims = env.VERIFIED_CLAIMS === 'true';

  const offerCount = {};
  const maxPct = {};
  for (const c of site.coupons) {
    offerCount[c.storeSlug] = (offerCount[c.storeSlug] || 0) + 1;
    const n = Number(String(c.discount || '').match(/(\d{1,3})\s*%/)?.[1] || 0);
    if (n > (maxPct[c.storeSlug] || 0)) maxPct[c.storeSlug] = n;
  }
  const storeBySlug = Object.fromEntries(site.stores.map((x) => [x.slug, x]));
  const regionHasOffers = (k) => site.coupons.some((c) => (c.markets || []).includes(k));
  const regionsLive = Object.keys(REGIONS).filter(regionHasOffers).length;

  // Pages that must not be indexed and must not be in the sitemap.
  const noindex = new Set();
  for (const s of site.stores) {
    const templated = BOILERPLATE.test(String(s.body || '')) && s.uniqueContent !== true;
    if (templated && (offerCount[s.slug] || 0) < min) noindex.add(storeUrl(s));
  }
  for (const k of Object.keys(REGIONS)) if (!regionHasOffers(k)) noindex.add(regionUrl(k));

  const today = new Date().toISOString().slice(0, 10);

  function fixHtml(html, pathname) {
    let out = html;
    if (noindex.has(pathname)) out = out.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, follow">');
    if (!verifiedClaims) out = softenClaims(out);
    out = out.replace(/<b>\d+<\/b><span>Regions covered<\/span>/, () => `<b>${regionsLive}</b><span>Regions covered</span>`);

    const parts = out.split('</head>');
    let head = parts[0];
    let rest = parts.slice(1).join('</head>');

    const dm = head.match(/<meta name="description" content="([^"]*)">/);
    const desc = dm ? cleanDescription(dm[1]) : '';
    if (dm) head = head.replace(dm[0], () => `<meta name="description" content="${desc}">`);

    const store = pathname.match(/^\/coupons\/([^/]+)\/$/);
    if (store && storeBySlug[store[1]]) {
      const st = storeBySlug[store[1]];
      const summary = storeSummaryHtml(st, site.coupons.filter((c) => c.storeSlug === st.slug));
      if (summary) rest = rest.replace(/<div class="prose">[\s\S]*?<\/div>/, (blk) => (BOILERPLATE.test(blk.replace(/&amp;/g, '&')) ? `<div class="prose">${summary}</div>` : blk));
    }
    if (store && maxPct[store[1]]) {
      const max = maxPct[store[1]];
      const cap = (s) => s.replace(/\b(up to |Up to )(\d{1,3})%/g, (x, a, n) => (Number(n) > max ? `${a}${max}%` : x));
      head = cap(head);
      rest = rest.replace(/(<p class="lead">)([\s\S]*?)(<\/p>)/, (x, a, b, c) => a + cap(b) + c);
    }

    // Social tags always match the real title and description.
    const title = head.match(/<title>([^<]*)<\/title>/)?.[1];
    const finalDesc = head.match(/<meta name="description" content="([^"]*)">/)?.[1];
    if (title) for (const n of ['og:title', 'twitter:title']) head = setMeta(head, n, title);
    if (finalDesc) for (const n of ['og:description', 'twitter:description']) head = setMeta(head, n, finalDesc);

    return head + '</head>' + rest;
  }

  function fixSitemap(xml) {
    const out = xml.replace(/<url>[\s\S]*?<\/url>/g, (blk) => {
      const loc = blk.match(/<loc>([^<]+)<\/loc>/)?.[1];
      if (!loc) return blk;
      let p;
      try { p = decodeURI(new URL(loc.replace(/&amp;/g, '&')).pathname); } catch { return blk; }
      return noindex.has(p) ? '' : blk;
    });
    // lastmod that is just "today" carries no information, so it is left out instead of being a daily lie.
    return out.replace(new RegExp(`\\s*<lastmod>${today}</lastmod>`, 'g'), '');
  }

  function render(pathname) {
    const r = site.render(pathname);
    if (!r || r.redirect || r.status !== 200 || typeof r.body !== 'string') return r;
    if (String(r.type).startsWith('text/html')) return { ...r, body: fixHtml(r.body, pathname) };
    if (/^\/sitemap(-main|-images)?\.xml$/.test(pathname)) return { ...r, body: fixSitemap(r.body) };
    return r;
  }

  return { ...site, render, noindexPaths: noindex };
}
