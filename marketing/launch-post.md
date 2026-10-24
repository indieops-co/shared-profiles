# Shared Profiles 1.1 — launch post

LinkedIn, X, and the post image, for Skilllet 2026-15 v1.1 (brand themes). Made from Claujabi's reference
(see "Skilllet release requirements" → "Launch post" in BRAND.md). Signed by Dev.

**Before posting:**
- **Swap in the real story.** The frustration paragraph is a draft written from what the theme work fixes. Replace it
  with what actually happened, even if it's small.
- **Pick the call to action.** Three versions are at the bottom. It's a free Skilllet (catalogue `price` 0), so there's
  no `{{price}}` to fill. If that ever changes, the calls to action change with it.
- **Check the updates line.** It says updates arrive by email, which is true for anyone who downloaded from
  indieops.co. Make sure it's still true on launch day.
- **Check the design count.** "80-odd" is the README's wording; `node scripts/ioc.mjs theme catalog` listed 84 on
  2026-10-24.
- **Say only what 1.1 ships.** No other Skilllet reads the brand theme yet, so don't name one as using it. GBPCoach
  and LinkPanther read the *profiles*, which is the part that already shipped.
- **Never imply an affiliation.** The designs describe well-known products. The posts say "design language", credit
  VoltAgent's collection, and say the client's own name and logo go on everything.

---

## LinkedIn

> Most small-business brand guides are one hex code and a logo in a Word doc.
>
> And the client still wants posts, a website and a monthly report that look like the same company made them.
>
> I kept hitting this. Every new client meant guessing a font, eyeballing a dark mode, and a report that came out a slightly different green from the post before it. So I put the brand where the client's details already live.
>
> Shared Profiles is the free Skilllet that keeps one plain-text page about you and one per client, which IndieOps Skilllets read instead of asking you again. Version 1.1 gives each of them a brand theme.
>
> Pick a starting design from awesome-design-md, VoltAgent's open collection of 80-odd design languages. Add the client's colour, fonts and logo. Then open the live preview: the brand on social posts, a landing page, a report and an email header, light and dark side by side. Change anything, press Copy edits, paste it to Claude.
>
> It borrows a design language, never a brand. Everything you make shows your client's name and logo.
>
> And because it's a Skilllet, not a sticky note, it's a whole folder: a command-line tool that checks every change and keeps the last version, dark mode worked out with readable contrast, and a fall that stays red even when the brand is green. Tested before it ships.
>
> Free. Updates land in your inbox.
>
> [CALL TO ACTION]
>
> Skilllet. Fine-tuned Agentic superpowers.
>
> — Dev, IndieOps
>
> #ClaudeCode #Branding #Freelancing

About 240 words. Links go in the first comment, not the post:

> indieops.co/skills/shared-profiles
>
> The starting designs come from awesome-design-md by VoltAgent (MIT): github.com/VoltAgent/awesome-design-md. Each imported design keeps its licence beside your theme.

---

## X

**Single post** (240 to 270 characters with a short call to action; X counts a link as 23):

> Most small-business brand guides are one hex code and a logo in a Word doc.
>
> Shared Profiles 1.1 makes it a whole brand theme: pick a real design language, add their colour and fonts, see it on posts, a site and a report.
>
> [SHORT CALL TO ACTION]

**Optional thread:**

1. The single post above.
2. The starting designs are awesome-design-md, VoltAgent's MIT collection of 80-odd DESIGN.md files. It borrows a design language, never a brand: everything you make shows your client's name and logo.
3. What's in the folder: a CLI that checks every change and keeps the last version, dark mode worked out with readable contrast, and a fall that stays red even when the brand is green. The live preview never touches your files until you paste its edits to Claude.
4. Why it exists: every new client meant guessing a font and a dark mode, and no two reports came out the same green. Works with Claude on macOS, Windows and Linux (Node 18+). Free, updates by email. indieops.co/skills/shared-profiles — Dev

---

## Calls to action

Pick one and use it in both posts.

- **Straight.** "It's free. The link's in the first comment." For X: "Free: indieops.co/skills/shared-profiles"
- **Comment keyword.** "Comment BRAND and I'll send you the link." For X: "Reply BRAND for the link"
- **The Proof Lab.** "It's free, and if you're in the Proof Lab, our free community for people who build things with AI, you'll see every update announced in the group. Links in the first comment." For X: "Free. Updates get announced in the Proof Lab"

---

## The post image: the demo GIF

Use `docs/demo.gif` (or `docs/demo-dark.gif`) as the image on both posts, wherever the platform takes an animated
GIF. It's 960×540, 19.7 s, about half a megabyte, and it shows the real thing: Claude imports a starting design for
Acme Plumbing & Heating, sets the client's green and Fraunces, and the live preview shows social posts, a landing page
and a report in light and dark. Check the feed crop keeps the title card ("Shared Profiles / Turn one brand colour into
a whole brand theme.") readable.

---

## Feature image (the fallback) — for NanoBanana Pro

Only for a place the GIF can't go.

**The idea:** the whole brand guide is one sticky note with a hex code on it. Shared Profiles turns it into a full,
matching kit.

**Prompt:**

> A modern hand-drawn sketch illustration on white textured paper, dark charcoal architect-style lines with slightly overdrawn corners, saturated flat colour fills with subtle shading. Split composition. On the left, a lonely yellow sticky note stuck slightly crooked on an empty desk, with "BRAND GUIDE:" and "#0a7c66" scrawled on it in scruffy handwriting, and a tiny swatch of deep teal green coloured in beside the code. On the right, the same teal grown into a tidy fanned-out kit for a small plumbing company with no readable name: a square social post card, an open laptop showing a landing page with a teal button, and a printed monthly report with three stat tiles, one tile with a small red down arrow. Each piece appears twice, once on white and once on near-black, like light and dark versions laid side by side. A single felt-tip marker scribble highlight in warm pink sits behind the kit. A small rainbow-gradient hummingbird (purple, green, blue, yellow, pink) hovers between the two sides, carrying the teal swatch from the sticky note to the kit. Bright, funny, confident, editorial. No other text, no brand logos, no people.

**Format:** 1:1, 1080×1080, with the sticky note, the kit and the hummingbird inside the middle 80%. For a 16:9 version
for X, keep the scene and widen the empty desk on the left.

**Words in the image:** "BRAND GUIDE:" and "#0a7c66", nothing else. Check the hex code character by character; image
models like to "fix" it. No company names on the kit: a readable name would be a real business, or look like one.

**An alternative, if the sticky note feels done:** a paint-shop counter where a customer has handed over one tiny paint
chip marked "#0a7c66", and the rainbow hummingbird, wearing a tiny apron, slides back a whole matching set: a poster,
a shop sign, a website on a tablet and a report, every one in the same teal, half of them on a dark background.
Words: "#0a7c66" only.
