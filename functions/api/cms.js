// Admin CMS API: POST /api/cms (login + content operations). GET returns a harmless setup check.
import { health, handleCmsPost, errorResponse, json } from '../../src/cms.js';

export async function onRequest({ request, env }) {
  try {
    if (request.method === 'GET') return json(await health(env));
    if (request.method === 'POST') return await handleCmsPost(request, env);
    return json({ error: 'Method not allowed' }, 405, { allow: 'GET, POST' });
  } catch (e) { return errorResponse(e); }
}
