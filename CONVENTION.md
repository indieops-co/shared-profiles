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
<library>/me.md                              the person
<library>/businesses/<slug>/profile.md       the business
<library>/businesses/<slug>/notes/<skill>.md your own notes
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
`## Brand defaults` (Fonts, Colours, Look, Logo file) ·
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
