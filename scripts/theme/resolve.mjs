// resolve — theme.json → theme.resolved.json. The one place the layers are merged.
//
// Pure: no imports, no I/O, no Node APIs. preview.html inlines this exact text
// (with fonts.mjs), so the live editor and the CLI cannot disagree; a test
// asserts it. Font helpers are passed in rather than imported for that reason.
//
// Layers, in order: base (the DESIGN.md, untouched) ← auto (the importer's
// proposals) ← overrides (the user's brand) ← the other mode, derived here.
// Everything that reaches CSS is validated first: base comes from a file on the
// internet.

export const THEME_SCHEMA = 'indieops-theme/1';
export const RESOLVED_SCHEMA = 'indieops-theme-resolved/1';
export const ROLES = ['accent', 'onAccent', 'canvas', 'surface', 'subtle', 'ink', 'body', 'muted', 'line'];
export const TYPE_ROLES = ['display', 'heading', 'body', 'caption', 'button', 'eyebrow', 'mono'];
export const FONT_SLOTS = ['display', 'text', 'mono'];
const TEXT_ROLES = ['ink', 'body', 'muted'];
const SURFACE_ROLES = ['canvas', 'surface', 'subtle'];

// ───────────────────────── colour ─────────────────────────

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const NAMED = { white: '#ffffff', black: '#000000', transparent: '#00000000' };
const NUM = /^\d*\.?\d+%?$/;

export function parseColor(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  let m = s.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  m = s.match(/^rgba?\(\s*([^()]*)\)$/);
  if (!m) return null;
  const parts = m[1].split(/\s*[,/]\s*|\s+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4 || !parts.every((p) => NUM.test(p))) return null;
  const ch = (p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p) / 255);
  const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  return { r: clamp(ch(parts[0]), 0, 1), g: clamp(ch(parts[1]), 0, 1), b: clamp(ch(parts[2]), 0, 1), a: clamp(a, 0, 1) };
}

const hx = (x) => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, '0');
export function toHex(c, keepAlpha = false) {
  const base = `#${hx(c.r)}${hx(c.g)}${hx(c.b)}`;
  return keepAlpha && c.a < 1 ? base + hx(c.a) : base;
}

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function toOklch(c) {
  const r = toLin(c.r), g = toLin(c.g), b = toLin(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H, a: c.a ?? 1 };
}

function labToLinear(L, A, B) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → sRGB, reducing chroma (never lightness or hue) until it fits the gamut. */
export function fromOklch(L, C, H, a = 1) {
  L = clamp(L, 0, 1);
  const hr = (H * Math.PI) / 180;
  const at = (c) => labToLinear(L, c * Math.cos(hr), c * Math.sin(hr));
  const fits = (v) => v.every((x) => x >= -1e-5 && x <= 1 + 1e-5);
  let lin = at(Math.max(0, C));
  if (!fits(lin)) {
    let lo = 0, hi = Math.max(0, C);
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (fits(at(mid))) lo = mid; else hi = mid; }
    lin = at(lo);
  }
  const [r, g, b] = lin.map((x) => clamp(toGam(clamp(x, 0, 1)), 0, 1));
  return { r, g, b, a };
}

export function luminance(c) {
  return 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);
}

export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Flatten a translucent colour over a background, the way a browser paints it. */
export function over(fg, bg) {
  const a = fg.a ?? 1;
  if (a >= 1) return { ...fg, a: 1 };
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

/** w of `a` mixed into (1 − w) of `b`, in OKLab. */
export function mix(a, b, w) {
  const toLab = (c) => { const o = toOklch(c); const hr = (o.H * Math.PI) / 180; return [o.L, o.C * Math.cos(hr), o.C * Math.sin(hr)]; };
  const [L1, A1, B1] = toLab(a), [L2, A2, B2] = toLab(b);
  const L = L1 * w + L2 * (1 - w), A = A1 * w + A2 * (1 - w), B = B1 * w + B2 * (1 - w);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return fromOklch(L, Math.hypot(A, B), H, 1);
}

const isDarkBg = (c) => luminance(c) < 0.179; // where white and black text contrast equally

/** Move fg's lightness away from bg (hue kept) until the contrast is at least min. */
export function ensureContrast(fg, bgs, min) {
  const list = Array.isArray(bgs) ? bgs : [bgs];
  // Judge the colour as it will be written (#rrggbb), or rounding can undo the fix.
  const q = (c) => parseColor(toHex(c));
  const worst = (c) => Math.min(...list.map((b) => contrast(q(c), b)));
  if (worst(fg) >= min) return fg;
  const o = toOklch(fg);
  const dir = isDarkBg(list[0]) ? 1 : -1;
  for (let i = 1; i <= 100; i++) {
    const c = q(fromOklch(o.L + dir * i * 0.01, o.C, o.H, 1));
    if (worst(c) >= min) return c;
  }
  return dir > 0 ? { r: 1, g: 1, b: 1, a: 1 } : { r: 0, g: 0, b: 0, a: 1 };
}

export const isNeutral = (c) => toOklch(c).C < 0.04;

// ───────────────────────── values ─────────────────────────

const LEN = /^-?(\d+(\.\d+)?|\.\d+)(px|rem|em|%|vh|vw)?$/;
export const isLength = (v) => typeof v === 'number' || (typeof v === 'string' && LEN.test(v.trim()));
const isPadding = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim().split(/\s+/).length <= 4 && v.trim().split(/\s+/).every((p) => LEN.test(p)));
export const isColor = (v) => parseColor(v) !== null;
const BORDER = /^(\d+(\.\d+)?px)\s+(solid|dashed|dotted|double)\s+(.+)$/;
const isBorder = (v) => v === 'none' || v === 0 || v === '0' || (typeof v === 'string' && ((m) => m && isColor(m[4]))(v.trim().match(BORDER)));
const TRANSFORMS = new Set(['none', 'uppercase', 'lowercase', 'capitalize']);
const FEATURE = /^"?[a-z0-9]{4}"?(\s+\d)?$/;
const UNIVERSAL_FEATURES = new Set(['tnum', 'lnum', 'onum', 'pnum', 'case', 'kern', 'liga', 'calt', 'zero', 'frac']);

export function px(v, base = 16) {
  if (typeof v === 'number') return v;
  const m = String(v).trim().match(/^(-?\d*\.?\d+)(px|rem|em)?$/);
  if (!m) return null;
  return m[2] === 'rem' || m[2] === 'em' ? parseFloat(m[1]) * base : parseFloat(m[1]);
}

const clip = (s, n) => String(s).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, n);
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);

/** "ss01" / "\"tnum\", \"ss01\"" → ['"ss01"'], filtered. */
export function cleanFeatures(v, substituted) {
  if (v === undefined || v === null || v === '' || v === 'normal') return '';
  const parts = String(v).split(',').map((p) => p.trim()).filter((p) => FEATURE.test(p));
  return parts
    .map((p) => { const [tag, n] = p.replace(/"/g, '').split(/\s+/); return { tag, n }; })
    .filter(({ tag }) => !substituted || UNIVERSAL_FEATURES.has(tag))
    .map(({ tag, n }) => `"${tag}"${n ? ` ${n}` : ''}`)
    .join(', ');
}

// ───────────────────────── classification ─────────────────────────

const DISPLAY_NAME = /^(display|hero|headline|heading|title|h[1-6]\b|subtitle|subhead|card-title|mega|jumbo)/;

/** Which font slot a typography token belongs to. */
export function classifySlot(name, family, stackClass) {
  if (stackClass(family) === 'mono' || /(^|-)(code|mono)(-|$)/.test(name)) return 'mono';
  return DISPLAY_NAME.test(name) ? 'display' : 'text';
}

function tokenClass(name, c, roleOf) {
  const r = roleOf[name];
  if (r) {
    if (SURFACE_ROLES.includes(r)) return 'surface';
    if (TEXT_ROLES.includes(r)) return 'text';
    if (r === 'line') return 'line';
    if (r === 'accent') return 'accent';
  }
  const o = toOklch(c);
  if (/hairline|border|divider|rule|stroke|outline|separator/.test(name) && o.C < 0.08) return 'line';
  if (/canvas|surface|background|(^|-)bg(-|$)|paper|panel|card|cream|wash/.test(name) && o.C < 0.08) return 'surface';
  if (/ink|body|text|mute|charcoal|stone|ash|slate|graphite|gray|grey|(^|-)fg(-|$)|heading/.test(name) && o.C < 0.06) return 'text';
  if (o.C >= 0.06) return 'accent';
  if (o.L >= 0.8) return 'surface';
  if (o.L <= 0.55) return 'text';
  return 'line';
}

/**
 * One colour into the other mode. toDark: light → dark; else dark → light.
 * tint: the ink's hue, given to neutrals that have none (white → a dark that leans the brand's way).
 */
function tone(c, cls, toDark, canvasOther, tint) {
  const o = toOklch(c);
  const a = c.a ?? 1;
  if (o.C < 0.02 && tint && cls !== 'accent') { o.H = tint.H; o.C = Math.min(tint.C * 0.4, 0.02); }
  const nC = Math.min(o.C, 0.03);
  if (toDark) {
    if (cls === 'surface') return fromOklch(0.16 + (1 - o.L) * 0.9, nC, o.H, a);
    if (cls === 'line') return fromOklch(clamp(0.16 + (1 - o.L) * 2.2, 0.26, 0.4), nC, o.H, a);
    if (cls === 'text') return fromOklch(clamp(0.97 - (o.L - 0.15) * 0.55, 0.62, 0.97), nC, o.H, a);
  } else {
    if (cls === 'surface') return fromOklch(clamp(1 - (o.L - 0.16) / 0.9, 0.9, 1), nC, o.H, a);
    if (cls === 'line') return fromOklch(clamp(1 - (o.L - 0.16) / 2.2, 0.82, 0.92), nC, o.H, a);
    if (cls === 'text') return fromOklch(clamp(0.15 + (0.97 - o.L) / 0.55, 0.15, 0.45), nC, o.H, a);
  }
  // accent: keep the hue, tame only extreme chroma, then move lightness until it reads (3:1) on the new canvas.
  const C = Math.min(o.C, 0.25);
  let L = o.L;
  for (let i = 0; i < 80; i++) {
    const t = fromOklch(L, C, o.H, a);
    if (!canvasOther || contrast(over(t, canvasOther), canvasOther) >= 3) return t;
    L = clamp(L + (toDark ? 0.01 : -0.01), 0, 1);
  }
  return fromOklch(L, C, o.H, a);
}

// ───────────────────────── refs ─────────────────────────

const REF = /\{(colors|typography|rounded|spacing|components)\.([^{}]+)\}/g;
const WHOLE_REF = /^\{(colors|typography|rounded|spacing|components)\.([^{}]+)\}$/;

function resolveMap(map, group, all, warn) {
  // Values inside one group may point at others ("on-dark": "{colors.canvas}").
  const out = {};
  const visit = (key, depth, seen) => {
    if (has(out, key)) return out[key];
    let v = map[key];
    if (typeof v !== 'string' || !v.includes('{')) return (out[key] = v);
    if (depth > 8 || seen.has(key)) { warn(`${group}.${key}: reference loop`); return (out[key] = undefined); }
    seen.add(key);
    let bad = false;
    v = v.replace(REF, (m, g, k) => {
      const src = g === group ? (has(map, k) ? visit(k, depth + 1, seen) : undefined) : all[g]?.[k];
      if (src === undefined || src === null || typeof src === 'object') { bad = true; return m; }
      return String(src);
    });
    seen.delete(key);
    if (bad) { warn(`${group}.${key}: unresolved reference in ${JSON.stringify(map[key]).slice(0, 60)}`); return (out[key] = undefined); }
    return (out[key] = v);
  };
  for (const k of Object.keys(map || {})) visit(k, 0, new Set());
  return out;
}

function subst(v, groups) {
  let bad = false;
  const s = String(v).replace(REF, (m, g, k) => {
    const src = groups[g]?.[k];
    if (src === undefined || src === null || typeof src === 'object') { bad = true; return m; }
    return String(src);
  });
  return bad ? undefined : s;
}

// ───────────────────────── merge ─────────────────────────

function mergeFlat(base, over) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(over || {})) { if (v === null) delete out[k]; else out[k] = v; }
  return out;
}

function mergeDeep(base, over) {
  const out = clone(base || {});
  for (const [k, v] of Object.entries(over || {})) {
    if (v === null) { delete out[k]; continue; }
    if (isObj(v)) out[k] = mergeFlat(isObj(out[k]) ? out[k] : {}, v);
  }
  return out;
}

/** Overrides after an edit: drop empty objects so theme.json stays readable. */
export function prune(o) {
  if (!isObj(o)) return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const p = isObj(v) ? prune(v) : v;
    if (isObj(p) && !Object.keys(p).length) continue;
    if (Array.isArray(p) && !p.length) continue;
    if (p === undefined) continue;
    out[k] = p;
  }
  return out;
}

// ───────────────────────── resolve ─────────────────────────

/**
 * theme  — the parsed theme.json
 * F      — font helpers: { lookupFont, fontStack, fontCssUrl, stackClass, firstFamily, isPlausibleFamily, DEFAULT_FAMILY }
 */
export function resolveTheme(theme, F) {
  const warnings = [];
  const warn = (m) => { if (!warnings.includes(m)) warnings.push(m); };
  const base = theme.base || {};
  const auto = theme.auto || {};
  const ov = theme.overrides || {};
  const ovTok = ov.tokens || {};
  const baseMode = auto.mode === 'dark' ? 'dark' : 'light';
  const otherMode = baseMode === 'light' ? 'dark' : 'light';
  const toDark = baseMode === 'light';

  // 1. tokens = base ⊕ overrides.tokens
  const raw = {
    colors: mergeFlat(base.colors, ovTok.colors),
    typography: mergeDeep(base.typography, ovTok.typography),
    rounded: mergeFlat(base.rounded, ovTok.rounded),
    spacing: mergeFlat(base.spacing, ovTok.spacing),
    components: mergeDeep(base.components, ovTok.components),
  };
  const explicitColor = new Set(Object.keys(ovTok.colors || {}));

  // 2. role map: auto's token names, re-pointed by any override that names a token.
  const roleMap = { ...(auto.roles || {}) };
  const literals = {};
  for (const r of ROLES) {
    const v = ov.roles?.[r];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && has(raw.colors, v)) roleMap[r] = v;
    else if (isColor(v)) literals[r] = v;
    else warn(`overrides.roles.${r}: "${clip(v, 40)}" is neither a colour nor a token name — ignored`);
  }
  for (const r of ROLES) {
    const t = roleMap[r];
    if (typeof t === 'string' && !has(raw.colors, t) && isColor(t)) { raw.colors[`role-${r}`] = t; roleMap[r] = `role-${r}`; }
    else if (t && !has(raw.colors, t)) { warn(`role ${r} points at missing token "${t}"`); delete roleMap[r]; }
  }

  // 3. role literals write through to their token, and the token's family follows.
  for (const [r, lit] of Object.entries(literals)) {
    const target = roleMap[r];
    if (!target) { raw.colors[`role-${r}`] = lit; roleMap[r] = `role-${r}`; continue; }
    if (explicitColor.has(target)) { warn(`overrides.roles.${r} ignored: tokens.colors.${target} is set explicitly`); continue; }
    const shared = ROLES.some((o) => o !== r && roleMap[o] === target && !literals[o]);
    if (shared) { raw.colors[`role-${r}`] = lit; roleMap[r] = `role-${r}`; continue; }
    const oldC = parseColor(String(subst(raw.colors[target], raw) ?? ''));
    raw.colors[target] = lit;
    const newC = parseColor(lit);
    if (!oldC || !newC) continue;
    const O = toOklch(oldC), N = toOklch(newC);
    for (const name of Object.keys(raw.colors)) {
      if (!name.startsWith(`${target}-`) || explicitColor.has(name)) continue;
      const c = parseColor(String(raw.colors[name]));
      if (!c) continue;
      const s = toOklch(c);
      const L = clamp(s.L + (N.L - O.L), 0, 1);
      const C = O.C < 0.02 ? Math.max(0, s.C + (N.C - O.C)) : s.C * (N.C / O.C);
      const H = O.C < 0.02 ? N.H : s.H + (N.H - O.H);
      raw.colors[name] = toHex(fromOklch(L, C, H, c.a), true);
    }
  }

  // 4. radius roles, with the same write-through rule.
  const radiusMap = { control: auto.radius?.control ?? 'md', card: auto.radius?.card ?? 'lg' };
  for (const k of ['control', 'card']) {
    const v = ov.radius?.[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && has(raw.rounded, v)) { radiusMap[k] = v; continue; }
    if (!isLength(v)) { warn(`overrides.radius.${k}: "${clip(v, 30)}" is not a length — ignored`); continue; }
    const target = radiusMap[k];
    const other = k === 'control' ? 'card' : 'control';
    const len = typeof v === 'number' ? `${v}px` : v;
    if (has(raw.rounded, target) && !(radiusMap[other] === target && ov.radius?.[other] == null) && !has(ovTok.rounded, target)) raw.rounded[target] = len;
    else { raw.rounded[`role-${k}`] = len; radiusMap[k] = `role-${k}`; }
  }

  // 5. scale.
  const sType = clamp(Number(ov.scale?.type) || 1, 0.8, 1.25);
  const sSpace = clamp(Number(ov.scale?.space) || 1, 0.75, 1.5);
  const scaleLen = (v, s) => {
    if (s === 1) return v;
    const n = px(v);
    if (n === null || Math.abs(n) >= 999 || !/px$|^-?[\d.]+$/.test(String(v).trim())) return v;
    return `${Math.round(n * s * 2) / 2}px`;
  };
  if (sType !== 1) {
    for (const t of Object.values(raw.typography)) {
      if (!isObj(t)) continue;
      if (t.fontSize !== undefined) t.fontSize = scaleLen(t.fontSize, sType);
      if (typeof t.letterSpacing === 'string' && /px$/.test(t.letterSpacing)) t.letterSpacing = scaleLen(t.letterSpacing, sType);
      if (typeof t.lineHeight === 'string' && /px$/.test(t.lineHeight)) t.lineHeight = scaleLen(t.lineHeight, sType);
    }
  }
  if (sSpace !== 1) {
    for (const k of Object.keys(raw.spacing)) raw.spacing[k] = scaleLen(raw.spacing[k], sSpace);
    for (const c of Object.values(raw.components)) {
      if (!isObj(c)) continue;
      for (const p of ['padding', 'height']) {
        if (typeof c[p] === 'string' && !c[p].includes('{')) c[p] = c[p].trim().split(/\s+/).map((x) => scaleLen(x, sSpace)).join(' ');
        else if (typeof c[p] === 'number') c[p] = scaleLen(`${c[p]}px`, sSpace);
      }
    }
  }

  // 6. references, then validation.
  const all = { colors: raw.colors, rounded: raw.rounded, spacing: raw.spacing, typography: raw.typography, components: raw.components };
  const colorsB = {};
  for (const [k, v] of Object.entries(resolveMap(raw.colors, 'colors', all, warn))) {
    if (v === undefined) continue;
    if (isColor(v)) colorsB[k] = String(v).trim();
    else if (!/gradient\(|TO_FILL/.test(String(v))) warn(`colors.${k}: "${clip(v, 40)}" is not a colour — dropped`);
  }
  const lenMap = (group) => {
    const out = {};
    for (const [k, v] of Object.entries(resolveMap(raw[group], group, all, warn))) {
      if (v === undefined) continue;
      if (isLength(v)) out[k] = typeof v === 'number' ? (v === 0 ? '0px' : `${v}px`) : String(v).trim();
      else warn(`${group}.${k}: "${clip(v, 30)}" is not a length — dropped`);
    }
    return out;
  };
  const rounded = lenMap('rounded');
  const spacing = lenMap('spacing');

  // Base-mode role values.
  const C = Object.fromEntries(Object.entries(colorsB).map(([k, v]) => [k, parseColor(v)]));
  const rolesB = {};
  const canvasB0 = C[roleMap.canvas] || parseColor(baseMode === 'light' ? '#ffffff' : '#0b0b0c');
  for (const r of ROLES) {
    const c = C[roleMap[r]];
    if (c) rolesB[r] = over(c, canvasB0);
  }
  rolesB.canvas = rolesB.canvas || canvasB0;
  const fill = (roles, mode) => {
    const cv = roles.canvas;
    roles.surface = roles.surface || cv;
    roles.subtle = roles.subtle || mix(roles.ink || (isDarkBg(cv) ? parseColor('#ffffff') : parseColor('#000000')), cv, 0.04);
    roles.ink = roles.ink || (isDarkBg(cv) ? parseColor('#f5f5f5') : parseColor('#111111'));
    roles.body = roles.body || roles.ink;
    roles.muted = roles.muted || ensureContrast(mix(roles.ink, cv, 0.55), cv, 4.5);
    roles.line = roles.line || mix(roles.ink, cv, 0.12);
    roles.accent = roles.accent || roles.ink;
    if (!roles.onAccent) roles.onAccent = bestOn(roles.accent, [parseColor('#ffffff'), roles.ink, cv]);
    return roles;
  };
  fill(rolesB, baseMode);
  if (literals.accent && ov.roles?.onAccent == null && contrast(rolesB.onAccent, rolesB.accent) < 4.5) {
    rolesB.onAccent = bestOn(rolesB.accent, [parseColor('#ffffff'), rolesB.ink, rolesB.canvas, parseColor('#000000')]);
  }

  // 7. the other mode: roles first (the brand's own dark tokens when it has them), then every token.
  const pin = (r) => { const v = ov.roles?.[otherMode]?.[r]; return v != null && isColor(v) ? parseColor(v) : null; };
  const authentic = (r) => { const t = auto.other?.[r]; return t && C[t] ? over(C[t], C[auto.other.canvas] || rolesB.canvas) : null; };
  const rolesO = {};
  const inkO = toOklch(rolesB.ink);
  const tint = inkO.C >= 0.02 ? { H: inkO.H, C: inkO.C } : null;
  rolesO.canvas = pin('canvas') || authentic('canvas') || tone(rolesB.canvas, 'surface', toDark, null, tint);
  rolesO.surface = pin('surface') || (auto.other?.canvas && authentic('surface')) || tone(rolesB.surface, 'surface', toDark, null, tint);
  if (!pin('surface') && toHex(rolesO.surface) === toHex(rolesO.canvas) && toDark) {
    const o = toOklch(rolesO.canvas);
    rolesO.surface = fromOklch(o.L + 0.035, o.C, o.H, 1);
  }
  rolesO.subtle = pin('subtle') || tone(rolesB.subtle, 'surface', toDark, null, tint);
  for (const r of TEXT_ROLES) rolesO[r] = pin(r) || authentic(r) || tone(rolesB[r], 'text', toDark, null, tint);
  rolesO.line = pin('line') || authentic('line') || tone(rolesB.line, 'line', toDark, null, tint);
  // A black or white action colour inverts with the mode, the way monochrome brands do.
  rolesO.accent = pin('accent') || over(tone(rolesB.accent, isNeutral(rolesB.accent) ? 'text' : 'accent', toDark, rolesO.canvas), rolesO.canvas);
  // Guards, derived mode only (a user's pin is respected and only warned about).
  for (const r of TEXT_ROLES) {
    if (pin(r)) { if (contrast(rolesO[r], rolesO.canvas) < 4.5) warn(`${otherMode}.${r} you pinned is below 4.5:1 on its canvas`); continue; }
    rolesO[r] = ensureContrast(rolesO[r], [rolesO.canvas, rolesO.surface], 4.5);
  }
  if (!pin('line')) {
    const lo = toOklch(rolesO.line), co = toOklch(rolesO.canvas);
    if (Math.abs(lo.L - co.L) < 0.05) rolesO.line = fromOklch(co.L + (toDark ? 0.08 : -0.08), lo.C, lo.H, 1);
  }
  // Text on the accent: the brand's own pairing while the accent is unchanged; otherwise the
  // first of (brand's, white, the canvas) that reaches 4.5:1, else whichever reads best.
  const onO = pin('onAccent');
  const sameAccent = toHex(rolesO.accent) === toHex(rolesB.accent);
  const onList = [rolesB.onAccent, parseColor('#ffffff'), rolesO.canvas];
  rolesO.onAccent = onO || (sameAccent ? rolesB.onAccent
    : onList.find((c) => contrast(c, rolesO.accent) >= 4.5) || bestOn(rolesO.accent, [...onList, parseColor('#000000')]));
  if (!sameAccent && contrast(rolesO.onAccent, rolesO.accent) < 4.5) warn(`${otherMode}: text on the accent is below 4.5:1`);

  // Base-mode checks are warnings only: the brand chose them.
  for (const r of TEXT_ROLES) if (contrast(rolesB[r], rolesB.canvas) < 4.5) warn(`${baseMode}.${r} is ${contrast(rolesB[r], rolesB.canvas).toFixed(2)}:1 on canvas (below 4.5) — the source design's choice`);
  if (contrast(rolesB.onAccent, rolesB.accent) < 4.5) warn(`${baseMode}: text on the accent is ${contrast(rolesB.onAccent, rolesB.accent).toFixed(2)}:1 (below 4.5) — use accentText for links`);

  // Derived roles in both modes.
  for (const [roles, mode] of [[rolesB, baseMode], [rolesO, otherMode]]) {
    roles.accentText = ensureContrast(roles.accent, roles.canvas, 4.5);
    roles.accentSoft = mix(roles.accent, roles.canvas, mode === 'light' ? 0.12 : 0.18);
  }

  // Every colour token in the other mode (so components work there too).
  const roleOf = {};
  for (const r of ROLES) if (roleMap[r] && !roleOf[roleMap[r]]) roleOf[roleMap[r]] = r;
  const fixedRe = toDark ? /-dark$|-dark-|-night|^on-dark|-on-dark|^surface-dark|^inverse|^dark-/ : /-light$|-light-|^on-light|-on-light|^surface-light|^inverse|^light-/;
  const colorsO = {};
  const pairs = auto.pairs || {};
  const pinTok = ovTok.modes?.[otherMode]?.colors || {};
  for (const [k, v] of Object.entries(colorsB)) {
    const c = C[k];
    if (pinTok[k] != null && isColor(pinTok[k])) { colorsO[k] = String(pinTok[k]); continue; }
    if (roleOf[k] && ROLES.includes(roleOf[k])) { colorsO[k] = c.a < 1 ? toHex({ ...rolesO[roleOf[k]], a: c.a }, true) : toHex(rolesO[roleOf[k]]); continue; }
    if (pairs[k] && C[pairs[k]]) { colorsO[k] = colorsB[pairs[k]]; continue; }
    if (fixedRe.test(k)) { colorsO[k] = v; continue; }
    const cls = tokenClass(k, c, roleOf);
    colorsO[k] = toHex(tone(c, cls === 'accent' && isNeutral(c) ? 'text' : cls, toDark, rolesO.canvas, tint), true);
  }

  // Fonts: three slots. A proprietary family is never first in a resolved stack.
  const fonts = {};
  for (const slot of FONT_SLOTS) {
    const a = auto.fonts?.[slot] || {};
    const want = ov.fonts?.[slot] ?? a.use;
    const known = F.lookupFont(want);
    let family = known ? known.family : (F.isPlausibleFamily(want) ? String(want).trim() : null);
    if (!family) {
      if (want) warn(`fonts.${slot}: "${clip(want, 40)}" is not a usable font name — using the default`);
      family = F.DEFAULT_FAMILY[a.class || (slot === 'mono' ? 'mono' : 'sans')];
    }
    const cls = F.lookupFont(family)?.class || a.class || (slot === 'mono' ? 'mono' : 'sans');
    fonts[slot] = {
      family, class: cls, from: a.from || null, curated: !!F.lookupFont(family),
      stack: F.fontStack(family, cls), css: F.fontCssUrl(family),
    };
  }

  // Typography, with the slot family swapped in.
  const typography = {};
  const typeRaw = raw.typography;
  for (const [name, t] of Object.entries(typeRaw)) {
    if (!isObj(t)) continue;
    const slot = classifySlot(name, t.fontFamily, F.stackClass);
    const f = fonts[slot];
    const sourceFamily = F.firstFamily(t.fontFamily);
    const substituted = !!sourceFamily && (F.lookupFont(sourceFamily)?.family !== f.family);
    const out = { slot, family: f.stack };
    const size = subst(t.fontSize ?? '', all);
    if (isLength(size)) out.size = /^\d+(\.\d+)?$/.test(String(size)) ? `${size}px` : String(size);
    const w = Number(t.fontWeight);
    if (w >= 100 && w <= 1000) out.weight = w;
    if (typeof t.lineHeight === 'number' || isLength(t.lineHeight)) out.lineHeight = t.lineHeight;
    if (t.letterSpacing === 0 || t.letterSpacing === '0' || t.letterSpacing === 'normal') out.letterSpacing = 'normal';
    else if (isLength(t.letterSpacing)) out.letterSpacing = String(t.letterSpacing);
    const feat = cleanFeatures(t.fontFeature, substituted);
    if (feat) out.features = feat;
    if (TRANSFORMS.has(t.textTransform)) out.transform = t.textTransform;
    typography[name] = out;
  }

  // Components per mode.
  const comps = (colors) => {
    const out = {};
    const groups = { colors, rounded, spacing };
    for (const [name, c] of Object.entries(raw.components)) {
      if (!isObj(c)) continue;
      const o = {};
      for (const [p, v] of Object.entries(c)) {
        if (v === null || v === undefined) continue;
        if (p === 'typography') {
          const m = String(v).match(WHOLE_REF);
          const key = m && m[1] === 'typography' ? m[2] : String(v);
          if (typography[key]) o.typography = key;
          continue;
        }
        if (p === 'description') { o.description = clip(v, 200); continue; }
        const s = typeof v === 'number' ? `${v}px` : subst(v, groups);
        if (s === undefined) continue;
        if (/^(backgroundColor|textColor|borderColor|iconColor|placeholderColor)$/.test(p)) { if (isColor(s)) o[p] = s; continue; }
        if (p === 'rounded') { if (isLength(s)) o.rounded = s; continue; }
        if (p === 'padding') { if (isPadding(s)) o.padding = s; continue; }
        if (/^(height|width|size|minHeight|gap)$/.test(p)) { if (isLength(s)) o[p] = s; continue; }
        if (p === 'border') { if (isBorder(s)) o.border = s; continue; }
      }
      if (Object.keys(o).length) out[name] = o;
    }
    return out;
  };

  // Type roles.
  const type = {};
  for (const r of TYPE_ROLES) {
    const k = auto.type?.[r];
    if (k && typography[k]) type[r] = { token: k, ...typography[k] };
  }
  if (!type.body) type.body = { token: null, slot: 'text', family: fonts.text.stack, size: '16px', weight: 400, lineHeight: 1.5 };
  if (!type.display) type.display = { token: null, slot: 'display', family: fonts.display.stack, size: '48px', weight: 600, lineHeight: 1.1 };

  const len = (k, map, dflt) => (has(map, k) ? map[k] : isLength(k) ? (typeof k === 'number' ? `${k}px` : k) : dflt);
  const radius = { control: len(radiusMap.control, rounded, '8px'), card: len(radiusMap.card, rounded, '12px') };
  const space = { unit: len(auto.space?.unit, spacing, '8px'), section: len(auto.space?.section, spacing, '64px') };

  // Guidance: the source's bullets minus any hidden, plus the user's own.
  const hide = new Set(ov.guidance?.hide || []);
  const g = base.guidance || {};
  const guidance = {
    overview: clip(g.overview || base.description || '', 1200),
    do: [...(g.do || []).filter((b) => !hide.has(b.id)).map((b) => clip(b.text, 400)), ...(ov.guidance?.do || []).map((t) => clip(t, 400))],
    dont: [...(g.dont || []).filter((b) => !hide.has(b.id)).map((b) => clip(b.text, 400)), ...(ov.guidance?.dont || []).map((t) => clip(t, 400))],
  };

  const hexRoles = (roles) => Object.fromEntries([...ROLES, 'accentText', 'accentSoft'].map((r) => [r, toHex(roles[r])]));
  const light = baseMode === 'light' ? hexRoles(rolesB) : hexRoles(rolesO);
  const dark = baseMode === 'light' ? hexRoles(rolesO) : hexRoles(rolesB);
  const colorsLight = baseMode === 'light' ? colorsB : colorsO;
  const colorsDark = baseMode === 'light' ? colorsO : colorsB;

  const logo = theme.assets?.logo || {};
  const src = theme.source || {};
  return {
    schema: RESOLVED_SCHEMA,
    revision: theme.revision ?? 0,
    generator: theme.generator || null,
    updated: theme.updated || null,
    baseMode,
    entity: { kind: theme.entity?.kind || null, slug: theme.entity?.slug || null, name: clip(theme.entity?.name || '', 120) },
    basedOn: { displayName: clip(src.displayName || src.folder || '', 60), folder: src.folder || null, url: src.url || null, license: src.license || null, reviewed: src.reviewed !== false },
    light, dark,
    fonts,
    type,
    radius, space,
    logo: { light: logo.light || null, dark: logo.dark || null, mark: logo.mark || null, alt: clip(logo.alt || theme.entity?.name || '', 120) },
    guidance,
    tokens: {
      light: { colors: colorsLight, components: comps(colorsLight) },
      dark: { colors: colorsDark, components: comps(colorsDark) },
      typography, rounded, spacing,
    },
    roleTokens: { ...roleMap },
    checks: { warnings },
  };
}

function bestOn(bg, candidates) {
  let best = candidates[0], score = -1;
  for (const c of candidates) { if (!c) continue; const s = contrast(c, bg); if (s > score) { score = s; best = c; } }
  return best;
}

// ───────────────────────── css ─────────────────────────

const CSS_ROLES = [
  ['accent', 'accent'], ['onAccent', 'on-accent'], ['accentText', 'accent-text'], ['accentSoft', 'accent-soft'],
  ['canvas', 'canvas'], ['surface', 'surface'], ['subtle', 'subtle'],
  ['ink', 'ink'], ['body', 'body'], ['muted', 'muted'], ['line', 'line'],
];

export function roleVars(roles) {
  return CSS_ROLES.map(([k, v]) => `--brand-${v}:${roles[k]};`).join('');
}

export function staticVars(res) {
  const d = res.type.display || {};
  return [
    `--brand-font-display:${res.fonts.display.stack};`,
    `--brand-font-text:${res.fonts.text.stack};`,
    `--brand-font-mono:${res.fonts.mono.stack};`,
    `--brand-weight-display:${d.weight || 600};`,
    `--brand-tracking-display:${d.letterSpacing || 'normal'};`,
    `--brand-radius-control:${res.radius.control};`,
    `--brand-radius-card:${res.radius.card};`,
    `--brand-space-unit:${res.space.unit};`,
    `--brand-space-section:${res.space.section};`,
  ].join('');
}

/** theme.css: roles only, light in :root, dark under the IndieOps theme-toggle selectors. */
export function themeCss(res, { mode } = {}) {
  const links = [...new Set(['display', 'text', 'mono'].map((s) => res.fonts[s].css).filter(Boolean))];
  const head = `/* ${res.entity.name || 'Brand'} — generated by Shared Profiles from brand/theme.json (revision ${res.revision}). Don't edit; run: ioc theme build\n` +
    `   Fonts: ${links.length ? links.map((u) => `<link rel="stylesheet" href="${u}">`).join(' ') : 'none'} */\n`;
  const nl = (s) => s.replace(/;/g, ';\n  ').replace(/\n  $/, '\n');
  if (mode === 'light' || mode === 'dark') {
    return `${head}:root{\n  color-scheme:${mode};\n  ${nl(roleVars(res[mode]) + staticVars(res))}}\n`;
  }
  return `${head}:root{\n  color-scheme:light dark;\n  ${nl(roleVars(res.light) + staticVars(res))}}\n` +
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){\n  ${nl(roleVars(res.dark))}}}\n` +
    `:root[data-theme="dark"]{\n  ${nl(roleVars(res.dark))}}\n` +
    `:root[data-theme="light"]{\n  ${nl(roleVars(res.light))}}\n`;
}
