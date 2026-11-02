// Customer-support chat widget. Uses the /api/chat function when available, otherwise answers from the FAQ list.
(function () {
  var B = window.__BOT__; if (!B) return;
  var $ = function (t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
  var history = [], busy = false;
  var root = $('div'); if (B.color) root.style.setProperty('--chat', B.color);
  var fab = $('button', 'chat-fab', '💬'); fab.type = 'button'; fab.setAttribute('aria-label', 'Chat with ' + B.name);
  var box = $('section', 'chat'); box.hidden = true; box.setAttribute('aria-label', B.name + ' support chat');
  var head = $('div', 'chat-h'), ht = $('div'); ht.appendChild($('b', '', B.name)); ht.appendChild($('small', '', 'Support assistant'));
  var close = $('button', '', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close chat'); head.appendChild(ht); head.appendChild(close);
  var log = $('div', 'chat-log'); log.setAttribute('aria-live', 'polite');
  var quick = $('div', 'chat-q');
  var form = $('form', 'chat-f'), input = $('input'); input.placeholder = 'Type your question…'; input.setAttribute('aria-label', 'Your message'); input.maxLength = 400;
  var send = $('button', '', 'Send'); send.type = 'submit'; form.appendChild(input); form.appendChild(send);
  box.appendChild(head); box.appendChild(log); box.appendChild(quick); box.appendChild(form);
  root.appendChild(box); root.appendChild(fab); document.body.appendChild(root);

  function linkify(node, text) {
    var parts = text.split(/(\/[a-z0-9\-\/]+\/|https?:\/\/[^\s)]+)/gi);
    parts.forEach(function (p) {
      if (/^(\/[a-z0-9\-\/]+\/|https?:\/\/)/i.test(p)) { var a = $('a', '', p); a.href = p; if (/^http/.test(p)) { a.target = '_blank'; a.rel = 'noopener'; } node.appendChild(a); }
      else node.appendChild(document.createTextNode(p));
    });
  }
  function add(who, text) { var m = $('div', 'msg ' + who); if (who === 'bot') linkify(m, text); else m.textContent = text; log.appendChild(m); log.scrollTop = log.scrollHeight; return m; }
  function faqAnswer(q) {
    q = q.toLowerCase(); var best = null, score = 0;
    (B.faqs || []).forEach(function (f) {
      var words = (f.q + ' ' + (f.k || '')).toLowerCase().split(/\W+/).filter(function (w) { return w.length > 2; }), s = 0;
      words.forEach(function (w) { if (q.indexOf(w) > -1) s++; });
      if (s > score) { score = s; best = f; }
    });
    if (best && score >= 2) return best.a;
    return 'I am not sure about that one.' + (B.contactEmail ? ' You can email us at ' + B.contactEmail + ' or use the contact page: /contact/' : ' Please use the contact page: /contact/');
  }
  function ask(text) {
    if (busy || !text.trim()) return; busy = true;
    add('me', text); history.push({ role: 'user', content: text }); quick.hidden = true;
    var wait = add('bot', '…');
    fetch(B.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-8) }) })
      .then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); })
      .then(function (j) { if (!j.reply) throw new Error('x'); return j.reply; })
      .catch(function () { return faqAnswer(text); })
      .then(function (reply) { wait.textContent = ''; linkify(wait, reply); history.push({ role: 'assistant', content: reply }); busy = false; log.scrollTop = log.scrollHeight; });
  }
  fab.onclick = function () { box.hidden = !box.hidden; if (!box.hidden) { if (!log.children.length) { add('bot', B.greeting); (B.quickReplies || []).forEach(function (q) { var b = $('button', '', q); b.type = 'button'; b.onclick = function () { ask(q); }; quick.appendChild(b); }); } input.focus(); } };
  close.onclick = function () { box.hidden = true; fab.focus(); };
  form.onsubmit = function (e) { e.preventDefault(); var t = input.value; input.value = ''; ask(t); };
})();
