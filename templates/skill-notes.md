# [SKILL NAME] — notes on [BUSINESS]

`businesses/<slug>/notes/<skill>.md`. Yours alone. Nothing else writes to this file, so there is
nothing to conflict over.

Last updated: [date]

**Never write a secret here.** No API keys, no passwords, no tokens, no portal logins — not even
"temporarily". This file is plain text in a home directory and it is the one most likely to be
carrying configuration. Keys belong in environment variables.

## What this Skilllet knows about this business
Facts too specific for the shared profile — settings, non-secret identifiers, choices made.

## Decisions made
Dated. What was chosen and why, so a later session doesn't relitigate it.

| Date | Decision | Why |
|---|---|---|

## Open
Things left unresolved. Read on the next run; don't raise them unprompted.

---

If something in here turns out to be true regardless of which Skilllet is running — a phone number, a
service, a domain — move it up into `profile.md`. That's the test: would another Skilllet want it?
