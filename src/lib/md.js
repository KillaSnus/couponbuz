export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
}

function inline(s) {
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, (m, t, u) =>
    u.startsWith('http') ? `<a href="${u}" rel="nofollow noopener" target="_blank">${t}</a>` : `<a href="${u}">${t}</a>`);
  return s;
}

// Tiny markdown: ##/### headings, lists, images, paragraphs, bold/italic, links.
export function md(src) {
  const blocks = String(src || '').replace(/\r/g, '').split(/\n{2,}/);
  const out = [];
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    // A block may start with a heading followed by body lines.
    let i = 0;
    while (i < lines.length && /^#{1,3}\s/.test(lines[i])) {
      const m = lines[i].match(/^(#{1,3})\s+(.*)$/);
      const level = Math.max(2, m[1].length);
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
      i++;
    }
    const rest = lines.slice(i);
    if (!rest.length) continue;
    if (rest.every((l) => /^[-*]\s/.test(l))) {
      out.push('<ul>' + rest.map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('') + '</ul>');
    } else if (rest.every((l) => /^\d+\.\s/.test(l))) {
      out.push('<ol>' + rest.map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('') + '</ol>');
    } else if (/^!\[[^\]]*\]\(([^)]+)\)$/.test(rest[0]) && rest.length === 1) {
      const m = rest[0].match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      out.push(`<figure><img src="${esc(m[2])}" alt="${esc(m[1])}" loading="lazy"></figure>`);
    } else {
      out.push(`<p>${rest.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

export function stripTags(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function truncate(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}
