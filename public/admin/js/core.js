export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
export const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
export const setPath = (o, p, v) => { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach((k) => { a = a[k] = a[k] && typeof a[k] === 'object' ? a[k] : {}; }); a[ks[ks.length - 1]] = v; };

export function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ''), 2800); }

export function modal(html, onMount) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="mbox">${html}</div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-x]')) close(); });
  if (onMount) onMount(m, close);
  return { el: m, close };
}

export const IS_CONFIGURED = true; // backend is the Cloudflare Pages Function /api/cms (see functions/api/cms.js)
export const DEMO = !!(window.__DEMO__ || new URLSearchParams(location.search).has('demo')) && ['localhost', '127.0.0.1', ''].includes(location.hostname);

const tsISO = (v) => (v && typeof v === 'object' && typeof v.toDate === 'function' ? v.toDate().toISOString() : v);
const normalise = (d) => { const o = {}; for (const [k, v] of Object.entries(d)) o[k] = tsISO(v); return o; };

// ---------- backends ----------
const API = '/api/cms';
const TOKEN_KEY = 'cb_cms_token';
const getTok = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const setTok = (t) => { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch {} };

// Content saved here is live immediately: the public site renders from the same storage (no rebuild step).
const markDirty = () => {};

async function call(body) {
  let res;
  try { res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + getTok() }, body: JSON.stringify(body) }); }
  catch { throw new Error('Cannot reach the CMS server. Check your connection and that the site is deployed on Cloudflare Pages.'); }
  let j = {}; try { j = await res.json(); } catch {}
  if (res.status === 401 && j.code === 'auth') { setTok(''); if (body.op !== 'login') setTimeout(() => location.reload(), 600); }
  if (!res.ok) throw new Error(j.error || `Server error ${res.status}`);
  return j;
}
const quiet = (c) => c === 'activity' || c === 'submissions';
const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

async function apiBackend() {
  let listeners = [];
  const notify = (u) => listeners.forEach((cb) => cb(u));
  return {
    mode: 'api',
    onAuth: (cb) => { listeners.push(cb); if (!getTok()) return cb(null); call({ op: 'me' }).then((j) => cb({ email: j.email })).catch(() => { setTok(''); cb(null); }); },
    async signIn(email, password) { const j = await call({ op: 'login', email, password }); setTok(j.token); notify({ email: j.email }); },
    async signOut() { setTok(''); notify(null); },
    async list(col) { return (await call({ op: 'list', col })).items; },
    async get(col, id) { return (await call({ op: 'get', col, id })).item; },
    async set(col, id, data) { await call({ op: 'set', col, id, data }); if (!quiet(col)) markDirty(); },
    async del(col, id) { await call({ op: 'del', col, id }); if (!quiet(col)) markDirty(); },
    async batch(ops) { for (let i = 0; i < ops.length; i += 100) await call({ op: 'batch', ops: ops.slice(i, i + 100) }); if (ops.some((o) => !quiet(o.col))) markDirty(); },
    async upload(file) { const r = await call({ op: 'upload', name: file.name, dataUrl: await fileToDataUrl(file) }); markDirty(); return r; },
    async delFile(path) { try { await call({ op: 'delfile', path }); markDirty(); } catch {} },
  };
}

async function demoBackend() {
  let seed = window.__SEED__;
  if (!seed) seed = await (await fetch('seed.json')).json();
  const db = {};
  const put = (col, id, d) => ((db[col] ||= {})[id] = { ...d });
  seed.categories.forEach((c) => put('categories', c.slug, c)); seed.stores.forEach((c) => put('stores', c.slug, c));
  seed.coupons.forEach((c) => put('coupons', c.id, c)); seed.posts.forEach((c) => put('posts', c.slug, c));
  seed.pages.forEach((c) => put('pages', c.slug, c)); (seed.collections || []).forEach((c) => put('collections', c.slug, c));
  Object.entries(seed.settings).forEach(([k, v]) => put('settings', k, v));
  put('redirects', 'demo-1', { from: '/old-nike-page/', to: '/coupons/nike/', code: '301', active: true, note: 'Example redirect' });
  put('submissions', 'demo-sub', { store: 'Nike', title: 'Example visitor submission', code: '', description: 'Demo record. Delete me.', url: '', markets: ['US'], status: 'pending', type: 'deal', createdAt: new Date().toISOString() });
  return {
    mode: 'demo',
    onAuth: (cb) => cb({ email: 'demo@couponbuz.com' }),
    signIn: async () => {}, signOut: async () => location.reload(),
    async list(col) { return Object.entries(db[col] || {}).map(([id, d]) => ({ id, ...d })); },
    async get(col, id) { const d = (db[col] || {})[id]; return d ? { id, ...d } : null; },
    async set(col, id, data) { put(col, id, { ...data, updatedAt: new Date().toISOString() }); },
    async del(col, id) { if (db[col]) delete db[col][id]; },
    async batch(ops) { ops.forEach(({ col, id, data }) => put(col, id, data)); },
    upload: (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ url: r.result, name: file.name, path: 'demo/' + file.name }); r.onerror = rej; r.readAsDataURL(file); }),
    async delFile() {},
  };
}

export let backend = null;
export async function initBackend() { backend = DEMO ? await demoBackend() : await apiBackend(); return backend; }

// ---------- cached listing ----------
const cache = {};
export async function list(col, force) { if (!force && cache[col]) return cache[col]; return (cache[col] = await backend.list(col)); }
export const bust = (col) => { if (col) delete cache[col]; else Object.keys(cache).forEach((k) => delete cache[k]); };

export let currentUser = null;
export const setUser = (u) => { currentUser = u; };

export async function logActivity(action, col, title) {
  try { await backend.set('activity', `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, { action, col, title: String(title || '').slice(0, 120), by: currentUser?.email || '', at: new Date().toISOString() }); } catch (e) {}
}

// ---------- csv ----------
export function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}
export const toCSV = (rows) => rows.map((r) => r.map((v) => { v = String(v ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',')).join('\n');
export function download(name, text, type = 'text/plain') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
