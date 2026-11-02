import { esc, slugify, $, $$, getPath, setPath, toast, modal, list, bust, backend, publishNow, DEMO, currentUser, logActivity, parseCSV, toCSV, download } from './core.js';
import { COLLECTIONS, SETTINGS } from './schemas.js';
import { formHTML, readFields, wireFields, uploadImage } from './fields.js';

const $app = () => document.getElementById('app');
export let go = () => {};
export const setRouter = (fn) => { go = fn; };

let seedCache = null;
async function seedData() { if (seedCache) return seedCache; seedCache = window.__SEED__ || (await (await fetch('seed.json')).json()); return seedCache; }
const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));
const wordCount = (s) => (String(s || '').match(/\S+/g) || []).length;

// ---------- shell ----------
const NAV = [
  ['', [['dashboard', '📊', 'Dashboard']]],
  ['Content', Object.entries(COLLECTIONS).filter(([k]) => k !== 'redirects').map(([k, c]) => [`c:${k}`, { stores: '🏬', coupons: '🏷️', categories: '🗂️', collections: '🎄', posts: '📝', pages: '📄' }[k], c.label]).concat([['media', '🖼️', 'Media library']])],
  ['Design', [['s:theme', '🎨', 'Appearance'], ['s:nav', '🧭', 'Menus'], ['s:home', '🏠', 'Home page'], ['s:code', '🧩', 'Custom code']]],
  ['Growth', [['s:seo', '🔎', 'SEO settings'], ['seoaudit', '✅', 'SEO audit'], ['c:redirects', '↪️', 'Redirects'], ['s:bot', '💬', 'AI support bot']]],
  ['Tools', [['importexport', '📦', 'Import / Export'], ['submissions', '📥', 'Submissions'], ['activity', '🕘', 'Activity'], ['s:site', '⚙️', 'General settings']]],
];
let current = 'dashboard';
export function shell(view, inner) {
  current = view;
  $app().innerHTML = `<div class="shell"><aside class="side"><div class="logo">CouponBuz <small>CMS</small></div>
  ${NAV.map(([g, items]) => `${g ? `<h4>${g}</h4>` : ''}${items.map(([id, ic, l]) => `<a data-v="${id}" class="${view === id ? 'on' : ''}"><span>${ic}</span>${esc(l)}</a>`).join('')}`).join('')}
  <div class="out"><small>${esc(currentUser?.email || '')}${DEMO ? ' · demo mode' : ''}</small><a data-out>Sign out</a><a data-live>View live site ↗</a></div></aside>
  <main class="main">${DEMO ? '<div class="demo">Demo mode: changes are kept in memory only and reset when you reload. Open the deployed /admin/ to save for real.</div>' : ''}${inner}</main></div>`;
  $$('[data-v]').forEach((a) => (a.onclick = () => go(a.dataset.v)));
  $('[data-out]').onclick = () => backend.signOut();
  $('[data-live]').onclick = () => window.open(DEMO ? '#' : '/', '_blank');
}
const top = (title, right = '') => `<div class="top"><h1>${title}</h1><div class="topr">${right}</div></div>`;

// ---------- dashboard ----------
export async function dashboard() {
  const cols = Object.keys(COLLECTIONS), data = {};
  await Promise.all(cols.map(async (c) => (data[c] = await list(c, true))));
  const settings = {}; (await list('settings', true)).forEach((s) => (settings[s.id] = s));
  const acts = (await list('activity', true).catch(() => [])).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 6);
  const real = data.coupons.filter((c) => !c.demo && c.status !== 'draft').length, demo = data.coupons.filter((c) => c.demo).length;
  const checks = [
    ['Set your live site URL', /^https:\/\//.test(settings.site?.url || ''), 's:site'],
    ['Add at least 5 real offers', real >= 5, 'c:coupons'],
    ['Remove or hide the sample offers', demo === 0, 'c:coupons'],
    ['Add affiliate links to your stores', data.stores.filter((s) => s.affiliateUrl).length >= 3, 'c:stores'],
    ['Write a store guide for your top stores', data.stores.filter((s) => wordCount(s.body) > 150).length >= 3, 'c:stores'],
    ['Set a social share image', !!settings.seo?.ogImage, 's:seo'],
    ['Add Google Search Console code', !!settings.seo?.googleVerification, 's:seo'],
    ['Add Google Analytics (optional)', !!settings.seo?.gaId, 's:seo'],
  ];
  const done = checks.filter((c) => c[1]).length;
  let hookOn = false; if (!DEMO) { try { hookOn = !!(await (await fetch('/api/cms')).json()).buildHook; } catch {} }
  shell('dashboard', `${top('Dashboard')}
  <div class="grid">${cols.map((c) => `<a class="stat" data-v="c:${c}"><b>${data[c].length}</b>${esc(COLLECTIONS[c].label)}</a>`).join('')}</div>
  <div class="two">
    <div class="panel"><h2>Launch checklist <small>${done}/${checks.length}</small></h2><div class="bar"><i style="width:${(done / checks.length) * 100}%"></i></div>
      ${checks.map(([t, ok, v]) => `<a class="chk-row ${ok ? 'ok' : ''}" data-v="${v}"><span>${ok ? '✓' : '○'}</span>${esc(t)}</a>`).join('')}</div>
    <div class="panel"><h2>Publish to the live site</h2><p>Edits save instantly and the live site rebuilds automatically about 20 seconds after your last change (about a minute to go live). You can also publish right now.</p>
      ${DEMO || hookOn ? '' : '<div class="warnbox">Automatic publishing is off: add the <b>BUILD_HOOK_URL</b> environment variable in Netlify (Site configuration &gt; Build &amp; deploy &gt; Build hooks), then redeploy.</div>'}
      <div style="margin-top:12px"><button class="btn" id="pub">Publish now</button></div>
      <p class="help" style="margin-top:10px">Tip: schedule a daily rebuild so expired offers disappear automatically.</p></div>
  </div>
  <div class="two">
    <div class="panel"><h2>Recent activity</h2>${acts.length ? acts.map((a) => `<div class="act"><b>${esc(a.action)}</b> ${esc(a.title)} <small>${esc(a.col)} · ${esc(String(a.at).slice(0, 16).replace('T', ' '))}</small></div>`).join('') : '<p class="help">Nothing yet.</p>'}</div>
    <div class="panel"><h2>Starter data</h2><p>New project? Import starter stores, categories, guides, menus, theme and bot settings. Items with the same ID are overwritten.</p><button class="btn sec" id="seed">Import starter data</button></div>
  </div>`);
  $('#pub').onclick = async () => {
    if (DEMO) return toast('Demo mode: Publish works once the site is on Netlify.');
    const r = await publishNow();
    if (r.triggered) { toast('Build started. Live in about a minute.'); logActivity('published site', 'site', 'Netlify build triggered'); }
    else toast('Could not start a build: ' + (r.reason || r.error || 'check BUILD_HOOK_URL in Netlify'), true);
  };
  $('#seed').onclick = importSeed;
}

async function importSeed() {
  if (!confirm('Import starter data now?')) return;
  const seed = await seedData(), ops = [];
  seed.categories.forEach((c) => ops.push({ col: 'categories', id: c.slug, data: c }));
  seed.stores.forEach((s) => ops.push({ col: 'stores', id: s.slug, data: s }));
  seed.coupons.forEach((c) => ops.push({ col: 'coupons', id: c.id, data: c }));
  seed.posts.forEach((p) => ops.push({ col: 'posts', id: p.slug, data: p }));
  seed.pages.forEach((p) => ops.push({ col: 'pages', id: p.slug, data: p }));
  (seed.collections || []).forEach((p) => ops.push({ col: 'collections', id: p.slug, data: p }));
  Object.entries(seed.settings).forEach(([k, v]) => ops.push({ col: 'settings', id: k, data: v }));
  await backend.batch(ops); bust(); toast('Starter data imported'); logActivity('imported', 'site', 'Starter data'); go('dashboard');
}

// ---------- collection list ----------
export async function listView(col) {
  const S = COLLECTIONS[col]; let items = await list(col, true);
  const hasStatus = S.fields.some((f) => f.k === 'status');
  shell(`c:${col}`, `${top(S.label, `<input id="q" placeholder="Filter…" class="s">${hasStatus ? '<select id="st" class="s"><option value="">All statuses</option><option>published</option><option>draft</option></select>' : ''}<button class="btn sec" id="exp">Export CSV</button>${col === 'redirects' ? '<button class="btn sec" id="bulk">Bulk add</button>' : ''}<button class="btn" id="add">+ Add ${esc(S.one)}</button>`)}
  <div class="bulkbar" id="bb" hidden><span id="bc"></span>${hasStatus ? '<button class="btn sec sm" data-b="published">Publish</button><button class="btn sec sm" data-b="draft">Set to draft</button>' : ''}<button class="btn danger sm" data-b="del">Delete</button></div>
  <div class="panel flush"><table><thead><tr><th><input type="checkbox" id="all"></th>${S.cols.map((c) => `<th>${esc(c)}</th>`).join('')}<th></th></tr></thead><tbody id="rows"></tbody></table></div>`);
  const cell = (d, c) => { const v = d[c]; if (c === 'status') return `<span class="tag ${v === 'draft' ? 'draft' : 'ok'}">${esc(v || 'published')}</span>`; if (c === 'active') return v === false ? '<span class="tag draft">off</span>' : '<span class="tag ok">on</span>'; return esc(Array.isArray(v) ? v.join(', ') : v); };
  const paint = () => {
    const q = $('#q').value.toLowerCase(), st = $('#st')?.value || '';
    const rows = items.filter((d) => (!st || (d.status || 'published') === st) && JSON.stringify(d).toLowerCase().includes(q)).sort((a, b) => String(a[S.cols[0]] || '').localeCompare(String(b[S.cols[0]] || '')));
    $('#rows').innerHTML = rows.map((d) => `<tr data-id="${esc(d.id)}"><td><input type="checkbox" class="sel"></td>${S.cols.map((c) => `<td>${cell(d, c)}</td>`).join('')}<td class="ra"><button class="btn sec sm" data-e>Edit</button><button class="btn sec sm" data-dup>Duplicate</button>${S.url ? `<a class="btn sec sm" target="_blank" href="${DEMO ? '#' : S.url(d)}">View</a>` : ''}</td></tr>`).join('') || `<tr><td colspan="${S.cols.length + 2}" class="empty">Nothing here yet.</td></tr>`;
    bulk();
  };
  const sel = () => $$('.sel:checked').map((c) => c.closest('tr').dataset.id);
  const bulk = () => { const n = sel().length; $('#bb').hidden = !n; $('#bc').textContent = `${n} selected`; };
  paint();
  $('#q').oninput = paint; if ($('#st')) $('#st').onchange = paint;
  $('#all').onchange = (e) => { $$('.sel').forEach((c) => (c.checked = e.target.checked)); bulk(); };
  $('#rows').onclick = async (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return; const id = tr.dataset.id, d = items.find((x) => x.id === id);
    if (e.target.matches('.sel')) return bulk();
    if (e.target.closest('[data-e]')) editView(col, d);
    if (e.target.closest('[data-dup]')) await duplicate(col, d);
  };
  $('#add').onclick = () => editView(col, null);
  $('#exp').onclick = () => exportCSV(col, items);
  if ($('#bulk')) $('#bulk').onclick = bulkRedirects;
  $('#bb').onclick = async (e) => {
    const b = e.target.closest('[data-b]'); if (!b) return; const ids = sel();
    if (b.dataset.b === 'del') { if (!confirm(`Delete ${ids.length} item(s) permanently?`)) return; for (const id of ids) await backend.del(col, id); logActivity('deleted', col, `${ids.length} items`); }
    else { for (const id of ids) { const d = items.find((x) => x.id === id); const { id: _i, ...rest } = d; await backend.set(col, id, { ...rest, status: b.dataset.b }); } logActivity(b.dataset.b, col, `${ids.length} items`); }
    bust(col); toast('Done'); listView(col);
  };
}

async function duplicate(col, d) {
  const S = COLLECTIONS[col]; const { id, updatedAt, ...rest } = d;
  const copy = { ...rest, status: rest.status ? 'draft' : undefined };
  let nid;
  if (S.idField) { copy[S.idField] = `${d[S.idField]}-copy`; nid = copy[S.idField]; if (copy[S.title]) copy[S.title] = `${copy[S.title]} (copy)`; }
  else nid = `${slugify(d[S.title] || 'item')}-copy-${Math.random().toString(36).slice(2, 6)}`;
  Object.keys(copy).forEach((k) => copy[k] === undefined && delete copy[k]);
  await backend.set(col, nid, copy); bust(col); logActivity('duplicated', col, d[S.title]); toast('Duplicated'); listView(col);
}

function exportCSV(col, items) {
  const S = COLLECTIONS[col], keys = S.fields.filter((f) => f.t !== 'repeat' && f.t !== 'md' && f.t !== 'code').map((f) => f.k);
  const rows = [keys, ...items.map((d) => keys.map((k) => { const v = d[k]; return Array.isArray(v) ? v.join('|') : v ?? ''; }))];
  download(`${col}.csv`, toCSV(rows), 'text/csv'); toast('CSV downloaded');
}

async function bulkRedirects() {
  modal(`<div class="top"><h2 style="margin:0">Bulk add redirects</h2><button class="btn sec" data-x>Close</button></div><p>One per line: <code>/old-path/ /new-path/ 301</code> (the number is optional, default 301).</p><textarea id="bt" rows="10" class="mono" placeholder="/old-page/ /coupons/nike/ 301"></textarea><div style="margin-top:12px"><button class="btn" id="bgo">Add redirects</button></div>`, (m, close) => {
    $('#bgo', m).onclick = async () => {
      const lines = $('#bt', m).value.split('\n').map((l) => l.trim()).filter(Boolean); let n = 0;
      for (const l of lines) { const [from, to, code] = l.split(/\s+/); if (!from?.startsWith('/') || !to) continue; await backend.set('redirects', `r-${Date.now()}-${n++}`, { from, to, code: code === '302' ? '302' : '301', active: true, note: 'bulk' }); }
      bust('redirects'); logActivity('bulk redirects', 'redirects', `${n} added`); close(); toast(`${n} redirects added`); listView('redirects');
    };
  });
}

// ---------- edit ----------
function serpHTML(S, data, settings) {
  const site = settings.site?.siteName || 'CouponBuz', url = (settings.site?.url || 'https://example.com').replace(/\/$/, '');
  const kw = String(data[S.seo.kw] || '').trim(), slug = slugify(data.slug || kw);
  const tpl = settings.seo?.titleTemplate || '%title% | %site%';
  const autoTitle = S.seo.prefix === '/coupons/' ? `${kw} Promo Codes & Savings Tips` : S.seo.prefix === '/categories/' ? `${kw} Coupons & Promo Codes` : kw;
  const title = data.seoTitle || tpl.replace('%title%', autoTitle).replace('%site%', site);
  const text = S.seo.text.map((k) => data[k] || '').join(' ');
  const desc = data.seoDescription || text.replace(/[#*\[\]()!`]/g, '').slice(0, 158);
  const fullUrl = `${url}${S.seo.prefix}${slug}${S.seo.suffix || '/'}`;
  const words = wordCount(text), min = S.seo.prefix === '/guides/' ? 300 : S.seo.prefix === '/coupons/' ? 120 : 40;
  const lower = (s) => String(s).toLowerCase();
  const checks = [
    [title.length >= 30 && title.length <= 60, `Title length ${title.length} (best 30–60)`],
    [desc.length >= 70 && desc.length <= 160, `Description length ${desc.length} (best 70–160)`],
    [!kw || lower(title).includes(lower(kw)), 'Keyword is in the title'],
    [!kw || lower(desc).includes(lower(kw)), 'Keyword is in the description'],
    [slug.split('-').length <= 5 && !!slug, 'Short URL slug (5 words or fewer)'],
    [words >= min, `Enough original text: ${words} words (aim for ${min}+)`],
  ];
  const score = Math.round((checks.filter((c) => c[0]).length / checks.length) * 100);
  return `<div class="serp"><div class="g-url">${esc(fullUrl)}</div><div class="g-title">${esc(title.slice(0, 70))}</div><div class="g-desc">${esc(desc.slice(0, 165))}</div></div>
  <div class="score ${score >= 80 ? 'good' : score >= 50 ? 'mid' : 'low'}">SEO score <b>${score}</b>/100</div>
  <ul class="checks">${checks.map(([ok, t]) => `<li class="${ok ? 'ok' : 'warn'}">${ok ? '✓' : '⚠'} ${esc(t)}</li>`).join('')}</ul>`;
}

export async function editView(col, item) {
  const S = COLLECTIONS[col];
  const settings = {}; (await list('settings')).forEach((s) => (settings[s.id] = s));
  const defaults = item ? item : Object.fromEntries(S.fields.map((f) => [f.k, f.k === 'status' ? 'published' : f.k === 'markets' ? ['US', 'UK', 'CA', 'EU'] : f.k === 'type' ? 'code' : f.k === 'code' && col === 'redirects' ? '301' : f.k === 'active' ? true : f.k === 'date' ? new Date().toISOString().slice(0, 10) : '']));
  if (!item && col === 'redirects') defaults.code = '301';
  const body = await formHTML(S.fields, defaults);
  shell(`c:${col}`, `${top(`${item ? 'Edit' : 'New'} ${esc(S.one)}`, `${item && S.url ? `<a class="btn sec" target="_blank" href="${DEMO ? '#' : S.url(item)}">View live ↗</a>` : ''}<button class="btn sec" id="back">← Back</button>`)}
  <form class="panel" id="form">${body}<div class="sticky"><button class="btn" type="submit">Save</button><button type="button" class="btn sec" id="cancel">Cancel</button></div></form>`);
  const form = $('#form'); wireFields(form);
  if (S.seo) {
    const pane = $('.pane[data-g="SEO"]', form); const box = document.createElement('div'); box.className = 'serpbox'; pane.prepend(box);
    const upd = () => (box.innerHTML = `<h3>Google preview &amp; SEO check</h3>${serpHTML(S, readFields(S.fields, form, {}), settings)}`);
    form.addEventListener('input', upd); upd();
  }
  $('#back').onclick = $('#cancel').onclick = () => listView(col);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = readFields(S.fields, form, item ? (({ id, updatedAt, ...r }) => r)(clone(item)) : {});
    let id = item?.id;
    if (S.idField) { data[S.idField] = slugify(data[S.idField] || data[S.title]); id = data[S.idField]; }
    else if (!id) id = `${slugify(data.storeSlug || col)}-${slugify(data[S.title] || 'item').slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
    if (!id) return toast('Please fill in the title', true);
    if (col === 'redirects' && !String(data.from).startsWith('/')) return toast('"From" must start with /', true);
    if (S.idField && !item && (await list(col)).some((d) => d.id === id)) return toast(`An item with the URL slug "${id}" already exists`, true);
    try {
      await backend.set(col, id, data);
      if (item && item.id !== id) await backend.del(col, item.id);
      bust(col); logActivity(item ? 'edited' : 'created', col, data[S.title]); toast('Saved'); listView(col);
    } catch (err) { toast('Save failed: ' + err.message, true); }
  };
}

// ---------- settings ----------
const PV = (t) => `<div class="pv" style="--p:${t.primary};--pd:${t.primaryDark};--a:${t.accent};--bg:${t.bg};--s:${t.surface};--ink:${t.ink};--mu:${t.muted};--r:${Math.min(28, Number(t.radius) || 14)}px">
  <div class="pv-an" style="background:${t.announcement?.bg || '#101828'}">${esc(t.announcement?.enabled ? t.announcement.text || 'Announcement' : 'Announcement bar hidden')}</div>
  <div class="pv-h"><b>● CouponBuz</b><span>Stores</span><span>Categories</span><span>Guides</span></div>
  <div class="pv-hero"><i>Updated October 2026</i><h4>Find promo codes worth using</h4><div class="pv-s"><span>Search a store…</span><u>Search</u></div></div>
  <div class="pv-body"><div class="pv-offer"><div class="pv-d">20% off</div><div class="pv-t"><b>Sample offer title</b><small>Checked 12 Oct · US UK</small></div><div class="pv-c">Show code</div></div><div class="pv-tiles"><div>N</div><div>A</div><div>E</div></div></div></div>`;

export async function settingsView(id) {
  const S = SETTINGS[id], seed = (await seedData()).settings[id] || {};
  const existing = (await backend.get('settings', id)) || {};
  const { id: _i, updatedAt, ...cur0 } = existing;
  const cur = Object.keys(cur0).length ? cur0 : clone(seed);
  const body = await formHTML(S.fields, cur);
  shell(`s:${id}`, `${top(esc(S.label), `<button class="btn" id="saveTop">Save changes</button>`)}
  ${id === 'code' ? '<div class="warnbox">Custom code runs on every visitor\'s browser. Only paste code from sources you trust. A mistake here can break the whole site, so test after publishing.</div>' : ''}
  ${id === 'bot' ? `<div class="infobox"><b>Using the AI:</b> the bubble works right away with your FAQ answers. To switch on real AI answers, add <code>ANTHROPIC_API_KEY</code> in Netlify → Site settings → Environment variables, then redeploy. Without a key the bot falls back to the FAQ list.</div>` : ''}
  <div class="${S.preview ? 'split' : ''}"><form class="panel" id="form">${body}<div class="sticky"><button class="btn" type="submit">Save changes</button></div></form>${S.preview ? `<div class="panel pvwrap"><h3>Live preview</h3><div id="pv"></div><p class="help">Preview of colors, corners and announcement bar. Fonts show after you publish.</p></div>` : ''}</div>`);
  const form = $('#form'); wireFields(form);
  if (S.preview) { const upd = () => ($('#pv').innerHTML = PV(readFields(S.fields, form, {}))); form.addEventListener('input', upd); upd(); }
  const save = async (e) => {
    e && e.preventDefault();
    try { await backend.set('settings', id, readFields(S.fields, form, clone(cur))); bust('settings'); logActivity('updated settings', 'settings', S.label); toast('Saved. The live site will update automatically in about a minute.'); } catch (err) { toast('Save failed: ' + err.message, true); }
  };
  form.onsubmit = save; $('#saveTop').onclick = () => save();
}

// ---------- media ----------
export async function mediaView() {
  const items = (await list('media', true)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  shell('media', `${top('Media library', '<input type="file" id="file" accept="image/*" multiple hidden><button class="btn" id="up">Upload images</button>')}
  <p class="help">Upload once, then reuse images from any image field (click “Library”). Name files with keywords before uploading (e.g. <code>nike-promo-code.jpg</code>); it helps image search. Click an image to copy its URL. Max 5 MB each.</p>
  <div class="media big">${items.map((i) => `<figure data-id="${esc(i.id)}" data-u="${esc(i.url)}" data-p="${esc(i.path || '')}"><img src="${esc(i.url)}" alt="${esc(i.alt || '')}"><figcaption>${esc(i.name)}<br><a href="#" data-alt>alt text</a> · <a href="#" data-del>delete</a></figcaption></figure>`).join('') || '<p class="empty">No uploads yet.</p>'}</div>`);
  const file = $('#file'); $('#up').onclick = () => file.click();
  file.onchange = async () => { for (const f of file.files) { try { await uploadImage(f); } catch (e) { toast(f.name + ': ' + e.message, true); } } mediaView(); };
  $('.media').onclick = async (e) => {
    const fig = e.target.closest('figure'); if (!fig) return; const it = items.find((x) => x.id === fig.dataset.id);
    if (e.target.closest('[data-del]')) { e.preventDefault(); if (!confirm('Delete this image? Pages using it will show a broken image.')) return; await backend.delFile(fig.dataset.p); await backend.del('media', fig.dataset.id); bust('media'); return mediaView(); }
    if (e.target.closest('[data-alt]')) { e.preventDefault(); const a = prompt('Alt text (describe the image):', it.alt || ''); if (a !== null) { await backend.set('media', it.id, { ...it, alt: a, id: undefined }); bust('media'); mediaView(); } return; }
    navigator.clipboard?.writeText(fig.dataset.u); toast('Image URL copied');
  };
}

// ---------- SEO audit ----------
export async function seoAuditView() {
  const [stores, posts, pages, cats, deals, coupons] = await Promise.all(['stores', 'posts', 'pages', 'categories', 'collections', 'coupons'].map((c) => list(c, true)));
  const rows = [], descSeen = {};
  stores.forEach((s) => { const d = (s.description || '').trim().toLowerCase(); if (d) (descSeen[d] ||= []).push(s.slug); });
  const add = (type, col, d, label, issues) => rows.push({ type, col, d, label, issues });
  const metaIssues = (d, issues) => {
    if (d.seoTitle && (d.seoTitle.length < 25 || d.seoTitle.length > 65)) issues.push(`SEO title is ${d.seoTitle.length} chars (aim 30–60)`);
    if (d.seoDescription && (d.seoDescription.length < 70 || d.seoDescription.length > 165)) issues.push(`Meta description is ${d.seoDescription.length} chars (aim 70–160)`);
  };
  stores.forEach((s) => {
    const i = [], offers = coupons.filter((c) => c.storeSlug === s.slug && c.status !== 'draft').length;
    if (!s.description) i.push('Missing description'); else if (descSeen[s.description.trim().toLowerCase()].length > 1) i.push('Duplicate description (same as another store)');
    if (wordCount(`${s.description} ${s.body} ${(s.tips || []).join(' ')}`) < 120) i.push('Thin content (under 120 words)');
    if (s.logo && !s.logoAlt) i.push('Logo has no alt text');
    if (!s.affiliateUrl) i.push('No affiliate link');
    if (!offers) i.push('No live offers: page is set to noindex');
    metaIssues(s, i); add('Store', 'stores', s, s.name, i);
  });
  posts.forEach((p) => { const i = []; if (wordCount(p.body) < 300) i.push(`Short article (${wordCount(p.body)} words, aim 300+)`); if (!p.image) i.push('No cover image'); else if (!p.imageAlt) i.push('Cover image has no alt text'); if (!p.seoDescription && !p.excerpt) i.push('No meta description or summary'); metaIssues(p, i); add('Guide', 'posts', p, p.title, i); });
  cats.forEach((c) => { const i = []; if (wordCount(c.description) < 25) i.push('Short description (add 2–3 sentences)'); metaIssues(c, i); add('Category', 'categories', c, c.name, i); });
  deals.forEach((c) => { const i = []; if (wordCount(`${c.intro} ${c.body}`) < 60) i.push('Little text on this page'); if (!(c.stores || []).length) i.push('No stores selected'); metaIssues(c, i); add('Deal page', 'collections', c, c.name, i); });
  pages.forEach((p) => { const i = []; if (!p.seoDescription) i.push('No meta description'); metaIssues(p, i); add('Page', 'pages', p, p.title, i); });
  const clean = rows.filter((r) => !r.issues.length).length, score = rows.length ? Math.round((clean / rows.length) * 100) : 100;
  const bad = rows.filter((r) => r.issues.length).sort((a, b) => b.issues.length - a.issues.length);
  shell('seoaudit', `${top('SEO audit')}
  <div class="grid"><div class="stat"><b>${score}%</b>Pages fully clean</div><div class="stat"><b>${rows.length}</b>Pages checked</div><div class="stat"><b>${bad.reduce((n, r) => n + r.issues.length, 0)}</b>Issues found</div></div>
  <div class="panel flush"><table><thead><tr><th>Page</th><th>Type</th><th>Issues</th><th></th></tr></thead><tbody>${bad.map((r) => `<tr><td><b>${esc(r.label)}</b></td><td>${esc(r.type)}</td><td>${r.issues.map((x) => `<span class="issue">${esc(x)}</span>`).join('')}</td><td class="ra"><button class="btn sec sm" data-c="${r.col}" data-i="${esc(r.d.id)}">Fix</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">🎉 No issues found.</td></tr>'}</tbody></table></div>
  <p class="help">Rankings depend on content quality, links and competition. This audit covers the on-page basics you control.</p>`);
  $$('[data-c]').forEach((b) => (b.onclick = () => { const col = b.dataset.c, d = rows.find((r) => r.col === col && r.d.id === b.dataset.i).d; editView(col, d); }));
}

// ---------- import / export ----------
export async function importExportView() {
  shell('importexport', `${top('Import / Export')}
  <div class="two">
  <div class="panel"><h2>Backup</h2><p>Download everything (content, settings, menus, redirects) as one JSON file, or restore from one.</p><button class="btn" id="bk">Download backup</button> <button class="btn sec" id="rs">Restore backup…</button><input type="file" id="rsf" accept=".json" hidden></div>
  <div class="panel"><h2>CSV import</h2><p>Add many stores, offers, categories or redirects from a spreadsheet. Column names must match the field keys: download the CSV template first. Separate list values with <code>|</code> (e.g. <code>US|UK</code>).</p>
  <select id="cc" class="s">${['stores', 'coupons', 'categories', 'redirects'].map((c) => `<option value="${c}">${COLLECTIONS[c].label}</option>`).join('')}</select> <button class="btn sec" id="tpl">Template</button> <button class="btn" id="imp">Choose CSV…</button><input type="file" id="csvf" accept=".csv" hidden><div id="csvmsg" class="help"></div></div></div>`);
  $('#bk').onclick = async () => {
    const out = { exportedAt: new Date().toISOString() };
    for (const c of [...Object.keys(COLLECTIONS), 'settings', 'media']) out[c] = await list(c, true);
    download(`couponbuz-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 1), 'application/json'); toast('Backup downloaded');
  };
  $('#rs').onclick = () => $('#rsf').click();
  $('#rsf').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return; let j; try { j = JSON.parse(await f.text()); } catch { return toast('Not a valid backup file', true); }
    if (!confirm('Restore this backup? Items with the same ID will be overwritten.')) return;
    const ops = []; for (const c of [...Object.keys(COLLECTIONS), 'settings', 'media']) (j[c] || []).forEach(({ id, updatedAt, ...d }) => ops.push({ col: c, id, data: d }));
    await backend.batch(ops); bust(); toast(`Restored ${ops.length} items`); logActivity('restored backup', 'site', `${ops.length} items`);
  };
  $('#tpl').onclick = () => { const S = COLLECTIONS[$('#cc').value]; download(`${$('#cc').value}-template.csv`, toCSV([S.fields.filter((f) => !['repeat', 'md', 'code'].includes(f.t)).map((f) => f.k)]), 'text/csv'); };
  $('#imp').onclick = () => $('#csvf').click();
  $('#csvf').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return; const col = $('#cc').value, S = COLLECTIONS[col];
    const rows = parseCSV(await f.text()); if (rows.length < 2) return toast('CSV has no data rows', true);
    const head = rows[0].map((h) => h.trim()), fmap = Object.fromEntries(S.fields.map((x) => [x.k, x]));
    const unknown = head.filter((h) => !fmap[h]); const ops = [];
    for (const r of rows.slice(1)) {
      const d = {}; head.forEach((h, i) => { const fd = fmap[h]; if (!fd) return; let v = (r[i] ?? '').trim(); if (['multi', 'multiDyn', 'lines'].includes(fd.t)) v = v ? v.split('|').map((x) => x.trim()) : []; else if (fd.t === 'bool') v = /^(true|yes|1|on)$/i.test(v); else if (fd.t === 'number') v = v === '' ? '' : Number(v); d[h] = v; });
      if (!d[S.title]) continue;
      if (S.fields.some((x) => x.k === 'status') && !d.status) d.status = 'published';
      let id; if (S.idField) { d[S.idField] = slugify(d[S.idField] || d[S.title]); id = d[S.idField]; } else id = `${slugify(d.storeSlug || col)}-${slugify(d[S.title]).slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
      ops.push({ col, id, data: d });
    }
    $('#csvmsg').innerHTML = `${ops.length} rows ready${unknown.length ? `. Ignored unknown columns: ${esc(unknown.join(', '))}` : ''}. <button class="btn sm" id="go">Import ${ops.length} ${esc(S.label.toLowerCase())}</button>`;
    $('#go').onclick = async () => { await backend.batch(ops); bust(col); logActivity('csv import', col, `${ops.length} rows`); toast(`Imported ${ops.length}`); $('#csvmsg').textContent = 'Done.'; };
  };
}

// ---------- activity ----------
export async function activityView() {
  const items = (await list('activity', true).catch(() => [])).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 100);
  shell('activity', `${top('Activity log')}<div class="panel flush"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Item</th></tr></thead><tbody>${items.map((a) => `<tr><td>${esc(String(a.at).slice(0, 16).replace('T', ' '))}</td><td>${esc(a.by)}</td><td>${esc(a.action)}</td><td>${esc(a.col)}: ${esc(a.title)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No activity yet.</td></tr>'}</tbody></table></div>`);
}

// ---------- public submissions (moderation) ----------
const SUB_STATUS = { pending: 'Pending', approved: 'Approved (draft created)', rejected: 'Rejected' };
export async function submissionsView() {
  const items = (await list('submissions', true).catch(() => [])).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const stores = await list('stores');
  const row = (s) => `<tr data-id="${esc(s.id)}"><td>${esc(String(s.createdAt || '').slice(0, 10))}</td><td><b>${esc(s.store)}</b><br><small>${esc((s.markets || []).join(', '))}</small></td><td>${esc(s.title)}${s.code ? `<br><code>${esc(s.code)}</code>` : ''}<br><small>${esc(s.description || '')}</small></td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">link</a>` : ''}${s.email ? `<br><small>${esc(s.email)}</small>` : ''}</td><td>${esc(SUB_STATUS[s.status] || s.status)}</td><td class="acts">${s.status === 'pending' ? '<button class="btn sm" data-a="approve">Create draft</button> <button class="btn sm ghost" data-a="reject">Reject</button> ' : ''}<button class="btn sm ghost" data-a="delete">Delete</button></td></tr>`;
  const pending = items.filter((s) => s.status === 'pending').length;
  shell('submissions', `${top('Submissions', `<span class="help">${pending} pending</span>`)}<div class="panel"><p class="help">Visitors can only send submissions here; nothing goes live automatically. "Create draft" makes an unverified DRAFT offer in Coupons for you to check against the store's own site and publish yourself.</p></div><div class="panel flush"><table><thead><tr><th>Date</th><th>Store</th><th>Offer</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>${items.map(row).join('') || '<tr><td colspan="6" class="empty">No submissions yet.</td></tr>'}</tbody></table></div>`);
  $$('[data-a]').forEach((b) => (b.onclick = async () => {
    const id = b.closest('tr').dataset.id, s = items.find((x) => x.id === id), a = b.dataset.a;
    try {
      if (a === 'delete') { if (!confirm('Delete this submission permanently?')) return; await backend.del('submissions', id); await logActivity('deleted', 'submissions', s.store); }
      else if (a === 'reject') { const { id: _i, ...d } = s; await backend.set('submissions', id, { ...d, status: 'rejected' }); await logActivity('rejected', 'submissions', s.store); }
      else if (a === 'approve') {
        const match = stores.find((x) => x.slug === slugify(s.store) || String(x.name).toLowerCase() === String(s.store).toLowerCase());
        const cid = `sub-${Date.now()}`;
        await backend.set('coupons', cid, { title: s.title, storeSlug: match ? match.slug : '', type: s.type || (s.code ? 'code' : 'deal'), code: s.code || '', description: s.description || '', url: s.url || '', markets: s.markets || [], expires: s.expires || '', verified: false, status: 'draft', terms: 'Submitted by a visitor. Not yet checked.' });
        const { id: _i, ...d } = s; await backend.set('submissions', id, { ...d, status: 'approved' });
        await logActivity('draft created from submission', 'coupons', s.title); bust('coupons');
        toast(match ? 'Draft offer created. Check it in Coupons before publishing.' : 'Draft created without a store. Pick the store in Coupons.');
      }
      bust('submissions'); await submissionsView();
    } catch (e) { toast('Could not update: ' + e.message, true); }
  }));
}
