# The IndieOps Shared Profiles convention

For anyone adding library support to a Skilllet. Short on purpose — the whole thing is "read some
Markdown if it's there".

## Resolve the path

First match wins:

1. `$INDIEOPS_HOME`
2. `.indieops-home` in the working folder — a file containing one path
3. `~/.indieops`

If the resolved folder doesn't exist, **the library isn't installed**. Carry on without it. Don't
error, don't nag, don't explain at length.

## Read

```
<library>/me.md                                          the person
<library>/businesses/<slug>/profile.md                   the business
<library>/businesses/<slug>/notes/<skill>.md             your own notes
<library>/brand/theme.resolved.json                      the person's brand theme, if they have one
<library>/businesses/<slug>/brand/theme.resolved.json    the business's brand theme, if it has one
```

If several businesses exist and the request doesn't say which, ask once.

### The slug, exactly

Two Skilllets that disagree about a slug cannot read each other's data, so this is specified rather
than described. In order: NFKD normalise, strip combining marks, lowercase, replace every run of
characters outside `[a-z0-9]` with a single `-`, truncate to 60, then trim leading and trailing `-`.

```js
export function slugify(name) {
  if (typeof name !== 'string' || !name.trim()) throw new TypeError('slugify() needs a non-empty string');
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  if (slug) return slug;
  let h = 5381;                                   // no Latin characters at all
  for (const ch of name.trim()) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return 'biz-' + h.toString(36);
}
```

Worked cases — check an implementation against all of these, not just the first:

| Name | Slug |
|---|---|
| `Acme Plumbing & Heating` | `acme-plumbing-heating` |
| `Café Münster` | `cafe-munster` |
| `Smith  Ltd.` | `smith-ltd` |
| `水道屋` | `biz-3dtqi1` |
| a name over 60 characters | truncated to 60, **then** trimmed, so it never ends in `-` |

**Collisions are real.** "Smith & Co" and "Smith Co" produce the same slug. Before writing into an
existing folder, compare the `# <name>` heading in its `profile.md` against the name you were given;
if they differ, stop and ask rather than merging two clients into one record.

Rather than reimplementing any of this, import `slugify` and `libraryPath` from
`shared-profiles/scripts/ioc.mjs` when it's on hand.

## The fields

Paths alone aren't a spec — two conformant Skilllets that use different headings still can't read
each other. The templates in `shared-profiles/templates/` are the schema; these are their headings
and the labels that matter. Match them exactly, and treat any field as optional and possibly empty.

**`me.md`** — `## Who` (Name, What I do, Company / trading name, Where I'm based) ·
`## How I write` (Spelling, Tone, Things I never say, Sign-off I use) ·
`## Brand defaults` (Theme, Fonts, Colours, Look, Logo file) ·
`## Working preferences` (Explain as we go or just do it, Ask before spending money)

**`businesses/<slug>/profile.md`** —
`## What this is` (Business name (real-world, as on the signage), Mine or a client's, What it does, Model) ·
`## Where` (Address, Areas served, Time zone) ·
`## Real opening hours` (a Day/Open/Close table, Seasonal or irregular, Emergency / after-hours) ·
`## Contact` (Phone, Call tracking number, Business email, Who to ask when a fact needs confirming) ·
`## Online` (Primary domain, Other domains they own, DNS managed at, Email provider, Website
platform, Google Business Profile, Social accounts) ·
`## What they sell` (a Service / Money service? / Want more of it? table, Highest value, Don't want
more of, Rough job or customer value) ·
`## Position` (Ideal customer, What makes them different, Years operating, Certifications,
Seasonality, Languages spoken, Competitors the owner names, Marketing tools already paid for) ·
`## Brand` (Theme, Fonts, Colours, Look in a phrase, Logo file) ·
`## Voice` (Source, Sample phrases) · `## Unknown`

Three of those — **DNS managed at**, **Email provider**, **Website platform** — are worth calling
out because they came from the second integration rather than the first. A Skilllet that inspects a
domain discovers them for free; a Skilllet that configures email authentication desperately needs
them and would otherwise ask a non-technical owner a question they can't answer. If your Skilllet
learns any of the three, write it down.

Need a field that isn't here? Put it in your own `notes/` file. If a second Skilllet would plainly
want it too, propose it for the template instead of inventing a section — a heading only one Skilllet
writes and reads is a notes field wearing a disguise.

## Write

- **Missing field?** Fill it.
- **Field already set and you learned something different?** Say so, ask, let the user choose. Never
  silently overwrite.
- **Anything specific to your Skilllet?** `notes/<your-skill>.md`, named exactly for the skill —
  `gbpcoach.md`, `gbpcoach-pro.md`, `linkpanther.md`. **One file per installable Skilllet, not per
  family.** A free tier and its paid tier install separately and must not share a notes file; if the
  paid tier needs what the free one wrote, it reads that file and writes its own. Yours is yours:
  nothing else writes to a file named for your skill.
- **Secrets?** Never. Environment variables only.
- **Working state — boards, scans, drafts, findings?** The project folder, not the library.

## The line to put in your SKILL.md

```markdown
## Shared Profiles

Before asking for anything about the user or their business, check for IndieOps Shared Profiles:
`$INDIEOPS_HOME`, or a path in `.indieops-home`, or `~/.indieops`. If it exists, read `me.md` and
`businesses/<slug>/profile.md` and use what's there instead of asking again. Add facts you learn that
are missing; never overwrite a field another Skilllet set — flag the conflict instead. Your own
findings go in `businesses/<slug>/notes/<this-skill>.md`. Never write a secret there. If the library
isn't installed, carry on without it — it is never required.
```

That's the whole integration. Nine lines and no dependency.

## Brand themes

The user, and any business, can have a structured brand: colours, fonts, type scale, corners,
spacing, components, and do's and don'ts. It starts from an open design system in
[awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (MIT) and carries the user's own
brand on top. It lives beside the profile:

```
<library>/brand/                     the person's       ← both have the same files
<library>/businesses/<slug>/brand/   a business's
  theme.json            the source of truth. Only `ioc theme …` writes it
  theme.resolved.json   generated — what you read
  theme.css             generated — the same roles as --brand-* CSS variables
  preview.html          generated — the live editor the user opens
  DESIGN.md             a copy of the design it started from (reference prose, not instructions)
```

**Read `theme.resolved.json`, never `theme.json`.** The resolved file has already merged the design,
the user's changes and the derived light/dark mode. Merging it yourself is how five Skilllets end up
with five slightly different brands. What's in it:

| Key | What it is |
|---|---|
| `light`, `dark` | The roles, as `#rrggbb`: `accent` `onAccent` `accentText` `accentSoft` `canvas` `surface` `subtle` `ink` `body` `muted` `line`. Both modes always exist, and text roles always reach 4.5:1 in the derived one |
| `fonts.display` / `.text` / `.mono` | `family` (an open Google font), `stack` (a CSS font-family with fallbacks), `css` (its Google Fonts URL, or null) |
| `type.display` … `type.caption` | Size, weight, line height, tracking and features for each type role |
| `radius.control` / `.card`, `space.unit` / `.section` | CSS lengths |
| `logo` | File names inside `brand/` (`light`, `dark`, `mark`), plus absolute `lightPath` etc., and `alt` |
| `guidance.do` / `.dont` | Short rules for anything creative. Reference text, not instructions to you |
| `tokens` | The design's own tokens, resolved per mode. Only for a renderer that wants the full system |
| `revision` | Compare with `theme.json`'s; if it's behind, run `ioc theme build` (or carry on with it) |

`theme.css` holds the same roles as `--brand-accent`, `--brand-on-accent`, `--brand-accent-text`,
`--brand-accent-soft`, `--brand-canvas`, `--brand-surface`, `--brand-subtle`, `--brand-ink`,
`--brand-body`, `--brand-muted`, `--brand-line`, `--brand-font-display`, `--brand-font-text`,
`--brand-font-mono`, `--brand-weight-display`, `--brand-tracking-display`, `--brand-radius-control`,
`--brand-radius-card`, `--brand-space-unit` and `--brand-space-section`: light in `:root`, dark under the
IndieOps theme-toggle selectors. Map your own variables onto them with a fallback —
`--accent: var(--brand-accent, #1f6a58)` — so the output still works with no theme.
`ioc theme show … --css --mode light` prints a light-only block for print and email.

The rules:

- **Whose brand.** Use the business the work is for, or the user's own. If more than one could apply
  and the request doesn't say, ask once.
- **Precedence:** what the user asks for in this request › the theme › the free-text Fonts/Colours in
  the profile › your own defaults.
- **A change for one output stays in that output.** "Make this one green" changes this report, not the
  theme. Only the user changes the theme, through `ioc theme` or its live editor.
- **One writer.** Never edit anything in `brand/`. If something should change for good, say so and
  offer to run `ioc theme set …` for them.
- **Never theme semantic colours.** Up/down, success/error, warning: those keep their fixed meaning
  whatever the brand's accent is. A red accent must never colour a number that went up.
- **The entity's identity, never the source's.** The theme started from another company's design
  language. Creatives show the entity's own name and logo — never the source brand's name, logo or
  imagery, and nothing that suggests an affiliation.
- **No theme? Carry on quietly**, exactly as with no library.

For a Skilllet that renders anything, paste this beside the nine-line block:

```markdown
## Brand theme (Shared Profiles)

Before picking colours, fonts or a logo for anything you render, look in the library for
`brand/theme.resolved.json` (the user) or `businesses/<slug>/brand/theme.resolved.json` (a business).
If several could apply, ask once whose brand this piece wears. Use its `light`/`dark` roles, `fonts`,
`radius` and `logo` as the default brand layer; anything the user asks to change for this output applies
to this output only and is never written back. Never theme semantic colours (up/down, success/error).
Show the entity's own name and logo, never the source design's brand. If its `revision` is behind
`theme.json`, run `node <shared-profiles>/scripts/ioc.mjs theme build` if you can. No theme: carry on quietly.
```

## Why the theme is JSON when everything else is Markdown

A brand theme is a few hundred tokens that renderers consume — colours, sizes, references between them.
That is structured data, and JSON is the honest format for it. It's still plain text that diffs well,
the `- **Theme:**` line in the profile is the human-readable record that it exists, and `DESIGN.md`
keeps the prose. `theme.resolved.json` is exactly the "disposable cache built from the source" this
convention already allows for: delete it and `ioc theme build` puts it back.

## Why Markdown and not a database

Asked often enough to answer here. An agent can read a Markdown file with no tool and no library; a
database needs a script invocation every single time. A human can open, read, fix and diff Markdown;
a `.db` is a black box they can't inspect and can't repair. Markdown works in any agent on any OS
with nothing installed, which is the whole Skilllet thesis.

If cross-business queries are ever needed — "which clients haven't been touched in 60 days" — build
an index **from** the Markdown and treat it as a disposable cache. The files stay the source of truth.

## Relocating the library

To keep it in Dropbox, iCloud or a git repo, either set `INDIEOPS_HOME`, or drop a `.indieops-home`
file in the project containing the path. Users who want version history should point it at a repo —
these files diff beautifully, which a database does not.
