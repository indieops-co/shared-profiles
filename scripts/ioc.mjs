#!/usr/bin/env node
// ioc — IndieOps Shared Profiles helper.
//
// Optional. Everything this does could be done by hand; it exists so path
// resolution and slugging are consistent across every Skilllet instead of being
// reimplemented slightly differently in each one.
//
//   node ioc.mjs where                       print the resolved library path
//   node ioc.mjs init [--business "Name"]    create the library (and a business)
//   node ioc.mjs list                        every business, and when it was last touched
//   node ioc.mjs show <slug>                 print a business profile
//   node ioc.mjs add <name>                  add a business to an existing library
//   node ioc.mjs slug <name>                 what slug a name resolves to
//   node ioc.mjs theme <command>             brand themes (see: ioc theme --help)
//
// Zero dependencies. Node 18+.

import { readFile, writeFile, mkdir, readdir, stat, rename } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, '..', 'templates');

const HELP = `
ioc — IndieOps Shared Profiles

  where                        print the resolved library path
  init [--business "Name"]     create the library, optionally with a business
  list                         every business, and when each was last touched
  show <slug>                  print a business profile
  add <name>                   add a business to an existing library
  remove <slug>                move a business to businesses/_removed/ (nothing deleted)
  slug <name>                  show the slug a name resolves to
  theme <command>              a brand theme for you or a business (ioc theme --help)

The library path is the first of these that applies:
  1. $INDIEOPS_HOME
  2. a path inside a .indieops-home file in the working folder
  3. ~/.indieops

To keep the library in Dropbox, iCloud or a git repo, set INDIEOPS_HOME or write
the path into .indieops-home. The files diff well — a repo is a good home.
`;

/**
 * Resolve the library path. Same order everywhere; never reimplement this.
 *   1. $INDIEOPS_HOME
 *   2. the nearest .indieops-home file, searching upward from cwd
 *   3. ~/.indieops
 * Relative paths resolve against the file that declares them (or cwd, for the
 * env var). Never throws — a broken pointer falls through to the default.
 */
export function libraryPath(cwd = process.cwd(), env = process.env) {
  const expandHome = (s) => (s === '~' || s.startsWith('~/') ? homedir() + s.slice(1) : s);

  if (env.INDIEOPS_HOME && env.INDIEOPS_HOME.trim()) {
    return resolve(cwd, expandHome(env.INDIEOPS_HOME.trim()));
  }

  let dir = resolve(cwd);
  for (;;) {
    const pointer = join(dir, '.indieops-home');
    if (existsSync(pointer)) {
      let raw = '';
      try {
        raw = readFileSync(pointer, 'utf8').split('\n')[0].trim();
      } catch {
        // A directory, a permissions problem, a binary file. Ignore it and keep
        // looking — a broken pointer must never crash a Skilllet that imports this.
      }
      if (raw && !raw.startsWith('~') || (raw.startsWith('~/') || raw === '~')) {
        const expanded = expandHome(raw);
        if (expanded) return isAbsolute(expanded) ? expanded : resolve(dir, expanded);
      }
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return join(homedir(), '.indieops');
}

/**
 * "Acme Plumbing & Heating" -> "acme-plumbing-heating".
 *
 * The exact algorithm is part of the convention: two Skilllets that disagree
 * about a slug cannot read each other's data. Steps, in order:
 *   NFKD normalise -> strip combining marks -> lowercase ->
 *   every run of non [a-z0-9] becomes one "-" -> truncate to 60 -> trim "-"
 *
 * A name with no Latin letters or digits (\u6c34\u9053\u5c4b, \u0633\u0628\u0627\u0643) would slug to nothing, so
 * it falls back to "biz-" plus a short stable hash of the original. The real
 * name always lives in the profile's H1 either way.
 */
export function slugify(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('slugify() needs a non-empty string; got ' + JSON.stringify(name));
  }
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  if (slug) return slug;

  let h = 5381;
  for (const ch of name.trim()) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return 'biz-' + h.toString(36);
}

const say = (m) => console.log(m);
const die = (m, code = 1) => { console.error(`\n✗ ${m}\n`); process.exit(code); };
const today = () => new Date().toISOString().slice(0, 10);

async function template(name) {
  try {
    return await readFile(join(TEMPLATES, name), 'utf8');
  } catch {
    die(`Can't find templates/${name}. Run this from inside the shared-profiles folder.`);
  }
}

const README = `# IndieOps Shared Profiles

Shared memory for IndieOps Skilllets. Every Skilllet reads from here so you never type the same fact
twice.

- \`me.md\` — you. Name, voice, brand defaults, how you like things done.
- \`businesses/<slug>/profile.md\` — one per business, yours or a client's.
- \`businesses/<slug>/notes/<skill>.md\` — each Skilllet's own working notes.

Plain Markdown. Open it, edit it, back it up, put it in git. Nothing here needs a program to read it.

**No secrets in this folder.** API keys and passwords belong in environment variables — this is plain
text in a home directory and it will end up in a backup or a screen share eventually.

Created ${today()}.
`;

function readHeading(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

async function ensureBusiness(lib, name) {
  const clean = name.replace(/[\r\n]+/g, ' ').trim();
  if (!clean) die('That business name is empty.');
  if (clean.startsWith('--')) die(`"${clean}" looks like a flag, not a business name.`);

  const slug = slugify(clean);
  const dir = join(lib, 'businesses', slug);
  const profile = join(dir, 'profile.md');

  if (existsSync(profile)) {
    // Two different businesses can slug the same ("Smith & Co" / "Smith Co").
    // Merging them would put one client's phone number in another's record, so
    // refuse rather than quietly reuse the folder.
    const existing = readHeading(await readFile(profile, 'utf8'));
    if (existing && existing.toLowerCase() !== clean.toLowerCase()) {
      die(
        `businesses/${slug}/ already holds "${existing}", which is a different business.\n` +
        `  Both names produce the same folder name. Rename one to tell them apart —\n` +
        `  e.g. "${clean} (Riverside)" — then add it again.`,
      );
    }
    say(`  already there: businesses/${slug}/profile.md`);
    return slug;
  }

  await mkdir(join(dir, 'notes'), { recursive: true });
  // Function replacements: a name containing $&, $\` or $$ must land literally.
  const body = (await template('business-profile.md'))
    .replace('# [BUSINESS NAME]', () => `# ${clean}`)
    .replace('Last updated: [date] · Last touched by: [skill]', () => `Last updated: ${today()} · Last touched by: ioc`)
    .replace('- **Business name (real-world, as on the signage):**', () => `- **Business name (real-world, as on the signage):** ${clean}`);
  await writeFile(profile, body);
  say(`  created:       businesses/${slug}/profile.md`);
  return slug;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const lib = libraryPath();

  if (!cmd || cmd === '--help' || cmd === '-h') { say(HELP); return; }

  if (cmd === 'theme') {
    // Loaded only when asked for, so the rest of ioc stays as small as it always was.
    const { main: theme } = await import('./theme/cli.mjs');
    process.exitCode = await theme(rest, { lib, slugify });
    return;
  }

  if (cmd === 'where') {
    say(lib);
    say(existsSync(lib) ? '(exists)' : '(not created yet — run: ioc init)');
    return;
  }

  if (cmd === 'slug') {
    if (!rest.length) die('Usage: ioc slug "Business Name"');
    say(slugify(rest.join(' ')));
    return;
  }

  if (cmd === 'init') {
    const i = rest.indexOf('--business');
    const name = i !== -1 ? rest[i + 1] : null;
    if (i !== -1 && (!name || name.startsWith('--'))) die('--business needs a name.');

    const fresh = !existsSync(lib);
    await mkdir(join(lib, 'businesses'), { recursive: true });
    say(`\nLibrary: ${lib}${fresh ? '' : '  (already existed — nothing was overwritten)'}`);

    for (const [file, tpl] of [['README.md', null], ['me.md', 'me.md']]) {
      if (existsSync(join(lib, file))) { say(`  kept:          ${file}`); continue; }
      await writeFile(join(lib, file), tpl ? (await template(tpl)).replace('Last updated: [date]', `Last updated: ${today()}`) : README);
      say(`  created:       ${file}`);
    }
    if (name) await ensureBusiness(lib, name);

    say(`\nNext: fill in me.md — the voice section is the one that pays for itself.`);
    say(`Back it up, or point INDIEOPS_HOME at a folder you already sync.\n`);
    return;
  }

  if (cmd === 'add') {
    if (!rest.length) die('Usage: ioc add "Business Name"');
    if (!existsSync(lib)) die(`No library at ${lib}. Run: ioc init`);
    say('');
    await ensureBusiness(lib, rest.join(' '));
    say('');
    return;
  }

  if (cmd === 'list') {
    const dir = join(lib, 'businesses');
    if (!existsSync(dir)) die(`No library at ${lib}. Run: ioc init`);
    const entries = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.name.startsWith('_'));
    if (!entries.length) { say('\nNo businesses yet. Run: ioc add "Business Name"\n'); return; }

    const rows = [];
    for (const e of entries) {
      const profile = join(dir, e.name, 'profile.md');
      let skills = [];
      try {
        skills = (await readdir(join(dir, e.name, 'notes')))
          .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
          .map((f) => f.replace(/\.md$/, ''));
      } catch { /* no notes yet */ }

      if (!existsSync(profile)) {
        rows.push({ slug: e.name, when: 'no profile.md', order: -1, skills, theme: '—', broken: true });
        continue;
      }
      // Prefer the file's own "Last updated:" line. mtime is wrong after a git
      // clone or a sync restore, and both are recommended homes for this folder.
      const body = await readFile(profile, 'utf8');
      const stamped = body.match(/^Last updated:\s*(\d{4}-\d{2}-\d{2})/m);
      let when, order;
      if (stamped) {
        order = Date.parse(stamped[1] + 'T00:00:00Z');
        const n = Math.max(0, Math.floor((Date.now() - order) / 86400000));
        when = n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
      } else {
        const s = await stat(profile);
        order = s.mtime.getTime();
        const n = Math.max(0, Math.floor((Date.now() - order) / 86400000));
        when = (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`) + ' (file date)';
      }
      let theme = '—';
      try {
        const t = JSON.parse(await readFile(join(dir, e.name, 'brand', 'theme.json'), 'utf8'));
        theme = t.source?.displayName ? `${t.source.displayName}` : 'yes';
      } catch { /* no theme */ }
      rows.push({ slug: e.name, when, order, skills, theme, broken: false });
    }
    rows.sort((a, b) => b.order - a.order);

    const w = Math.max(8, ...rows.map((r) => r.slug.length));
    say(`\n${lib}\n`);
    const tw = Math.max(5, ...rows.map((r) => r.theme.length));
    say(`  ${'BUSINESS'.padEnd(w)}  LAST UPDATED     ${'THEME'.padEnd(tw)}  SKILLLETS USED`);
    for (const r of rows) say(`  ${r.slug.padEnd(w)}  ${r.when.padEnd(15)}  ${r.theme.padEnd(tw)}  ${r.skills.join(', ') || '—'}`);
    if (rows.some((r) => r.broken)) {
      say(`\n  ⚠ A business above has no profile.md. Run: ioc add "<its real name>" to create one,`);
      say(`    or delete the folder if it was a mistake.`);
    }
    say('');
    return;
  }

  if (cmd === 'show') {
    if (!rest.length) die('Usage: ioc show <slug>');
    const p = join(lib, 'businesses', slugify(rest.join(' ')), 'profile.md');
    if (!existsSync(p)) die(`No profile at ${p}. Run: ioc list`);
    say(await readFile(p, 'utf8'));
    return;
  }

  if (cmd === 'remove') {
    if (!rest.length) die('Usage: ioc remove <slug>   (moves it to businesses/_removed/, nothing is deleted)');
    const slug = slugify(rest.join(' '));
    const from = join(lib, 'businesses', slug);
    if (!existsSync(from)) die(`No business at ${from}. Run: ioc list`);
    const to = join(lib, 'businesses', '_removed', `${slug}-${today()}`);
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    say(`\n  moved: businesses/${slug}/ → businesses/_removed/${slug}-${today()}/`);
    say(`  Nothing was deleted. If this client's details shouldn't be kept, delete that folder.\n`);
    return;
  }

  die(`Unknown command "${cmd}". Run with --help.`, 2);
}

// Run main() only when this file IS the entry point. `endsWith('ioc.mjs')` would
// also fire for a sibling's wrapper called gbp-ioc.mjs, hijacking its process.
const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  main().catch((e) => die(process.env.IOC_DEBUG ? (e.stack || e.message) : e.message));
}
