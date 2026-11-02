// Tiny stand-in for Cloudflare Pages used for the browser test: static files from /public (minus _routes.json excludes),
// Pages-Function-style routing for /api/* and /media/*, everything else to the catch-all function.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeKV } from './_fakes.mjs';
import { onRequest as publicSite } from '../functions/[[path]].js';
import { onRequest as cmsFn } from '../functions/api/cms.js';
import { onRequest as formFn } from '../functions/api/form.js';
import { onRequest as submitFn } from '../functions/api/submit-coupon.js';
import { onRequest as chatFn } from '../functions/api/chat.js';
import { onRequestGet as mediaFn } from '../functions/media/[[path]].js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const routes = JSON.parse(fs.readFileSync(path.join(PUB, '_routes.json'), 'utf8'));
const excluded = (p) => routes.exclude.some((r) => (r.endsWith('/*') ? p.startsWith(r.slice(0, -1)) : p === r));

export function startServer(port, env) {
  const caches = new Map();
  globalThis.caches = { default: { match: async (r) => { const e = caches.get(r.url); return e ? new Response(e.body, { status: e.status, headers: e.headers }) : undefined; }, put: async (r, res) => { caches.set(r.url, { body: await res.text(), status: res.status, headers: [...res.headers] }); } } };
  const staticFile = (p) => { let f = path.join(PUB, p); if (!f.startsWith(PUB)) return null; if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; };
  const assets = { fetch: async (request) => { const f = staticFile(new URL(request.url).pathname); return f ? new Response(fs.readFileSync(f), { headers: { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' } }) : new Response('nf', { status: 404 }); } };
  const full = { ...env, ASSETS: assets };
  const server = http.createServer(async (rq, rs) => {
    try {
      const url = new URL(rq.url, `http://localhost:${port}`);
      const chunks = []; for await (const c of rq) chunks.push(c);
      const request = new Request(url, { method: rq.method, headers: rq.headers, body: ['GET', 'HEAD'].includes(rq.method) ? undefined : Buffer.concat(chunks) });
      let res;
      if (excluded(url.pathname)) { const f = staticFile(url.pathname); res = f ? new Response(fs.readFileSync(f), { headers: { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' } }) : (url.pathname === '/admin' ? Response.redirect(url.origin + '/admin/', 308) : new Response('nf', { status: 404 })); }
      else {
        const ctx = { request, env: full, params: {}, waitUntil: () => {} };
        if (url.pathname === '/api/cms') res = await cmsFn(ctx);
        else if (url.pathname === '/api/form') res = await formFn(ctx);
        else if (url.pathname === '/api/submit-coupon') res = await submitFn(ctx);
        else if (url.pathname === '/api/chat') res = await chatFn(ctx);
        else if (url.pathname.startsWith('/media/')) res = await mediaFn({ ...ctx, params: { path: url.pathname.slice(7).split('/') } });
        else res = await publicSite(ctx);
      }
      rs.writeHead(res.status, Object.fromEntries(res.headers)); rs.end(Buffer.from(await res.arrayBuffer()));
    } catch (e) { rs.writeHead(500); rs.end(String(e.stack || e)); }
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = { CMS: new FakeKV(), ADMIN_PASSWORD: 'e2e-password', ADMIN_EMAIL: 'owner@test.dev', SITE_URL: 'http://localhost:8799', SHOW_DEMO: 'false' };
  await startServer(8799, env); console.log('listening 8799');
}
