// Public website: every page is rendered from the CMS data in KV (see src/runtime.js).
import { handlePublic } from '../src/runtime.js';

export async function onRequest(context) {
  const { request, env } = context;
  return handlePublic(request, env, { waitUntil: (p) => context.waitUntil(p) });
}
