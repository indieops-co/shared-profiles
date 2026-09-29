# IndieOps Client Library

**Type a fact once. Every IndieOps Skilllet knows it.**

*An IndieOps Skilllet — a copyable skill folder that does one job properly.* · Skilllet 2026-15 · [indieops.co](https://indieops.co)

LinkPanther learns the domain. GBPCoach learns the business. Instantly Ready learns the sending
setup. Right now each one asks you from scratch. Install this and they stop.

Free, and it makes every other Skilllet you own better.

---

## What it is

One folder on your machine, in plain Markdown:

```
~/.indieops/
├── me.md                           *you* — name, voice, brand defaults
└── businesses/
    └── acme-plumbing/
        ├── profile.md              *business* — services, domains, DNS, areas
        └── notes/
            ├── gbpcoach.md         each Skilllet's own notes - auto-generated as needed.
            └── linkpanther.md
```

Two roots, because your Skilllets split two ways. TastePilot and the course builder care who *you*
are and don't care about any client. GBPCoach and LinkPanther care about a *business*. Both read what
they need and ignore the rest.

No database, no server, nothing to install. You can open any of these files, read them, fix a typo,
diff them in git, or email one to an assistant.

---

## Install

Drop the `indieops-client` folder in as a skill, the same as any other Skilllet, then:

```
node scripts/ioc.mjs init --business "Acme Plumbing"
```

Or just say *"set up my client library"* and let the Skilllet do it.

Then fill in `me.md`. The voice section is the one that pays for itself — it's why the next thing you
generate sounds like you wrote it.

---

## Commands

```
node scripts/ioc.mjs where        where the library resolved to
node scripts/ioc.mjs init         create it
node scripts/ioc.mjs add "Name"   add a business
node scripts/ioc.mjs list         every business, when you last touched it, which Skilllets ran
node scripts/ioc.mjs show <slug>  print a profile
```

`list` answers the question a freelancer actually has:

```
  BUSINESS                 LAST TOUCHED   SKILLETS USED
  testville-family-dental  today          gbpcoach
  acme-plumbing-heating    23 days ago    gbpcoach, linkpanther
```

---

## Where it lives, and moving it

First match wins:

1. `$INDIEOPS_HOME`
2. a path in a `.indieops-home` file in the folder you're working in
3. `~/.indieops`

Want it in Dropbox, iCloud or a git repo? Set `INDIEOPS_HOME` and it moves. A git repo is a genuinely
good home for it — Markdown diffs beautifully, so you get a history of every client fact that ever
changed, which is not something a database gives you for free.

---

## No secrets in here

API keys, passwords, tokens, portal logins — none of it. Those belong in environment variables. This
is plain text in a home directory and it will end up in a backup, a screen share or a sync folder
sooner or later. Every Skilllet that uses this library is instructed the same way.

---

## Adding it to your own Skilllet

`CONVENTION.md` is the whole spec, and the integration is nine lines of Markdown in your `SKILL.md`.
The four rules that matter:

1. **Read before you ask.** If it's in the library, don't ask for it again.
2. **Add missing facts. Never overwrite one another Skilllet set** — flag the conflict and let the
   user decide.
3. **Your own findings go in `notes/<your-skill>.md`.** Nothing else writes there, so nothing collides.
4. **Never require it.** A missing library is not an error. Check, use it if it's there, carry on
   quietly if it isn't.

---

## Why not a database

Because an agent can read a Markdown file with no tool and no library, and a database needs a script
invocation every single time. Because you can open, read, fix and diff Markdown, and a `.db` file is
a black box you can't inspect and can't repair. And because Markdown works in any agent, on any OS,
with nothing installed — which is the entire point of a Skilllet.

If you ever want cross-business queries, build an index *from* these files and treat it as a
disposable cache. The Markdown stays the source of truth.

---

v1.0 · September 2026 · IndieOps Free License · Built by [IndieOps](https://indieops.co)

## License

**License:** [IndieOps Free License](LICENSE). Free to use, even commercially; don't redistribute it.
