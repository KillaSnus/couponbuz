// Serves images uploaded in the CMS media library from KV: /media/uploads/<file>
import { IMAGE_TYPES } from '../../src/cms.js';

export async function onRequestGet({ params, env }) {
  const path = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  if (!env.CMS || !/^uploads\/[a-z0-9._-]+$/.test(path)) return new Response('Not found', { status: 404 });
  const { value, metadata } = await env.CMS.getWithMetadata('media:' + path, 'arrayBuffer');
  if (!value) return new Response('Not found', { status: 404 });

  const type = metadata && IMAGE_TYPES[metadata.type] ? metadata.type : 'application/octet-stream';
  const body = value instanceof ArrayBuffer ? new Uint8Array(value) : value;

  return new Response(body, {
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
