import { esc, $, $$, getPath, setPath, list, backend, toast, modal, bust } from './core.js';

const REG = new Map(); let rid = 0;

// ---------- single field ----------
export async function fieldHTML(f, v) {
  const help = f.help ? `<span class="help">${esc(f.help)}</span>` : '';
  const label = f.t === 'bool' ? '' : `<label>${esc(f.l)}${f.req ? ' *' : ''}</label>${help ? `<div>${help}</div>` : ''}`;
  const val = v ?? '';
  const wrap = (inner, extra = '') => `<div class="fld ${extra}" data-fk="${esc(f.k)}" data-t="${f.t}">${label}${inner}</div>`;
  switch (f.t) {
    case 'text': return wrap(`<input class="ctl" value="${esc(val)}" placeholder="${esc(f.ph || '')}" ${f.req ? 'required' : ''}>`);
    case 'number': return wrap(`<input class="ctl" type="number" value="${esc(val)}">`);
    case 'date': return wrap(`<input class="ctl" type="date" value="${esc(String(val).slice(0, 10))}">`);
    case 'textarea': return wrap(`<textarea class="ctl" rows="${f.rows || 4}">${esc(val)}</textarea>`);
    case 'md': return wrap(`<div class="mdbar"><span>Formatting:</span><code>## Heading</code><code>- list</code><code>**bold**</code><code>[text](https://…)</code><code>![alt](image-url)</code></div><textarea class="ctl" rows="18">${esc(val)}</textarea>`);
    case 'code': return wrap(`<textarea class="ctl mono" rows="${f.rows || 6}" spellcheck="false">${esc(val)}</textarea>`);
    case 'lines': return wrap(`<textarea class="ctl" rows="4">${esc((Array.isArray(v) ? v : []).join('\n'))}</textarea>`);
    case 'bool': return `<div class="fld chk" data-fk="${esc(f.k)}" data-t="bool"><input class="ctl" id="c_${++rid}" type="checkbox" ${v ? 'checked' : ''}><label for="c_${rid}">${esc(f.l)}</label>${help ? `<span class="help"> ${esc(f.help)}</span>` : ''}</div>`;
    case 'color': {
      const ok = /^#[0-9a-fA-F]{6}$/.test(val);
      return wrap(`<div class="colorf"><input type="color" value="${ok ? val : '#4f46e5'}" data-cp><input class="ctl" value="${esc(val)}" placeholder="#4f46e5"></div>`);
    }
    case 'select': {
      let opts = f.pairs ? f.pairs : f.opts ? f.opts.map((o) => [o, o]) : (await list(f.from)).map((d) => [d.slug || d.id, d.name || d.title]);
      opts = [['', '— choose —'], ...opts];
      return wrap(`<select class="ctl" ${f.req ? 'required' : ''}>${opts.map(([a, b]) => `<option value="${esc(a)}" ${String(a) === String(val) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`);
    }
    case 'multi': { const cur = Array.isArray(v) ? v : []; return wrap(`<div class="multi">${f.opts.map((o) => `<label><input type="checkbox" value="${o}" ${cur.includes(o) ? 'checked' : ''}> ${o}</label>`).join('')}</div>`); }
    case 'multiDyn': {
      const cur = Array.isArray(v) ? v : [], items = await list(f.from);
      return wrap(`<div class="multi scroll">${items.map((d) => `<label><input type="checkbox" value="${esc(d.slug || d.id)}" ${cur.includes(d.slug || d.id) ? 'checked' : ''}> ${esc(d.name || d.title)}</label>`).join('') || '<em>Nothing to choose yet.</em>'}</div>`);
    }
    case 'image': return wrap(`<div class="imgf"><div class="line"><input class="ctl url" value="${esc(val)}" placeholder="Paste an image URL, upload, or pick from the library"><button type="button" class="btn sec sm" data-up>Upload</button><button type="button" class="btn sec sm" data-lib>Library</button><button type="button" class="btn sec sm" data-clr>Clear</button><input type="file" accept="image/*" hidden></div>${val ? `<img src="${esc(val)}" alt="">` : ''}</div>`);
    case 'repeat': {
      const id = ++rid; REG.set(id, f);
      const items = Array.isArray(v) ? v : [];
      const html = (await Promise.all(items.map((it, i) => itemHTML(f, it, items.length > 3 && i > 1)))).join('');
      return wrap(`<div class="rep" data-rid="${id}"><div class="rep-list">${html}</div><button type="button" class="btn sec sm" data-rep-add>+ Add ${esc(f.l.toLowerCase().replace(/ \(.*/, ''))}</button></div>`);
    }
  }
  return '';
}

async function itemHTML(f, v, collapsed) {
  const title = (v && (v[f.label] || v[f.labelAlt])) || 'New item';
  const body = (await Promise.all(f.fields.map((sf) => fieldHTML(sf, v ? getPath(v, sf.k) : sf.k === 'enabled' ? true : '')))).join('');
  return `<div class="rep-item" data-label="${esc(f.label)}"><div class="rep-h"><button type="button" class="rep-t" data-rep-toggle>${esc(title)}</button><span class="rep-c"><button type="button" data-rep-up title="Move up">↑</button><button type="button" data-rep-down title="Move down">↓</button><button type="button" data-rep-del title="Remove">✕</button></span></div><div class="rep-b" ${collapsed ? 'hidden' : ''}>${body}</div></div>`;
}

// ---------- groups / form ----------
export async function formHTML(fields, values) {
  const groups = []; fields.forEach((f) => { const g = f.g || 'Content'; if (!groups.includes(g)) groups.push(g); });
  const panes = await Promise.all(groups.map(async (g, i) => `<div class="pane" data-g="${esc(g)}" ${i ? 'hidden' : ''}>${(await Promise.all(fields.filter((f) => (f.g || 'Content') === g).map((f) => fieldHTML(f, getPath(values || {}, f.k))))).join('')}</div>`));
  const tabs = groups.length > 1 ? `<div class="ftabs">${groups.map((g, i) => `<button type="button" class="${i ? '' : 'on'}" data-tab="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : '';
  return `${tabs}<div class="panes">${panes.join('')}</div>`;
}

const own = (container, key) => {
  const owner = container.classList.contains('rep-b') ? container : null;
  return [...container.querySelectorAll('.fld[data-fk]')].find((el) => el.dataset.fk === key && el.parentElement.closest('.rep-b') === owner);
};

export function readFields(fields, container, base = {}) {
  const o = base;
  for (const f of fields) {
    const w = own(container, f.k); if (!w) continue;
    let v;
    switch (f.t) {
      case 'bool': v = $('.ctl', w).checked; break;
      case 'multi': case 'multiDyn': v = $$('input:checked', w).map((i) => i.value); break;
      case 'lines': v = $('.ctl', w).value.split('\n').map((s) => s.trim()).filter(Boolean); break;
      case 'number': v = $('.ctl', w).value === '' ? '' : Number($('.ctl', w).value); break;
      case 'repeat': v = $$('.rep-list > .rep-item', w).map((it) => readFields(f.fields, $('.rep-b', it), {})); break;
      default: v = $('.ctl', w).value.trim();
    }
    if (f.t === 'code' || f.t === 'md') v = $('.ctl', w).value; // keep whitespace in code / markdown
    setPath(o, f.k, v);
  }
  return o;
}

// ---------- behaviour (delegated, wired once per form root) ----------
export function wireFields(root) {
  root.addEventListener('click', async (e) => {
    const t = e.target;
    const tab = t.closest('[data-tab]');
    if (tab) { const bar = tab.parentElement; $$('button', bar).forEach((b) => b.classList.toggle('on', b === tab)); $$('.pane', root).forEach((p) => (p.hidden = p.dataset.g !== tab.dataset.tab)); return; }
    const rep = t.closest('[data-rid]');
    if (rep && t.closest('[data-rep-add]')) {
      const f = REG.get(Number(rep.dataset.rid)); const l = $('.rep-list', rep);
      l.insertAdjacentHTML('beforeend', await itemHTML(f, null, false)); l.lastElementChild.scrollIntoView({ block: 'nearest' }); return;
    }
    const item = t.closest('.rep-item');
    if (item) {
      if (t.closest('[data-rep-del]')) { if (confirm('Remove this item?')) item.remove(); return; }
      if (t.closest('[data-rep-up]') && item.previousElementSibling) item.parentElement.insertBefore(item, item.previousElementSibling);
      if (t.closest('[data-rep-down]') && item.nextElementSibling) item.parentElement.insertBefore(item.nextElementSibling, item);
      if (t.closest('[data-rep-toggle]')) { const b = $(':scope > .rep-b', item); b.hidden = !b.hidden; }
    }
    const img = t.closest('.imgf');
    if (img) {
      const input = $('input.ctl', img), file = $('input[type=file]', img);
      const setVal = (u) => { input.value = u; $('img', img)?.remove(); if (u) img.insertAdjacentHTML('beforeend', `<img src="${esc(u)}" alt="">`); input.dispatchEvent(new Event('input', { bubbles: true })); };
      if (t.closest('[data-up]')) file.click();
      if (t.closest('[data-clr]')) setVal('');
      if (t.closest('[data-lib]')) openLibrary(setVal);
      if (!file._w) { file._w = 1; file.onchange = async () => { if (file.files[0]) { try { setVal(await uploadImage(file.files[0])); } catch (x) { toast('Upload failed: ' + x.message, true); } } }; }
    }
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-cp]')) { $('.ctl', t.parentElement).value = t.value; $('.ctl', t.parentElement).dispatchEvent(new Event('input', { bubbles: true })); }
    else if (t.matches('.colorf .ctl') && /^#[0-9a-fA-F]{6}$/.test(t.value)) $('[data-cp]', t.parentElement).value = t.value;
    const item = t.closest('.rep-item');
    if (item) { const w = t.closest('.fld'); if (w && w.dataset.fk === item.dataset.label && w.parentElement === $(':scope > .rep-b', item)) $(':scope > .rep-h .rep-t', item).textContent = t.value || 'New item'; }
  });
  // file inputs inside images need a handler even when the Upload click came first
  root.addEventListener('change', async (e) => {
    const t = e.target; if (!t.matches('.imgf input[type=file]') || t._w) return;
    const img = t.closest('.imgf'), input = $('input.ctl', img);
    try { const u = await uploadImage(t.files[0]); input.value = u; $('img', img)?.remove(); img.insertAdjacentHTML('beforeend', `<img src="${esc(u)}" alt="">`); } catch (x) { toast('Upload failed: ' + x.message, true); }
  });
}

// ---------- media ----------
export async function uploadImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Images only');
  if (file.size > 5 * 1024 * 1024) throw new Error('Max 5 MB');
  const r = await backend.upload(file);
  await backend.set('media', r.name.replace(/[^\w-]/g, '_'), { name: r.name, path: r.path, url: r.url, alt: '', createdAt: new Date().toISOString() });
  bust('media'); toast('Uploaded');
  return r.url;
}
export async function openLibrary(onPick) {
  const items = (await list('media', true)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  modal(`<div class="top"><h2 style="margin:0">Media library</h2><button class="btn sec" data-x>Close</button></div>${items.length ? `<div class="media">${items.map((i) => `<figure data-u="${esc(i.url)}"><img src="${esc(i.url)}" alt="${esc(i.alt || '')}"><figcaption>${esc(i.name)}</figcaption></figure>`).join('')}</div>` : '<p>No uploads yet. Close this and press Upload.</p>'}`, (m, close) => {
    m.addEventListener('click', (e) => { const f = e.target.closest('[data-u]'); if (f) { onPick(f.dataset.u); close(); } });
  });
}
