---
name: indieops-client
description: The shared memory every IndieOps Skilllet reads from — one plain-Markdown library on this machine holding who the user is (name, voice, brand defaults) and one profile per business they work on (their own or a client's). Use to set the library up, add or switch between businesses, answer "which clients do I have" or "when did I last work on X", move or back the library up, correct a stored fact, or remove a business that's no longer a client. Not for doing the work itself: the business-specific Skilllet still owns its own onboarding, audits, content and reports — this only stores and hands back the facts, and a sibling Skilllet reads the library directly without loading this one.
---

# IndieOps Client Library

One folder on the machine that every IndieOps Skilllet reads. The point: **nobody types the same
fact twice.** LinkPanther learns the domain, GBPCoach learns the business, Instantly Ready learns the
sending setup — and the fourth Skilllet they install already knows all three.

Plain Markdown. No database, no server, no dependency. The user can open any of it, read it, fix it,
diff it in git, or email it to an assistant.

## Where it lives

Resolution order — first match wins:

1. `$INDIEOPS_HOME`, if set
2. A file named `.indieops-home` in the working folder, containing a single path
3. `~/.indieops`

```
~/.indieops/
├── README.md                       what this folder is (written on init)
├── me.md                           the user — name, voice, defaults
└── businesses/
    └── <slug>/
        ├── profile.md              the business: what it is, where, what it sells
        └── notes/
            ├── gbpcoach.md         one file per Skilllet — no two ever collide
            ├── linkpanther.md
            └── …
```

`node scripts/ioc.mjs where` prints the resolved path. `init` creates it. `list` shows every business
and when each was last touched.

## Two roots, on purpose

**`me.md` is about the person.** Their name, how they write, what they build, their brand defaults.
TastePilot, the course builder and Press Ready care about this and don't care about any business.

**`businesses/<slug>/profile.md` is about a business** — theirs or a client's. GBPCoach, LinkPanther
and Instantly Ready care about this.

A Skilllet reads whichever it needs. Most read `me.md`; the business-scoped ones read both.

## Rules for any Skilllet using this

1. **Read before you ask.** If a fact is in the library, use it. Asking a user to re-type their own
   business name is the failure this exists to prevent.
2. **Confirm, don't assume, on first use in a session.** One line: *"Working on Acme Plumbing, from
   your library — right?"* Then move on. People do change clients.
3. **Add missing facts freely. Never overwrite a field another Skilllet set.** If what you learned
   contradicts what's there, say so and let the user decide which is true. Silent overwrites are how
   a shared file becomes untrustworthy.
4. **Write your own findings to `notes/<your-skill>.md`, not the profile.** The profile is for facts
   that stay true regardless of which Skilllet is running. Your working state is yours.
5. **Never write a secret here.** No API keys, no passwords, no tokens — those stay in the
   environment. This folder is plain text in a home directory and may well end up in a backup, a
   screen share, or a Dropbox.
6. **Never require it.** Every Skilllet must work with the library absent. Check, use it if it's
   there, carry on quietly if it isn't. A missing library is not an error and not worth a paragraph.
7. **Local working state stays local.** Boards, scans, findings, drafts belong in the project's own
   folder. The library is identity, not activity.

## Setting it up

If the library doesn't exist and the user is doing something business-scoped, offer it once:

> I can keep the basics about this business in a shared file, so the next IndieOps Skilllet you use
> already knows them. Plain Markdown in your home folder, takes a minute. Want that?

If yes: `node scripts/ioc.mjs init --business "<name>"`, then fill `me.md` and the profile from what
you already know, and ask only for what's genuinely missing. If no, don't raise it again this session.

## Switching between businesses

`list` shows what exists. When a user has more than one, ask which they mean the first time it
matters, then stay on it for the session and say which one you're on at the top of replies that
produce work.

## Routing

| The user says | Do |
|---|---|
| "set up my client library", "start sharing between skills" | `init`, then fill from what you know |
| "which clients do I have", "when did I last work on X" | `list` |
| "switch to <business>", "we're working on <business> now" | read that profile, confirm in one line |
| "where does this live", "how do I back it up" | `where`, plus the relocation note in `CONVENTION.md` |
| "update the phone number / add a service / new domain" | edit `profile.md` |
| a fact about the person, not a business ("I always write in British English") | `me.md` |
| a fact only your Skilllet needs | `notes/<your-skill>.md` |

`CONVENTION.md` is the spec to hand another Skilllet's author, or to paste into a Skilllet that
doesn't know about the library yet.
