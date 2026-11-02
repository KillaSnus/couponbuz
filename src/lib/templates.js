import { esc, truncate } from './md.js';
import { fontLink, themeCss } from './theme.js';

let C = {}; // site config + data, set by configure()
let NOW = new Date();
export function configure(cfg, now = new Date()) { C = cfg; NOW = now; }

// ---------- URL structure (SEO) ----------
export const REGIONS = {
  US: { slug: 'us', name: 'United States', short: 'US' },
  UK: { slug: 'uk', name: 'United Kingdom', short: 'UK' },
  CA: { slug: 'canada', name: 'Canada', short: 'CA' },
  EU: { slug: 'europe', name: 'Europe', short: 'EU' },
};
export const storeUrl = (s) => `/coupons/${s.slug}/`;
export const catUrl = (c) => `/categories/${c.slug}-coupons/`;
export const regionUrl = (r) => `/promo-codes/${REGIONS[r].slug}/`;
export const dealUrl = (d) => `/deals/${d.slug}/`;
export const postUrl = (p) => `/guides/${p.slug}/`;
export const storeLogo = (s) => s.logo || `/img/stores/${s.slug}-coupons.svg`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthYear = () => `${MONTHS[NOW.getMonth()]} ${NOW.getFullYear()}`;
export const monShort = () => `${MONTHS[NOW.getMonth()].slice(0, 3)} ${NOW.getFullYear()}`;
export const fmtDate = (d) => { const x = new Date(d); return isNaN(x) ? '' : `${x.getDate()} ${MONTHS[x.getMonth()].slice(0, 3)} ${x.getFullYear()}`; };
export const daysUntil = (d) => Math.ceil((new Date(d) - NOW) / 86400000);
export const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const abs = (p) => C.site.url + p;

// ---------- layout ----------
export function seoTitle(t) {
  const tpl = C.seo.titleTemplate || '%title% | %site%';
  const full = tpl.replace('%title%', t).replace('%site%', C.site.siteName);
  // Search results cut titles at about 60 characters, and SEO tools flag longer ones. Drop the site-name
  // suffix when it would push the title over the limit.
  return full.length <= 60 ? full : t;
}

export function layout({ title, titleFull = false, description, path, body, schema = [], ogImage, ogTitle, ogDescription, canonical, noindex = false, type = 'website', headExtra = '' }) {
  const url = canonical || abs(path);
  const full = titleFull ? title : seoTitle(title);
  const desc = truncate(description || C.seo.defaultDescription, 160);
  const ogT = ogTitle || full, ogD = truncate(ogDescription || desc, 200);
  const img = ogImage || C.seo.ogImage || '/img/og-default.png';
  const imgAbs = /^https?:/.test(img) ? img : abs(img);
  const T = C.theme, S = C.site, SEO = C.seo;
  const favicon = T.faviconUrl || '/img/favicon.svg';
  return `<!doctype html>
<html lang="en"${T.darkMode === 'dark' ? ' data-theme="dark"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
<meta name="theme-color" content="${esc(T.primary)}">
${SEO.googleVerification ? `<meta name="google-site-verification" content="${esc(SEO.googleVerification)}">` : ''}${SEO.bingVerification ? `<meta name="msvalidate.01" content="${esc(SEO.bingVerification)}">` : ''}
<meta property="og:type" content="${type}"><meta property="og:site_name" content="${esc(S.siteName)}">
<meta property="og:title" content="${esc(ogT)}"><meta property="og:description" content="${esc(ogD)}">
<meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(imgAbs)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(ogT)}"><meta name="twitter:description" content="${esc(ogD)}"><meta name="twitter:image" content="${esc(imgAbs)}">
<link rel="icon" href="${esc(favicon)}">
${fontLink(T.font)}
<style id="theme">${themeCss(T)}</style>
<link rel="stylesheet" href="/assets/style.css">
${C.code.css ? `<style id="custom-css">${C.code.css}</style>` : ''}
${schema.map(jsonLd).join('\n')}
${headExtra}
${C.code.head || ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header()}
<main id="main">
${body}
</main>
${footer()}
<div id="cb-modal" class="modal" hidden></div>
<script>window.__CB=${JSON.stringify({ ga: SEO.gaId || '', gtm: SEO.gtmId || '', openOnReveal: S.openOnReveal !== false })};</script>
${C.botEnabled ? `<script>window.__BOT__=${JSON.stringify(C.botPublic).replace(/</g, '\\u003c')};</script><script src="/assets/chat.js" defer></script>` : ''}
<script src="/assets/site.js" defer></script>
${C.code.bodyEnd || ''}
</body>
</html>`;
}

// ---------- header / nav ----------
const ico = {
  menu: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chev: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l4 4 4-4"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
};
export { ico };

function megaFor(item) {
  if (item.type === 'stores') {
    const list = C.stores.filter((s) => s.featured).slice(0, 10);
    return `<div class="mega"><div class="mega-grid">${list.map((s) => `<a href="${storeUrl(s)}"><img src="${esc(storeLogo(s))}" alt="" width="28" height="28" loading="lazy"><span>${esc(s.name)}</span></a>`).join('')}</div><a class="mega-all" href="${esc(item.url || '/stores/')}">Browse all stores →</a></div>`;
  }
  if (item.type === 'categories') {
    return `<div class="mega"><div class="mega-grid">${C.categories.map((c) => `<a href="${catUrl(c)}"><span class="mi">${esc(c.icon || '🏷️')}</span><span>${esc(c.name)}</span></a>`).join('')}</div><a class="mega-all" href="${esc(item.url || '/categories/')}">All categories →</a></div>`;
  }
  if (item.type === 'regions') {
    return `<div class="mega"><div class="mega-grid">${Object.keys(REGIONS).map((r) => `<a href="${regionUrl(r)}"><span class="mi">🌍</span><span>${REGIONS[r].name}</span></a>`).join('')}</div></div>`;
  }
  if (item.type === 'dropdown' && (item.children || []).length) {
    return `<div class="mega small"><ul>${item.children.map((c) => `<li><a href="${esc(c.url)}">${esc(c.label)}</a></li>`).join('')}</ul></div>`;
  }
  return '';
}

function header() {
  const T = C.theme, A = T.announcement || {};
  const items = C.nav.header || [];
  const logo = T.logoUrl || '/img/logo.svg';
  const desk = items.map((it) => {
    const mega = megaFor(it);
    return mega
      ? `<div class="item"><a class="top" href="${esc(it.url || '#')}">${esc(it.label)}</a><button class="chev" type="button" aria-expanded="false" aria-label="Open ${esc(it.label)} menu">${ico.chev}</button>${mega}</div>`
      : `<div class="item"><a class="top" href="${esc(it.url || '#')}">${esc(it.label)}</a></div>`;
  }).join('');
  const mob = items.map((it) => {
    let links = '';
    if (it.type === 'stores') links = C.stores.filter((s) => s.featured).slice(0, 10).map((s) => `<li><a href="${storeUrl(s)}">${esc(s.name)}</a></li>`).join('');
    else if (it.type === 'categories') links = C.categories.map((c) => `<li><a href="${catUrl(c)}">${esc(c.icon || '')} ${esc(c.name)}</a></li>`).join('');
    else if (it.type === 'regions') links = Object.keys(REGIONS).map((r) => `<li><a href="${regionUrl(r)}">${REGIONS[r].name}</a></li>`).join('');
    else if (it.type === 'dropdown') links = (it.children || []).map((c) => `<li><a href="${esc(c.url)}">${esc(c.label)}</a></li>`).join('');
    return links
      ? `<details><summary>${esc(it.label)}</summary><ul>${links}<li><a class="all" href="${esc(it.url || '#')}">View all →</a></li></ul></details>`
      : `<a class="dlink" href="${esc(it.url || '#')}">${esc(it.label)}</a>`;
  }).join('');
  return `${A.enabled && A.text ? `<div class="announce" style="background:${esc(A.bg || '#101828')}"><a href="${esc(A.link || '#')}">${esc(A.text)}</a></div>` : ''}
<header class="hdr">
  <div class="wrap hdr-bar">
    <button class="icon-btn burger" type="button" aria-label="Open menu" aria-controls="drawer" aria-expanded="false" data-drawer-open>${ico.menu}</button>
    <a class="brand" href="/" aria-label="${esc(C.site.siteName)} home"><img src="${esc(logo)}" alt="" width="34" height="34"><span>${esc(C.site.siteName)}</span></a>
    <nav class="mainnav" aria-label="Main">${desk}</nav>
    <form class="search" action="/search/" role="search" autocomplete="off">${ico.search}<input type="search" name="q" placeholder="Search stores…" aria-label="Search stores" data-search><div class="suggest" data-suggest hidden></div></form>
  </div>
</header>
<div class="scrim" data-drawer-close hidden></div>
<aside class="drawer" id="drawer" aria-label="Menu" hidden>
  <div class="drawer-head"><a class="brand" href="/"><img src="${esc(logo)}" alt="" width="30" height="30"><span>${esc(C.site.siteName)}</span></a><button class="icon-btn" type="button" aria-label="Close menu" data-drawer-close>${ico.close}</button></div>
  <form class="search m" action="/search/" role="search">${ico.search}<input type="search" name="q" placeholder="Search stores…" aria-label="Search stores"></form>
  <nav>${mob}</nav>
</aside>`;
}

function footer() {
  const S = C.site, soc = S.social || {};
  const socials = Object.entries(soc).filter(([, v]) => v).map(([k, v]) => `<a href="${esc(v)}" rel="me noopener" target="_blank">${esc(k[0].toUpperCase() + k.slice(1))}</a>`).join('');
  return `<footer class="ftr">
  <div class="wrap ftr-grid">
    <div class="ftr-about">
      <a class="brand" href="/"><img src="${esc(C.theme.logoUrl || '/img/logo.svg')}" alt="" width="30" height="30"><span>${esc(S.siteName)}</span></a>
      <p>${esc(S.footerAbout || S.tagline)}</p>
      ${socials ? `<p class="soc">${socials}</p>` : ''}
    </div>
    ${(C.nav.footer || []).map((col) => `<div><h3>${esc(col.title)}</h3><ul>${(col.links || []).map((l) => `<li><a href="${esc(l.url)}">${esc(l.label)}</a></li>`).join('')}</ul></div>`).join('')}
  </div>
  <div class="wrap ftr-legal"><p>${esc(S.disclosure)}</p><p>© ${NOW.getFullYear()} ${esc(S.siteName)}. Store names and logos belong to their owners and are used only to identify offers.</p></div>
</footer>`;
}

export function breadcrumbs(items) {
  return `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${items.map(([n, p], i) => `<li>${i < items.length - 1 ? `<a href="${p}">${esc(n)}</a>` : `<span aria-current="page">${esc(n)}</span>`}</li>`).join('')}</ol></nav>`;
}
export function breadcrumbSchema(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: abs(p) })) };
}

// ---------- components ----------
export const regionPills = (m) => (m || []).map((x) => `<span class="rp">${esc(x)}</span>`).join('');

const mask = (code) => { const c = String(code); return c.length <= 3 ? '•••' : '•'.repeat(Math.min(3, c.length - 2)) + c.slice(-2); };

export function offerPayload(c, st) {
  return { id: c.id, t: c.title, c: c.type === 'code' ? c.code || '' : '', u: c.url || st.affiliateUrl || `https://${st.domain}`, s: st.name, l: storeLogo(st), x: c.terms || '', e: c.expires ? fmtDate(c.expires) : '', d: c.discount || '', demo: !!c.demo };
}

export function offerCard(c, st, ctx = 'store') {
  const dest = c.url || st.affiliateUrl || `https://${st.domain}`;
  const hasCode = c.type === 'code' && c.code;
  const left = Math.max(0, c.expires ? daysUntil(c.expires) : 99);
  const pills = [
    c.demo ? '<span class="pill warn">Sample listing</span>' : '',
    c.exclusive ? '<span class="pill hot">Exclusive</span>' : '',
    c.verified && c.verifiedAt ? `<span class="pill ok">${ico.check} Checked <time datetime="${esc(c.verifiedAt)}">${esc(fmtDate(c.verifiedAt))}</time></span>` : '',
    c.expires && left <= 3 ? `<span class="pill hot">Ends ${left <= 0 ? 'today' : 'in ' + left + ' day' + (left > 1 ? 's' : '')}</span>` : c.expires ? `<span class="pill">Ends ${esc(fmtDate(c.expires))}</span>` : '',
    ...(c.tags || []).map((t) => `<span class="pill tag">${esc(t)}</span>`),
  ].filter(Boolean).join('');
  const lead = ctx === 'home'
    ? `<a class="o-logo" href="${storeUrl(st)}" aria-label="${esc(st.name)} offers"><img src="${esc(storeLogo(st))}" alt="${esc(st.name)} logo" width="52" height="52" loading="lazy"></a>`
    : `<div class="o-disc"><b>${esc(c.discount || (hasCode ? 'Code' : 'Deal'))}</b><small>${hasCode ? 'Promo code' : 'Deal'}</small></div>`;
  const cta = hasCode
    ? `<button class="cta code" type="button" data-reveal="${esc(c.id)}"><span class="lbl">Show code</span><span class="peek" aria-hidden="true">${esc(mask(c.code))}</span></button>`
    : `<a class="cta deal" href="${esc(dest)}" target="_blank" rel="sponsored nofollow noopener" data-deal>Get deal</a>`;
  return `<article class="offer" id="o-${esc(c.id)}" data-markets="${esc((c.markets || []).join(','))}" data-type="${hasCode ? 'code' : 'deal'}">
  ${lead}
  <div class="o-body">
    ${ctx === 'home' ? `<a class="o-store" href="${storeUrl(st)}">${esc(st.name)}</a>` : ''}
    <h3>${ctx === 'home' && c.discount ? `<b>${esc(c.discount)}</b> ` : ''}${esc(c.title)}</h3>
    <div class="o-meta">${pills}${regionPills(c.markets)}</div>
    ${c.description ? `<p>${esc(c.description)}</p>` : ''}
    ${c.terms ? `<details><summary>Terms</summary><p>${esc(c.terms)}</p></details>` : ''}
  </div>
  <div class="o-act">${cta}</div>
</article>`;
}

export function storeTile(st, count) {
  return `<a class="s-tile" href="${storeUrl(st)}"><img src="${esc(storeLogo(st))}" alt="${esc(st.name)} logo" width="60" height="60" loading="lazy"><strong>${esc(st.name)}</strong><span>${count ? `${count} offer${count > 1 ? 's' : ''}` : 'View store'}</span></a>`;
}

export function postCard(p) {
  return `<a class="p-card" href="${postUrl(p)}">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.imageAlt || p.title)}" width="640" height="360" loading="lazy">` : '<div class="ph" aria-hidden="true"></div>'}<div><small>${esc(fmtDate(p.date))}</small><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></div></a>`;
}

export function faqBlock(items) {
  return items.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
}
export function faqSchema(items) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}

export function newsletterForm(id = 'newsletter') {
  return `<form class="nl" name="${id}" method="POST" action="/api/form" data-nl><input type="hidden" name="form-name" value="${id}"><p hidden><label>Do not fill: <input name="bot-field"></label></p><input type="email" name="email" required placeholder="you@email.com" aria-label="Email address" autocomplete="email"><button class="btn accent" type="submit">Subscribe</button><p class="nl-msg" role="status" hidden>Thanks! You are on the list.</p></form>`;
}
