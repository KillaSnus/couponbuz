// Serves the public website straight from the CMS data stored in KV.
// There is NO build step: every CMS save bumps `meta:version`, and pages are cached per version, so the next
// visitor request renders the new content. Rendering one page is cheap (only that page is built).
import { createSite, SEED } from './site.js';
import { loadContent, getVersion } from './cms.js';

const memo = { key: '', promise: null };

const today = () => new Date().toISOString().slice(0, 10);
const empty = (d) => !(d.stores || []).length && !(d.categories || []).length;

async function getSite(env) {
  let ver = 'seed';
  let data = null;
  if (env.CMS) {
    ver = await getVersion(env);
    const key = `${ver}|${today()}|${env.SITE_URL || ''}|${env.SHOW_DEMO || ''}`;
    if (memo.key === key && memo.promise) return { site: await memo.promise, ver };
    memo.key = key;
    memo.promise = (async () => {
      const content = await loadContent(env);
      data = empty(content) ? { ...SEED, settings: content.settings || {}, redirects: content.redirects || [] } : content;
      return createSite(data, { siteUrl: env.SITE_URL, showDemo: env.SHOW_DEMO !== 'false' });
    })();
    try { return { site: await memo.promise, ver }; } catch (e) { memo.key = ''; memo.promise = null; throw e; }
  }
  // KV not connected yet: still show the starter site so the first deploy is never blank
  if (memo.key !== 'seed') { memo.key = 'seed'; memo.promise = Promise.resolve(createSite({ ...SEED, redirects: [] }, { siteUrl: env.SITE_URL, showDemo: env.SHOW_DEMO !== 'false' })); }
  return { site: await memo.promise, ver };
}

/** Used by the chat function and tests. */
export async function currentSite(env) { return (await getSite(env)).site; }
export function resetRuntimeCache() { memo.key = ''; memo.promise = null; }

const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };

export async function handlePublic(request, env, { waitUntil = () => {}, cache = globalThis.caches?.default } = {}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  let pathname;
  try { pathname = decodeURI(url.pathname); } catch { return new Response('Bad request', { status: 400 }); }

  if (pathname === '/admin') return Response.redirect(url.origin + '/admin/' + url.search, 301);
  const hasExt = /\.[a-z0-9]{1,8}$/i.test(pathname);
  if (!hasExt && !pathname.endsWith('/')) return Response.redirect(url.origin + pathname + '/' + url.search, 301);

  // files that exist in /public (images, css, js...) win over generated routes
  if (hasExt && env.ASSETS) {
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return res;
  }

  const { site, ver } = await getSite(env);
  const cacheKey = new Request(`${url.origin}${pathname}?__v=${encodeURIComponent(ver)}&__d=${today()}`);
  if (cache && request.method === 'GET') {
    const hit = await cache.match(cacheKey);
    if (hit) return new Response(hit.body, { status: hit.status, headers: withHeaders(hit.headers, { 'x-cache': 'HIT' }) });
  }

  const r = site.render(pathname);
  if (r && r.redirect) return new Response(null, { status: r.status, headers: { location: r.redirect, 'cache-control': 'public, max-age=300' } });
  const out = r || site.render404();
  const headers = { 'content-type': out.type, 'cache-control': 'public, max-age=0, must-revalidate', ...SEC, 'x-cache': 'MISS' };
  if (out.type.startsWith('image/svg')) headers['content-security-policy'] = "default-src 'none'; style-src 'unsafe-inline'";
  const res = new Response(request.method === 'HEAD' ? null : out.body, { status: out.status, headers });

  if (cache && request.method === 'GET' && out.status === 200) {
    const copy = new Response(out.body, { status: 200, headers: { ...headers, 'cache-control': 'public, max-age=86400' } });
    waitUntil(cache.put(cacheKey, copy));
  }
  return res;
}

function withHeaders(h, extra) { const o = new Headers(h); o.set('cache-control', 'public, max-age=0, must-revalidate'); for (const [k, v] of Object.entries(extra)) o.set(k, v); return o; }
