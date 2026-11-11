# Biorals (Cloudflare Pages edition)

Coupon website + admin CMS, built for Cloudflare Pages. **When you save in the CMS, the public website shows the change immediately.** There is no build and no deploy hook.

## How it works
- `public/admin/` is the CMS (a static app). It talks to `/api/cms` (a Pages Function).
- Content is stored in **Cloudflare KV** (binding `CMS`): stores, offers, categories, guides, pages, redirects, settings, submissions, uploaded images.
- Every public page is rendered on request from that content by `functions/[[path]].js` (`src/site.js` holds the page templates and SEO logic). Every CMS save changes a version number that the page cache is keyed on, so the next visitor gets fresh HTML.
- Public forms (`/api/form`, `/api/submit-coupon`) and the optional AI chat (`/api/chat`) are also Pages Functions. Visitor submissions wait in CMS > Submissions.

## Commands
```
npm install
npm test            # 47 tests (CMS API, live updates, SEO checks, forms, functions)
npm run setup       # once: creates the KV storage and writes its id into wrangler.toml
npm run deploy      # publish to Cloudflare Pages
npm run dev         # local preview with wrangler (copy .dev.vars.example to .dev.vars first)
```
Step-by-step deployment: see **DEPLOY.md**.

## Layout
```
functions/        Cloudflare Pages Functions (public site, /api/*, /media/*)
src/              site renderer (site.js + lib/), CMS backend (cms.js), forms (forms.js), runtime (runtime.js), starter data (seed.js)
public/           static files: admin app, CSS/JS, _routes.json, _headers
tests/            node tests + tests/e2e-browser.py (Playwright scenario used to check the admin in a real browser)
wrangler.toml     Cloudflare configuration (KV binding, SITE_URL, SHOW_DEMO)
```
