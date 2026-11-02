// Visitor-facing endpoints: newsletter/contact form, coupon submissions, support chat.
import { HttpError, applyOps, clientIp, errorResponse, json, rateLimit } from './cms.js';
import { currentSite } from './runtime.js';

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const isEmail = (s) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s);
const rid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) return await request.json();
    const fd = await request.formData();
    const o = {};
    for (const [k, v] of fd.entries()) { if (k === 'markets') (o.markets ||= []).push(String(v)); else o[k] = String(v); }
    return o;
  } catch { throw new HttpError(400, 'Invalid form data.'); }
}
const wantsJson = (request) => (request.headers.get('accept') || '').includes('application/json') || (request.headers.get('content-type') || '').includes('application/json');
const back = (request, path) => Response.redirect(new URL(path, request.url).toString(), 303);

// ---------- newsletter + contact form (POST /api/form) ----------
export async function handleForm(request, env) {
  const ip = clientIp(request);
  if (!(await rateLimit(env, 'form', ip, 10, 600))) throw new HttpError(429, 'Too many requests. Please try again later.');
  const b = await readBody(request);
  if (str(b['bot-field'], 10)) return wantsJson(request) ? json({ ok: true }) : back(request, '/'); // honeypot: pretend success
  const kind = str(b['form-name'], 20) === 'contact' ? 'contact' : 'newsletter';
  const email = str(b.email, 200).toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.');
  const message = kind === 'contact' ? str(b.message, 3000) : '';
  if (kind === 'contact' && message.length < 5) throw new HttpError(400, 'Please write a short message.');
  await applyOps(env, [{
    col: 'submissions', id: `${kind}-${rid()}`,
    data: { kind, status: 'message', store: kind === 'contact' ? 'Contact form' : 'Newsletter signup', title: kind === 'contact' ? `Message from ${str(b.name, 80) || email}` : email, description: message, email, markets: [], createdAt: new Date().toISOString() },
  }]);
  return wantsJson(request) ? json({ ok: true }) : back(request, kind === 'contact' ? '/contact/?sent=1' : '/?subscribed=1');
}

// ---------- coupon submissions (POST /api/submit-coupon) ----------
export async function handleSubmitCoupon(request, env) {
  const ip = clientIp(request);
  if (!(await rateLimit(env, 'submit', ip, 6, 3600))) throw new HttpError(429, 'Too many submissions. Please try again later.');
  const b = await readBody(request);
  if (str(b.website, 10)) return wantsJson(request) ? json({ ok: true }) : back(request, '/submit-coupon/?sent=1');
  const ts = Number(b.ts);
  if (ts && Date.now() - ts < 2500) throw new HttpError(400, 'That was very fast. Please try again.');

  const errors = {};
  const store = str(b.store, 80), title = str(b.title, 120), code = str(b.code, 40), description = str(b.description, 500), email = str(b.email, 120).toLowerCase();
  const url = str(b.url, 300), expires = str(b.expires, 10);
  const markets = (Array.isArray(b.markets) ? b.markets : []).map((m) => String(m).toUpperCase()).filter((m) => ['US', 'UK', 'CA', 'EU'].includes(m));
  if (!store) errors.store = 'Store name is required.';
  if (title.length < 5) errors.title = 'Offer title needs at least 5 characters.';
  if (url && !/^https?:\/\/\S+$/i.test(url)) errors.url = 'Link must start with http:// or https://';
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) errors.expires = 'Expiry must be a date.';
  if (email && !isEmail(email)) errors.email = 'Email looks invalid.';
  if (!(b.consent === true || b.consent === 'yes' || b.consent === 'true')) errors.consent = 'Please confirm you checked the offer.';
  if (Object.keys(errors).length) return json({ errors }, 400);

  await applyOps(env, [{
    col: 'submissions', id: `sub-${rid()}`,
    data: { store, title, code, url, description, markets, expires, email, type: code ? 'code' : 'deal', status: 'pending', createdAt: new Date().toISOString() },
  }]);
  return wantsJson(request) ? json({ ok: true }) : back(request, '/submit-coupon/?sent=1');
}

// ---------- support chat (POST /api/chat) ----------
export async function handleChat(request, env) {
  const ip = clientIp(request);
  if (!(await rateLimit(env, 'chat', ip, 40, 600))) throw new HttpError(429, 'Too many messages. Please try again later.');
  let body; try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid request.'); }
  const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-8)
    .map((m) => ({ role: m && (m.role === 'assistant' || m.role === 'bot') ? 'assistant' : 'user', content: str(m && m.content, 600) }))
    .filter((m) => m.content);
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw new HttpError(400, 'No question received.');
  if (!env.ANTHROPIC_API_KEY) return json({ reply: '' }, 200); // empty reply: the widget answers from the FAQ list instead

  const site = await currentSite(env);
  const k = site.botKnowledge();
  const system = [
    `You are the support assistant for ${k.site.name} (${k.site.url}), a coupon and promo code website for ${k.regions.join(', ')}.`,
    'Answer briefly and politely using ONLY the facts below. Never invent codes, discounts, prices or expiry dates. If a code is not listed, say you do not have one and point to the store page. Mention that offers can change or expire.',
    k.site.disclosure ? `Disclosure: ${k.site.disclosure}` : '',
    k.instructions ? `Extra instructions from the site owner: ${k.instructions}` : '',
    `Contact: ${k.site.email || 'use the contact page at /contact/'}`,
    'FAQ:\n' + k.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n'),
    'Stores and current offers:\n' + k.stores.slice(0, 300).map((s) => `- ${s.name} (${s.url}) [${s.category || ''}] ${(s.offers || []).map((o) => `${o.title}${o.code ? ' code ' + o.code : ''}${o.sample ? ' (sample)' : ''}`).join('; ')}`).join('\n'),
  ].filter(Boolean).join('\n\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.CHAT_MODEL || 'claude-haiku-5-5', max_tokens: 350, system, messages }),
    });
    if (!res.ok) return json({ reply: '' });
    const data = await res.json();
    const reply = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    return json({ reply });
  } catch { return json({ reply: '' }); }
}

export { errorResponse };
