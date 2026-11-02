# Security notes (actual state)
## Model
Static public site; admin is a browser app. The browser holds only the public Firebase web config. Real authorisation = Firestore/Storage rules keyed to the admin UID (`ADMIN_UID_HERE` placeholder must be replaced). The email check in admin JS is a UI gate only.

## Rules (static lint passes; emulator NOT run)
- Anonymous: read-only on stores, coupons, categories, posts, pages, collections, redirects, settings, media. No writes anywhere. No access to `submissions` or `activity`.
- Admin UID: read/write everything. Storage: admin uploads only, images only, <5MB.
- Note: settings are publicly readable (needed for the build). Never put secrets in settings docs (custom-code fields are public output anyway).

## Public submission (`netlify/functions/submit-coupon.mjs`)
Server-side validation (lengths, https-only URL, code charset, date window, consent), `<`/`>` and control characters stripped, honeypot + minimum-time check, Origin must equal SITE_URL, per-IP limit 5/hour (in-memory per instance: a speed bump, not a guarantee), 20 KB body cap, saved only as `status: pending` via service account to admin-only collection; admin approval creates a DRAFT. Email is plain text via Resend only when configured; failure is logged without losing the submission; no user-supplied header fields (no header injection path). Errors returned to users are generic. Tested with mocks only.
Residual risk: determined bots can still send low-volume spam to the queue; consider Turnstile/hCaptcha and a durable rate limiter (Netlify Blobs / Upstash) if abuse appears. Netlify Forms (newsletter/contact) use honeypot only.

## Chat function
Anthropic key server-side only; SITE_URL fixed (not Host header); rate limit 20/10min/IP (in-memory); knowledge limited to public `bot-knowledge.json`; max_tokens 400.

## Headers
`netlify.toml` sets security headers; `/admin/*` is noindex + no-store. No CSP yet (the admin imports the Firebase SDK from gstatic and inline scripts exist) - recommended follow-up.

## Secrets
Names only in `.env.example`. `.gitignore` excludes .env*, service-account*.json, dist/. Tree scan found no key/token/private-key patterns (pattern scan, not proof). No git history exists yet, so nothing can have been committed.
If a secret is ever committed: deleting it in a later commit is NOT enough. Revoke/rotate it first, then clean history (git filter-repo / BFG) with your approval, and force-push only deliberately.

## Manual checks still to run on a live Firebase project (NOT YET RUN)
1. Anonymous REST GET `.../documents/submissions` -> expect 403.
2. Anonymous PATCH/POST to `stores` -> expect 403.
3. Signed-in NON-admin account write -> expect 403.
4. Storage upload without admin token -> expect 403.
5. POST submit-coupon from another Origin -> 403; 6 rapid posts -> 429.
## Not tested / not covered
Dependency audit (zero npm deps, but Firebase SDK loads from CDN, pinned 10.12.2, no SRI); backups schedule; data-retention policy for submissions (email addresses are stored: set a deletion routine); login lockout relies on Firebase defaults.
