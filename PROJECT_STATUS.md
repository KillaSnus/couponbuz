# CouponBuz: Project Status
Last updated: 2026-10-18. Everything below is about the code in this folder. "Verified" means a command was run in the build sandbox and passed; "Not verified" means it needs live Firebase / Netlify / search-engine access that the sandbox does not have.

## Stack
Zero-dependency Node static-site generator (`build/`) -> `dist/`. Content comes from Firestore (public-read REST) or `data/seed.json` fallback. Admin CMS in `admin/` (Firebase Auth + Firestore + Storage, client SDK from CDN). Netlify Functions: `chat.mjs` (AI bot), `submit-coupon.mjs` (public submissions).

## Completed and verified (by command)
- `npm run build` succeeds: 34 indexable pages from seed data. (`npm test` builds and inspects it.)
- `npm test`: 35 tests pass, 0 fail. Covers critical routes, titles <= 60 / descriptions length, uniqueness, internal links, sitemap == indexable pages, robots.txt, orphan check, sample-offer labelling, markdown/theme injection safety, WCAG AA contrast of default theme, seed integrity, static lint of Firestore/Storage rules, chat function, submission function (mocked Firebase/OAuth/email).
- Admin smoke test in Chromium (demo mode): login-free demo loads, 20 nav sections, Submissions approve -> draft coupon, Social/Advanced SEO tabs present, 0 page errors. `?demo=1` is ignored when Firebase is configured (shell not shown).
- Secret scan of the tree (key/token/private-key patterns): no matches. `admin/firebase-config.js` contains placeholders only.

## Features present
Public: home, store directory A-Z, store pages `/coupons/{slug}/`, category pages, region pages, deals pages, guides, trust pages (how we verify, how we make money, about, contact, privacy, terms), search, 404, submit-a-coupon form (`/submit-coupon/`, noindex).
SEO: per-page title/description/OG/noindex/canonical/custom head overrides (rendered in static HTML), canonical tags, breadcrumbs, JSON-LD (Organization, WebSite, BreadcrumbList, FAQPage, Article, ItemList), sitemap index + sitemaps, robots.txt, `_redirects` from CMS, noindex for stores with no offers.
CMS: stores, coupons, categories, deals, guides, pages, redirects, media, menus, theme, home sections, SEO settings, custom code, bot settings, CSV import/export, backup/restore, SEO audit, activity log, submissions moderation.

## Incomplete / limitations (be aware)
- Sample data: the 8 offers in `data/seed.json` are labelled samples with a fake code; real coupons must be entered/verified in the CMS. Build with `SHOW_DEMO=false` to hide them.
- Brand and coupon records do NOT yet have the verification-workflow fields (source URL, verification method, review queue, import dry-run/rollback, image provenance). Basic `verified`/`verifiedAt` exist. (Master prompt 4 scope.)
- Admin SEO audit is a client-side check of CMS data, not a crawl of the live site.
- No hreflang (no genuinely equivalent localized pages exist; correct to omit for now).
- No IndexNow integration yet.
- Admin email check in the browser is only a UI gate; real protection is the UID in the Firestore/Storage rules.

## Not verified (needs live access)
Firebase Auth login, Firestore/Storage rules behaviour (only statically linted; emulator unavailable), Netlify deploy, Netlify build hook, real Anthropic call, Resend email, service-account write from the function, Netlify Forms, Lighthouse / PageSpeed / Core Web Vitals / axe (tools unavailable here, scores are UNMEASURED), Search Console / Bing, indexing, rankings.
