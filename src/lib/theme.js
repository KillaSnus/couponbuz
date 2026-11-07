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
  const r = Math.min(28, Math.max(0, Number(t.radius) || 16));
  const light = `--primary:${hex(t.primary, '#4f46e5')};--primary-dark:${hex(t.primaryDark, '#3730a3')};--accent:${hex(t.accent, '#c2410c')};--bg:${hex(t.bg, '#f8fafc')};--surface:${hex(t.surface, '#fff')};--ink:${hex(t.ink, '#0f172a')};--muted:${hex(t.muted, '#5b6478')};--radius:${r}px;--font:${f.css};`;
  const dark = `--bg:#0c1020;--surface:#151a2e;--ink:#eef1f8;--muted:#a2abc0;--link:color-mix(in srgb,${hex(t.primary, '#4f46e5')} 55%,#fff);`;
  let css = `:root{${light}}`;
  if (t.darkMode === 'dark') css += `:root{${dark}}`;
  else if (t.darkMode !== 'light') css += `@media (prefers-color-scheme:dark){:root{${dark}}}`;

  // Homepage-only dark emerald visual treatment inspired by the supplied reference.
  // Keep the rest of the site and CMS-driven content untouched.
  css += `<style id="couponbuz-home-design">
    body:has(.hero){--home-bg:#050706;--home-panel:#0b0d0c;--home-panel-2:#101311;--home-line:#242826;--home-text:#f5f7f6;--home-muted:#a1a7a4;--home-green:#00e88f;background:var(--home-bg)!important;color:var(--home-text)!important}
    body:has(.hero) .hdr{background:rgba(5,7,6,.94)!important;border-color:var(--home-line)!important}
    body:has(.hero) .brand,body:has(.hero) .item .top{color:var(--home-text)!important}
    body:has(.hero) .item .top:hover{background:#121613!important}
    body:has(.hero) .search{background:#0b0d0c!important;border-color:var(--home-line)!important;color:var(--home-muted)!important}
    body:has(.hero) .search input{color:var(--home-text)!important}
    body:has(.hero) .hero{background:var(--home-bg)!important;color:var(--home-text)!important;border-bottom:1px solid var(--home-line);padding:76px 0 64px}
    body:has(.hero) .hero-grid{display:block;text-align:center;max-width:760px}
    body:has(.hero) .hero-copy{display:flex;flex-direction:column;align-items:center}
    body:has(.hero) .hero-cards{display:none}
    body:has(.hero) .hero h1{max-width:680px;color:var(--home-text)!important;font-size:clamp(2.8rem,6vw,4.7rem);line-height:1.04;letter-spacing:-.06em;margin:28px auto 18px}
    body:has(.hero) .hero .lead{max-width:660px;color:var(--home-muted)!important;font-size:1.08rem;line-height:1.65}
    body:has(.hero) .eyebrow{background:#101311;border:1px solid var(--home-line);color:#c4cac7;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em}
    body:has(.hero) .hero-search{width:min(100%,660px);margin:28px auto 12px}
    body:has(.hero) .hero-search input{background:#050706!important;color:var(--home-text)!important;border:1px solid #303633!important;border-radius:9px;box-shadow:none;padding:16px 18px}
    body:has(.hero) .hero-search input::placeholder{color:#7c8580}
    body:has(.hero) .hero-search .btn,body:has(.hero) .btn.accent{background:var(--home-green)!important;color:#04110b!important;box-shadow:none}
    body:has(.hero) .hero-links{color:#858c88!important;font:12px/1.8 ui-monospace,SFMono-Regular,Menlo,monospace}
    body:has(.hero) .hero-links a{color:#aab1ad!important}
    body:has(.hero) .stats{margin:0 auto;padding-top:22px;padding-bottom:22px;border-bottom:1px solid var(--home-line);max-width:1280px}
    body:has(.hero) .stats>div{background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0;padding:16px 10px}
    body:has(.hero) .stats b{color:var(--home-text)!important;font-size:clamp(1.7rem,3vw,2.4rem)}
    body:has(.hero) .stats div:nth-child(2) b{color:var(--home-green)!important}
    body:has(.hero) .stats span{color:var(--home-muted)!important;text-transform:uppercase;letter-spacing:.08em;font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
    body:has(.hero) .block{margin-top:76px;margin-bottom:76px}
    body:has(.hero) .sec-head h2,body:has(.hero) h2{color:var(--home-text)!important}
    body:has(.hero) .sec-head p,body:has(.hero) .lead,body:has(.hero) .block p{color:var(--home-muted)}
    body:has(.hero) .more,body:has(.hero) a{--link:var(--home-green)}
    body:has(.hero) .offer,body:has(.hero) .s-tile,body:has(.hero) .cat,body:has(.hero) .region,body:has(.hero) .coll,body:has(.hero) .p-card,body:has(.hero) .faq,body:has(.hero) .card,body:has(.hero) .steps>div,body:has(.hero) .empty{background:var(--home-panel)!important;border:1px solid var(--home-line)!important;color:var(--home-text)!important;box-shadow:none!important}
    body:has(.hero) .s-tile:hover,body:has(.hero) .cat:hover,body:has(.hero) .region:hover,body:has(.hero) .coll:hover{border-color:#3b4b42!important;transform:translateY(-2px)}
    body:has(.hero) .s-tile strong,body:has(.hero) .cat strong,body:has(.hero) .region strong,body:has(.hero) .coll strong,body:has(.hero) .o-body h3{color:var(--home-text)!important}
    body:has(.hero) .s-tile span,body:has(.hero) .o-body p,body:has(.hero) .fine,body:has(.hero) .region span,body:has(.hero) .coll span{color:var(--home-muted)!important}
    body:has(.hero) .s-tile img{background:#fff;border-color:var(--home-line)}
    body:has(.hero) .pill{background:#141816;border-color:var(--home-line);color:#c5ccc8}
    body:has(.hero) .pill.ok{background:#062417;border-color:#0a5737;color:var(--home-green)}
    body:has(.hero) .rp{background:#062417;color:var(--home-green)}
    body:has(.hero) .cta,body:has(.hero) .cta.deal{background:#151a17;color:var(--home-green);border:1px solid #34453b;box-shadow:none}
    body:has(.hero) .cta.code{background:var(--home-green);color:#04110b;border:0}
    body:has(.hero) .faq summary{color:var(--home-text)}
    body:has(.hero) .faq summary:hover{background:#101311}
    body:has(.hero) .nl-band{background:var(--home-panel)!important;border:1px solid var(--home-line);color:var(--home-text)}
    body:has(.hero) .nl-band h2{color:var(--home-text)}body:has(.hero) .nl-band p{color:var(--home-muted)}
    body:has(.hero) .nl input{background:#050706;border-color:var(--home-line);color:var(--home-text)}
    body:has(.hero) .ftr{background:#050706;border-color:var(--home-line);color:var(--home-muted)}
    body:has(.hero) .ftr a{color:#c0c6c3}body:has(.hero) .ftr h3{color:#858c88}
    body:has(.hero) .drawer{background:#090c0a;color:var(--home-text)}body:has(.hero) .drawer a,body:has(.hero) .drawer summary{color:var(--home-text)}
    @media(max-width:980px){body:has(.hero) .hero{padding:58px 0 48px}body:has(.hero) .hero-grid{padding-left:22px;padding-right:22px}body:has(.hero) .hero-search{flex-direction:row}}
    @media(max-width:640px){body:has(.hero) .hero{padding:48px 0 40px}body:has(.hero) .hero h1{font-size:clamp(2.6rem,12vw,3.8rem)}body:has(.hero) .hero-search{flex-direction:column}body:has(.hero) .hero-search .btn{width:100%}body:has(.hero) .stats{gap:0;padding-top:12px;padding-bottom:12px}body:has(.hero) .stats>div{padding:12px 4px}body:has(.hero) .block{margin-top:52px;margin-bottom:52px}}
    @media(prefers-reduced-motion:reduce){body:has(.hero) *{scroll-behavior:auto!important;transition:none!important}}
  </style>`;
  return css;
}
