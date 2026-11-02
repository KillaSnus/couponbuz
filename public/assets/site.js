(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ----- mobile drawer -----
  var drawer = $('#drawer'), scrim = $('.scrim'), burger = $('[data-drawer-open]');
  function setDrawer(open) {
    if (!drawer) return;
    drawer.hidden = !open; scrim.hidden = !open;
    if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) { var f = $('summary,a,input', drawer); if (f) f.focus(); } else if (burger) burger.focus();
  }
  $$('[data-drawer-open]').forEach(function (b) { b.addEventListener('click', function () { setDrawer(true); }); });
  $$('[data-drawer-close]').forEach(function (b) { b.addEventListener('click', function () { setDrawer(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setDrawer(false); closeModal(); $$('.item.open').forEach(function (i) { i.classList.remove('open'); }); } });

  // ----- desktop mega menu (keyboard/touch) -----
  $$('.item .chev').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var it = b.parentElement, open = !it.classList.contains('open');
      $$('.item.open').forEach(function (i) { i.classList.remove('open'); });
      it.classList.toggle('open', open); b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.item')) $$('.item.open').forEach(function (i) { i.classList.remove('open'); }); });

  // ----- offers: reveal modal -----
  var OFFERS = {}; var oj = $('#offers-json'); if (oj) { try { OFFERS = JSON.parse(oj.textContent); } catch (x) {} }
  var modal = $('#cb-modal'), lastFocus = null;
  function closeModal() { if (!modal || modal.hidden) return; modal.hidden = true; modal.innerHTML = ''; document.body.style.overflow = ''; if (location.hash.indexOf('#o-') === 0) history.replaceState(null, '', location.pathname + location.search); if (lastFocus) lastFocus.focus(); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function openOffer(id, trigger) {
    var o = OFFERS[id]; if (!o || !modal) return;
    lastFocus = trigger || document.activeElement;
    var sheet = el('div', 'sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', o.s + ' promo code');
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = closeModal; sheet.appendChild(x);
    var img = el('img'); img.src = o.l; img.alt = o.s + ' logo'; img.width = 64; img.height = 64; sheet.appendChild(img);
    sheet.appendChild(el('h3', '', o.t));
    if (o.d) sheet.appendChild(el('div', 'disc', o.d));
    if (o.c) {
      var box = el('div', 'codebox'), code = el('code', '', o.c), cp = el('button', 'btn accent', 'Copy'); cp.type = 'button';
      cp.onclick = function () { copy(o.c, function () { cp.textContent = 'Copied!'; setTimeout(function () { cp.textContent = 'Copy'; }, 1800); }); };
      box.appendChild(code); box.appendChild(cp); sheet.appendChild(box);
      sheet.appendChild(el('p', 'step', 'Copy the code, then paste it in the promo box at checkout on ' + o.s + '.'));
    }
    var go = el('a', 'btn full', 'Go to ' + o.s); go.href = o.u; go.target = '_blank'; go.rel = 'sponsored nofollow noopener'; sheet.appendChild(go);
    if (o.demo) sheet.appendChild(el('p', 'terms', 'This is a sample listing used to show the layout. It is not a real code.'));
    if (o.x || o.e) sheet.appendChild(el('p', 'terms', (o.e ? 'Ends ' + o.e + '. ' : '') + (o.x || '')));
    modal.innerHTML = ''; modal.appendChild(sheet); modal.hidden = false; document.body.style.overflow = 'hidden';
    cp && cp.focus ? cp.focus() : go.focus();
    if (location.hash !== '#o-' + id) history.replaceState(null, '', '#o-' + id);
  }
  function copy(text, done) {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, done);
    else { var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); done(); }
  }
  document.addEventListener('click', function (e) {
    var r = e.target.closest('[data-reveal]');
    if (r) { var id = r.getAttribute('data-reveal'); var o = OFFERS[id]; openOffer(id, r); if (o && window.__CB && window.__CB.openOnReveal) window.open(o.u, '_blank', 'noopener'); return; }
    if (modal && e.target === modal) closeModal();
  });
  if (location.hash.indexOf('#o-') === 0) { var hid = location.hash.slice(3); if (OFFERS[hid]) openOffer(hid); }

  // ----- store page filters -----
  var fl = $('[data-filters]');
  if (fl) {
    var type = 'all', mk = '';
    var apply = function () {
      var shown = 0;
      $$('[data-list] .offer').forEach(function (c) {
        var m = (c.getAttribute('data-markets') || '').split(',');
        var ok = (type === 'all' || c.getAttribute('data-type') === type) && (!mk || m.indexOf(mk) > -1);
        c.style.display = ok ? '' : 'none'; if (ok) shown++;
      });
      var none = $('[data-none]'); if (none) none.hidden = shown > 0;
    };
    fl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var grp = b.parentElement; $$('button', grp).forEach(function (x) { x.classList.toggle('on', x === b); });
      if (b.hasAttribute('data-f')) type = b.getAttribute('data-f'); else mk = b.getAttribute('data-m') || '';
      apply();
    });
  }

  // ----- search -----
  var idx = null;
  function load() {
    if (idx) return Promise.resolve(idx);
    if (window.__SEARCH__) { idx = window.__SEARCH__; return Promise.resolve(idx); }
    return fetch('/search.json').then(function (r) { return r.json(); }).then(function (j) { idx = j; return j; });
  }
  function find(q) { q = q.trim().toLowerCase(); if (!q) return []; return idx.filter(function (s) { return s.n.toLowerCase().indexOf(q) > -1 || s.d.toLowerCase().indexOf(q) > -1 || s.c.toLowerCase().indexOf(q) > -1; }); }
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  $$('[data-search]').forEach(function (inp) {
    var box = inp.parentElement.querySelector('[data-suggest]'); if (!box) return;
    inp.addEventListener('input', function () {
      load().then(function () {
        var r = find(inp.value).slice(0, 6);
        box.innerHTML = r.map(function (s) { return '<a href="' + esc(s.u) + '"><img src="' + esc(s.l) + '" alt="" width="28" height="28"><span>' + esc(s.n) + '</span></a>'; }).join('');
        box.hidden = !r.length;
      });
    });
    document.addEventListener('click', function (e) { if (!box.contains(e.target) && e.target !== inp) box.hidden = true; });
  });
  var res = $('[data-results]');
  if (res) {
    var q = new URLSearchParams(location.search).get('q') || ''; var qi = $('[data-q]'); if (qi) qi.value = q;
    load().then(function () {
      var r = find(q);
      res.innerHTML = r.map(function (s) { return '<a class="s-tile" href="' + esc(s.u) + '"><img src="' + esc(s.l) + '" alt="' + esc(s.n) + ' logo" width="60" height="60"><strong>' + esc(s.n) + '</strong><span>' + (s.o ? s.o + ' offer' + (s.o > 1 ? 's' : '') : 'View store') + '</span></a>'; }).join('');
      var em = $('[data-empty]'); if (em) em.hidden = r.length > 0 || !q;
    });
  }

  // ----- newsletter / contact forms (posted to /api/form) -----
  $$('form[data-nl]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = new URLSearchParams(new FormData(f)).toString(), msg = $('.nl-msg', f), btn = $('button[type=submit]', f);
      btn.disabled = true;
      fetch(f.getAttribute('action') || '/api/form', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: body })
        .then(function (r) { if (!r.ok) throw new Error(); msg.textContent = msg.getAttribute('data-ok') || msg.textContent; msg.hidden = false; f.reset(); })
        .catch(function () { msg.textContent = 'Could not send right now. Please try again later.'; msg.hidden = false; })
        .then(function () { btn.disabled = false; });
    });
  });

  // ----- submit-a-coupon form (progressive enhancement: without JS it is a normal form POST) -----
  var sf = $('form[data-submit]');
  if (sf) {
    if (sf.elements.ts) sf.elements.ts.value = String(Date.now());
    var smsg = $('.nl-msg', sf);
    if (new URLSearchParams(location.search).get('sent')) { smsg.textContent = 'Thank you! Your submission is waiting for review.'; smsg.hidden = false; }
    sf.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(sf), o = { markets: fd.getAll('markets'), consent: fd.get('consent') === 'yes' };
      ['website', 'ts', 'store', 'title', 'code', 'url', 'description', 'expires', 'email'].forEach(function (k) { o[k] = fd.get(k) || ''; });
      var btn = $('button[type=submit]', sf); btn.disabled = true; smsg.hidden = true;
      fetch(sf.action, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(o) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (x.ok) { sf.reset(); if (sf.elements.ts) sf.elements.ts.value = String(Date.now()); smsg.textContent = 'Thank you! Your submission is waiting for review.'; }
          else if (x.j.errors) smsg.textContent = Object.keys(x.j.errors).map(function (k) { return x.j.errors[k]; }).join(' ');
          else smsg.textContent = x.j.error || 'Could not send right now. Please try again later.';
          smsg.hidden = false;
        })
        .catch(function () { smsg.textContent = 'Could not send right now. Please try again later.'; smsg.hidden = false; })
        .then(function () { btn.disabled = false; });
    });
  }

  // ----- analytics only after consent (GDPR/UK PECR friendly) -----
  var CB = window.__CB || {};
  function loadAnalytics() {
    if (CB.gtm) { (function (w, d, s, l, i) { w[l] = w[l] || []; w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' }); var f = d.getElementsByTagName(s)[0], j = d.createElement(s); j.async = true; j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i; f.parentNode.insertBefore(j, f); })(window, document, 'script', 'dataLayer', CB.gtm); }
    if (CB.ga) { var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + CB.ga; document.head.appendChild(s); window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; gtag('js', new Date()); gtag('config', CB.ga); }
  }
  if (CB.ga || CB.gtm) {
    var c = null; try { c = localStorage.getItem('cb_consent'); } catch (x) {}
    if (c === 'yes') loadAnalytics();
    else if (!c) {
      var b = el('div', 'consent'); b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Cookie consent');
      b.appendChild(el('p', '', 'We use analytics cookies to improve this site. You can accept or decline.'));
      var no = el('button', 'btn ghost', 'Decline'), yes = el('button', 'btn', 'Accept');
      no.type = yes.type = 'button';
      no.onclick = function () { try { localStorage.setItem('cb_consent', 'no'); } catch (x) {} b.remove(); };
      yes.onclick = function () { try { localStorage.setItem('cb_consent', 'yes'); } catch (x) {} b.remove(); loadAnalytics(); };
      b.appendChild(no); b.appendChild(yes); document.body.appendChild(b);
    }
  }
})();
