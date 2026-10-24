// automap — propose how a DESIGN.md's own token names map onto the fixed role
// vocabulary every IndieOps Skilllet reads (accent, canvas, ink, …).
//
// These are proposals. They live in theme.json's `auto` layer, are replaced on
// every re-import, and anything here can be re-pointed by the user's overrides.
// The candidate lists come from counting key names across all 84 upstream files.

import { parseColor, luminance, contrast, toOklch, isNeutral, px, classifySlot, over } from './resolve.mjs';
import { lookupFont, stackClass, firstFamily, FONTS, DEFAULT_FAMILY } from './fonts.mjs';

const CANDIDATES = {
  accent: ['primary', 'brand', 'accent', 'brand-primary'],
  onAccent: ['on-primary', 'primary-on', 'on-accent', 'on-brand'],
  canvas: ['canvas', 'canvas-light', 'surface-canvas-light', 'background', 'bg', 'surface', 'paper', 'white'],
  surface: ['surface-card', 'surface', 'card', 'surface-elevated', 'surface-1', 'canvas'],
  subtle: ['surface-soft', 'canvas-soft', 'surface-1', 'surface-subtle', 'surface-strong', 'canvas-alt', 'surface-muted'],
  ink: ['ink', 'ink-deep', 'body-strong', 'on-light', 'charcoal', 'text', 'foreground'],
  body: ['body', 'ink-secondary', 'body-strong', 'charcoal', 'graphite', 'ink-2', 'text-secondary'],
  muted: ['muted', 'mute', 'ink-mute', 'ink-muted', 'ink-subtle', 'muted-soft', 'ink-tertiary', 'stone', 'ash', 'slate', 'body-muted'],
  line: ['hairline', 'hairline-light', 'hairline-on-light', 'border', 'divider', 'hairline-soft', 'rule', 'line', 'hairline-strong'],
};

// The brand's own tokens for the other mode, when it has them.
const OTHER = {
  dark: {
    canvas: ['canvas-dark', 'canvas-night', 'surface-dark', 'bg-dark', 'background-dark', 'dark', 'surface-inverse', 'inverse-canvas'],
    surface: ['surface-dark-elevated', 'surface-dark-soft', 'surface-dark-2', 'card-dark', 'surface-elevated-dark'],
    ink: ['on-dark', 'ink-on-dark', 'text-on-dark', 'on-dark-primary', 'ink-inverse', 'on-inverse'],
    body: ['on-dark-soft', 'on-dark-secondary', 'body-on-dark'],
    muted: ['on-dark-mute', 'on-dark-muted', 'muted-on-dark', 'on-dark-soft', 'on-dark-tertiary'],
    line: ['hairline-dark', 'hairline-on-dark', 'border-dark', 'divider-dark', 'line-dark'],
  },
  light: {
    canvas: ['canvas-light', 'surface-light', 'bg-light', 'background-light', 'light', 'paper', 'canvas-inverse', 'inverse-canvas', 'white'],
    surface: ['surface-light-elevated', 'surface-light-soft', 'card-light'],
    ink: ['on-light', 'ink-on-light', 'text-on-light', 'ink-inverse', 'on-inverse', 'ink-dark'],
    body: ['on-light-soft', 'on-light-secondary', 'body-on-light'],
    muted: ['on-light-mute', 'on-light-muted', 'muted-on-light'],
    line: ['hairline-light', 'hairline-on-light', 'border-light', 'divider-light'],
  },
};

const TYPE = {
  heading: ['heading-lg', 'heading-md', 'title-lg', 'heading-2', 'h2', 'display-sm', 'title-md', 'subhead', 'heading', 'title', 'heading-xl'],
  body: ['body-md', 'body', 'body-lg', 'body-sm', 'text-md', 'paragraph', 'body-text'],
  caption: ['caption', 'caption-md', 'caption-sm', 'body-sm', 'micro', 'small', 'label-sm'],
  button: ['button-md', 'button', 'button-sm', 'button-lg', 'button-label', 'button-text', 'label-md', 'label', 'cta'],
  eyebrow: ['eyebrow', 'caption-uppercase', 'micro-cap', 'overline', 'label-caps', 'kicker', 'eyebrow-md'],
  mono: ['code', 'code-md', 'mono', 'code-sm', 'mono-md', 'mono-sm'],
};

/**
 * base   — theme.base (tokens straight from the DESIGN.md)
 * extra  — { fontNote, hints } from the reader
 * Returns the `auto` layer.
 */
export function automap(base, { fontNote = '', hints = {} } = {}) {
  const notes = [];
  const raw = base.colors || {};
  const colors = {};
  for (const [k, v] of Object.entries(raw)) { const c = parseColor(String(v)); if (c) colors[k] = c; }
  const exists = (k) => Object.prototype.hasOwnProperty.call(colors, k);

  // Mode.
  const canvasKey0 = hints.roles?.canvas || ['canvas', 'canvas-light', 'background', 'bg', 'surface'].find(exists);
  let mode;
  if (canvasKey0) mode = luminance(colors[canvasKey0]) < 0.2 ? 'dark' : 'light';
  else mode = colors.ink && luminance(colors.ink) > 0.5 ? 'dark' : 'light';
  const swap = (k) => (mode === 'dark' ? k.replace(/-light\b/g, '-dark').replace(/\bon-light\b/g, 'on-dark') : k);

  const roles = {};
  const pick = (role, list, ok = () => true) => {
    if (hints.roles?.[role] && exists(hints.roles[role]) && ok(hints.roles[role])) return hints.roles[role];
    for (const k of list.map(swap)) if (exists(k) && ok(k)) return k;
    return null;
  };
  roles.canvas = pick('canvas', CANDIDATES.canvas, (k) => (mode === 'dark' ? luminance(colors[k]) < 0.2 : luminance(colors[k]) >= 0.2));
  const cv = roles.canvas ? over(colors[roles.canvas], { r: 1, g: 1, b: 1, a: 1 }) : (mode === 'dark' ? { r: 0.05, g: 0.05, b: 0.05, a: 1 } : { r: 1, g: 1, b: 1, a: 1 });
  if (!roles.canvas) { roles.canvas = mode === 'dark' ? '#0d0d0d' : '#ffffff'; notes.push(`canvas: no canvas token — using ${roles.canvas}`); }
  const readable = (min) => (k) => contrast(over(colors[k], cv), cv) >= min;
  roles.accent = pick('accent', CANDIDATES.accent);
  if (!roles.accent) {
    const chroma = Object.keys(colors).filter((k) => !isNeutral(colors[k])).sort((a, b) => toOklch(colors[b]).C - toOklch(colors[a]).C)[0];
    roles.accent = chroma || pick('ink', CANDIDATES.ink);
    notes.push(`accent: no "primary" token — using ${roles.accent}`);
  }
  roles.onAccent = pick('onAccent', CANDIDATES.onAccent);
  roles.surface = pick('surface', CANDIDATES.surface, (k) => Math.abs(luminance(colors[k]) - luminance(cv)) < 0.3);
  roles.subtle = pick('subtle', CANDIDATES.subtle, (k) => Math.abs(luminance(colors[k]) - luminance(cv)) < 0.3);
  roles.ink = pick('ink', CANDIDATES.ink, readable(4.5)) || pick('ink', CANDIDATES.ink, readable(3));
  roles.body = pick('body', CANDIDATES.body, readable(3));
  roles.muted = pick('muted', CANDIDATES.muted, readable(3));
  roles.line = pick('line', CANDIDATES.line, (k) => contrast(over(colors[k], cv), cv) < 3);
  for (const r of Object.keys(roles)) if (!roles[r]) delete roles[r];
  for (const r of ['ink', 'body', 'muted']) {
    const listed = CANDIDATES[r].map(swap).find(exists);
    if (listed && roles[r] !== listed) notes.push(`${r}: "${listed}" is too faint on the canvas — ${roles[r] ? `using "${roles[r]}"` : 'deriving one'}`);
  }
  if (colors[roles.accent] && isNeutral(colors[roles.accent])) {
    notes.push("accent: this design's action colour is black/white — creatives will be monochrome unless you set an accent (ioc theme set accent \"#hex\")");
  }

  // The brand's own other-mode tokens.
  const otherMode = mode === 'light' ? 'dark' : 'light';
  const other = {};
  const O = OTHER[otherMode];
  const oc = (hints.other?.canvas && exists(hints.other.canvas) ? hints.other.canvas : null) || O.canvas.find((k) => exists(k) && (otherMode === 'dark' ? luminance(colors[k]) < 0.06 : luminance(colors[k]) > 0.6));
  if (oc) {
    other.canvas = oc;
    const ocC = over(colors[oc], { r: 1, g: 1, b: 1, a: 1 });
    const okText = (k) => exists(k) && contrast(over(colors[k], ocC), ocC) >= 4.5;
    other.ink = (hints.other?.ink && okText(hints.other.ink) ? hints.other.ink : null) || O.ink.find(okText);
    if (!other.ink) delete other.ink;
    for (const r of ['body', 'muted']) { const k = O[r].find((x) => exists(x) && contrast(over(colors[x], ocC), ocC) >= 3); if (k) other[r] = k; }
    const s = O.surface.find((k) => exists(k) && Math.abs(luminance(colors[k]) - luminance(ocC)) < 0.1);
    if (s) other.surface = s;
    const l = O.line.find((k) => exists(k));
    if (l) other.line = l;
  }

  // Token pairs: X-light ↔ X-dark, X-on-light ↔ X-on-dark.
  const pairs = {};
  const [from, to] = mode === 'light' ? ['light', 'dark'] : ['dark', 'light'];
  for (const k of Object.keys(colors)) {
    const re = new RegExp(`(^|-)${from}(-|$)`);
    if (!re.test(k)) continue;
    const twin = k.replace(re, `$1${to}$2`);
    if (exists(twin)) pairs[k] = twin;
  }
  if (mode === 'light' && exists('canvas') && !pairs.canvas && other.canvas) pairs.canvas = other.canvas;

  // Type roles.
  const typo = base.typography || {};
  const size = (k) => px(typo[k]?.fontSize) ?? 0;
  const tnames = Object.keys(typo);
  const type = {};
  const displays = tnames.filter((k) => /^(display|hero|headline|mega|h1\b|jumbo)/.test(k));
  const under = displays.filter((k) => size(k) <= 72).sort((a, b) => size(b) - size(a));
  type.display = under[0] || displays.sort((a, b) => size(a) - size(b))[0]
    || tnames.filter((k) => size(k) <= 72).sort((a, b) => size(b) - size(a))[0] || null;
  for (const [r, list] of Object.entries(TYPE)) type[r] = list.find((k) => typo[k]) || null;
  if (!type.eyebrow) type.eyebrow = tnames.find((k) => typo[k]?.textTransform === 'uppercase') || null;
  if (!type.mono) type.mono = tnames.find((k) => stackClass(typo[k]?.fontFamily) === 'mono') || null;
  if (!type.body) type.body = tnames.filter((k) => size(k) >= 14 && size(k) <= 18).sort((a, b) => Math.abs(size(a) - 16) - Math.abs(size(b) - 16))[0] || null;
  if (!type.heading) type.heading = tnames.filter((k) => size(k) >= 20 && size(k) <= 36 && k !== type.display).sort((a, b) => size(b) - size(a))[0] || null;
  if (!type.caption) type.caption = tnames.filter((k) => size(k) >= 11 && size(k) <= 14).sort((a, b) => size(a) - size(b)).pop() || null;
  if (!type.button) type.button = type.body;
  for (const r of Object.keys(type)) if (!type[r]) delete type[r];

  // Radius and space.
  const comps = base.components || {};
  const refOf = (v) => { const m = String(v ?? '').match(/^\{rounded\.([^}]+)\}$/); return m ? m[1] : null; };
  const firstRounded = (re) => { const k = Object.keys(comps).find((n) => re.test(n) && comps[n]?.rounded !== undefined); return k ? refOf(comps[k].rounded) || String(comps[k].rounded) : null; };
  const rk = Object.keys(base.rounded || {});
  const radius = {
    control: hints.radius?.control || firstRounded(/^button-primary/) || firstRounded(/^button/) || (rk.includes('md') ? 'md' : rk[0] || '8px'),
    card: hints.radius?.card || firstRounded(/^card/) || (rk.includes('lg') ? 'lg' : rk[rk.length - 1] || '12px'),
  };
  const sp = base.spacing || {};
  const spEntries = Object.entries(sp).map(([k, v]) => [k, px(v)]).filter(([, v]) => v !== null);
  const unit = spEntries.filter(([, v]) => v >= 8).sort((a, b) => a[1] - b[1])[0]?.[0] || '8px';
  const section = ['section', 'section-lg', 'huge', 'section-md', 'xxxl', '3xl'].find((k) => sp[k] !== undefined)
    || (sp.xxl !== undefined && px(sp.xxl) !== null ? `${px(sp.xxl) * 2}px` : '64px');
  const space = { unit, section };

  // Fonts: three slots, each with an open substitute.
  const fonts = {};
  const slotTokens = { display: [], text: [], mono: [] };
  for (const k of tnames) slotTokens[classifySlot(k, typo[k]?.fontFamily, stackClass)].push(k);
  const rep = { display: type.display || type.heading || slotTokens.display[0], text: type.body || slotTokens.text[0], mono: type.mono || slotTokens.mono[0] };
  const stackOf = (slot) => (rep[slot] ? typo[rep[slot]]?.fontFamily : null);
  fonts.text = substitute(stackOf('text'), null, fontNote, 'text');
  const ds = stackOf('display');
  fonts.display = !ds ? { ...fonts.text, why: 'no display face in the source — same as text' }
    : firstFamily(ds) === fonts.text.from ? { ...fonts.text } : substitute(ds, null, fontNote, 'display');
  const ms = stackOf('mono');
  fonts.mono = ms ? substitute(ms, 'mono', fontNote, 'mono') : { from: null, use: DEFAULT_FAMILY.mono, class: 'mono', why: 'no mono face in the source — default' };

  return { mode, roles, other, pairs, type, radius, space, fonts, notes };
}

const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const SLOT_WORDS = { display: /display|headline|heading|hero|title|wordmark/i, text: /\bui\b|body|text|paragraph|interface|running/i, mono: /mono|code/i };

/** Pick an open substitute for a source font stack. */
export function substitute(stack, forceClass, note, slot = 'text') {
  const from = firstFamily(stack);
  const cls = forceClass || stackClass(stack);
  if (!from) return { from: null, use: DEFAULT_FAMILY[cls], class: cls, why: 'no family named — default' };
  const known = lookupFont(from);
  if (known) return { from, use: known.family, class: known.class, why: 'already an open font' };

  const core = norm(from).replace(/(variable|var|vf)$/, '');
  const firstWord = norm(from.split(/[\s-]/)[0]);
  const sentences = String(note || '').split(/(?<=[.!?])\s+|\n+/);
  const byCore = (s) => core.length >= 4 && norm(s).includes(core);
  const byWord = (s) => firstWord.length >= 4 && norm(s).includes(firstWord);
  const curatedIn = (text, wantClass) => {
    const hits = [];
    const emph = [...String(text).matchAll(/\*\*([^*]+)\*\*|(?<!\*)\*([^*]+)\*(?!\*)|_([^_]+)_/g)].map((m) => m[1] || m[2] || m[3]);
    for (const e of emph) for (const part of e.split(/\s*[,/]|\s+or\s+|\s+and\s+/)) { const f = lookupFont(part); if (f) hits.push({ f, at: -1 }); }
    const n = String(text);
    for (const f of FONTS) { const i = n.search(new RegExp(`\\b${f.family.replace(/ /g, '\\s+')}\\b`)); if (i >= 0) hits.push({ f, at: i }); }
    const ok = hits.filter(({ f }) => !wantClass || f.class === wantClass);
    ok.sort((a, b) => a.at - b.at);
    return ok[0]?.f || null;
  };

  // The sentences about this exact family first, then about its family name, then about its job.
  // A note often names the family in one sentence and its substitute in the next.
  const around = (test) => sentences.flatMap((x, i) => (test(x) ? [x, sentences[i + 1] || ''] : []));
  const about = [around(byCore), around(byWord)].find((x) => x.length)?.join(' ') || '';
  let f = about && (curatedIn(about, cls) || curatedIn(about, null));
  let why = f && `named as the substitute for ${from} in the source`;
  if (!f) {
    const job = sentences.filter((x) => SLOT_WORDS[slot]?.test(x)).join(' ');
    f = job && curatedIn(job, cls);
    why = f && `named for ${slot === 'text' ? 'body' : slot === 'mono' ? 'code' : 'display'} text in the source’s font-substitute note`;
  }
  if (!f) { f = curatedIn(note, cls); why = f && 'named in the source’s font-substitute note'; }
  if (!f) {
    for (const p of String(stack).split(',').slice(1)) { const k = lookupFont(p); if (k) { f = k; why = `next open font in the source stack`; break; } }
  }
  if (!f) { f = lookupFont(DEFAULT_FAMILY[cls]); why = `${from} isn't an open font — default ${cls}`; }
  return { from, use: f.family, class: f.class, why };
}
