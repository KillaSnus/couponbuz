# Next steps (in order)
1. Create the Firebase project; enable Email/Password auth, Firestore, Storage. Create your admin user; copy its UID.
2. Replace `ADMIN_UID_HERE` in `firestore.rules` and `storage.rules`; publish both. Paste the web config into `admin/firebase-config.js` (web config is public by design) and set `ADMIN_EMAILS`.
3. Run the rules test: sign out, then confirm anonymous reads of `submissions` and `activity` and any write return permission-denied (see SECURITY_NOTES.md checks). Mark results.
4. Create a GitHub repo (empty, private to start). Follow DEPLOYMENT.md "GitHub".
5. Connect the repo to Netlify, set env var NAMES from `.env.example`, deploy a PREVIEW, test the submission form, admin login, and bot on the preview URL.
6. Replace sample content with real, verified offers; fill descriptions for every store (the duplicate check flags thin pages).
7. Only then: custom domain, Search Console + Bing verification, submit sitemap.
8. Next engineering items: verification workflow fields + import dry-run (prompt 4), IndexNow, Lighthouse/axe run on the preview URL, independent audit.
