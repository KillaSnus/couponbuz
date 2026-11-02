const FONTS = {
  system: { css: "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", gf: '' },
  inter: { css: "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", gf: 'Inter:wght@400;500;600;700;800' },
  poppins: { css: "'Poppins',system-ui,sans-serif", gf: 'Poppins:wght@400;500;600;700;800' },
  jakarta: { css: "'Plus Jakarta Sans',system-ui,sans-serif", gf: 'Plus+Jakarta+Sans:wght@400;500;600;700;800' },
  dmsans: { css: "'DM Sans',system-ui,sans-serif", gf: 'DM+Sans:wght@400;500;600;700' },
  nunito: { css: "'Nunito',system-ui,sans-serif", gf: 'Nunito:wght@400;600;700;800' },
};
export const FONT_OPTIONS = Object.keys(FONTS);

const hex = (v, d) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? v : d);

export function fontLink(font) {
  const f = FONTS[font] || FONTS.inter;
  if (!f.gf) return '';
  // Non-blocking font CSS: the page renders with the fallback font immediately and swaps when the font arrives.
  const href = `https://fonts.googleapis.com/css2?family=${f.gf}&display=swap`;
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${href}"></noscript>`;
}

export function themeCss(t) {
  const f = FONTS[t.font] || FONTS.inter;
  const r = Math.min(28, Math.max(0, Number(t.radius) || 14));
  const light = `--primary:${hex(t.primary, '#4f46e5')};--primary-dark:${hex(t.primaryDark, '#3730a3')};--accent:${hex(t.accent, '#ff6b35')};--bg:${hex(t.bg, '#f7f7fb')};--surface:${hex(t.surface, '#ffffff')};--ink:${hex(t.ink, '#101828')};--muted:${hex(t.muted, '#5b6478')};--link:${hex(t.primary, '#4f46e5')};--radius:${r}px;--font:${f.css};`;
  const dark = `--bg:#0c1020;--surface:#151a2e;--ink:#eef1f8;--muted:#a2abc0;--link:color-mix(in srgb,${hex(t.primary, '#4f46e5')} 55%,#fff);`;
  let css = `:root{${light}}`;
  if (t.darkMode === 'dark') css += `:root{${dark}}`;
  else if (t.darkMode !== 'light') css += `@media (prefers-color-scheme:dark){:root{${dark}}}`;
  return css;
}
