# Deployment
Nothing has been deployed, pushed, or pointed at DNS by this work. All commands below are for YOU to run once you authorise a target repo/site.

## Local
`npm test` (build + 35 tests) · `npm run build` -> `dist/` · `npm run preview` · `npm run check` (duplicate-content report; `DIST_DIR=...` to point at another build).

## GitHub
This folder is NOT yet a git repository and has no remote. Create an empty repository on GitHub first, then:
```
cd couponbuz
git init -b main                         # creates the local repo
git add -A && git status                 # stage everything not ignored; READ the list: no .env, no service-account*.json, no dist/
git commit -m "Initial CouponBuz site"   # saves the first snapshot locally
git remote add origin <YOUR-REPO-URL>    # links to the repo you created (I will not guess this URL)
git push -u origin main                  # uploads. Run only when you are happy with the status list
```

## Netlify
Build command `node build/build.js`, publish dir `dist`, functions dir `netlify/functions`, Node 20 (all in `netlify.toml`). Environment variable NAMES (set values in Netlify UI only): SITE_URL, FIREBASE_PROJECT_ID, SHOW_DEMO, FIREBASE_SERVICE_ACCOUNT, RESEND_API_KEY, NOTIFY_EMAIL, NOTIFY_FROM, ANTHROPIC_API_KEY, CHAT_MODEL. Create a build hook (Site configuration > Build & deploy) and paste its URL into CMS > General settings so "Publish" rebuilds the site.
Deploy a preview/branch deploy first; custom domain and DNS only after the checks in NEXT_STEPS.md.
Rollback: Netlify > Deploys > pick a previous deploy > Publish deploy. Data rollback: CMS > Import/Export > Backup (take one before big edits).
