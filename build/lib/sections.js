import { esc } from './md.js';
import { offerCard, storeTile, postCard, storeUrl, catUrl, regionUrl, dealUrl, REGIONS, faqBlock, faqSchema, newsletterForm, monthYear } from './templates.js';

const head = (sec, link) => `<div class="sec-head"><div><h2>${esc(sec.title || '')}</h2>${sec.subtitle ? `<p>${esc(sec.subtitle)}</p>` : ''}</div>${link ? `<a class="more" href="${link[1]}">${esc(link[0])} →</a>` : ''}</div>`;

export function renderSection(sec, x) {
  const schema = [];
  let html = '';
  switch (sec.type) {
    case 'hero': {
      const cards = x.coupons.filter((c) => c.featured).slice(0, 3);
      html = `<section class="hero"><div class="wrap hero-grid">
  <div class="hero-copy">
    <p class="eyebrow">Updated ${esc(monthYear())}</p>
    <h1>${esc(sec.title || x.site.siteName)}</h1>
    <p class="lead">${esc(sec.subtitle || x.site.tagline)}</p>
    <form class="hero-search" action="/search/" role="search" autocomplete="off"><input type="search" name="q" placeholder="Search a store, e.g. Nike" aria-label="Search stores" data-search><button class="btn accent" type="submit">Search</button><div class="suggest" data-suggest hidden></div></form>
    <p class="hero-links">Popular: ${x.stores.filter((s) => s.featured).slice(0, 5).map((s) => `<a href="${storeUrl(s)}">${esc(s.name)}</a>`).join('')}</p>
  </div>
  ${cards.length ? `<div class="hero-cards">${cards.map((c, i) => { const st = x.storeBy[c.storeSlug]; return `<a class="hc hc${i}" href="${storeUrl(st)}"><img src="${esc(x.logo(st))}" alt="${esc(st.name)} logo" width="44" height="44"><div><strong>${esc(c.discount || 'Deal')}</strong><span>${esc(st.name)}</span></div></a>`; }).join('')}</div>` : ''}
</div></section>`;
      break;
    }
    case 'stats':
      html = `<section class="wrap stats"><div><b>${x.stores.length}</b><span>Stores listed</span></div><div><b>${x.coupons.length}</b><span>Live offers</span></div><div><b>4</b><span>Regions covered</span></div><div><b>${x.cats.length}</b><span>Categories</span></div></section>`;
      break;
    case 'offers': {
      const list = x.coupons.filter((c) => c.featured).slice(0, sec.limit || 6);
      if (list.length) html = `<section class="wrap block">${head(sec, ['All stores', '/stores/'])}<div class="stack">${list.map((c) => offerCard(c, x.storeBy[c.storeSlug], 'home')).join('')}</div></section>`;
      break;
    }
    case 'stores': {
      const list = x.stores.filter((s) => s.featured).slice(0, sec.limit || 12);
      html = `<section class="wrap block">${head(sec, ['Browse A–Z', '/stores/'])}<div class="tile-grid">${list.map((s) => storeTile(s, x.couponsOf(s.slug).length)).join('')}</div></section>`;
      break;
    }
    case 'categories':
      html = `<section class="wrap block">${head(sec, ['All categories', '/categories/'])}<div class="cat-grid">${x.cats.map((c) => `<a class="cat" href="${catUrl(c)}"><span class="ico">${esc(c.icon || '🏷️')}</span><strong>${esc(c.name)}</strong></a>`).join('')}</div></section>`;
      break;
    case 'regions':
      html = `<section class="wrap block">${head(sec)}<div class="region-grid">${Object.entries(REGIONS).map(([k, r]) => `<a class="region" href="${regionUrl(k)}"><strong>${esc(r.name)}</strong><span>${x.stores.filter((s) => (s.markets || []).includes(k)).length} stores</span></a>`).join('')}</div></section>`;
      break;
    case 'collections':
      if (x.collections.length) html = `<section class="wrap block">${head(sec)}<div class="coll-grid">${x.collections.map((d) => `<a class="coll" href="${dealUrl(d)}"><strong>${esc(d.name)}</strong><span>${esc(d.intro || '')}</span></a>`).join('')}</div></section>`;
      break;
    case 'howitworks':
      html = `<section class="wrap block">${head(sec)}<div class="steps"><div><span class="num">1</span><h3>Find your store</h3><p>Search or browse by category and region to reach the store page.</p></div><div><span class="num">2</span><h3>Read the terms</h3><p>Each offer lists its discount, region, expiry and conditions in plain language.</p></div><div><span class="num">3</span><h3>Copy and save</h3><p>Press Show code, copy it, then paste it at checkout on the store website.</p></div></div><p class="fine"><a href="/how-we-verify/">How we check offers</a> · <a href="/how-we-make-money/">How we make money</a></p></section>`;
      break;
    case 'guides':
      if (x.posts.length) html = `<section class="wrap block">${head(sec, ['All guides', '/guides/'])}<div class="post-grid">${x.posts.slice(0, sec.limit || 3).map(postCard).join('')}</div></section>`;
      break;
    case 'faq': {
      const items = (sec.items || []).filter((i) => i.q && i.a).map((i) => [i.q, i.a]);
      if (items.length) { html = `<section class="wrap block narrow">${head(sec)}${faqBlock(items)}</section>`; schema.push(faqSchema(items)); }
      break;
    }
    case 'newsletter':
      html = `<section class="wrap block"><div class="nl-band"><div><h2>${esc(sec.title || 'Subscribe')}</h2><p>${esc(sec.subtitle || '')}</p></div>${newsletterForm('newsletter')}</div></section>`;
      break;
    case 'html':
      html = `<section class="wrap block custom-html">${sec.html || ''}</section>`;
      break;
  }
  return { html, schema };
}
