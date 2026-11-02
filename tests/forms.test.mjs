import test from 'node:test';
import assert from 'node:assert/strict';
import { handleForm, handleSubmitCoupon, handleChat, errorResponse } from '../src/forms.js';
import { listDocs } from '../src/cms.js';
import { resetRuntimeCache } from '../src/runtime.js';
import { makeEnv, post, req } from './_fakes.mjs';

const run = async (fn, request, env) => { try { const r = await fn(request, env); return { status: r.status, headers: r.headers, body: r.status === 303 ? null : await r.json() }; } catch (e) { const r = errorResponse(e); return { status: r.status, body: await r.json() }; } };
const good = { store: 'Nike', title: '15% off your first order', code: 'FIRST15', url: 'https://nike.com/x', description: 'New customers', markets: ['US', 'XX', 'UK'], expires: '2027-01-31', email: 'a@b.co', consent: true, website: '', ts: String(Date.now() - 10000) };

test('coupon submission is validated and stored as PENDING (never published)', async () => {
  const env = makeEnv();
  const r = await run(handleSubmitCoupon, post('/api/submit-coupon', good), env);
  assert.equal(r.status, 200);
  const subs = await listDocs(env, 'submissions');
  assert.equal(subs.length, 1); assert.equal(subs[0].status, 'pending'); assert.deepEqual(subs[0].markets, ['US', 'UK']); assert.equal(subs[0].type, 'code');
  assert.equal((await listDocs(env, 'coupons')).length, 0);
});

test('submission validation errors are reported per field', async () => {
  const env = makeEnv();
  const r = await run(handleSubmitCoupon, post('/api/submit-coupon', { ...good, store: '', title: 'abc', url: 'javascript:alert(1)', consent: false, email: 'bad' }), env);
  assert.equal(r.status, 400); assert.deepEqual(Object.keys(r.body.errors).sort(), ['consent', 'email', 'store', 'title', 'url']);
  assert.equal((await listDocs(env, 'submissions')).length, 0);
});

test('honeypot and too-fast submissions are not stored', async () => {
  const env = makeEnv();
  assert.equal((await run(handleSubmitCoupon, post('/api/submit-coupon', { ...good, website: 'http://spam' }), env)).status, 200);
  assert.equal((await run(handleSubmitCoupon, post('/api/submit-coupon', { ...good, ts: String(Date.now()) }), env)).status, 400);
  assert.equal((await listDocs(env, 'submissions')).length, 0);
});

test('submissions are rate limited per visitor', async () => {
  const env = makeEnv(); let last;
  for (let i = 0; i < 8; i++) last = await run(handleSubmitCoupon, post('/api/submit-coupon', good, { 'cf-connecting-ip': '1.2.3.4' }), env);
  assert.equal(last.status, 429);
  assert.equal((await run(handleSubmitCoupon, post('/api/submit-coupon', good, { 'cf-connecting-ip': '5.6.7.8' }), env)).status, 200);
});

test('two visitors submitting at once never overwrite each other', async () => {
  const env = makeEnv();
  await Promise.all(Array.from({ length: 5 }, (_, i) => run(handleSubmitCoupon, post('/api/submit-coupon', { ...good, title: 'Offer number ' + i }, { 'cf-connecting-ip': '9.9.9.' + i }), env)));
  assert.equal((await listDocs(env, 'submissions')).length, 5);
});

test('newsletter + contact forms store messages; bad email / honeypot handled', async () => {
  const env = makeEnv();
  const fd = new FormData(); fd.set('form-name', 'newsletter'); fd.set('email', 'Fan@Example.com'); fd.set('bot-field', '');
  const r = await handleForm(new Request('https://couponbuz.test/api/form', { method: 'POST', body: fd }), env);
  assert.equal(r.status, 303); // plain form post (no JS) is redirected back
  const c = await run(handleForm, post('/api/form', { 'form-name': 'contact', email: 'x@y.co', name: 'Sam', message: 'Hello there, a question' }), env);
  assert.equal(c.status, 200);
  assert.equal((await run(handleForm, post('/api/form', { 'form-name': 'newsletter', email: 'nope' }), env)).status, 400);
  assert.equal((await run(handleForm, post('/api/form', { 'form-name': 'newsletter', email: 'a@b.co', 'bot-field': 'x' }), env)).status, 200);
  const subs = await listDocs(env, 'submissions');
  assert.equal(subs.length, 2); assert.ok(subs.some((s) => s.email === 'fan@example.com' && s.kind === 'newsletter')); assert.ok(subs.some((s) => s.kind === 'contact' && /Sam/.test(s.title)));
  assert.ok(subs.every((s) => s.status === 'message')); // so the admin never offers to "approve" them as coupons
});

test('chat: without an API key the widget falls back to FAQ answers (empty reply)', async () => {
  resetRuntimeCache();
  const env = makeEnv();
  const r = await run(handleChat, post('/api/chat', { messages: [{ role: 'user', content: 'hi' }] }), env);
  assert.equal(r.status, 200); assert.equal(r.body.reply, '');
  assert.equal((await run(handleChat, post('/api/chat', { messages: [] }), env)).status, 400);
});

test('chat with an API key sends only public site knowledge and never leaks secrets', async () => {
  resetRuntimeCache();
  const env = makeEnv({ ANTHROPIC_API_KEY: 'sk-test-123' });
  let sent;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent = { url, init }; return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Try the Nike page.' }] }), { status: 200 }); };
  try {
    const r = await run(handleChat, post('/api/chat', { messages: [{ role: 'user', content: 'Any Nike codes?' }] }), env);
    assert.equal(r.body.reply, 'Try the Nike page.');
    assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
    const body = JSON.parse(sent.init.body);
    assert.equal(sent.init.headers['x-api-key'], 'sk-test-123');
    assert.match(body.system, /Nike/); assert.ok(!body.system.includes(env.ADMIN_PASSWORD)); assert.ok(!body.system.includes('sk-test-123'));
    globalThis.fetch = async () => { throw new Error('network down'); };
    assert.equal((await run(handleChat, post('/api/chat', { messages: [{ role: 'user', content: 'again' }] }), env)).body.reply, '');
  } finally { globalThis.fetch = realFetch; }
});
