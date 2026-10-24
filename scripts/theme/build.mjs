// build — theme.json → the generated files beside it:
//   theme.resolved.json   what other Skilllets read
//   theme.css             the same roles as --brand-* variables
//   preview.html          the live editor (one self-contained file)
//   README.md             what's in the folder
// Never touches theme.json.

import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as F from './fonts.mjs';
import { resolveTheme, themeCss } from './resolve.mjs';
import { REPO_URL } from './catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, '..', '..', 'templates', 'theme-preview.html');
export const LOGO_MAX = 1024 * 1024;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
export const LOGO_TYPES = Object.keys(MIME);

export async function writeAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, path);
}

/** fonts.mjs / resolve.mjs as isolated namespaces, for inlining into the preview. */
export async function inlineModules() {
  const asObject = (src, name) => {
    const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    const body = src.replace(/^import .*$/gm, '').replace(/^export\s+/gm, '');
    return `const ${name} = (() => {\n${body}\nreturn { ${names.join(', ')} };\n})();`;
  };
  const fonts = await readFile(join(HERE, 'fonts.mjs'), 'utf8');
  const resolve = await readFile(join(HERE, 'resolve.mjs'), 'utf8');
  const code = `${asObject(fonts, 'IOFonts')}\n${asObject(resolve, 'IOResolve')}`;
  if (/<\/script/i.test(code)) throw new Error('resolver source contains </script — cannot inline it');
  return { code, sha: createHash('sha256').update(code).digest('hex') };
}

const jsonForScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function logoData(brandDir, rel, warn) {
  if (!rel) return null;
  const p = join(brandDir, rel);
  const ext = extname(p).toLowerCase();
  if (!MIME[ext] || rel.includes('..') || rel.includes('/')) { warn(`logo ${rel}: not a png/jpg/webp/svg in brand/ — skipped`); return null; }
  try {
    const s = await stat(p);
    if (s.size > LOGO_MAX) { warn(`logo ${rel} is over 1 MB — skipped in the preview`); return null; }
    if (s.size > 300 * 1024) warn(`logo ${rel} is ${Math.round(s.size / 1024)} KB — a smaller file keeps the preview quick`);
    return `data:${MIME[ext]};base64,${(await readFile(p)).toString('base64')}`;
  } catch { warn(`logo ${rel} is missing from brand/`); return null; }
}

export function resolved(theme, brandDir) {
  const res = resolveTheme(theme, F);
  for (const k of ['light', 'dark', 'mark']) {
    if (res.logo[k]) res.logo[`${k}Path`] = join(brandDir, res.logo[k]);
  }
  return res;
}

/**
 * ent: { kind, slug, name, brand (dir), facts: { tagline, place, phone } , libHash }
 * Returns { res, warnings, files }.
 */
export async function buildEntity(ent, theme) {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const res = resolved(theme, ent.brand);
  const files = [];

  await writeAtomic(join(ent.brand, 'theme.resolved.json'), JSON.stringify(res, null, 2) + '\n');
  files.push('theme.resolved.json');
  await writeAtomic(join(ent.brand, 'theme.css'), themeCss(res));
  files.push('theme.css');

  const logos = {};
  for (const k of ['light', 'dark', 'mark']) logos[k] = await logoData(ent.brand, theme.assets?.logo?.[k], warn);
  const { code, sha } = await inlineModules();
  const tpl = await readFile(TEMPLATE, 'utf8');
  const facts = {
    kind: ent.kind, slug: ent.slug, name: ent.name, tagline: ent.facts?.tagline || '', place: ent.facts?.place || '',
    phone: ent.facts?.phone || '', libHash: ent.libHash || '', brandPath: ent.brand, repoUrl: REPO_URL,
  };
  const html = tpl
    .replaceAll('__IO_TITLE__', esc(`${ent.name || 'Brand'} — brand theme`))
    .replace('__IO_THEME_JSON__', () => jsonForScript(theme))
    .replace('__IO_FACTS_JSON__', () => jsonForScript(facts))
    .replace('__IO_LOGOS_JSON__', () => jsonForScript(logos))
    .replace('/*__IO_RESOLVER__*/', () => code)
    .replaceAll('__IO_RESOLVER_SHA__', sha)
    .replaceAll('__IO_REVISION__', String(theme.revision ?? 0));
  await writeAtomic(join(ent.brand, 'preview.html'), html);
  files.push('preview.html');

  await writeAtomic(join(ent.brand, 'README.md'), brandReadme(ent, theme));
  files.push('README.md');
  return { res, warnings: [...warnings, ...res.checks.warnings], files };
}

function brandReadme(ent, theme) {
  const src = theme.source || {};
  const based = src.displayName ? `**${src.displayName}**` : 'a design';
  const flag = ent.kind === 'me' ? '--me' : `--business ${ent.slug}`;
  return `# Brand theme — ${ent.name}

Generated by IndieOps Shared Profiles. Change it with \`ioc theme …\` or the live editor in
\`preview.html\`, not by editing these files.

| File | What it is |
|---|---|
| \`theme.json\` | The source of truth: the design it started from (\`base\`), how that maps onto brand roles (\`auto\`), and your brand on top (\`overrides\`) |
| \`DESIGN.md\` | A verbatim copy of the design it started from |
| \`SOURCE-LICENSE.txt\` | That design's licence (MIT). It travels with the copy |
| \`theme.resolved.json\` | Generated. What other Skilllets read |
| \`theme.css\` | Generated. The same roles as \`--brand-*\` CSS variables |
| \`preview.html\` | Generated. Open it to see the brand on real layouts and change it |
| \`theme.prev.json\` | The previous \`theme.json\`, one step back |

The generated files are safe to delete. \`node <shared-profiles>/scripts/ioc.mjs theme build ${flag}\`
puts them back.

Started from ${based} in [awesome-design-md](${REPO_URL}) by VoltAgent (MIT). That design language
is only a starting point: everything made with this theme shows ${ent.name}'s own name and logo,
never the source brand's.
`;
}

export async function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8'));
}
