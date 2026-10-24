// Shared Profiles tests. Zero dependencies (node:test). Node 18+.
//
//   node test/run.mjs                 everything offline, against test/fixtures
//   node test/run.mjs --live          also fetch every DESIGN.md upstream and sweep them
//   node test/run.mjs --live --ref <sha>
//
// Never touches a real library: every CLI test points INDIEOPS_HOME at a temp folder.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(HERE, 'fixtures', 'source');
const IOC = join(ROOT, 'scripts', 'ioc.mjs');
const T = join(ROOT, 'scripts', 'theme');

const { parseYaml, splitFrontMatter, YamlLiteError } = await import(join(T, 'yaml-lite.mjs'));
const { readDesignMd } = await import(join(T, 'design-md.mjs'));
const { automap } = await import(join(T, 'automap.mjs'));
const R = await import(join(T, 'resolve.mjs'));
const F = await import(join(T, 'fonts.mjs'));
const { inlineModules } = await import(join(T, 'build.mjs'));
const { parseReadme, matchCatalog } = await import(join(T, 'catalog.mjs'));
const { setThemePointer, themeLine } = await import(join(T, 'pointers.mjs'));
const { merge3, validateOverrides } = await import(join(T, 'cli.mjs'));

const fixture = (name) => readFileSync(join(SRC, 'design-md', name, 'DESIGN.md'), 'utf8');
function themeFrom(name, overrides = {}) {
  const d = readDesignMd(fixture(name), name);
  const auto = automap(d.base, { fontNote: d.fontNote, hints: d.hints });
  return { schema: R.THEME_SCHEMA, revision: 1, entity: { kind: 'business', slug: 'acme', name: 'Acme' }, source: { displayName: name }, base: { ...d.base, guidance: d.guidance }, auto, overrides };
}
const resolve = (t) => R.resolveTheme(t, F);
const P = R.parseColor;
const derivedOk = (res) => {
  const o = res.baseMode === 'light' ? res.dark : res.light;
  for (const r of ['ink', 'body', 'muted', 'accentText']) assert.ok(R.contrast(P(o[r]), P(o.canvas)) >= 4.5, `${r} ${o[r]} on ${o.canvas}`);
  assert.ok(Math.abs(R.toOklch(P(o.line)).L - R.toOklch(P(o.canvas)).L) >= 0.05, 'line visible on canvas');
};

describe('yaml-lite', () => {
  test('reads the Stripe front matter', () => {
    const { yaml } = splitFrontMatter(fixture('stripe'));
    const { data } = parseYaml(yaml, 'stripe');
    assert.equal(data.colors.primary, '#533afd');
    assert.equal(data.typography['display-xxl'].fontWeight, 300);
    assert.equal(data.typography['display-xxl'].lineHeight, 1.03);
    assert.equal(data.typography['display-xxl'].letterSpacing, '-1.4px');
    assert.equal(data.components['button-primary-pill'].backgroundColor, '{colors.primary}');
  });
  test('block scalars, comments, quotes, colons in plain text', () => {
    const { data } = parseYaml([
      'description: |', '  Line one.', '  Line two.', 'note: >-', '  folded', '  text', 'colors:', '  # a comment', '  a: "#fff" # trailing',
      "  b: 'it''s'", '  c: plain: with colon', '  n: 12', '  z: null',
    ].join('\n'));
    assert.equal(data.description, 'Line one.\nLine two.\n');
    assert.equal(data.note, 'folded text');
    assert.deepEqual(data.colors, { a: '#fff', b: "it's", c: 'plain: with colon', n: 12, z: null });
  });
  test('refuses what DESIGN.md never uses, naming the line', () => {
    assert.throws(() => parseYaml('a:\n  - x', 'f', 1), (e) => e instanceof YamlLiteError && /f:2: lists/.test(e.message));
    assert.throws(() => parseYaml('a:\n\tb: 1', 'f', 1), /tab/);
    assert.throws(() => parseYaml('a: [1, 2]', 'f', 1), /flow/);
  });
});

describe('design-md', () => {
  test('front-matter format', () => {
    const d = readDesignMd(fixture('stripe'));
    assert.equal(d.format, 'stitch-alpha');
    assert.ok(d.guidance.do.length >= 5 && d.guidance.dont.length >= 5);
    assert.match(d.guidance.do[0].id, /^do-[0-9a-f]{8}$/);
    assert.match(d.fontNote, /Inter/);
    assert.ok(d.guidance.overview.length > 50);
  });
  test('older prose-only format is extracted', () => {
    const d = readDesignMd(fixture('tesla'));
    assert.equal(d.format, 'legacy-prose');
    assert.equal(d.base.colors['electric-blue'], '#3E6AE1');
    assert.equal(d.hints.roles.accent, 'electric-blue');
    assert.equal(d.base.typography['hero-title'].fontSize, '40px');
    assert.ok(d.warnings.some((w) => /prose-only/.test(w)));
  });
  test('refuses something that is not a DESIGN.md', () => {
    assert.throws(() => readDesignMd('# My notes\n\nHello'), /not a DESIGN\.md/);
  });
});

describe('catalog', () => {
  test('README collection, and fuzzy matching', () => {
    const entries = parseReadme(readFileSync(join(SRC, 'README.md'), 'utf8'));
    assert.deepEqual(entries.map((e) => e.folder), ['claude', 'stripe', 'tesla']);
    assert.equal(entries[1].category, 'Fintech & Crypto');
    assert.equal(matchCatalog([...entries, { folder: 'linear.app', name: 'Linear' }], 'linear')[0].folder, 'linear.app');
    assert.equal(matchCatalog(entries, 'STRIPE')[0].folder, 'stripe');
  });
});

describe('automap', () => {
  test('Stripe roles and fonts', () => {
    const t = themeFrom('stripe');
    assert.deepEqual(
      { accent: t.auto.roles.accent, canvas: t.auto.roles.canvas, ink: t.auto.roles.ink, line: t.auto.roles.line },
      { accent: 'primary', canvas: 'canvas', ink: 'ink', line: 'hairline' },
    );
    assert.equal(t.auto.mode, 'light');
    assert.equal(t.auto.fonts.text.use, 'Inter');
    assert.equal(t.auto.fonts.text.from, 'sohne-var');
    assert.equal(t.auto.radius.control, 'pill');
  });
  test('Claude carries its own dark tokens', () => {
    const t = themeFrom('claude');
    assert.equal(t.auto.other.canvas, 'surface-dark');
    assert.equal(t.auto.other.ink, 'on-dark');
  });
});

describe('resolve', () => {
  test('a role colour writes through, and its family follows', () => {
    const res = resolve(themeFrom('stripe', { roles: { accent: '#0a7c66' } }));
    assert.equal(res.light.accent, '#0a7c66');
    assert.equal(res.tokens.light.colors.primary, '#0a7c66');
    assert.equal(res.tokens.light.colors['primary-deep'], '#116856');
    assert.equal(res.tokens.light.components['button-primary-pill'].backgroundColor, '#0a7c66');
  });
  test('a role can point at another token', () => {
    const res = resolve(themeFrom('stripe', { roles: { accent: 'ruby' } }));
    assert.equal(res.light.accent, '#ea2261');
    assert.equal(res.tokens.light.colors.primary, '#533afd');
  });
  test('roles that share a token split instead of dragging each other', () => {
    const t = { base: { colors: { primary: '#111111', canvas: '#ffffff' } }, auto: { mode: 'light', roles: { accent: 'primary', ink: 'primary', canvas: 'canvas' } }, overrides: { roles: { accent: '#0a7c66' } } };
    const res = resolve(t);
    assert.equal(res.light.accent, '#0a7c66');
    assert.equal(res.light.ink, '#111111');
    assert.equal(res.roleTokens.accent, 'role-accent');
  });
  test('an explicit token beats a role colour, with a warning', () => {
    const res = resolve(themeFrom('stripe', { roles: { accent: '#0a7c66' }, tokens: { colors: { primary: '#ff0000' } } }));
    assert.equal(res.light.accent, '#ff0000');
    assert.ok(res.checks.warnings.some((w) => /tokens\.colors\.primary is set/.test(w)));
  });
  test('references: nested, missing, loops', () => {
    const t = { base: { colors: { a: '#123456', b: '{colors.a}', c: '{colors.b}', loop1: '{colors.loop2}', loop2: '{colors.loop1}', gone: '{colors.nope}', canvas: '#ffffff', ink: '#000000' },
      components: { x: { backgroundColor: '{colors.c}', border: '1px solid {colors.a}', textColor: '{colors.nope}' } } },
      auto: { mode: 'light', roles: { canvas: 'canvas', ink: 'ink', accent: 'a' } }, overrides: {} };
    const res = resolve(t);
    assert.equal(res.tokens.light.colors.c, '#123456');
    assert.equal(res.tokens.light.components.x.backgroundColor, '#123456');
    assert.equal(res.tokens.light.components.x.border, '1px solid #123456');
    assert.equal(res.tokens.light.components.x.textColor, undefined);
    assert.equal(res.tokens.light.colors.loop1, undefined);
    assert.ok(res.checks.warnings.some((w) => /loop/.test(w)));
  });
  test('null in overrides.tokens removes a base token', () => {
    const res = resolve(themeFrom('stripe', { tokens: { colors: { ruby: null } } }));
    assert.equal(res.tokens.light.colors.ruby, undefined);
  });
  test('type and space scale; pills never scale', () => {
    const res = resolve(themeFrom('stripe', { scale: { type: 1.1, space: 1.5 } }));
    assert.equal(res.tokens.typography['body-md'].size, '16.5px');
    assert.equal(res.tokens.spacing.xl, '36px');
    assert.equal(res.tokens.rounded.pill, '9999px');
  });
  test('radius writes through to the token behind it', () => {
    const res = resolve(themeFrom('stripe', { radius: { control: '6px' } }));
    assert.equal(res.radius.control, '6px');
    assert.equal(res.tokens.light.components['button-primary-pill'].rounded, '6px');
  });
  test('derived modes are readable for every fixture', () => {
    for (const n of ['stripe', 'claude', 'tesla']) derivedOk(resolve(themeFrom(n)));
  });
  test('a black-and-white accent inverts in dark mode', () => {
    const res = resolve({ base: { colors: { primary: '#171717', canvas: '#ffffff', ink: '#171717' } }, auto: { mode: 'light', roles: { accent: 'primary', canvas: 'canvas', ink: 'ink' } }, overrides: {} });
    assert.ok(R.luminance(P(res.dark.accent)) > 0.6, res.dark.accent);
    assert.ok(R.contrast(P(res.dark.onAccent), P(res.dark.accent)) >= 4.5);
  });
  test('hostile values never reach CSS', () => {
    const res = resolve(themeFrom('stripe', {
      tokens: { colors: { evil: 'red;}body{background:url(//x)}' }, components: { 'button-primary-pill': { padding: '</style><script>alert(1)</script>', border: '1px solid red;}x{', backgroundColor: 'expression(alert(1))' } }, typography: { 'body-md': { fontFeature: '"ss01"; } body {', textTransform: 'url(x)' } } },
      fonts: { display: '"; } body { x' },
    }));
    // Warnings quote what was dropped (shown as text, never as CSS); everything else must be clean.
    assert.ok(res.checks.warnings.some((w) => /colors\.evil.*dropped/.test(w)));
    const out = JSON.stringify({ ...res, checks: null });
    for (const bad of ['url(//x)', '</style>', '<script', 'expression(', '} body {', 'url(x)']) assert.ok(!out.includes(bad), bad);
    assert.equal(res.fonts.display.family, 'Inter');
    assert.equal(res.tokens.light.components['button-primary-pill'].padding, undefined);
    assert.ok(!R.themeCss(res).includes('url('));
  });
  test('theme.css', () => {
    const res = resolve(themeFrom('stripe'));
    const css = R.themeCss(res);
    assert.match(css, /:root\{\n  color-scheme:light dark;\n  --brand-accent:#533afd;/);
    assert.match(css, /:root\[data-theme="dark"\]\{/);
    assert.match(css, /prefers-color-scheme:dark\)\{:root:not\(\[data-theme="light"\]\)/);
    const light = R.themeCss(res, { mode: 'light' });
    assert.ok(light.includes('color-scheme:light;') && !light.includes('data-theme'));
  });
});

describe('preview parity', () => {
  test('the preview runs the same resolver as the CLI', async () => {
    const { code } = await inlineModules();
    const { IOFonts, IOResolve } = new Function(`${code}\nreturn { IOFonts, IOResolve };`)();
    for (const n of ['stripe', 'claude', 'tesla']) {
      const t = themeFrom(n, { roles: { accent: '#0a7c66' }, fonts: { display: 'Fraunces' }, scale: { type: 1.1 } });
      assert.deepEqual(IOResolve.resolveTheme(t, IOFonts), resolve(t), n);
    }
  });
});

describe('pointers and merge', () => {
  test('Theme line goes in, and only it changes', () => {
    const md = readFileSync(join(ROOT, 'templates', 'business-profile.md'), 'utf8').replace('# [BUSINESS NAME]', '# Acme');
    const { md: once, changed } = setThemePointer(md, 'business', themeLine('Stripe'));
    assert.ok(changed);
    assert.match(once, /- \*\*Theme:\*\* brand\/theme\.json \(based on Stripe/);
    assert.ok(once.indexOf('## Brand') < once.indexOf('## Voice'));
    const { md: twice } = setThemePointer(once, 'business', themeLine('Claude'));
    assert.equal(twice.match(/\*\*Theme:\*\*/g).length, 1);
    assert.match(twice, /based on Claude/);
  });
  test('three-way merge of overrides', () => {
    const { merged, conflicts, unflatten } = merge3({ roles: { accent: '#111111' } }, { roles: { accent: '#222222', ink: '#000000' } }, { roles: { accent: '#333333' }, fonts: { display: 'Fraunces' } });
    assert.deepEqual(conflicts.map((c) => c.path), ['roles.accent']);
    assert.deepEqual(unflatten(merged), { roles: { ink: '#000000' }, fonts: { display: 'Fraunces' } });
  });
  test('override validation', () => {
    const t = themeFrom('stripe');
    assert.deepEqual(validateOverrides({ roles: { accent: 'ruby', ink: '#000' }, fonts: { display: 'Fraunces' }, scale: { type: 1.1 } }, t), []);
    assert.equal(validateOverrides({ roles: { accent: 'nope' }, scale: { type: 3 }, fonts: { body: 'Inter' }, wat: 1 }, t).length, 4);
  });
});

describe('cli', () => {
  const home = mkdtempSync(join(tmpdir(), 'ioc-test-'));
  const env = { ...process.env, INDIEOPS_HOME: home, IOC_THEME_SOURCE_DIR: SRC };
  const ioc = (args, input) => {
    const r = spawnSync(process.execPath, [IOC, ...args], { env, input, encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const theme = (dir) => JSON.parse(readFileSync(join(home, dir, 'brand', 'theme.json'), 'utf8'));
  const acme = 'businesses/acme-plumbing-heating';

  test('setup', () => {
    assert.equal(ioc(['init', '--business', 'Acme Plumbing & Heating']).code, 0);
    assert.equal(ioc(['add', 'Me']).code, 0);
  });
  test('asks whose brand when it can\u2019t tell', () => {
    const r = ioc(['theme', 'import', 'stripe']);
    assert.equal(r.code, 2);
    assert.match(r.out, /--business acme-plumbing-heating/);
  });
  test('import', () => {
    const r = ioc(['theme', 'import', 'stripe', '--business', 'Acme Plumbing & Heating']);
    assert.equal(r.code, 0, r.out);
    for (const f of ['theme.json', 'DESIGN.md', 'SOURCE-LICENSE.txt', 'theme.resolved.json', 'theme.css', 'preview.html', 'README.md']) assert.ok(existsSync(join(home, acme, 'brand', f)), f);
    const t = theme(acme);
    assert.equal(t.revision, 1);
    assert.equal(t.source.folder, 'stripe');
    assert.equal(t.source.displayName, 'Stripe');
    const profile = readFileSync(join(home, acme, 'profile.md'), 'utf8');
    assert.match(profile, /## Brand\n[\s\S]*- \*\*Theme:\*\* brand\/theme\.json \(based on Stripe/);
    assert.match(readFileSync(join(home, acme, 'brand', 'SOURCE-LICENSE.txt'), 'utf8'), /Copyright \(c\) \d{4} VoltAgent/);
    assert.match(readFileSync(join(home, acme, 'brand', 'preview.html'), 'utf8'), /data-revision="1"/);
  });
  test('set, with a backup and a new revision', () => {
    const r = ioc(['theme', 'set', '--business', 'acme-plumbing-heating', 'accent', '#0a7c66', 'fonts.display', 'Fraunces']);
    assert.equal(r.code, 0, r.out);
    assert.equal(theme(acme).revision, 2);
    assert.equal(JSON.parse(readFileSync(join(home, acme, 'brand', 'theme.prev.json'), 'utf8')).revision, 1);
    assert.equal(JSON.parse(readFileSync(join(home, acme, 'brand', 'theme.resolved.json'), 'utf8')).light.accent, '#0a7c66');
  });
  test('bad values are refused and nothing changes', () => {
    assert.equal(ioc(['theme', 'set', '--business', 'acme-plumbing-heating', 'accent', 'red;}']).code, 1);
    assert.equal(ioc(['theme', 'set', '--business', 'acme-plumbing-heating', 'nonsense.path', 'x']).code, 2);
    assert.equal(theme(acme).revision, 2);
  });
  test('switching needs --switch, and keeps the brand', () => {
    assert.equal(ioc(['theme', 'import', 'claude', '--business', 'acme-plumbing-heating']).code, 1);
    const r = ioc(['theme', 'import', 'claude', '--business', 'acme-plumbing-heating', '--switch']);
    assert.equal(r.code, 0, r.out);
    const t = theme(acme);
    assert.equal(t.source.folder, 'claude');
    assert.equal(t.overrides.roles.accent, '#0a7c66');
    assert.equal(t.overrides.fonts.display, 'Fraunces');
  });
  test('orphaned token overrides are reported after a switch', () => {
    assert.equal(ioc(['theme', 'set', '--business', 'acme-plumbing-heating', 'tokens.colors.surface-card', '#fafafa']).code, 0);
    const r = ioc(['theme', 'import', 'stripe', '--business', 'acme-plumbing-heating', '--switch']);
    assert.match(r.out, /no longer used by this design.*tokens\.colors\.surface-card/);
  });
  test('apply-edits: fast-forward, conflict, prefer, wrong entity', () => {
    const t = theme(acme);
    const doc = (over) => JSON.stringify({ schema: 'indieops-theme-edits/1', entity: { kind: 'business', slug: 'acme-plumbing-heating' }, fromRevision: t.revision, baseline: t.overrides, overrides: over });
    let r = ioc(['theme', 'apply-edits', '-', '--business', 'acme-plumbing-heating'], doc({ ...t.overrides, radius: { card: '16px' } }));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /fast-forward/);
    // The library moves on, then stale edits touch the same key.
    assert.equal(ioc(['theme', 'set', '--business', 'acme-plumbing-heating', 'accent', '#222222']).code, 0);
    const stale = doc({ ...t.overrides, roles: { accent: '#333333' } });
    r = ioc(['theme', 'apply-edits', '-', '--business', 'acme-plumbing-heating'], stale);
    assert.equal(r.code, 1);
    assert.match(r.out, /roles\.accent/);
    r = ioc(['theme', 'apply-edits', '-', '--business', 'acme-plumbing-heating', '--prefer', 'edits'], stale);
    assert.equal(r.code, 0, r.out);
    assert.equal(theme(acme).overrides.roles.accent, '#333333');
    assert.equal(theme(acme).overrides.radius.card, '16px');
    assert.equal(ioc(['theme', 'import', 'stripe', '--business', 'me']).code, 0);
    r = ioc(['theme', 'apply-edits', '-', '--business', 'me'], stale);
    assert.equal(r.code, 1);
    assert.match(r.out, /not --business me/);
  });
  test('--me and a business called "Me" are different', () => {
    assert.equal(ioc(['theme', 'import', 'tesla', '--me']).code, 0);
    assert.equal(theme('').source.folder, 'tesla');
    assert.equal(theme('businesses/me').source.folder, 'stripe');
    assert.match(readFileSync(join(home, 'me.md'), 'utf8'), /## Brand defaults[\s\S]*- \*\*Theme:\*\* brand\/theme\.json \(based on Tesla/);
  });
  test('an older prose-only design is flagged for review', () => {
    const r = ioc(['theme', 'check', '--me']);
    assert.match(r.out, /not reviewed yet/);
    assert.equal(theme('').source.reviewed, false);
  });
  test('--file works with no network', () => {
    const r = ioc(['theme', 'import', 'claude', '--me', '--switch', '--file', join(SRC, 'design-md', 'claude', 'DESIGN.md')]);
    assert.equal(r.code, 0, r.out);
    assert.equal(theme('').source.via, 'file');
  });
  test('a logo is copied in and embedded in the preview', () => {
    const r = ioc(['theme', 'set', '--me', 'assets.logo.light', join(HERE, 'fixtures', 'logo.svg')]);
    assert.equal(r.code, 0, r.out);
    assert.ok(existsSync(join(home, 'brand', 'logo-light.svg')));
    assert.match(readFileSync(join(home, 'brand', 'preview.html'), 'utf8'), /data:image\/svg\+xml;base64,/);
  });
  test('slug collisions are refused', () => {
    assert.equal(ioc(['add', 'Smith & Co']).code, 0);
    assert.equal(ioc(['theme', 'import', 'stripe', '--business', 'Smith Co']).code, 1);
  });
  test('show, check, build, list', () => {
    const css = ioc(['theme', 'show', '--business', 'acme-plumbing-heating', '--css', '--mode', 'light']);
    assert.match(css.out, /color-scheme:light;/);
    assert.equal(ioc(['theme', 'build', '--all']).code, 0);
    const c = ioc(['theme', 'check', '--all']);
    assert.equal(c.code, 0, c.out);
    const l = ioc(['list']);
    assert.match(l.out, /THEME\s+SKILLLETS USED/);
    assert.match(l.out, /acme-plumbing-heating\s+today\s+Stripe/);
  });
  test('cleanup', () => rmSync(home, { recursive: true, force: true }));
});

if (process.argv.includes('--live')) {
  describe('live: every DESIGN.md upstream', () => {
    test('parse, map and resolve all of them', { timeout: 300000 }, async () => {
      const { themeSource, loadCatalog } = await import(join(T, 'catalog.mjs'));
      const src = themeSource({});
      const i = process.argv.indexOf('--ref');
      const ref = i > -1 ? process.argv[i + 1] : await src.commit();
      const entries = await loadCatalog(src);
      assert.ok(entries.length >= 80, `only ${entries.length} designs listed`);
      const fails = [];
      let front = 0;
      for (const e of entries) {
        try {
          const text = await src.designMd(ref, e.folder);
          const d = readDesignMd(text, e.folder);
          if (d.format === 'stitch-alpha') front++;
          const res = resolve({ base: { ...d.base, guidance: d.guidance }, auto: automap(d.base, { fontNote: d.fontNote, hints: d.hints }), overrides: {} });
          derivedOk(res);
        } catch (err) { fails.push(`${e.folder}: ${err.message.split('\n')[0]}`); }
      }
      console.log(`  ${entries.length} designs at ${String(ref).slice(0, 7)}, ${front} with front matter`);
      assert.deepEqual(fails, []);
    });
  });
}
