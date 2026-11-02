// Newsletter + contact form (POST /api/form)
import { handleForm, errorResponse } from '../../src/forms.js';
import { json } from '../../src/cms.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });
  try { return await handleForm(request, env); } catch (e) { return errorResponse(e); }
}
