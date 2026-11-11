import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCmsPost, health, errorResponse, issueToken, verifyToken, getVersion } from '../src/cms.js';
import { makeEnv, post, PASSWORD } from './_fakes.mjs';

async function call(env, body, token) {
  try { const r = await handleCmsPost(post('/api/cms', body, token ? { authorization: 'Bearer ' + token } : {}), env); return { status: r.status, body: await r.json() }; }
  catch (e) { const r = errorResponse(e); return { status: r.status, body: await r.json() }; }
}
const login = async (env) => (await call(env, { op: 'login', email: 'owner@biorals.test', password: PASSWORD })).body.token;

test('login works with the right password and rejects the wrong one', async () => {
  const env = makeEnv();
  assert.ok(await login(env));
  const bad = await call(env, { op: 'login', email: 'owner@biorals.test', password: 'nope' });
  assert.equal(bad.status, 401);
  const wrongMail = await call(env, { op: 'login', email: 'someone@else.test', password: PASSWORD });
  assert.equal(wrongMail.status, 401);
});

test('login without ADMIN_PASSWORD gives a clear setup error, never a silent pass', async () => {
  const env = makeEnv({ ADMIN_PASSWORD: undefined });
  const r = await call(env, { op: 'login', email: 'x@y.z', password: '' });
  assert.equal(r.status, 500); assert.match(r.body.error, /ADMIN_PASSWORD/);
  assert.equal(await verifyToken(env, await issueToken(makeEnv(), 'a')), null);
});

test('missing KV binding is explained', async () => {
  const env = makeEnv(); delete env.CMS;
  const tok = await issueToken(env, 'a');
  const r = await call(env, { op: 'list', col: 'stores' }, tok);
  assert.equal(r.status, 500); assert.match(r.body.error, /KV/);
  assert.equal((await health(env)).kv, false);
});

test('login is throttled after repeated failures', async () => {
  const env = makeEnv();
  for (let i = 0; i < 8; i++) await call(env, { op: 'login', email: 'owner@biorals.test', password: 'bad' + i });
  const r = await call(env, { op: 'login', email: 'owner@biorals.test', password: PASSWORD });
  assert.equal(r.status, 429);
});

test('every content operation requires a valid token', async () => {
  const env = makeEnv();
  for (const body of [{ op: 'list', col: 'stores' }, { op: 'set', col: 'stores', id: 'x', data: {} }, { op: 'del', col: 'stores', id: 'x' }, { op: 'batch', ops: [] }, { op: 'upload', name: 'a.png', dataUrl: 'data:image/png;base64,AAAA' }, { op: 'me' }]) {
    const r = await call(env, body); assert.equal(r.status, 401, body.op); assert.equal(r.body.code, 'auth');
  }
  assert.equal((await call(env, { op: 'me' }, 'garbage.token')).status, 401);
  const good = await login(env);
  const tampered = good.slice(0, -3) + (good.endsWith('AAA') ? 'BBB' : 'AAA');
  assert.equal((await call(env, { op: 'me' }, tampered)).status, 401);
  const expired = await issueToken(env, 'a', -10);
  assert.equal((await call(env, { op: 'me' }, expired)).status, 401);
});

test('set / get / list / del round trip, ids are returned, __proto__ is refused', async () => {
  const env = makeEnv(); const t = await login(env);
  assert.equal((await call(env, { op: 'set', col: 'stores', id: 'acme', data: { name: 'Acme', slug: 'acme' } }, t)).status, 200);
  const l = (await call(env, { op: 'list', col: 'stores' }, t)).body.items;
  assert.equal(l.length, 1); assert.equal(l[0].id, 'acme'); assert.ok(l[0].updatedAt);
  assert.equal((await call(env, { op: 'get', col: 'stores', id: 'acme' }, t)).body.item.name, 'Acme');
  assert.equal((await call(env, { op: 'get', col: 'stores', id: 'nope' }, t)).body.item, null);
  assert.equal((await call(env, { op: 'set', col: 'stores', id: '__proto__', data: { a: 1 } }, t)).status, 400);
  assert.equal((await call(env, { op: 'set', col: 'nonsense', id: 'x', data: {} }, t)).status, 400);
  assert.equal(({}).polluted, undefined);
  await call(env, { op: 'del', col: 'stores', id: 'acme' }, t);
  assert.equal((await call(env, { op: 'list', col: 'stores' }, t)).body.items.length, 0);
});

test('batch writes many items in one call and respects the 200 op limit', async () => {
  const env = makeEnv(); const t = await login(env);
  const ops = Array.from({ length: 100 }, (_, i) => ({ col: 'stores', id: 's' + i, data: { name: 'S' + i, slug: 's' + i } }));
  assert.equal((await call(env, { op: 'batch', ops }, t)).status, 200);
  assert.equal((await call(env, { op: 'list', col: 'stores' }, t)).body.items.length, 100);
  const tooMany = Array.from({ length: 201 }, (_, i) => ({ col: 'stores', id: 'x' + i, data: {} }));
  assert.equal((await call(env, { op: 'batch', ops: tooMany }, t)).status, 400);
});

test('public content changes bump the version; activity / submissions / media do not', async () => {
  const env = makeEnv(); const t = await login(env);
  const v0 = await getVersion(env);
  await call(env, { op: 'set', col: 'activity', id: 'a1', data: { action: 'x', at: new Date().toISOString() } }, t);
  await call(env, { op: 'set', col: 'submissions', id: 's1', data: { store: 'X' } }, t);
  assert.equal(await getVersion(env), v0);
  await call(env, { op: 'set', col: 'stores', id: 'a', data: { name: 'A', slug: 'a' } }, t);
  const v1 = await getVersion(env); assert.notEqual(v1, v0);
  await call(env, { op: 'del', col: 'stores', id: 'a' }, t);
  assert.notEqual(await getVersion(env), v1);
});

test('activity log is capped', async () => {
  const env = makeEnv(); const t = await login(env);
  for (let b = 0; b < 4; b++) await call(env, { op: 'batch', ops: Array.from({ length: 100 }, (_, i) => ({ col: 'activity', id: `a${b}-${i}`, data: { action: 'x', at: new Date(2026, 0, 1, 0, 0, b * 100 + i).toISOString() } })) }, t);
  assert.equal((await call(env, { op: 'list', col: 'activity' }, t)).body.items.length, 300);
});

test('image upload: stores bytes, rejects non-images and oversize files, delete works', async () => {
  const env = makeEnv(); const t = await login(env);
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const up = (await call(env, { op: 'upload', name: 'My Logo!.PNG', dataUrl: png }, t)).body;
  assert.match(up.url, /^\/media\/uploads\/[a-z0-9]+-my-logo\.png$/);
  assert.ok(env.CMS.m.has('media:' + up.path));
  assert.equal((await call(env, { op: 'upload', name: 'x.html', dataUrl: 'data:text/html;base64,PGI+' }, t)).status, 400);
  assert.equal((await call(env, { op: 'upload', name: 'x.png', dataUrl: 'not a data url' }, t)).status, 400);
  const big = 'data:image/png;base64,' + Buffer.alloc(6 * 1024 * 1024 + 10).toString('base64');
  assert.equal((await call(env, { op: 'upload', name: 'big.png', dataUrl: big }, t)).status, 413);
  assert.equal((await call(env, { op: 'delfile', path: '../secrets' }, t)).status, 400);
  assert.equal((await call(env, { op: 'delfile', path: up.path }, t)).status, 200);
  assert.equal(env.CMS.m.has('media:' + up.path), false);
});

test('GET /api/cms health check exposes no secrets', async () => {
  const env = makeEnv(); const h = await health(env);
  assert.deepEqual(Object.keys(h).sort(), ['kv', 'ok', 'passwordSet', 'version']);
  assert.ok(!JSON.stringify(h).includes(PASSWORD));
});
