import { $, esc, initBackend, backend, setUser, DEMO, toast } from './js/core.js';
import { setRouter, dashboard, listView, settingsView, mediaView, seoAuditView, importExportView, activityView, submissionsView } from './js/views.js';

const app = document.getElementById('app');

async function route(v) {
  try {
    if (v === 'dashboard') await dashboard();
    else if (v === 'media') await mediaView();
    else if (v === 'seoaudit') await seoAuditView();
    else if (v === 'importexport') await importExportView();
    else if (v === 'submissions') await submissionsView();
    else if (v === 'activity') await activityView();
    else if (v.startsWith('s:')) await settingsView(v.slice(2));
    else if (v.startsWith('c:')) await listView(v.slice(2));
    window.scrollTo(0, 0);
  } catch (e) {
    app.innerHTML = `<div class="login"><h1>Something went wrong</h1><p>${esc(e.message)}</p><p class="help">If this keeps happening, sign out and back in, or check the function logs in Cloudflare (Workers &amp; Pages → your project → Functions → Logs).</p><button class="btn" onclick="location.reload()">Reload</button></div>`;
    console.error(e);
  }
}
setRouter(route);

function loginView(msg = '') {
  app.innerHTML = `<form class="login" id="login"><div class="lg">CouponBuz</div><h1>Admin sign in</h1><p>Authorised administrators only.</p>
  <label>Email</label><input class="in" id="e" type="email" autocomplete="username" required>
  <label>Password</label><input class="in" id="p" type="password" autocomplete="current-password" required>
  <div class="err" id="err">${esc(msg)}</div><div style="margin-top:16px"><button class="btn" style="width:100%;justify-content:center">Sign in</button></div></form>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    try { await backend.signIn($('#e').value.trim(), $('#p').value); } catch (err) { $('#err').textContent = err.message || 'Sign-in failed. Check your email and password.'; }
  };
}

(async function boot() {
  try { await initBackend(); } catch (e) { app.innerHTML = `<div class="login"><h1>Could not start</h1><p>${esc(e.message)}</p></div>`; return; }
  backend.onAuth((u) => {
    if (!u) { setUser(null); return loginView(); }
    setUser(u); route('dashboard');
  });
})();
