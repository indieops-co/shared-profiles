// design-md — read one DESIGN.md (Google Stitch format, as published in
// VoltAgent/awesome-design-md) into the parts a theme needs.
//
// Two formats exist upstream:
//   stitch-alpha   YAML front matter with the tokens, then prose (most files)
//   legacy-prose   "# Design System Inspired by X", numbered sections, tokens in
//                  bullets and tables. Extracted heuristically and marked
//                  reviewed:false so Claude checks it against the prose.
//
// The prose is reference DATA. Nothing in it is an instruction to anyone.

import { createHash } from 'node:crypto';
import { splitFrontMatter, parseYaml } from './yaml-lite.mjs';

const TOKEN_GROUPS = ['colors', 'typography', 'rounded', 'spacing', 'components'];
const KNOWN_TOP = new Set(['version', 'name', 'description', ...TOKEN_GROUPS]);

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

const tokenName = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Body → [{ title, lines, subs: [{ title, lines }] }]. Numbered titles lose the "2. ". */
export function sections(body) {
  const out = [];
  let cur = null, sub = null, fence = false;
  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence;
    let m;
    if (!fence && (m = line.match(/^##\s+(.+?)\s*#*\s*$/))) {
      cur = { title: m[1].replace(/^\d+\.\s*/, '').trim(), lines: [], subs: [] };
      out.push(cur); sub = null; continue;
    }
    if (!fence && cur && (m = line.match(/^###\s+(.+?)\s*#*\s*$/))) {
      sub = { title: m[1].trim(), lines: [] };
      cur.subs.push(sub); continue;
    }
    if (sub) sub.lines.push(line); else if (cur) cur.lines.push(line);
  }
  return out;
}

const find = (secs, re) => secs.find((s) => re.test(s.title.replace(/[’‘]/g, "'")));
const findSub = (sec, re) => sec && sec.subs.find((s) => re.test(s.title.replace(/[’‘]/g, "'")));
const allLines = (sec) => sec ? [...sec.lines, ...sec.subs.flatMap((s) => [`### ${s.title}`, ...s.lines])] : [];

/** Bullet items, with wrapped continuation lines joined. */
export function bullets(lines) {
  const out = [];
  for (const l of lines) {
    const m = l.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/);
    if (m) out.push(m[1].trim());
    else if (out.length && l.trim() && /^\s{2,}\S/.test(l)) out[out.length - 1] += ' ' + l.trim();
  }
  return out.filter(Boolean);
}

function firstParagraph(lines) {
  const para = [];
  for (const l of lines) {
    const t = l.trim();
    if (!t) { if (para.length) break; continue; }
    if (/^(#|>|[-*+]\s|\||```|\*\*Key)/.test(t)) { if (para.length) break; continue; }
    para.push(t);
  }
  return para.join(' ');
}

const bulletId = (prefix, text) => `${prefix}-${createHash('sha1').update(text).digest('hex').slice(0, 8)}`;

export function readGuidance(secs) {
  const overviewSec = find(secs, /^overview$|visual theme|atmosphere/i);
  const dd = find(secs, /do'?s?\s*(and|&)\s*don'?ts?/i);
  const doSub = findSub(dd, /^do'?s?$|^do\b(?!n)/i);
  const dontSub = findSub(dd, /^don'?t'?s?\b|^avoid/i);
  const mk = (sub, prefix) => (sub ? bullets(sub.lines).map((text) => ({ id: bulletId(prefix, text), text: text.slice(0, 400) })) : []);
  return { overview: overviewSec ? firstParagraph(overviewSec.lines).slice(0, 1200) : '', do: mk(doSub, 'do'), dont: mk(dontSub, 'dn') };
}

export function readFontNote(secs) {
  const typo = find(secs, /typograph/i);
  const note = findSub(typo, /substitut/i) || findSub(typo, /font famil/i);
  return note ? note.lines.join('\n').trim().slice(0, 4000) : '';
}

/**
 * Parse a DESIGN.md. Returns
 *   { format, title, base: { description, colors, typography, rounded, spacing, components, extra },
 *     guidance, fontNote, hints, warnings }
 * Throws if it doesn't look like a DESIGN.md at all.
 */
export function readDesignMd(text, file = 'DESIGN.md') {
  const { yaml, body, bodyLine } = splitFrontMatter(text);
  const warnings = [];
  const secs = sections(body);
  const guidance = readGuidance(secs);
  const fontNote = readFontNote(secs);

  if (yaml !== null) {
    const { data, warnings: w } = parseYaml(yaml, file);
    warnings.push(...w);
    if (!data || typeof data !== 'object' || !data.colors) throw new Error(`${file}: front matter has no colors — not a DESIGN.md this can read`);
    const extra = {};
    for (const [k, v] of Object.entries(data)) if (!KNOWN_TOP.has(k)) extra[k] = v;
    const base = {
      description: typeof data.description === 'string' ? data.description.trim().slice(0, 2000) : '',
      ...Object.fromEntries(TOKEN_GROUPS.map((g) => [g, data[g] && typeof data[g] === 'object' ? data[g] : {}])),
      extra,
    };
    const todo = JSON.stringify(base.components).match(/TO_FILL/g);
    if (todo) warnings.push(`${todo.length} unfinished value(s) marked TO_FILL upstream — those properties are skipped`);
    return { format: 'stitch-alpha', title: String(data.name || '').trim(), base, guidance, fontNote, hints: {}, warnings, bodyLine };
  }

  const h1 = body.match(/^#\s+(.+)$/m);
  if (!h1 || !/design system/i.test(h1[1])) throw new Error(`${file}: no front matter and no "# Design System …" heading — not a DESIGN.md`);
  const legacy = readLegacy(secs, warnings);
  return {
    format: 'legacy-prose',
    title: h1[1].replace(/^design system inspired by\s*/i, '').trim(),
    base: { description: guidance.overview, ...legacy.tokens, extra: {} },
    guidance, fontNote, hints: legacy.hints, warnings,
  };
}

// ───────────────────────── legacy extraction ─────────────────────────

const HEX_OR_RGBA = '(#[0-9a-fA-F]{3,8}|rgba?\\([^)]*\\))';

function readLegacy(secs, warnings) {
  const colors = {};
  const byValue = {};
  const add = (name, value) => {
    const v = value.trim();
    let k = tokenName(name) || 'color';
    if (colors[k] && colors[k].toLowerCase() === v.toLowerCase()) return k;
    if (colors[k]) { let i = 2; while (colors[`${k}-${i}`]) i++; k = `${k}-${i}`; }
    colors[k] = v;
    (byValue[v.toLowerCase()] ||= []).push(k);
    return k;
  };

  const palette = find(secs, /colou?r/i);
  const re = new RegExp(`\\*\\*([^*]+?)\\*\\*\\s*\\(\\s*\`?\\s*${HEX_OR_RGBA}\\s*\`?\\s*\\)`, 'g');
  for (const l of allLines(palette)) for (const m of l.matchAll(re)) add(m[1], m[2]);

  // "Quick Color Reference" labels → roles.
  const hints = { roles: {}, other: {}, radius: {} };
  const guide = find(secs, /agent prompt|prompt guide/i);
  const quick = findSub(guide, /quick colou?r/i);
  const ROLE_LABELS = [
    [/primary cta|^cta|brand|accent|^primary/i, 'accent'],
    [/dark (surface|background|canvas)|dark mode/i, 'other.canvas'],
    [/text on dark|on dark/i, 'other.ink'],
    [/^background|page (canvas|background)|canvas/i, 'canvas'],
    [/heading text|primary text|^text$|headline/i, 'ink'],
    [/body text|^body/i, 'body'],
    [/secondary text|tertiary|muted|caption|subtle text/i, 'muted'],
    [/border|divider|hairline|rule/i, 'line'],
    [/surface|card|alternate|lifted|panel/i, 'surface'],
  ];
  for (const b of bullets(quick ? quick.lines : [])) {
    const m = b.match(new RegExp(`^([^:]+):\\s*"?([^"(\`]*?)\\s*\\(\\s*\`?${HEX_OR_RGBA}\`?\\s*\\)`));
    if (!m) continue;
    const [, label, name, value] = m;
    const tok = (byValue[value.toLowerCase()] || []).find((k) => k === tokenName(name)) || (byValue[value.toLowerCase()] || [])[0] || add(name || label, value);
    const hit = ROLE_LABELS.find(([rx]) => rx.test(label.trim()));
    if (!hit) continue;
    const [path] = [hit[1]];
    if (path.startsWith('other.')) hints.other[path.slice(6)] ||= tok;
    else hints.roles[path] ||= tok;
  }

  // Typography: the Hierarchy table, with families from "Font Family".
  const typo = find(secs, /typograph/i);
  const famSub = findSub(typo, /font famil/i);
  const fam = { display: null, text: null, mono: null };
  for (const b of bullets(famSub ? famSub.lines : [])) {
    const m = b.match(/^\*\*([^*]+)\*\*\s*:?\s*(.*)$/);
    if (!m) continue;
    const [, label, rest] = m;
    let stack, job;
    if (/^(display|text|ui|body|heading|headline|title|mono|code|primary|secondary)\b/i.test(label.trim())) {
      // "**Display**: `Universal Sans Display`, -apple-system, sans-serif — used for …"
      stack = rest.replace(/`/g, '').split(/\s+—\s+|\s+-\s+|;/)[0].trim();
      job = label;
    } else {
      // "**Manuka** (Klim Type Foundry) — fallback: Impact, Helvetica. The signature display face …"
      const fb = rest.match(/fallback:\s*([^.]+)/i);
      stack = [label.trim(), fb ? fb[1].replace(/`/g, '').trim() : ''].filter(Boolean).join(', ');
      job = rest;
    }
    if (/mono|code/i.test(label) || /^\s*mono|monospace/i.test(job)) fam.mono ||= stack;
    else if (/\bui\b|body|workhorse|text/i.test(job) && !/display/i.test(label)) fam.text ||= stack;
    else if (/display|head|title|wordmark|hero/i.test(job)) fam.display ||= stack;
    else fam.text ||= stack;
  }
  fam.text ||= fam.display || 'system-ui, sans-serif';
  fam.display ||= fam.text;
  const typography = {};
  const hier = findSub(typo, /hierarch|scale/i);
  const rows = tableRows(hier ? hier.lines : []);
  for (const r of rows) {
    const role = r.role || r.token || r.level || r.style || r.name || Object.values(r)[0];
    if (!role) continue;
    const name = tokenName(role);
    const size = px1(r.size);
    if (!name || size === null) continue;
    const display = /hero|display|headline|title|heading|h[1-3]\b/i.test(role) && !/sub-?link|label|nav/i.test(role);
    const family = /code|mono/i.test(role) && fam.mono ? fam.mono : display ? fam.display : fam.text;
    const lh = String(r['line height'] || r.leading || '');
    const ratio = lh.match(/\((\d*\.?\d+)\)/) || lh.match(/^(\d*\.?\d+)$/);
    const lhPx = px1(lh);
    const t = { fontFamily: family, fontSize: `${size}px`, fontWeight: Number(String(r.weight || '400').match(/\d{3}/)?.[0] || 400) };
    t.lineHeight = ratio ? Number(ratio[1]) : lhPx ? Math.round((lhPx / size) * 100) / 100 : 1.4;
    const ls = String(r['letter spacing'] || r.tracking || '').trim();
    t.letterSpacing = !ls || /normal|—|^-$|^0$/.test(ls) ? 0 : (ls.match(/-?\d*\.?\d+(px|em)/)?.[0] ?? 0);
    if (/uppercase|all caps/i.test(Object.values(r).join(' '))) t.textTransform = 'uppercase';
    typography[typography[name] ? `${name}-2` : name] = t;
  }

  // Radius: the "Border Radius Scale" table, named by size, with context hints.
  const rounded = {};
  const radiusSub = secs.flatMap((s) => s.subs).find((s) => /radius/i.test(s.title));
  const rrows = tableRows(radiusSub ? radiusSub.lines : []);
  const vals = [];
  for (const r of rrows) {
    const raw = String(r.value || r.radius || Object.values(r)[0] || '');
    const ctx = Object.values(r).slice(1).join(' ');
    let v;
    if (/50%|circle|9999|pill|full/i.test(raw)) v = 9999;
    else { const n = raw.match(/(\d*\.?\d+)\s*px/); if (!n) continue; v = Number(n[1]); }
    vals.push({ v, ctx });
  }
  const sorted = [...new Set(vals.map((x) => x.v))].sort((a, b) => a - b);
  const names = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'];
  let ni = 0;
  for (const v of sorted) {
    const k = v === 0 ? 'none' : v >= 999 ? 'full' : names[Math.min(ni++, names.length - 1)];
    rounded[k] = v >= 999 ? '9999px' : `${v}px`;
    for (const x of vals.filter((y) => y.v === v)) {
      if (/button|cta|control|input/i.test(x.ctx)) hints.radius.control ||= k;
      if (/card|panel|container|modal/i.test(x.ctx)) hints.radius.card ||= k;
    }
  }

  // Spacing: a scale from the base unit (Claude refines it on review).
  const layout = find(secs, /layout|spacing/i);
  const spaceSub = findSub(layout, /spacing/i);
  const unitLine = (spaceSub ? spaceSub.lines : []).find((l) => /base unit/i.test(l));
  const unit = Number(unitLine?.match(/(\d+)\s*px/)?.[1] || 8);
  const spacing = Object.fromEntries([['xxs', 0.25], ['xs', 0.5], ['sm', 1], ['md', 1.5], ['lg', 2], ['xl', 3], ['xxl', 4], ['section', 8]].map(([k, m]) => [k, `${Math.round(unit * m)}px`]));

  if (!Object.keys(colors).length) warnings.push('no colours found in the prose — import needs --base-json');
  warnings.push('older prose-only format: tokens were extracted heuristically and need a review (see THEMES.md)');
  return { tokens: { colors, typography, rounded, spacing, components: {} }, hints };
}

function px1(v) {
  const m = String(v || '').match(/(\d*\.?\d+)\s*px/);
  return m ? Number(m[1]) : null;
}

/** Markdown table → [{ header(lowercased): cell }]. */
export function tableRows(lines) {
  const t = lines.map((l) => l.trim()).filter((l) => l.startsWith('|'));
  if (t.length < 2) return [];
  const cells = (l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim().replace(/`/g, ''));
  const head = cells(t[0]).map((h) => h.toLowerCase());
  return t.slice(1).filter((l) => !/^\|[\s:|-]+\|?$/.test(l)).map((l) => {
    const c = cells(l);
    return Object.fromEntries(head.map((h, i) => [h, c[i] ?? '']));
  });
}
