# Shared Profiles

## Start here

Drop the `shared-profiles` folder into `~/.claude/skills/` (or upload the zip on claude.ai under **Settings → Capabilities → Skills**), then say:

```
Set up my shared profiles. My business is Acme Plumbing & Heating.
```

That creates one folder on your computer, `~/.indieops/`, with a page about you and a page about the business. From then on every IndieOps Skilllet reads it before asking you anything, and writes back what it learns. Type a fact once; every Skilllet knows it.

Want it to look like you too? Say *"give Acme a brand theme"* and keep reading.

---

## What's in the folder

```
~/.indieops/
├── me.md                     you: name, how you write, your brand defaults
├── brand/                    your brand theme (optional)
└── businesses/
    └── acme-plumbing-heating/
        ├── profile.md        the business: what it does, where, hours, domains, services
        ├── brand/            the business's brand theme (optional)
        └── notes/            each Skilllet's own working notes
```

It's all plain text. Open any of it, fix a typo, back it up, put it in git, or email it to an assistant. **Nothing secret ever goes in here**: no passwords, API keys or card details. Those stay in your password manager and environment variables, because this folder will end up in a backup or a screen share one day.

Two pages, because Skilllets split two ways. Some care about *you* (your name, your voice, your look) and some care about a *business* (its domain, its hours, its services). Each reads what it needs.

---

## Brand themes

A brand theme is everything about how you, or a client, *look*: a colour for every job (buttons and links, backgrounds, headings, body text, borders), fonts, type sizes, corners, spacing, and a short list of do's and don'ts. Any Skilllet that makes something you look at can read it, so a report, a social post and a landing page all come out wearing the same brand.

### Start from a real design language

You don't start from a blank page. You start from one of the design languages in **[awesome-design-md](https://github.com/VoltAgent/awesome-design-md)**, VoltAgent's open collection of DESIGN.md files describing 80-odd well-known products: warm editorial ones, crisp technical ones, playful ones, dark and cinematic ones. Each comes with its colours, type scale, components and rules.

Tell Claude what the brand should feel like, or let it read your profile, and it shows you a shortlist of eight to twelve that fit, each with a link to preview it. Pick one.

### Then make it yours

The design you pick is only the starting point. Claude asks for the three things that make it *yours*: your brand colour, your logo, and your fonts if you have them. Those are kept as a separate layer on top, so you can switch to a different starting design later and keep every change you made.

Nothing you make ever wears the starting design's name or logo. A theme that starts from the Stripe design language is *your* brand with Stripe's sense of spacing and type, not a Stripe lookalike.

### See it, change it

Open `brand/preview.html` in your browser. It shows your brand on:

- a **spec sheet**: every colour, the type scale, corners, spacing and components, with contrast scores
- two **social posts** at real Instagram sizes
- a **landing page** hero with cards
- a **report page** with stat tiles and a table
- an **email header**, using only what inboxes actually support

Switch between light, dark and side by side. Dark mode is worked out for you, and its text always passes accessibility contrast. Every control on the left updates every layout as you drag it. Undo works.

The preview never changes your files by itself. When you're happy, press **Copy edits** and paste them to Claude ("apply these theme edits"). That way nothing changes behind your back, and if a Skilllet changed the theme while you were editing, Claude tells you which values clash and asks which to keep.

### Things worth knowing

- **Fonts.** Most well-known brands use fonts you can't use, so every theme uses an open Google Font in its place, picked from what the original design itself recommends. Offline, the preview shows fallback fonts and says so.
- **Up and down colours never change.** In reports, a fall is always red and a rise always green, whatever your brand colour is. A red brand colour must never make a good month look bad.
- **Older designs.** A few designs in the collection are written as prose rather than structured tokens. Claude reads those and checks its reading with you.
- **Offline or behind a company proxy?** Download the DESIGN.md yourself and Claude imports it from the file.
- **The licence travels with it.** Each imported design keeps its MIT notice beside your theme.

---

## Commands

You don't need these. Claude runs them for you. They're here if you like a terminal:

```
node scripts/ioc.mjs where                      where the library lives
node scripts/ioc.mjs init --business "Name"     create it
node scripts/ioc.mjs add "Name"                 add a business
node scripts/ioc.mjs list                       every business, when it was last updated, its theme
node scripts/ioc.mjs show <slug>                print a profile

node scripts/ioc.mjs theme catalog              the designs you can start from
node scripts/ioc.mjs theme import <design> --business <name>
node scripts/ioc.mjs theme set --business <name> accent "#0a7c66" fonts.display Fraunces
node scripts/ioc.mjs theme build --business <name> --open
node scripts/ioc.mjs theme apply-edits - --business <name>
node scripts/ioc.mjs theme check --all
```

Use `--me` instead of `--business` for your own brand. `node scripts/ioc.mjs theme --help` lists everything you can set.

---

## Moving it

The library lives in the first of these that exists:

1. the folder in the `INDIEOPS_HOME` environment variable
2. the path written inside a `.indieops-home` file in the folder you're working in
3. `~/.indieops`

Want it in Dropbox, iCloud or a git repo? Set `INDIEOPS_HOME` and it moves. A git repo is a good home: plain text diffs well, so you get a history of every fact and every brand change.

---

## For Skilllet authors

`CONVENTION.md` is the whole spec. Reading the profiles is nine lines of Markdown in your `SKILL.md`. If your Skilllet renders anything, one more paragraph has it read the brand theme too: one resolved file with both light and dark, open fonts and a logo. The four rules:

1. **Read before you ask.** If it's in the library, don't ask again.
2. **Add missing facts; never overwrite one another Skilllet set.** Flag the conflict and let the user decide.
3. **Your own findings go in `notes/<your-skill>.md`.** Nothing else writes there.
4. **Never require it.** A missing library, or a missing theme, is not an error.
