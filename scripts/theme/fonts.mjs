// fonts — the curated Google Fonts a theme may name, and how to load each one.
//
// Pure: no imports, no I/O. preview.html inlines this file next to resolve.mjs.
//
// Why curated: a DESIGN.md names proprietary faces (Söhne, Copernicus, SF Pro)
// that nobody can load. A theme renders with an open substitute from this list.
// And one weight a family doesn't have makes the whole Google Fonts request fail,
// so every family here carries the weights it really has: [min, max] for a
// variable axis, or the exact static list.

export const FALLBACKS = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

export const DEFAULT_FAMILY = { sans: 'Inter', serif: 'Source Serif 4', mono: 'JetBrains Mono' };

// [family, class, weights] — weights is 'min..max' (a variable axis) or a list (static).
// "axes" adds an optical-size axis to the request where it matters.
const LIST = [
  // sans
  ['Inter', 'sans', '100..900'],
  ['Inter Tight', 'sans', '100..900'],
  ['Geist', 'sans', '100..900'],
  ['Roboto', 'sans', '100..900'],
  ['Open Sans', 'sans', '300..800'],
  ['Montserrat', 'sans', '100..900'],
  ['Lato', 'sans', [100, 300, 400, 700, 900]],
  ['Poppins', 'sans', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
  ['Nunito', 'sans', '200..1000'],
  ['Nunito Sans', 'sans', '200..1000'],
  ['Work Sans', 'sans', '100..900'],
  ['DM Sans', 'sans', '100..1000'],
  ['Manrope', 'sans', '200..800'],
  ['Plus Jakarta Sans', 'sans', '200..800'],
  ['Outfit', 'sans', '100..900'],
  ['Figtree', 'sans', '300..900'],
  ['IBM Plex Sans', 'sans', [100, 200, 300, 400, 500, 600, 700]],
  ['Source Sans 3', 'sans', '200..900'],
  ['Space Grotesk', 'sans', '300..700'],
  ['Sora', 'sans', '100..800'],
  ['Archivo', 'sans', '100..900'],
  ['Barlow', 'sans', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
  ['Rubik', 'sans', '300..900'],
  ['Karla', 'sans', '200..800'],
  ['Mulish', 'sans', '200..1000'],
  ['Raleway', 'sans', '100..900'],
  ['Lexend', 'sans', '100..900'],
  ['Urbanist', 'sans', '100..900'],
  ['Onest', 'sans', '100..900'],
  ['Hanken Grotesk', 'sans', '100..900'],
  ['Schibsted Grotesk', 'sans', '400..900'],
  ['Public Sans', 'sans', '100..900'],
  ['Red Hat Display', 'sans', '300..900'],
  ['Albert Sans', 'sans', '100..900'],
  ['Instrument Sans', 'sans', '400..700'],
  ['Bricolage Grotesque', 'sans', '200..800'],
  ['Titillium Web', 'sans', [200, 300, 400, 600, 700, 900]],
  ['Oswald', 'sans', '200..700'],
  ['Bebas Neue', 'sans', [400]],
  ['Anton', 'sans', [400]],
  ['Noto Sans', 'sans', '100..900'],
  ['Mona Sans', 'sans', '200..900'],
  ['Hubot Sans', 'sans', '200..900'],
  ['Sofia Sans', 'sans', '1..1000'],
  ['Jost', 'sans', '100..900'],
  ['Archivo Black', 'sans', [400]],
  ['Saira Condensed', 'sans', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
  ['Barlow Condensed', 'sans', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
  ['Roboto Condensed', 'sans', '100..900'],
  ['Silkscreen', 'sans', [400, 700]],
  ['Press Start 2P', 'sans', [400]],
  // serif
  ['Fraunces', 'serif', '100..900', 'opsz,wght@9..144,'],
  ['Source Serif 4', 'serif', '200..900', 'opsz,wght@8..60,'],
  ['Playfair Display', 'serif', '400..900'],
  ['Merriweather', 'serif', [300, 400, 700, 900]],
  ['Lora', 'serif', '400..700'],
  ['EB Garamond', 'serif', '400..800'],
  ['Cormorant Garamond', 'serif', [300, 400, 500, 600, 700]],
  ['Libre Baskerville', 'serif', '400..700'],
  ['DM Serif Display', 'serif', [400]],
  ['Instrument Serif', 'serif', [400]],
  ['Newsreader', 'serif', '200..800', 'opsz,wght@6..72,'],
  ['Literata', 'serif', '200..900'],
  ['Crimson Pro', 'serif', '200..900'],
  ['Spectral', 'serif', [200, 300, 400, 500, 600, 700, 800]],
  ['Noto Serif', 'serif', '100..900'],
  ['PT Serif', 'serif', [400, 700]],
  ['Bitter', 'serif', '100..900'],
  ['Roboto Slab', 'serif', '100..900'],
  ['Zilla Slab', 'serif', [300, 400, 500, 600, 700]],
  ['Young Serif', 'serif', [400]],
  ['Gelasio', 'serif', '400..700'],
  // mono
  ['JetBrains Mono', 'mono', '100..800'],
  ['Geist Mono', 'mono', '100..900'],
  ['IBM Plex Mono', 'mono', [100, 200, 300, 400, 500, 600, 700]],
  ['Fira Code', 'mono', '300..700'],
  ['Source Code Pro', 'mono', '200..900'],
  ['Roboto Mono', 'mono', '100..700'],
  ['Space Mono', 'mono', [400, 700]],
  ['DM Mono', 'mono', [300, 400, 500]],
  ['Inconsolata', 'mono', '200..900'],
  ['Martian Mono', 'mono', '100..800'],
  ['VT323', 'mono', [400]],
];

const norm = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export const FONTS = LIST.map(([family, cls, weights, axes]) => {
  const variable = typeof weights === 'string';
  return {
    family, class: cls, variable,
    weights: variable ? weights.split('..').map(Number) : weights,
    axes: axes || null, key: norm(family),
  };
});
const BY_KEY = new Map(FONTS.map((f) => [f.key, f]));
// Names the source notes use for a family we curate under another name.
const ALIASES = { geistsans: 'Geist', interdisplay: 'Inter', intervariable: 'Inter', sourceserifpro: 'Source Serif 4', sourcesanspro: 'Source Sans 3', ibmplexsansvariable: 'IBM Plex Sans' };

/** "Inter Variable", "inter", "'Inter'", "Roboto Light (300)" → the curated entry, or null. */
export function lookupFont(name) {
  if (typeof name !== 'string') return null;
  const clean = name.replace(/["']/g, '').replace(/\(.*?\)/g, '').trim();
  const tries = [clean, clean.replace(/\s+(variable|var|vf)$/i, ''), clean.replace(/\s+(thin|light|regular|medium|semibold|bold|black)$/i, '')];
  for (const t of tries) {
    const k = norm(t);
    const hit = BY_KEY.get(k) || (ALIASES[k] && BY_KEY.get(norm(ALIASES[k])));
    if (hit) return hit;
  }
  return null;
}

/** A family name a user typed for a font we don't curate: letters, digits, spaces. */
export function isPlausibleFamily(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/.test(name.trim());
}

/** The class of a CSS font-family stack: mono, serif or sans. */
export function stackClass(stack) {
  const parts = String(stack || '').split(',').map((p) => p.replace(/["']/g, '').trim().toLowerCase());
  for (const p of parts) {
    const hit = lookupFont(p);
    if (hit) return hit.class;
    if (p === 'monospace' || /\bmono\b|code|courier|consolas|menlo/.test(p)) return 'mono';
    if (p === 'serif' || /georgia|times|garamond|baskerville|tiempos|copernicus|caslon|didot|bodoni|serif$/.test(p) && !/sans/.test(p)) return 'serif';
    if (p === 'sans-serif') return 'sans';
  }
  return 'sans';
}

/** The first family in a stack, unquoted. */
export function firstFamily(stack) {
  return String(stack || '').split(',')[0].replace(/["']/g, '').trim() || null;
}

export function fontStack(family, cls = 'sans') {
  const fb = FALLBACKS[cls] || FALLBACKS.sans;
  return family ? `"${family.replace(/["\\]/g, '')}", ${fb}` : fb;
}

/** One Google Fonts CSS2 URL per family, so one bad family can't break the others. */
export function fontCssUrl(family) {
  const f = lookupFont(family);
  const name = f ? f.family : isPlausibleFamily(family) ? family.trim() : null;
  if (!name) return null;
  const fam = encodeURIComponent(name).replace(/%20/g, '+');
  if (!f) return `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
  const w = f.variable ? `${f.weights[0]}..${f.weights[1]}` : f.weights.join(';');
  if (f.axes) {
    // opsz,wght@<opsz range>,<wght range> — only valid for the variable form.
    return `https://fonts.googleapis.com/css2?family=${fam}:${f.axes}${w}&display=swap`;
  }
  return f.weights.length === 1 && f.weights[0] === 400
    ? `https://fonts.googleapis.com/css2?family=${fam}&display=swap`
    : `https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&display=swap`;
}

/** The nearest weight the family really has (static families only). */
export function nearestWeight(family, weight) {
  const f = lookupFont(family);
  const w = Number(weight) || 400;
  if (!f) return w;
  if (f.variable) return Math.min(f.weights[1], Math.max(f.weights[0], w));
  return f.weights.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), f.weights[0]);
}
