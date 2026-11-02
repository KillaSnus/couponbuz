// Tests for the AI support-bot Netlify Function (Anthropic and the site are mocked; nothing leaves this machine).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../netlify/functions/chat.mjs');
let n = 0;
const fresh = async () => (await import(pathToFileURL(FILE).href + '?v=' + ++n)).handler; // new module state per test
const ev = (o = {}) => ({ httpMethod: 'POST', headers: { host: 'attacker.example', 'x-nf-client-connection-ip': `10.0.0.${++n}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'How do I use a code?' }] }), ...o });

function mockFetch(calls) {
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (String(url).endsWith('/bot-knowledge.json')) return { ok: true, json: async () => ({ site: { name: 'T', email: 'e@x.test' }, stores: [], faqs: [], instructions: '' }) };
    if (String(url).startsWith('https://api.anthropic.com/')) return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Open the store page, press Show code.' }] }) };
    throw new Error('unexpected fetch ' + url);
  };
}
const setEnv = (e) => { for (const k of ['ANTHROPIC_API_KEY', 'SITE_URL', 'URL']) delete process.env[k]; Object.assign(process.env, e); };

test('only POST is accepted', async () => { setEnv({}); const h = await fresh(); assert.equal((await h(ev({ httpMethod: 'GET' }))).statusCode, 405); });
test('without an API key the function answers 503 (widget falls back to the FAQ list)', async () => { setEnv({}); const h = await fresh(); assert.equal((await h(ev())).statusCode, 503); });
test('rejects malformed input', async () => {
  setEnv({ ANTHROPIC_API_KEY: 'test-key', SITE_URL: 'https://site.test' }); mockFetch([]); const h = await fresh();
  assert.equal((await h(ev({ body: 'not json' }))).statusCode, 400);
  assert.equal((await h(ev({ body: JSON.stringify({ messages: [] }) }))).statusCode, 400);
  assert.equal((await h(ev({ body: JSON.stringify({ messages: [{ role: 'assistant', content: 'hi' }] }) }))).statusCode, 400);
});
test('valid request returns a reply and reads site data from SITE_URL', async () => {
  setEnv({ ANTHROPIC_API_KEY: 'test-key', SITE_URL: 'https://site.test' }); const calls = []; mockFetch(calls); const h = await fresh();
  const res = await h(ev()); assert.equal(res.statusCode, 200); assert.match(JSON.parse(res.body).reply, /Show code/);
  assert.ok(calls.includes('https://site.test/bot-knowledge.json'), calls.join());
});
test('never fetches site data from an attacker-controlled Host header', async () => {
  setEnv({ ANTHROPIC_API_KEY: 'test-key' }); const calls = []; mockFetch(calls); const h = await fresh();
  const res = await h(ev());
  assert.ok(!calls.some((u) => u.includes('attacker.example')), 'fetched from Host header: ' + calls.join());
  assert.equal(res.statusCode, 503);
});
test('per-IP rate limit returns 429 after 20 messages', async () => {
  setEnv({ ANTHROPIC_API_KEY: 'test-key', SITE_URL: 'https://site.test' }); mockFetch([]); const h = await fresh();
  const same = { host: 'site.test', 'x-nf-client-connection-ip': '203.0.113.9' }; let last;
  for (let i = 0; i < 21; i++) last = await h(ev({ headers: same }));
  assert.equal(last.statusCode, 429);
});
