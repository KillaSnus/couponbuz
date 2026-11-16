// Public website: every page is rendered from the CMS data in KV (see src/runtime.js).
import { handlePublic } from '../src/runtime.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const isPagesHost = hostname === 'biorals.pages.dev' || hostname.endsWith('.biorals.pages.dev');
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'biorals.test';

  // Keep production traffic and its canonical URLs on biorals.com. Cloudflare Pages
  // preview URLs and local development remain usable.
  if (!isLocalHost && !isPagesHost && hostname !== 'biorals.com') {
    url.protocol = 'https:';
    url.hostname = 'biorals.com';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }

  return handlePublic(request, env, { waitUntil: (p) => context.waitUntil(p) });
}
