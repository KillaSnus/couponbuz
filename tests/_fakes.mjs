// In-memory stand-ins for Cloudflare KV, the edge cache and static assets, so the real handlers can be tested in Node.
export class FakeKV {
  constructor() { this.m = new Map(); }
  async get(k, type) { const e = this.m.get(k); if (!e) return null; if (type === 'arrayBuffer') return e.v instanceof Uint8Array ? e.v.buffer.slice(e.v.byteOffset, e.v.byteOffset + e.v.byteLength) : new TextEncoder().encode(e.v).buffer; return typeof e.v === 'string' ? e.v : new TextDecoder().decode(e.v); }
  async getWithMetadata(k, type) { const e = this.m.get(k); return { value: e ? await this.get(k, type) : null, metadata: e ? e.meta ?? null : null }; }
  async put(k, v, o = {}) { this.m.set(k, { v, meta: o.metadata }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })), list_complete: true }; }
}
export class FakeCache {
  constructor() { this.m = new Map(); }
  async match(req) { const e = this.m.get(req.url); return e ? new Response(e.body, { status: e.status, headers: e.headers }) : undefined; }
  async put(req, res) { this.m.set(req.url, { body: await res.text(), status: res.status, headers: [...res.headers] }); }
}
export const ORIGIN = 'https://biorals.test';
export const PASSWORD = 'correct horse battery staple 42';
export function makeEnv(extra = {}) {
  return { CMS: new FakeKV(), ADMIN_PASSWORD: PASSWORD, ADMIN_EMAIL: 'owner@biorals.test', SITE_URL: ORIGIN, SHOW_DEMO: 'false', ...extra };
}
export const req = (path, init = {}) => new Request(ORIGIN + path, init);
export const post = (path, body, headers = {}) => new Request(ORIGIN + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
