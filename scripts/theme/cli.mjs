// ioc theme — brand themes for the user and each business.
//
// The only writer of brand/. Everything else (the live editor, other Skilllets)
// proposes a change; this validates it, keeps one step of history, bumps the
// revision and regenerates what other Skilllets read. One writer is what stops
// a shared folder drifting into five slightly different versions of a brand.

import { readFile, mkdir, copyFile, readdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, extname, resolve as resolvePath } from 'node:path';
import { homedir, platform } from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readDesignMd, sha256 } from './design-md.mjs';
import { automap } from './automap.mjs';
import * as F from './fonts.mjs';
import { THEME_SCHEMA, ROLES, FONT_SLOTS, prune, isColor, isLength, contrast, parseColor, themeCss } from './resolve.mjs';
import { themeSource, loadCatalog, matchCatalog, isFolderName, REPO, REPO_URL, NetworkError } from './catalog.mjs';
import { buildEntity, resolved, writeAtomic, readJson, LOGO_MAX, LOGO_TYPES } from './build.mjs';
import { setThemePointer, themeLine, freeText, readField } from './pointers.mjs';

export const VERSION = '1.1.0';
const GENERATOR = `shared-profiles ${VERSION}`;
const EDITS_SCHEMA = 'indieops-theme-edits/1';

// Node 18 prints a one-off warning the first time fetch is used. It isn't ours to show.
const emit = process.emitWarning;
process.emitWarning = function (w, ...a) { if (/fetch/i.test(String(w?.message || w))) return; return emit.call(process, w, ...a); };

export class Exit extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const usage = (m) => { throw new Exit(2, m); };
const refuse = (m) => { throw new Exit(1, m); };
const say = (m = '') => console.log(m);
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const today = () => now().slice(0, 10);
const has = (o, k) => o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);

export const HELP = `
ioc theme — a brand theme for you and for each business

  catalog [--search word] [--json]           the designs you can start from
  import <design> --me | --business <name>   start a brand from one of them
      [--switch] [--fresh] [--file DESIGN.md] [--ref <commit>] [--base-json <file|->] [--dry-run]
  set   --me | --business <name> <path> <value> [<path> <value> …]
  reset --me | --business <name> <path> | --all
  apply-edits [file | -] --me | --business <name> [--prefer edits|library] [--dry-run]
  build --me | --business <name> | --all [--open]
  show  --me | --business <name> [--resolved | --json | --css [--mode light|dark]]
  check --me | --business <name> | --all [--strict]

Paths for set
  accent onAccent canvas surface subtle ink body muted line   a colour (#hex) or one of the design's token names
  dark.<role>  light.<role>                                  pin one mode's colour
  fonts.display  fonts.text  fonts.mono                      a Google Fonts family
  radius.control  radius.card                                a length (8px) or a rounded token name
  scale.type (0.8–1.25)  scale.space (0.75–1.5)
  guidance.do+ "text"  guidance.dont+ "text"  guidance.hide+ <id>
  assets.logo.light|dark|mark <file>   assets.logo.alt "text"
  advanced: tokens.colors.<name>  tokens.rounded.<name>  tokens.spacing.<name>
            tokens.typography.<name>.<prop>  tokens.components.<name>.<prop>  tokens.modes.dark.colors.<name>
  Any value null resets it.

Designs come from ${REPO_URL} by VoltAgent (MIT).
Your brand is kept separately from the design you start from, so switching keeps it.
`;

// ───────────────────────── args ─────────────────────────

const VALUED = new Set(['business', 'file', 'ref', 'base-json', 'search', 'mode', 'prefer']);
export function parseArgs(argv) {
  const flags = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--') && a.length > 2) {
      const k = a.slice(2);
      if (VALUED.has(k)) {
        const v = argv[i + 1];
        if (v === undefined || (v.startsWith('--') && v.length > 2)) usage(`--${k} needs a value`);
        flags[k] = v; i++;
      } else flags[k] = true;
    } else pos.push(a);
  }
  return { flags, pos };
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

// ───────────────────────── entities ─────────────────────────

async function listEntities(lib) {
  const out = [];
  if (existsSync(join(lib, 'me.md'))) out.push({ kind: 'me' });
  const dir = join(lib, 'businesses');
  if (existsSync(dir)) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('_') && existsSync(join(dir, e.name, 'profile.md'))) out.push({ kind: 'business', slug: e.name });
    }
  }
  return out;
}

async function meEntity(lib) {
  const p = join(lib, 'me.md');
  if (!existsSync(p)) throw new Exit(2, `No me.md in ${lib}. Run: node scripts/ioc.mjs init`);
  const md = await readFile(p, 'utf8');
  const name = readField(md, 'Company / trading name') || readField(md, 'Name') || 'Me';
  return { kind: 'me', slug: null, name, root: lib, brand: join(lib, 'brand'), pointer: p, flag: '--me',
    facts: { tagline: readField(md, 'What I do'), place: readField(md, "Where I'm based"), phone: '' } };
}

async function businessEntity(lib, input, slugify) {
  const raw = String(input).trim();
  const slug = slugify(raw);
  const root = join(lib, 'businesses', slug);
  const p = join(root, 'profile.md');
  if (!existsSync(p)) throw new Exit(2, `No business "${raw}" (businesses/${slug}/). Run: node scripts/ioc.mjs add "${raw}"`);
  const md = await readFile(p, 'utf8');
  const heading = md.match(/^#\s+(.+)$/m)?.[1].trim() || slug;
  // Two names can slug the same ("Smith & Co" / "Smith Co"). Never theme the wrong client.
  if (raw !== slug && heading.toLowerCase() !== raw.toLowerCase()) refuse(`businesses/${slug}/ holds "${heading}", not "${raw}". If that's the one, use --business ${slug}.`);
  return { kind: 'business', slug, name: heading, root, brand: join(root, 'brand'), pointer: p, flag: `--business ${slug}`,
    facts: { tagline: readField(md, 'What it does'), place: readField(md, 'Areas served') || readField(md, 'Address'), phone: readField(md, 'Phone') } };
}

async function pickEntity(ctx, flags) {
  const { lib, slugify } = ctx;
  if (!existsSync(lib)) throw new Exit(2, `No library at ${lib}. Run: node scripts/ioc.mjs init`);
  if (flags.me && flags.business) usage('Use --me or --business, not both.');
  let ent;
  if (flags.me) ent = await meEntity(lib);
  else if (flags.business) ent = await businessEntity(lib, flags.business, slugify);
  else {
    const list = await listEntities(lib);
    if (!list.some((e) => e.kind === 'business') && list.some((e) => e.kind === 'me')) ent = await meEntity(lib);
    else throw new Exit(2, `Whose brand? Add one of:\n${list.map((e) => (e.kind === 'me' ? '  --me' : `  --business ${e.slug}`)).join('\n') || '  (nothing yet — run: ioc init)'}`);
  }
  ent.libHash = createHash('sha256').update(lib).digest('hex').slice(0, 10);
  return ent;
}

// ───────────────────────── theme file ─────────────────────────

const themePath = (ent) => join(ent.brand, 'theme.json');
async function loadTheme(ent, { required = true } = {}) {
  let t;
  try { t = await readJson(themePath(ent)); } catch (e) { refuse(`${themePath(ent)} isn't valid JSON (${e.message}). The previous version is theme.prev.json.`); }
  if (!t && required) throw new Exit(2, `${ent.name} has no theme yet. Start one: ioc theme import <design> ${ent.flag}   (see: ioc theme catalog)`);
  if (t && t.schema !== THEME_SCHEMA) refuse(`${themePath(ent)} is "${t.schema}", which this version doesn't read.`);
  return t;
}

/** Validate, back up, bump the revision, write, regenerate, update the Markdown pointer. */
async function commitTheme(ent, theme, by, { pointer = true } = {}) {
  theme.overrides = prune(theme.overrides || {});
  const errs = validateOverrides(theme.overrides, theme);
  if (errs.length) refuse(`Not saved — ${errs.length === 1 ? errs[0] : '\n  ' + errs.join('\n  ')}`);
  await mkdir(ent.brand, { recursive: true });
  if (existsSync(themePath(ent))) await copyFile(themePath(ent), join(ent.brand, 'theme.prev.json'));
  theme.revision = (theme.revision || 0) + 1;
  theme.updated = now();
  theme.updatedBy = by;
  theme.generator = GENERATOR;
  await writeAtomic(themePath(ent), JSON.stringify(theme, null, 2) + '\n');
  const built = await buildEntity(ent, theme);
  if (pointer) await updatePointer(ent, theme);
  return built;
}

async function updatePointer(ent, theme) {
  const md = await readFile(ent.pointer, 'utf8');
  const { md: next, changed } = setThemePointer(md, ent.kind, themeLine(theme.source?.displayName));
  if (changed) await writeAtomic(ent.pointer, next);
  return changed;
}

// ───────────────────────── validation ─────────────────────────

const TYPO_PROPS = new Set(['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'fontFeature', 'textTransform']);
const COMP_PROPS = new Set(['backgroundColor', 'textColor', 'borderColor', 'typography', 'rounded', 'padding', 'height', 'width', 'size', 'border', 'description']);

export function validateOverrides(ov, theme) {
  const errs = [];
  const base = theme.base || {};
  const isTokenName = (group, v) => typeof v === 'string' && has(base[group], v);
  for (const k of Object.keys(ov || {})) if (!['roles', 'fonts', 'radius', 'scale', 'tokens', 'guidance'].includes(k)) errs.push(`unknown setting "${k}"`);
  for (const [r, v] of Object.entries(ov.roles || {})) {
    if (r === 'light' || r === 'dark') {
      for (const [r2, v2] of Object.entries(v || {})) {
        if (!ROLES.includes(r2)) errs.push(`${r}.${r2}: not a role (${ROLES.join(', ')})`);
        else if (v2 !== null && !isColor(v2)) errs.push(`${r}.${r2}: "${v2}" is not a colour`);
      }
      continue;
    }
    if (!ROLES.includes(r)) errs.push(`"${r}" is not a role (${ROLES.join(', ')})`);
    else if (v !== null && !isColor(v) && !isTokenName('colors', v)) errs.push(`${r}: "${v}" is neither a colour nor one of this design's colour tokens`);
  }
  for (const [s, v] of Object.entries(ov.fonts || {})) {
    if (!FONT_SLOTS.includes(s)) errs.push(`fonts.${s}: slots are ${FONT_SLOTS.join(', ')}`);
    else if (v !== null && !F.lookupFont(v) && !F.isPlausibleFamily(v)) errs.push(`fonts.${s}: "${v}" isn't a font name`);
  }
  for (const [k, v] of Object.entries(ov.radius || {})) {
    if (!['control', 'card'].includes(k)) errs.push(`radius.${k}: use radius.control or radius.card`);
    else if (v !== null && !isLength(v) && !isTokenName('rounded', v)) errs.push(`radius.${k}: "${v}" is not a length`);
  }
  const ranges = { type: [0.8, 1.25], space: [0.75, 1.5] };
  for (const [k, v] of Object.entries(ov.scale || {})) {
    if (!ranges[k]) errs.push(`scale.${k}: use scale.type or scale.space`);
    else if (v !== null && !(typeof v === 'number' && v >= ranges[k][0] && v <= ranges[k][1])) errs.push(`scale.${k}: ${v} is outside ${ranges[k].join('–')}`);
  }
  for (const [k, v] of Object.entries(ov.guidance || {})) {
    if (!['do', 'dont', 'hide'].includes(k)) errs.push(`guidance.${k}: use do, dont or hide`);
    else if (!Array.isArray(v) || v.length > 60 || !v.every((x) => typeof x === 'string' && x.trim() && x.length <= 400)) errs.push(`guidance.${k}: a list of short pieces of text`);
  }
  const tok = ov.tokens || {};
  for (const [g, map] of Object.entries(tok)) {
    if (g === 'modes') {
      for (const [m, mv] of Object.entries(map || {})) {
        if (!['light', 'dark'].includes(m)) { errs.push(`tokens.modes.${m}: use light or dark`); continue; }
        for (const [k, v] of Object.entries(mv?.colors || {})) if (v !== null && !isColor(v)) errs.push(`tokens.modes.${m}.colors.${k}: "${v}" is not a colour`);
      }
      continue;
    }
    if (!['colors', 'rounded', 'spacing', 'typography', 'components'].includes(g)) { errs.push(`tokens.${g}: not a token group`); continue; }
    for (const [k, v] of Object.entries(map || {})) {
      if (v === null) continue;
      if (g === 'colors' && !isColor(v)) errs.push(`tokens.colors.${k}: "${v}" is not a colour`);
      if ((g === 'rounded' || g === 'spacing') && !isLength(v)) errs.push(`tokens.${g}.${k}: "${v}" is not a length`);
      if (g === 'typography' || g === 'components') {
        if (!isObj(v)) { errs.push(`tokens.${g}.${k}: expected properties`); continue; }
        for (const p of Object.keys(v)) if (!(g === 'typography' ? TYPO_PROPS : COMP_PROPS).has(p)) errs.push(`tokens.${g}.${k}.${p}: not a ${g === 'typography' ? 'type' : 'component'} property`);
      }
    }
  }
  return errs;
}

// ───────────────────────── import ─────────────────────────

const titleCase = (s) => String(s).replace(/\.(app|ai|com|io)$/, '').split(/[-_.\s]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

async function cmdImport(ctx, flags, pos) {
  const ent = await pickEntity(ctx, flags);
  const query = pos[0];
  if (!query && !flags.file) usage('Usage: ioc theme import <design> --me | --business <name>   (see: ioc theme catalog)');
  if (flags.ref && !/^[0-9a-f]{7,40}$/.test(flags.ref)) usage('--ref takes a commit SHA');
  const src = themeSource();
  let entry, text, commit = null, via, licenseText = null;

  if (flags.file) {
    const p = resolvePath(flags.file);
    if (!existsSync(p)) refuse(`No file at ${p}`);
    if ((await stat(p)).size > 512 * 1024) refuse(`${p} is larger than 512 KB — that isn't a DESIGN.md`);
    text = await readFile(p, 'utf8');
    const folder = query && isFolderName(query) ? query.toLowerCase() : 'local-file';
    entry = { folder, name: query ? titleCase(query) : null, category: null, blurb: '', page: null };
    via = 'file';
  } else {
    if (!isFolderName(query) && !/^[\w .-]{1,64}$/.test(query)) usage(`"${query}" isn't a design name`);
    let entries;
    try { entries = await loadCatalog(src); } catch (e) { netFail(e); }
    const hits = matchCatalog(entries, query);
    if (!hits.length) refuse(`No design called "${query}". See: ioc theme catalog --search ${query.split(/\s/)[0]}`);
    entry = hits.find((h) => h.folder.toLowerCase() === query.toLowerCase() || h.name.toLowerCase() === query.toLowerCase())
      || (hits.length === 1 ? hits[0] : null);
    if (!entry) refuse(`"${query}" matches ${hits.length} designs: ${hits.slice(0, 10).map((h) => h.folder).join(', ')}. Use the exact one.`);
    try {
      commit = flags.ref || await src.commit();
      text = await src.designMd(commit, entry.folder);
      licenseText = await src.license(commit);
    } catch (e) { netFail(e); }
    if (text == null) refuse(`design-md/${entry.folder}/DESIGN.md isn't in the collection${commit ? ` at ${commit.slice(0, 7)}` : ''}.`);
    via = process.env.IOC_THEME_SOURCE_DIR ? 'local-copy' : 'github';
  }

  let d;
  try { d = readDesignMd(text, `${entry.folder}/DESIGN.md`); } catch (e) { refuse(e.message); }
  if (!entry.name) entry.name = titleCase(d.title.replace(/[-_]?(inspired|design|analysis)[-_\w]*$/i, '') || 'Local design');

  let reviewed = d.format === 'stitch-alpha';
  if (flags['base-json']) {
    const raw = flags['base-json'] === '-' ? await readStdin() : await readFile(resolvePath(flags['base-json']), 'utf8');
    let b;
    try { b = JSON.parse(raw); } catch (e) { refuse(`--base-json isn't valid JSON: ${e.message}`); }
    if (!isObj(b) || !isObj(b.colors) || !Object.keys(b.colors).length) refuse('--base-json needs at least { "colors": { … } }');
    for (const g of ['colors', 'typography', 'rounded', 'spacing', 'components']) if (isObj(b[g])) d.base[g] = b[g];
    if (typeof b.description === 'string') d.base.description = b.description.slice(0, 2000);
    if (isObj(b.hints)) d.hints = b.hints;
    reviewed = true;
  }

  const existing = await loadTheme(ent, { required: false });
  if (existing?.source?.folder && existing.source.folder !== entry.folder && !flags.switch) {
    refuse(`${ent.name} already starts from ${existing.source.displayName}. To start from ${entry.name} instead and keep your own colours, fonts and logo, add --switch (add --fresh too to drop them).`);
  }
  const auto = automap(d.base, { fontNote: d.fontNote, hints: d.hints });
  let overrides = flags.fresh ? {} : JSON.parse(JSON.stringify(existing?.overrides || {}));

  // Overrides survive a switch. Report the ones that no longer point at anything.
  const orphans = [], dropped = [];
  for (const [r, v] of Object.entries(overrides.roles || {})) {
    if (r === 'light' || r === 'dark' || v === null || isColor(v)) continue;
    if (!has(d.base.colors, v)) { dropped.push(`${r} → "${v}" (no such token in ${entry.name}; back to the automatic choice)`); delete overrides.roles[r]; }
  }
  for (const g of ['colors', 'typography', 'rounded', 'spacing', 'components']) {
    for (const k of Object.keys(overrides.tokens?.[g] || {})) if (!has(d.base[g], k)) orphans.push(`tokens.${g}.${k}`);
  }
  for (const id of overrides.guidance?.hide || []) {
    if (![...(d.guidance.do || []), ...(d.guidance.dont || [])].some((b) => b.id === id)) orphans.push(`guidance.hide ${id}`);
  }

  const copyright = (licenseText || '').match(/^Copyright.*$/m)?.[0] || 'Copyright (c) 2026 VoltAgent';
  const theme = {
    schema: THEME_SCHEMA,
    revision: existing?.revision || 0,
    updated: null, updatedBy: null, generator: GENERATOR,
    entity: { kind: ent.kind, slug: ent.slug, name: ent.name },
    source: {
      repo: REPO, folder: entry.folder, displayName: entry.name, category: entry.category, blurb: entry.blurb,
      path: `design-md/${entry.folder}/DESIGN.md`, commit,
      url: via === 'file' ? null : commit ? `${REPO_URL}/blob/${commit}/design-md/${entry.folder}/DESIGN.md` : `${REPO_URL}/tree/main/design-md/${entry.folder}`,
      page: entry.page, license: 'MIT', copyright, fetched: today(), format: d.format, via,
      title: d.title, sha256: sha256(text), reviewed,
    },
    base: { ...d.base, guidance: d.guidance, fontNote: d.fontNote },
    auto,
    overrides,
    assets: existing?.assets || { logo: {} },
  };
  if (existing?.overrides && flags.fresh && Object.keys(existing.overrides).length) say(`  Your previous changes are kept in brand/theme.prev.json.`);

  if (flags['dry-run']) {
    const res = resolved({ ...theme, revision: theme.revision + 1 }, ent.brand);
    printSummary(ent, theme, res, { orphans, dropped, warnings: [...d.warnings, ...res.checks.warnings], dry: true });
    return;
  }
  await mkdir(ent.brand, { recursive: true });
  await writeAtomic(join(ent.brand, 'DESIGN.md'), text);
  await writeAtomic(join(ent.brand, 'SOURCE-LICENSE.txt'), sourceLicense(theme, licenseText));
  const { res, warnings } = await commitTheme(ent, theme, existing ? (flags.switch ? 'ioc theme import --switch' : 'ioc theme import (refresh)') : 'ioc theme import');
  printSummary(ent, theme, res, { orphans, dropped, warnings: [...d.warnings, ...warnings] });
  const ft = freeText(await readFile(ent.pointer, 'utf8'), ent.kind);
  if (ft.fonts || ft.colours) {
    say(`  Note: ${basename(ent.pointer)} also describes the brand in words — Fonts: "${ft.fonts || '—'}", Colours: "${ft.colours || '—'}".`);
    say(`  If those differ from the theme, ask which is right; nothing there was changed.`);
  }
}

function netFail(e) {
  if (e instanceof NetworkError) throw new Exit(3, `${e.message}\n  Offline or behind a proxy? Download the DESIGN.md from ${REPO_URL} and use --file <path>.`);
  throw e;
}

function sourceLicense(theme, licenseText) {
  const s = theme.source;
  const head = `brand/DESIGN.md is a copy of ${s.path} from ${REPO_URL}` +
    (s.commit ? ` at commit ${s.commit}` : '') + `, fetched ${s.fetched}.\n` +
    `It describes a design language "inspired by" a real brand. It is a starting point only:\n` +
    `nothing made with this theme should use that brand's name, logo or imagery.\n\n`;
  return head + (licenseText || `MIT License\n\n${s.copyright}\n\nThe full licence text is at ${REPO_URL}/blob/main/LICENSE\n`);
}

// ───────────────────────── set / reset ─────────────────────────

function parseValue(v) {
  if (v === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^[[{"]/.test(v)) { try { return JSON.parse(v); } catch { /* a plain string */ } }
  return v;
}

function applySet(theme, path, value, copies) {
  const ov = (theme.overrides ||= {});
  const put = (obj, key, v) => { if (v === null) delete obj[key]; else obj[key] = v; };
  let m;
  if (ROLES.includes(path)) return put((ov.roles ||= {}), path, value);
  if ((m = path.match(/^(light|dark)\.(\w+)$/))) {
    if (!ROLES.includes(m[2])) usage(`"${m[2]}" is not a role (${ROLES.join(', ')})`);
    return put(((ov.roles ||= {})[m[1]] ||= {}), m[2], value);
  }
  if ((m = path.match(/^fonts\.(display|text|mono)$/))) return put((ov.fonts ||= {}), m[1], value === null ? null : (F.lookupFont(value)?.family || String(value).trim()));
  if ((m = path.match(/^radius\.(control|card)$/))) return put((ov.radius ||= {}), m[1], typeof value === 'number' ? `${value}px` : value);
  if ((m = path.match(/^scale\.(type|space)$/))) return put((ov.scale ||= {}), m[1], value);
  if ((m = path.match(/^guidance\.(do|dont|hide)\+$/))) {
    if (typeof value !== 'string' || !value.trim()) usage(`${path} needs some text`);
    if (m[1] === 'hide') {
      const ids = [...(theme.base?.guidance?.do || []), ...(theme.base?.guidance?.dont || [])].map((b) => b.id);
      if (!ids.includes(value)) refuse(`No source guidance with id ${value}. ids: ioc theme show … --json`);
    }
    const list = ((ov.guidance ||= {})[m[1]] ||= []);
    if (!list.includes(value.trim())) list.push(value.trim());
    return;
  }
  if ((m = path.match(/^guidance\.(do|dont|hide)$/))) {
    if (value !== null) usage(`${path} only takes null; add items with ${path}+`);
    if (ov.guidance) delete ov.guidance[m[1]];
    return;
  }
  if ((m = path.match(/^assets\.logo\.(light|dark|mark)$/))) {
    const logo = ((theme.assets ||= {}).logo ||= {});
    if (value === null) { logo[m[1]] = null; return; }
    const from = resolvePath(String(value));
    const ext = extname(from).toLowerCase();
    if (!existsSync(from)) refuse(`No file at ${from}`);
    if (!LOGO_TYPES.includes(ext)) refuse(`A logo must be ${LOGO_TYPES.join(' / ')}`);
    copies.push({ from, to: `logo-${m[1]}${ext === '.jpeg' ? '.jpg' : ext}` });
    logo[m[1]] = `logo-${m[1]}${ext === '.jpeg' ? '.jpg' : ext}`;
    return;
  }
  if (path === 'assets.logo.alt') { ((theme.assets ||= {}).logo ||= {}).alt = value === null ? null : String(value).slice(0, 120); return; }
  if ((m = path.match(/^tokens\.(colors|rounded|spacing)\.([^.]{1,60})$/))) return put(((ov.tokens ||= {})[m[1]] ||= {}), m[2], typeof value === 'number' && m[1] !== 'colors' ? `${value}px` : value);
  if ((m = path.match(/^tokens\.(typography|components)\.([^.]{1,60})\.([A-Za-z]+)$/))) return put((((ov.tokens ||= {})[m[1]] ||= {})[m[2]] ||= {}), m[3], value);
  if ((m = path.match(/^tokens\.modes\.(light|dark)\.colors\.([^.]{1,60})$/))) return put(((((ov.tokens ||= {}).modes ||= {})[m[1]] ||= {}).colors ||= {}), m[2], value);
  usage(`Unknown path "${path}". Run: ioc theme --help`);
}

async function cmdSet(ctx, flags, pos, { reset = false } = {}) {
  const ent = await pickEntity(ctx, flags);
  const theme = await loadTheme(ent);
  const copies = [];
  if (reset) {
    if (flags.all) theme.overrides = {};
    else { if (!pos.length) usage('Usage: ioc theme reset --me | --business <name> <path> | --all'); for (const p of pos) applySet(theme, p, null, copies); }
  } else {
    if (!pos.length || pos.length % 2) usage('Usage: ioc theme set --me | --business <name> <path> <value> [<path> <value> …]');
    for (let i = 0; i < pos.length; i += 2) applySet(theme, pos[i], parseValue(pos[i + 1]), copies);
  }
  for (const c of copies) {
    if ((await stat(c.from)).size > LOGO_MAX) refuse(`${c.from} is over 1 MB — use a smaller export of the logo`);
  }
  await mkdir(ent.brand, { recursive: true });
  for (const c of copies) await copyFile(c.from, join(ent.brand, c.to));
  const { res, warnings } = await commitTheme(ent, theme, reset ? 'ioc theme reset' : 'ioc theme set');
  say(`\n  ${ent.name}: saved (revision ${theme.revision}).`);
  printRoles(res);
  printWarnings(warnings);
  say(`  Open ${join(ent.brand, 'preview.html')} to see it.\n`);
}

// ───────────────────────── apply-edits ─────────────────────────

function flatten(o, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const p = prefix ? `${prefix}\u0000${k}` : k;
    if (isObj(v)) flatten(v, p, out); else out[p] = JSON.stringify(v);
  }
  return out;
}
function unflatten(flat) {
  const out = {};
  for (const [p, v] of Object.entries(flat)) {
    const keys = p.split('\u0000');
    let o = out;
    for (const k of keys.slice(0, -1)) o = (o[k] ||= {});
    o[keys[keys.length - 1]] = JSON.parse(v);
  }
  return out;
}

/** Key-level three-way merge of overrides. */
export function merge3(base, ours, theirs) {
  const B = flatten(base), O = flatten(ours), T = flatten(theirs);
  const out = {}, conflicts = [];
  for (const p of new Set([...Object.keys(B), ...Object.keys(O), ...Object.keys(T)])) {
    const b = B[p], o = O[p], t = T[p];
    if (o === t) { if (o !== undefined) out[p] = o; continue; }
    if (t === b) { if (o !== undefined) out[p] = o; continue; }
    if (o === b) { if (t !== undefined) out[p] = t; continue; }
    conflicts.push({ path: p.split('\u0000').join('.'), library: o === undefined ? '(unset)' : JSON.parse(o), edits: t === undefined ? '(unset)' : JSON.parse(t), key: p });
  }
  return { merged: out, conflicts, unflatten };
}

async function findEdits(ent, arg) {
  if (arg === '-') return { text: await readStdin(), from: 'stdin' };
  if (arg) { const p = resolvePath(arg); if (!existsSync(p)) refuse(`No file at ${p}`); return { text: await readFile(p, 'utf8'), from: p }; }
  const inBrand = join(ent.brand, 'theme-edits.json');
  if (existsSync(inBrand)) return { text: await readFile(inBrand, 'utf8'), from: inBrand, consume: inBrand };
  const dl = join(homedir(), 'Downloads');
  const want = `${ent.kind === 'me' ? 'me' : ent.slug}.theme-edits`;
  if (existsSync(dl)) {
    const files = (await readdir(dl)).filter((f) => f.startsWith(want) && f.endsWith('.json'));
    const dated = await Promise.all(files.map(async (f) => ({ f, t: (await stat(join(dl, f))).mtimeMs })));
    dated.sort((a, b) => b.t - a.t);
    if (dated[0]) { const p = join(dl, dated[0].f); return { text: await readFile(p, 'utf8'), from: p }; }
  }
  refuse(`No edits found. In the preview press "Copy edits" and paste them here, or pass the downloaded file:\n  ioc theme apply-edits ~/Downloads/${want}.json ${ent.flag}`);
}

async function cmdApplyEdits(ctx, flags, pos) {
  const ent = await pickEntity(ctx, flags);
  const theme = await loadTheme(ent);
  const { text, from, consume } = await findEdits(ent, pos[0]);
  let edits;
  try { edits = JSON.parse(text); } catch (e) { refuse(`Those edits aren't valid JSON (${e.message}). Copy them again from the preview.`); }
  if (edits?.schema !== EDITS_SCHEMA) refuse(`That isn't an edits file from the preview (schema "${edits?.schema}").`);
  const ek = edits.entity || {};
  if (ek.kind !== ent.kind || (ent.kind === 'business' && ek.slug !== ent.slug)) {
    refuse(`Those edits are for ${ek.kind === 'me' ? 'you (--me)' : `--business ${ek.slug}`}, not ${ent.flag}. Nothing changed.`);
  }
  if (!isObj(edits.overrides)) refuse('The edits have no overrides in them.');
  const current = theme.overrides || {};
  let next, how;
  const same = JSON.stringify(flatten(prune(current))) === JSON.stringify(flatten(prune(edits.baseline || {})));
  if (edits.fromRevision === theme.revision || same) { next = edits.overrides; how = 'fast-forward'; }
  else {
    const { merged, conflicts, unflatten: un } = merge3(edits.baseline || {}, current, edits.overrides);
    if (conflicts.length && !flags.prefer) {
      say(`\n  The library changed since the preview was opened (revision ${edits.fromRevision} → ${theme.revision}), and these changed in both:`);
      for (const c of conflicts) say(`    ${c.path.padEnd(28)} library: ${JSON.stringify(c.library)}   edits: ${JSON.stringify(c.edits)}`);
      refuse(`Nothing applied. Re-run with --prefer edits or --prefer library, or ask which to keep.`);
    }
    for (const c of conflicts) {
      const pick = flags.prefer === 'edits' ? c.edits : c.library;
      if (pick === '(unset)') delete merged[c.key]; else merged[c.key] = JSON.stringify(pick);
    }
    next = un(merged);
    how = `merged with library changes${conflicts.length ? ` (${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}, kept the ${flags.prefer})` : ''}`;
  }
  const before = flatten(prune(current)), after = flatten(prune(next));
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k] !== after[k]).map((k) => k.split('\u0000').join('.'));
  if (!changed.length) { say(`\n  Nothing to apply — the library already matches those edits.\n`); return; }
  if (flags['dry-run']) { say(`\n  Would apply (${how}): ${changed.join(', ')}\n`); return; }
  theme.overrides = next;
  const { res, warnings } = await commitTheme(ent, theme, 'ioc theme apply-edits');
  if (consume) await rm(consume, { force: true });
  say(`\n  ${ent.name}: applied ${changed.length} change${changed.length > 1 ? 's' : ''} from ${from === 'stdin' ? 'the pasted edits' : from} (${how}). Revision ${theme.revision}.`);
  say(`  Changed: ${changed.join(', ')}`);
  printRoles(res);
  printWarnings(warnings);
  say(`  Reload ${join(ent.brand, 'preview.html')} to keep editing from here.\n`);
}

// ───────────────────────── build / show / check ─────────────────────────

async function themedEntities(ctx) {
  const out = [];
  for (const e of await listEntities(ctx.lib)) {
    const ent = e.kind === 'me' ? await meEntity(ctx.lib) : await businessEntity(ctx.lib, e.slug, ctx.slugify);
    ent.libHash = createHash('sha256').update(ctx.lib).digest('hex').slice(0, 10);
    if (existsSync(themePath(ent))) out.push(ent);
  }
  return out;
}

function openFile(p) {
  const cmd = platform() === 'darwin' ? ['open', [p]] : platform() === 'win32' ? ['cmd', ['/c', 'start', '', p]] : ['xdg-open', [p]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref(); } catch { say(`  Open it yourself: ${p}`); }
}

async function cmdBuild(ctx, flags) {
  const list = flags.all ? await themedEntities(ctx) : [await pickEntity(ctx, flags)];
  if (!list.length) { say('\n  No themes yet. Start one: ioc theme import <design> --me\n'); return; }
  for (const ent of list) {
    const theme = await loadTheme(ent);
    const { warnings } = await buildEntity(ent, theme);
    await updatePointer(ent, theme);
    say(`  built: ${join(ent.brand, 'preview.html')}  (revision ${theme.revision})`);
    printWarnings(warnings, '    ');
    if (flags.open) openFile(join(ent.brand, 'preview.html'));
  }
}

async function cmdShow(ctx, flags) {
  const ent = await pickEntity(ctx, flags);
  const theme = await loadTheme(ent);
  if (flags.json) { say(JSON.stringify(theme, null, 2)); return; }
  const res = resolved(theme, ent.brand);
  if (flags.resolved) { say(JSON.stringify(res, null, 2)); return; }
  if (flags.css) {
    if (flags.mode && !['light', 'dark'].includes(flags.mode)) usage('--mode is light or dark');
    process.stdout.write(themeCss(res, { mode: flags.mode }));
    return;
  }
  printSummary(ent, theme, res, { warnings: res.checks.warnings, show: true });
}

async function cmdCheck(ctx, flags) {
  const list = flags.all ? await themedEntities(ctx) : [await pickEntity(ctx, flags)];
  let errors = 0, warns = 0;
  for (const ent of list) {
    const E = [], W = [];
    let theme;
    try { theme = await loadTheme(ent); } catch (e) { E.push(e.message); }
    if (theme) {
      E.push(...validateOverrides(theme.overrides || {}, theme));
      const res = resolved(theme, ent.brand);
      W.push(...res.checks.warnings);
      for (const r of ['ink', 'body', 'muted', 'accentText']) {
        const derived = res.baseMode === 'light' ? 'dark' : 'light';
        const c = contrast(parseColor(res[derived][r]), parseColor(res[derived].canvas));
        if (c < 4.5) E.push(`${derived}.${r} is ${c.toFixed(2)}:1 on canvas`);
      }
      for (const s of FONT_SLOTS) if (!res.fonts[s].curated) W.push(`fonts.${s}: "${res.fonts[s].family}" isn't in the curated list — it loads only if Google Fonts has it`);
      for (const k of ['light', 'dark', 'mark']) {
        const f = theme.assets?.logo?.[k];
        if (!f) continue;
        const p = join(ent.brand, f);
        if (!existsSync(p)) E.push(`logo.${k}: ${f} is missing from brand/`);
        else if ((await stat(p)).size > LOGO_MAX) E.push(`logo.${k}: ${f} is over 1 MB`);
      }
      const dm = join(ent.brand, 'DESIGN.md');
      if (!existsSync(dm)) W.push('DESIGN.md is missing (the copy of the source design)');
      else if (theme.source?.sha256 && sha256(await readFile(dm, 'utf8')) !== theme.source.sha256) W.push('DESIGN.md was edited after import — the theme still uses the imported tokens');
      const rj = await readJson(join(ent.brand, 'theme.resolved.json')).catch(() => null);
      if (!rj || rj.revision !== theme.revision) E.push(`theme.resolved.json is stale (${rj ? `revision ${rj.revision}` : 'missing'}, theme is ${theme.revision}) — run: ioc theme build ${ent.flag}`);
      const pv = existsSync(join(ent.brand, 'preview.html')) ? await readFile(join(ent.brand, 'preview.html'), 'utf8') : '';
      if (!pv.includes(`data-revision="${theme.revision}"`)) W.push(`preview.html is stale — run: ioc theme build ${ent.flag}`);
      if (!/^- \*\*Theme:\*\*/m.test(await readFile(ent.pointer, 'utf8'))) W.push(`${basename(ent.pointer)} has no Theme line — run: ioc theme build ${ent.flag}`);
      if (theme.source?.reviewed === false) W.push('imported from an older prose-only DESIGN.md and not reviewed yet (see THEMES.md)');
    }
    errors += E.length; warns += W.length;
    say(`\n  ${ent.name} (${ent.flag})  ${E.length ? `✗ ${E.length} problem${E.length > 1 ? 's' : ''}` : '✓ ok'}${W.length ? `, ${W.length} note${W.length > 1 ? 's' : ''}` : ''}`);
    for (const e of E) say(`    ✗ ${e}`);
    for (const w of W) say(`    · ${w}`);
  }
  say('');
  if (errors || (flags.strict && warns)) throw new Exit(1, `${errors} problem${errors === 1 ? '' : 's'}${flags.strict && warns ? `, ${warns} note${warns === 1 ? '' : 's'} (--strict)` : ''}`);
}

async function cmdCatalog(flags) {
  let entries;
  try { entries = await loadCatalog(themeSource()); } catch (e) { netFail(e); }
  const q = typeof flags.search === 'string' ? flags.search.toLowerCase() : null;
  if (q) entries = entries.filter((e) => [e.folder, e.name, e.category, e.blurb].join(' ').toLowerCase().includes(q));
  if (flags.json) { say(JSON.stringify({ repo: REPO_URL, entries }, null, 2)); return; }
  say(`\n  Designs to start from — ${REPO_URL} (MIT)\n`);
  const byCat = new Map();
  for (const e of entries) { if (!byCat.has(e.category)) byCat.set(e.category, []); byCat.get(e.category).push(e); }
  for (const [cat, list] of byCat) {
    say(`  ${cat}`);
    for (const e of list) say(`    ${e.folder.padEnd(16)} ${e.name.padEnd(14)} ${e.blurb.slice(0, 90)}`);
    say('');
  }
  say(`  ${entries.length} design${entries.length === 1 ? '' : 's'}. Preview any of them at https://getdesign.md/<folder>/design-md`);
  say(`  Start one: ioc theme import <folder> --me   or   --business "<name>"\n`);
}

// ───────────────────────── output ─────────────────────────

function printRoles(res, indent = '  ') {
  const rows = ['accent', 'onAccent', 'canvas', 'surface', 'subtle', 'ink', 'body', 'muted', 'line'];
  const cr = (mode, r) => (['ink', 'body', 'muted'].includes(r) ? `${contrast(parseColor(res[mode][r]), parseColor(res[mode].canvas)).toFixed(1)}:1` : r === 'onAccent' ? `${contrast(parseColor(res[mode].onAccent), parseColor(res[mode].accent)).toFixed(1)}:1` : '');
  say(`${indent}${'ROLE'.padEnd(10)}${'TOKEN'.padEnd(22)}${'LIGHT'.padEnd(18)}DARK`);
  for (const r of rows) {
    say(`${indent}${r.padEnd(10)}${String(res.roleTokens?.[r] || '—').slice(0, 20).padEnd(22)}${`${res.light[r]} ${cr('light', r)}`.padEnd(18)}${res.dark[r]} ${cr('dark', r)}`);
  }
}

function printWarnings(list, indent = '  ') {
  const uniq = [...new Set(list)];
  if (!uniq.length) return;
  say(`${indent}Notes:`);
  for (const w of uniq.slice(0, 12)) say(`${indent}  · ${w}`);
  if (uniq.length > 12) say(`${indent}  · …and ${uniq.length - 12} more (ioc theme check)`);
}

function printSummary(ent, theme, res, { orphans = [], dropped = [], warnings = [], dry = false, show = false } = {}) {
  const s = theme.source;
  say('');
  say(`  ${dry ? 'Would import' : show ? 'Theme for' : 'Imported'} ${show ? `${ent.name} — based on ${s.displayName}` : `${s.displayName} for ${ent.name}`}${ent.kind === 'me' ? ' (you)' : ''}`);
  say(`  from ${s.via === 'file' ? 'a local file' : `${REPO_URL}${s.commit ? ` @ ${s.commit.slice(0, 7)}` : ''}`} · ${s.license} · ${s.format}${s.reviewed ? '' : ' · needs review'}${show ? ` · revision ${theme.revision}` : ''}`);
  say(`  base mode: ${res.baseMode} (the other is derived)`);
  say('');
  printRoles(res);
  say('');
  for (const slot of FONT_SLOTS) {
    const a = theme.auto.fonts?.[slot] || {};
    const f = res.fonts[slot];
    const mine = theme.overrides?.fonts?.[slot];
    say(`  font ${slot.padEnd(8)} ${f.family.padEnd(20)} ${mine ? '(your choice)' : a.from && a.from !== f.family ? `for ${a.from} — ${a.why}` : a.why || ''}`);
  }
  say(`  radius   control ${res.radius.control} · card ${res.radius.card}     space unit ${res.space.unit} · section ${res.space.section}`);
  const n = Object.keys(flatten(theme.overrides || {})).length;
  if (n) say(`  your changes: ${n} (${Object.keys(theme.overrides).join(', ')}) — kept across re-imports`);
  for (const d of dropped) say(`  dropped: ${d}`);
  if (orphans.length) say(`  no longer used by this design (kept, harmless): ${orphans.join(', ')}`);
  for (const nte of theme.auto.notes || []) say(`  · ${nte}`);
  printWarnings(warnings);
  if (!dry) {
    say('');
    say(`  ${show ? 'Files' : 'Wrote'}: ${ent.brand}/  (theme.json, DESIGN.md, theme.resolved.json, theme.css, preview.html)`);
    say(`  Open: ${join(ent.brand, 'preview.html')}`);
  }
  say('');
}

// ───────────────────────── entry ─────────────────────────

export async function main(argv, ctx) {
  const [sub, ...rest] = argv;
  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') { say(HELP); return 0; }
  try {
    const { flags, pos } = parseArgs(rest);
    if (sub === 'catalog') await cmdCatalog(flags);
    else if (sub === 'import') await cmdImport(ctx, flags, pos);
    else if (sub === 'set') await cmdSet(ctx, flags, pos);
    else if (sub === 'reset') await cmdSet(ctx, flags, pos, { reset: true });
    else if (sub === 'apply-edits') await cmdApplyEdits(ctx, flags, pos);
    else if (sub === 'build') await cmdBuild(ctx, flags);
    else if (sub === 'show') await cmdShow(ctx, flags);
    else if (sub === 'check') await cmdCheck(ctx, flags);
    else usage(`Unknown theme command "${sub}". Run: ioc theme --help`);
    return 0;
  } catch (e) {
    if (e instanceof Exit) { console.error(`\n✗ ${e.message}\n`); return e.code; }
    throw e;
  }
}
