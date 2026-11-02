// Support chat bubble (POST /api/chat). Uses Claude when ANTHROPIC_API_KEY is set, otherwise the widget answers from your FAQ list.
import { handleChat, errorResponse } from '../../src/forms.js';
import { json } from '../../src/cms.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });
  try { return await handleChat(request, env); } catch (e) { return errorResponse(e); }
}
