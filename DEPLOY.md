# Deploy to Cloudflare Pages

You need: a free Cloudflare account, Node.js 20+, and this folder.

## 1. One-time setup (about 5 minutes)
```
npm install
npx wrangler login                 # opens the browser to authorise
npm run setup                      # creates the KV storage and saves its id in wrangler.toml
npx wrangler pages project create biorals --production-branch main
npx wrangler pages secret put ADMIN_PASSWORD --project-name biorals     # type a long password
npm run deploy
```
Optional secrets (same command): `ADMIN_EMAIL` (only this email may sign in), `SESSION_SECRET` (long random text), `ANTHROPIC_API_KEY` (AI answers in the chat bubble).

Edit `wrangler.toml` first if needed: `SITE_URL` must be your real domain (no trailing slash). Set `SHOW_DEMO = "false"` once you have real offers.

## 2. Open the CMS
Go to `https://<your-project>.pages.dev/admin/`, sign in, then **Dashboard > Import starter data** (first time only). Edit anything, save, and reload the public page: it is already updated.

Add your 535 stores through **Import / Export** (CSV). Check the result on /stores/ afterwards.

## 3. Use your own domain (biorals.com)
Cloudflare dashboard > Workers & Pages > biorals > Custom domains > add `biorals.com`. If the domain is currently attached to your OLD Pages project, remove it there first, then add it here.

## Deploying from GitHub instead of the CLI
Push this folder to GitHub, then Workers & Pages > Create > Pages > Connect to Git. Build command: leave empty. Build output directory: `public`. The KV id must already be in `wrangler.toml` (run `npm run setup` once locally and commit the file). Add `ADMIN_PASSWORD` under Settings > Variables and Secrets.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Login says ADMIN_PASSWORD is not set | Add the secret, then deploy again. |
| Admin says the KV binding `CMS` is missing | Run `npm run setup`, or bind a KV namespace named `CMS` in Settings > Bindings, then deploy again. |
| Public site shows only the sample stores | The CMS is still empty: Dashboard > Import starter data, or import your CSV. |
| A change shows up a bit late on a different device or country | KV is eventually consistent. The same browser location sees saves at once; other regions can take up to about a minute. |
| Cloudflare error 1102 (CPU limit) on a big page | Free plan allows 10 ms CPU per request. Pages are cached after the first view, but if you hit this on large pages (for example /stores/ with hundreds of stores), switch to the Workers Paid plan ($5/month). |
| Forgot the admin password | Set a new `ADMIN_PASSWORD` secret and deploy again. |

## Limits worth knowing
- Each collection (for example all stores) is one KV value, so two admins saving at the same second could overwrite each other. This is designed for a single editor. Visitor submissions are stored one key each, so they never collide.
- Uploaded images are stored in KV (max 6 MB each). For a very large image library, use R2 later.
- Login throttling uses KV counters, which are approximate.
