// CouponBuz CMS backend (Cloudflare KV). Used by the Pages Functions in /functions.
//
// Storage layout in the KV namespace bound as `CMS`:
//   col:<name>            one JSON object { "<id>": {...doc} } per collection (stores, coupons, settings, ...)
//   doc:submissions:<id>  visitor submissions are one key each, so two visitors never overwrite each other
//   media:<path>          uploaded images (binary) + metadata
//   meta:version          changes on every content save; the public site uses it to refresh its cache instantly
//   rl:<kind>:<ip>        tiny counters for rate limiting

export const PUBLIC_COLS = ['categories', 'stores', 'coupons', 'posts', 'pages', 'collections', 'redirects', 'settings'];
export const ALL_COLS = [...PUBLIC_COLS, 'media', 'submissions', 'activity'];
const QUIET = new Set(['activity', 'submissions', 'media']); // saving these does not change the public site
const PER_KEY = new Set(['submissions']);
const BAD_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_ACTIVITY = 300;
const MAX_DOC_BYTES = 1_000_000;
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
export const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export function kv(env) {
  if (!env || !env.CMS) {
    throw new HttpError(500, 'The KV storage binding named CMS is missing. Run "npm run setup" (or add a KV binding called CMS in Cloudflare: Workers & Pages > your project > Settings > Bindings) and deploy again.', 'config');
  }
  return env.CMS;
}

const nowIso = () => new Date().toISOString();
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);

function checkCol(col) {
  if (!ALL_COLS.includes(col)) throw new HttpError(400, `Unknown collection "${col}".`);
  return col;
}
function checkId(id) {
  const s = String(id ?? '');
  if (!s || s.length > 200 || BAD_IDS.has(s) || /[\u0000-\u001f]/.test(s)) throw new HttpError(400, 'Invalid id.');
  return s;
}
function cleanDoc(data, prev) {
  if (!isPlain(data)) throw new HttpError(400, 'Document data must be an object.');
  const { id: _ignore, ...rest } = data;
  let json = JSON.stringify(rest, (k, v) => (k === '__proto__' ? undefined : v));
  if (json.length > MAX_DOC_BYTES) throw new HttpError(413, 'This item is too large to save (limit about 1 MB).');
  const doc = JSON.parse(json);
  doc.updatedAt = nowIso();
  if (prev?.createdAt && !doc.createdAt) doc.createdAt = prev.createdAt;
  return doc;
}

// ---------- reading ----------
async function readCol(env, col) {
  const store = kv(env);
  if (PER_KEY.has(col)) {
    const out = {};
    let cursor;
    for (let i = 0; i < 20; i++) {
      const page = await store.list({ prefix: `doc:${col}:`, cursor });
      await Promise.all(page.keys.map(async (k) => {
        const raw = await store.get(k.name);
        if (!raw) return;
        try { out[k.name.slice(`doc:${col}:`.length)] = JSON.parse(raw); } catch { /* skip corrupt item */ }
      }));
      if (page.list_complete) break;
      cursor = page.cursor;
    }
    return out;
  }
  const raw = await store.get('col:' + col);
  if (!raw) return {};
  try { const o = JSON.parse(raw); return isPlain(o) ? o : {}; } catch { return {}; }
}
async function writeCol(env, col, map) {
  const json = JSON.stringify(map);
  if (json.length > 20_000_000) throw new HttpError(413, 'This collection is too large for one KV value (20 MB).');
  await kv(env).put('col:' + col, json);
}

export async function listDocs(env, col) {
  checkCol(col);
  const map = await readCol(env, col);
  return Object.entries(map).map(([id, d]) => ({ id, ...d }));
}
export async function getDoc(env, col, id) {
  checkCol(col); checkId(id);
  if (PER_KEY.has(col)) { const raw = await kv(env).get(`doc:${col}:${id}`); return raw ? { id, ...JSON.parse(raw) } : null; }
  const map = await readCol(env, col);
  return map[id] ? { id, ...map[id] } : null;
}

// ---------- writing ----------
export async function getVersion(env) { return (await kv(env).get('meta:version')) || '0'; }
export async function bumpVersion(env) {
  const v = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await kv(env).put('meta:version', v);
  return v;
}

/** ops: [{ col, id, data }] to set, [{ col, id, del: true }] (or data === null) to delete. Returns number of ops applied. */
export async function applyOps(env, ops) {
  if (!Array.isArray(ops) || !ops.length) return 0;
  if (ops.length > 200) throw new HttpError(400, 'Too many operations in one request (max 200).');
  const byCol = new Map();
  for (const op of ops) {
    const col = checkCol(op?.col), id = checkId(op?.id);
    if (!byCol.has(col)) byCol.set(col, []);
    byCol.get(col).push({ id, del: op.del === true || op.data === null, data: op.data });
  }
  let publicChanged = false;
  for (const [col, list] of byCol) {
    if (PER_KEY.has(col)) {
      for (const op of list) {
        if (op.del) await kv(env).delete(`doc:${col}:${op.id}`);
        else {
          const prev = await getDoc(env, col, op.id);
          await kv(env).put(`doc:${col}:${op.id}`, JSON.stringify(cleanDoc(op.data, prev)));
        }
      }
      continue;
    }
    const map = await readCol(env, col);
    for (const op of list) {
      if (op.del) delete map[op.id];
      else map[op.id] = cleanDoc(op.data, map[op.id]);
    }
    if (col === 'activity') {
      const ids = Object.keys(map);
      if (ids.length > MAX_ACTIVITY) {
        ids.sort((a, b) => String(map[b].at || '').localeCompare(String(map[a].at || '')));
        for (const id of ids.slice(MAX_ACTIVITY)) delete map[id];
      }
    }
    await writeCol(env, col, map);
    if (!QUIET.has(col)) publicChanged = true;
  }
  if (publicChanged) await bumpVersion(env); // <- this is what makes the public site update immediately
  return ops.length;
}

/** All content the public site needs (drafts included: the renderer filters them). */
export async function loadContent(env) {
  const out = {};
  await Promise.all(PUBLIC_COLS.map(async (col) => {
    const map = await readCol(env, col);
    out[col] = col === 'settings' ? map : Object.entries(map).map(([id, d]) => ({ id, ...d }));
  }));
  return out;
}

// ---------- uploads ----------
export async function saveUpload(env, name, dataUrl) {
  const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Upload must be an image data URL.');
  const type = m[1].toLowerCase();
  if (!IMAGE_TYPES[type]) throw new HttpError(400, 'Only PNG, JPG, GIF, WebP, AVIF or SVG images are allowed.');
  const bin = atob(m[2].replace(/\s+/g, ''));
  if (bin.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Image is larger than 6 MB.');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const base = String(name || 'image').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
  const path = `uploads/${Date.now().toString(36)}-${base}.${IMAGE_TYPES[type]}`;
  await kv(env).put('media:' + path, bytes, { metadata: { type, name: String(name || base).slice(0, 120), size: bytes.length } });
  return { url: '/media/' + path, name: String(name || base), path };
}
export async function deleteUpload(env, path) {
  if (!/^uploads\/[a-z0-9._-]+$/.test(String(path || ''))) throw new HttpError(400, 'Invalid file path.');
  await kv(env).delete('media:' + path);
}

// ---------- auth (HMAC-signed tokens; the password only lives in the ADMIN_PASSWORD secret) ----------
const te = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const secretOf = (env) => env.SESSION_SECRET || env.CMS_SECRET || env.ADMIN_PASSWORD || '';
const hmacKey = (secret) => crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

async function sign(env, text) { return b64u(await crypto.subtle.sign('HMAC', await hmacKey(secretOf(env)), te.encode(text))); }
async function sha(text) { return new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(text))); }
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha(String(a)), sha(String(b))]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export async function issueToken(env, email, ttlSec = 12 * 3600) {
  const body = b64u(te.encode(JSON.stringify({ e: email, exp: Math.floor(Date.now() / 1000) + ttlSec })));
  return `${body}.${await sign(env, body)}`;
}
export async function verifyToken(env, token) {
  if (!secretOf(env)) return null;
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !(await safeEqual(sig, await sign(env, body)))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return p.exp > Date.now() / 1000 ? { email: p.e } : null;
  } catch { return null; }
}

export async function rateLimit(env, kind, ip, max, windowSec, { peek = false } = {}) {
  if (!env.CMS) return true; // nothing to count with: do not block
  const key = `rl:${kind}:${ip || 'x'}`;
  const n = parseInt((await env.CMS.get(key)) || '0', 10) || 0;
  if (n >= max) return false;
  if (!peek) await env.CMS.put(key, String(n + 1), { expirationTtl: Math.max(60, windowSec) });
  return true;
}

export async function login(env, email, password, ip) {
  if (!env.ADMIN_PASSWORD) throw new HttpError(500, 'ADMIN_PASSWORD is not set. Add it as a secret in Cloudflare (Settings > Variables and Secrets) and deploy again.', 'config');
  if (!(await rateLimit(env, 'login', ip, 8, 900, { peek: true }))) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.', 'rate');
  const okPass = await safeEqual(password ?? '', env.ADMIN_PASSWORD);
  const okMail = !env.ADMIN_EMAIL || (await safeEqual(String(email || '').trim().toLowerCase(), String(env.ADMIN_EMAIL).trim().toLowerCase()));
  if (!(okPass && okMail)) {
    await rateLimit(env, 'login', ip, 8, 900);
    throw new HttpError(401, 'Wrong email or password.', 'login');
  }
  const who = env.ADMIN_EMAIL || String(email || '').trim() || 'admin';
  return { token: await issueToken(env, who), email: who };
}

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

// ---------- request handler for POST /api/cms ----------
export const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export function errorResponse(e) {
  if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
  console.error(e);
  return json({ error: 'Server error. Please try again.' }, 500);
}

export async function health(env) {
  const out = { ok: true, kv: !!env.CMS, passwordSet: !!env.ADMIN_PASSWORD, version: null };
  if (env.CMS) { try { out.version = await getVersion(env); } catch { out.kv = false; } }
  return out;
}

export async function handleCmsPost(request, env) {
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid request.'); }
  const op = body?.op;
  if (op === 'login') return json(await login(env, body.email, body.password, clientIp(request)));

  const auth = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const user = await verifyToken(env, auth);
  if (!user) return json({ error: 'Please sign in again.', code: 'auth' }, 401);

  switch (op) {
    case 'me': return json({ email: user.email });
    case 'list': return json({ items: await listDocs(env, body.col) });
    case 'get': return json({ item: await getDoc(env, body.col, body.id) });
    case 'set': await applyOps(env, [{ col: body.col, id: body.id, data: body.data }]); return json({ ok: true });
    case 'del': await applyOps(env, [{ col: body.col, id: body.id, del: true }]); return json({ ok: true });
    case 'batch': return json({ ok: true, n: await applyOps(env, body.ops) });
    case 'upload': return json(await saveUpload(env, body.name, body.dataUrl));
    case 'delfile': await deleteUpload(env, body.path); return json({ ok: true });
    case 'publish': return json({ ok: true, triggered: true, live: true }); // kept so older admin builds do not error: saves are already live
    default: throw new HttpError(400, 'Unknown operation.');
  }
}
