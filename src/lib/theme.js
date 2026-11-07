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
  const primary = hex(t.primary, '#4f46e5');
  const light = `--primary:${primary};--primary-dark:${hex(t.primaryDark, '#3730a3')};--accent:${hex(t.accent, '#c2410c')};--bg:${hex(t.bg, '#f8fafc')};--surface:${hex(t.surface, '#fff')};--ink:${hex(t.ink, '#0f172a')};--muted:${hex(t.muted, '#5b6478')};--radius:${r}px;--font:${f.css};`;
  const dark = `--bg:#0c1020;--surface:#151a2e;--ink:#eef1f8;--muted:#a2abc0;--link:color-mix(in srgb,${primary} 55%,#fff);`;
  let css = `:root{${light}}`;
  if (t.darkMode === 'dark') css += `:root{${dark}}`;
  else if (t.darkMode !== 'light') css += `@media (prefers-color-scheme:dark){:root{${dark}}}`;

  css += `
    body:has(.hero){--cb-bg:#0a0a0b;--cb-card:#131316;--cb-card-hover:#1a1a1f;--cb-border:#232328;--cb-green:#00d97e;--cb-green-glow:rgba(0,217,126,.15);--cb-text:#f5f5f7;--cb-dim:#a0a0a8;--cb-faint:#6b6b73;background:var(--cb-bg)!important;color:var(--cb-text)!important}
    body:has(.hero) a{color:inherit}
    body:has(.hero) .hdr{position:sticky;top:0;background:rgba(10,10,11,.88)!important;border-color:var(--cb-border)!important;backdrop-filter:blur(12px)}
    body:has(.hero) .hdr-bar{height:64px}
    body:has(.hero) .brand,body:has(.hero) .brand span,body:has(.hero) .item .top{color:var(--cb-text)!important}
    body:has(.hero) .item .top{font-size:14px;font-weight:500}
    body:has(.hero) .item .top:hover{background:var(--cb-card-hover);color:#fff!important}
    body:has(.hero) .brand img{border-radius:8px;box-shadow:none}
    body:has(.hero) .search{background:var(--cb-card);border-color:var(--cb-border);color:var(--cb-dim)}
    body:has(.hero) .search input{color:var(--cb-text)}
    body:has(.hero) .hero{position:relative;overflow:hidden;text-align:center;padding:80px 0 60px;background:var(--cb-bg)!important;border:0;color:var(--cb-text)}
    body:has(.hero) .hero:before{content:'';position:absolute;top:-200px;left:50%;transform:translateX(-50%);width:800px;height:400px;background:radial-gradient(ellipse,var(--cb-green-glow),transparent 70%);pointer-events:none}
    body:has(.hero) .hero-grid{display:block;position:relative;max-width:760px}
    body:has(.hero) .hero-copy{display:flex;flex-direction:column;align-items:center}
    body:has(.hero) .hero-cards{display:none}
    body:has(.hero) .eyebrow{display:inline-flex;align-items:center;gap:8px;background:var(--cb-card);border:1px solid var(--cb-border);padding:6px 14px;border-radius:100px;font-size:13px;color:var(--cb-dim);margin-bottom:24px}
    body:has(.hero) .eyebrow:before{content:'';width:8px;height:8px;background:var(--cb-green);border-radius:50%;box-shadow:0 0 8px var(--cb-green)}
    body:has(.hero) .hero h1{max-width:760px;margin:0 auto 20px;color:var(--cb-text)!important;font-size:clamp(36px,6vw,64px);font-weight:800;letter-spacing:-.055em;line-height:1.05}
    body:has(.hero) .hero .lead{max-width:620px;margin:0 auto 36px;color:var(--cb-dim)!important;font-size:clamp(16px,2vw,20px);line-height:1.6}
    body:has(.hero) .hero-search{position:relative;display:flex;align-items:center;gap:0;width:min(100%,560px);max-width:560px;margin:0 auto}
    body:has(.hero) .hero-search input{width:100%;min-height:56px;padding:16px 20px;background:var(--cb-card)!important;border:1px solid var(--cb-border)!important;border-radius:14px;color:var(--cb-text)!important;box-shadow:none;font-size:16px}
    body:has(.hero) .hero-search input::placeholder{color:var(--cb-faint)}
    body:has(.hero) .hero-search input:focus{border-color:var(--cb-green)!important;box-shadow:0 0 0 3px var(--cb-green-glow)}
    body:has(.hero) .hero-search .btn{display:none}
    body:has(.hero) .hero-links{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:8px;margin:20px auto 0;color:var(--cb-faint);font-size:13px}
    body:has(.hero) .hero-links a{margin:0;padding:4px 12px;border:1px solid var(--cb-border);border-radius:100px;background:var(--cb-card);color:var(--cb-dim)!important;font-size:13px}
    body:has(.hero) .hero-links a:hover{border-color:var(--cb-green);color:var(--cb-green)!important;text-decoration:none}
    body:has(.hero) .stats{position:relative;z-index:1;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;max-width:none;margin:0;padding:34px max(24px,calc((100% - 1200px)/2));border-top:1px solid var(--cb-border);border-bottom:1px solid var(--cb-border)}
    body:has(.hero) .stats>div{padding:0;text-align:center;background:none!important;border:0!important;border-radius:0;box-shadow:none!important}
    body:has(.hero) .stats b{display:block;color:var(--cb-green)!important;font-size:clamp(28px,4vw,40px);font-weight:800;letter-spacing:-1px}
    body:has(.hero) .stats span{color:var(--cb-faint)!important;font-size:13px;text-transform:uppercase;letter-spacing:.5px}
    body:has(.hero) .block{margin:0 auto;padding-top:72px;padding-bottom:0}
    body:has(.hero) .sec-head{display:block;text-align:center;margin:0 auto 40px}
    body:has(.hero) .sec-head h2,body:has(.hero) h2{color:var(--cb-text)!important;font-size:clamp(26px,4vw,38px);font-weight:800;letter-spacing:-1px;margin:0 0 12px}
    body:has(.hero) .sec-head p{max-width:560px;margin:0 auto;color:var(--cb-dim)!important;font-size:16px}
    body:has(.hero) .more{color:var(--cb-green)!important}
    body:has(.hero) .tile-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}
    body:has(.hero) .s-tile{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:20px;background:var(--cb-card)!important;border:1px solid var(--cb-border)!important;border-radius:var(--radius);color:var(--cb-text)!important;box-shadow:none!important;transition:all .2s}
    body:has(.hero) .s-tile:hover,body:has(.hero) .cat:hover{background:var(--cb-card-hover)!important;border-color:var(--cb-green)!important;transform:translateY(-2px);text-decoration:none}
    body:has(.hero) .s-tile img{width:56px;height:56px;border-radius:12px;object-fit:contain;background:#fff;border:0;padding:6px}
    body:has(.hero) .s-tile strong{color:var(--cb-text)!important;font-size:14px}
    body:has(.hero) .s-tile span{color:var(--cb-faint)!important;font-size:12px}
    body:has(.hero) .cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
    body:has(.hero) .cat{display:flex;align-items:center;gap:12px;padding:16px;background:var(--cb-card)!important;border:1px solid var(--cb-border)!important;border-radius:var(--radius);color:var(--cb-text)!important}
    body:has(.hero) .cat .ico{width:44px;height:44px;display:grid;place-items:center;border-radius:10px;background:rgba(255,255,255,.03);font-size:28px}
    body:has(.hero) .cat-txt strong{color:var(--cb-text)!important}
    body:has(.hero) .cat small{color:var(--cb-faint)!important}
    body:has(.hero) .offer,body:has(.hero) .region,body:has(.hero) .coll,body:has(.hero) .p-card,body:has(.hero) .faq,body:has(.hero) .steps>div,body:has(.hero) .card,body:has(.hero) .empty{background:var(--cb-card)!important;border:1px solid var(--cb-border)!important;color:var(--cb-text)!important;box-shadow:none!important}
    body:has(.hero) .offer:hover,body:has(.hero) .region:hover,body:has(.hero) .coll:hover{background:var(--cb-card-hover)!important;border-color:var(--cb-green)!important}
    body:has(.hero) .o-body h3,body:has(.hero) .s-tile strong,body:has(.hero) .cat strong,body:has(.hero) .region strong,body:has(.hero) .coll strong,body:has(.hero) .p-card h3{color:var(--cb-text)!important}
    body:has(.hero) .o-body p,body:has(.hero) .fine,body:has(.hero) .muted,body:has(.hero) .prose,body:has(.hero) .faq p,body:has(.hero) .region span,body:has(.hero) .coll span{color:var(--cb-dim)!important}
    body:has(.hero) .pill{background:#1b1b20;border-color:var(--cb-border);color:var(--cb-dim)}
    body:has(.hero) .pill.ok{background:rgba(0,217,126,.1);border-color:rgba(0,217,126,.25);color:var(--cb-green)}
    body:has(.hero) .rp{background:rgba(0,217,126,.1);color:var(--cb-green)}
    body:has(.hero) .cta,body:has(.hero) .cta.deal{background:#1a1a1f;color:var(--cb-green);border:1px solid var(--cb-border);box-shadow:none}
    body:has(.hero) .cta.code,body:has(.hero) .btn.accent{background:var(--cb-green)!important;color:#000!important;box-shadow:none}
    body:has(.hero) .faq summary{color:var(--cb-text)}
    body:has(.hero) .faq summary:hover{background:var(--cb-card-hover)}
    body:has(.hero) .nl-band{background:var(--cb-card)!important;border:1px solid var(--cb-border);color:var(--cb-text)}
    body:has(.hero) .nl-band h2{color:var(--cb-text)}
    body:has(.hero) .nl-band p{color:var(--cb-dim)}
    body:has(.hero) .nl input{background:#0a0a0b;border-color:var(--cb-border);color:var(--cb-text)}
    body:has(.hero) .ftr{margin-top:72px;background:#0a0a0b;border-top:1px solid var(--cb-border);color:var(--cb-dim)}
    body:has(.hero) .ftr a{color:var(--cb-dim)}
    body:has(.hero) .ftr .brand{color:var(--cb-text)}
    body:has(.hero) .ftr h3{color:var(--cb-dim)}
    body:has(.hero) .drawer{background:var(--cb-card);color:var(--cb-text)}
    body:has(.hero) .drawer a,body:has(.hero) .drawer summary{color:var(--cb-text)}
    @media(max-width:980px){body:has(.hero) .hero{padding:64px 0 48px}body:has(.hero) .stats{padding-left:20px;padding-right:20px}}
    @media(max-width:600px){body:has(.hero) .hero{padding:56px 0 44px}body:has(.hero) .stats{grid-template-columns:repeat(2,1fr);gap:22px;padding-top:26px;padding-bottom:26px}body:has(.hero) .block{padding-top:56px}body:has(.hero) .tile-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}body:has(.hero) .cat-grid{grid-template-columns:1fr}body:has(.hero) .hero h1{letter-spacing:-1.5px}}
  `;
  return css;
}
