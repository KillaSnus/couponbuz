// One-time setup: creates the KV storage on your Cloudflare account and writes its id into wrangler.toml.
// Usage: npm install && npx wrangler login && npm run setup
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tomlPath = path.join(root, 'wrangler.toml');
let toml = fs.readFileSync(tomlPath, 'utf8');
const wr = (args) => execFileSync('npx', ['wrangler', ...args], { cwd: root, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });

if (!toml.includes('REPLACE_WITH_KV_ID')) {
  console.log('✓ wrangler.toml already has a KV id. Nothing to create.');
} else {
  console.log('Creating KV namespace "couponbuz-cms"…');
  const out = wr(['kv', 'namespace', 'create', 'couponbuz-cms']);
  console.log(out);
  const id = (out.match(/"?id"?\s*[:=]\s*"([0-9a-f]{32})"/i) || out.match(/\b([0-9a-f]{32})\b/) || [])[1];
  if (!id) { console.error('Could not read the namespace id from the output above. Copy it into wrangler.toml (id = "...") by hand.'); process.exit(1); }
  toml = toml.replace('REPLACE_WITH_KV_ID', id);
  fs.writeFileSync(tomlPath, toml);
  console.log(`✓ Saved KV id ${id} in wrangler.toml`);
}
console.log(`
Next steps:
  1. npx wrangler pages project create couponbuz --production-branch main     (first time only)
  2. npx wrangler pages secret put ADMIN_PASSWORD --project-name couponbuz    (type a long password)
  3. npm run deploy
  4. Open https://<your-site>/admin/ and sign in, then Dashboard > Import starter data.
`);
