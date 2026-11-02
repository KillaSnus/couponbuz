// Visitor coupon submissions (POST /api/submit-coupon). They wait in the CMS > Submissions for review.
import { handleSubmitCoupon, errorResponse } from '../../src/forms.js';
import { json } from '../../src/cms.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });
  try { return await handleSubmitCoupon(request, env); } catch (e) { return errorResponse(e); }
}
