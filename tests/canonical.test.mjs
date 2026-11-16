import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as publicSite } from '../functions/[[path]].js';
import { makeEnv } from './_fakes.mjs';

const ctx = (request, env = makeEnv()) => ({ request, env, params: {}, waitUntil: () => {} });

test('redirects non-Biorals hostnames to biorals.com and preserves path and query', async () => {
  const request = new Request('https://old-domain.example/some/page/?source=search');
  const response = await publicSite(ctx(request));

  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://biorals.com/some/page/?source=search');
});

test('does not redirect the Biorals domain or its Cloudflare Pages hostnames', async () => {
  for (const host of ['biorals.com', 'biorals.pages.dev', 'preview.biorals.pages.dev']) {
    const request = new Request(`https://${host}/not-a-route/`);
    const response = await publicSite(ctx(request));
    assert.notEqual(response.status, 301, `${host} should not redirect`);
  }
});

test('keeps local development hosts usable', async () => {
  const request = new Request('http://localhost:8788/not-a-route/');
  const response = await publicSite(ctx(request));
  assert.notEqual(response.status, 301);
});
