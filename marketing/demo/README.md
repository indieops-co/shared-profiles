# Shared Profiles demo GIF

The source for `docs/demo.gif` and `docs/demo-dark.gif` ("The demo GIF" in `indieops-brand/BRAND.md`). It's in
`marketing/`, so it never ships. Built from the house template, `Internal/claujabi/demo-gif/`.

- `src/Demo.tsx`: the animation. Title card → the complaint → pick and import a starting design → make it the
  client's → the live preview → the same title card. 960×540, 15 fps, 19.7 s.
- `src/timeline.json`: how long each scene runs, and when the preview cuts. `encode.mjs` reads it too.
- `public/shots/`: the real `brand/preview.html` in a 1440-wide browser, light and dark page themes: as it opens, then
  "Side by side" on the social posts, landing page and report. `shots.json` has where to crop and where the button is.
- `capture/capture.sh`: rebuilds the shots and prints the real CLI output, from a throwaway library (never
  `~/.indieops`) and the design catalogue the tests pin (`test/fixtures/source`).
- `render.sh`: renders PNG frames with Remotion, then `encode.mjs` makes each GIF and writes it to `docs/`.

**Re-render** after anything the GIF shows changes (the CLI's output, the preview page, the sample layouts):

```
npm install                 # once (Remotion 4.0.438, puppeteer-core for the capture)
bash capture/capture.sh     # new shots, and the real output to copy into PICK and TUNE in src/Demo.tsx
bash render.sh              # → docs/demo.gif and docs/demo-dark.gif
npx remotion studio         # optional: scrub through it in a browser
```

Needs Node 18+, Google Chrome (or `CHROME=<path>`) for the capture, and ffmpeg and gifsicle for the encode. Set
`REMOTION_BROWSER` to a Chrome Headless Shell you already have to skip Remotion's download.

## Keeping it literal

Rules from BRAND.md: every command, message, file name and number must be one the product really produces (copy lines
from capture.sh's output; a line may be cut short or left out, never reworded), no prices, no URLs, nothing that isn't
in this version. The user's two prompts, Claude's prose (the grey bars), the complaint and the title card's subtitle
are the only words that aren't product output.

What's cut, and why:
- The import's `from https://github.com/VoltAgent/awesome-design-md · MIT · …` line (a URL), its `Wrote:`/`Open:`
  paths, the font-mono and radius lines, and the role-table rows other than accent, onAccent and ink (space).
- `theme set` prints the whole role table; the GIF keeps the header, accent and onAccent.
- `theme build` prints the absolute path; the GIF starts it at `…/businesses/`. With `--open` it prints the same line
  and opens the page (`cmdBuild` in `scripts/theme/cli.mjs`); the capture runs it without, so no browser pops up.
- The source design's logo never appears: the preview doesn't show it, by design.

One thing the shots correct: in shared-profiles 1.1.0 the preview's "Web fonts unavailable offline — showing
fallbacks" chip shows even when every font has loaded, because `.chip{display:inline-block}` overrides the `hidden`
attribute. `capture/shots.mjs` adds `.chip[hidden]{display:none}`, so the shots show the page's own state (fonts
loaded, chip hidden). Fix it in `templates/theme-preview.html` and that line becomes a no-op.

## Timeline

296 frames at 15 fps, 19.7 s. Scene lengths are in `src/timeline.json`.

| Beat | Time |
|---|---|
| Title card, still | 0–1.5 s |
| The complaint: "The client's brand? One hex code." | 1.5–3.6 s |
| "Give Acme Plumbing & Heating a brand theme.", the shortlist, "Start from Stripe.", `theme import` and its output | 3.6–7.9 s |
| "Their green is #0a7c66. Fraunces for headings.", `theme set`, `theme build --open` | 7.9–11.6 s |
| The preview as it opens (brand in Light); the pointer presses Side by side | 11.6–13.2 s |
| Social posts, light and dark (held 2 s after the choice) | 13.2–15.2 s |
| Landing page, light and dark | 15.2–16.7 s |
| Report page, light and dark | 16.7–18.3 s |
| Title card | 18.3–19.7 s |

The last frame is the same as frame 0, pixel for pixel, so the loop joins the two title cards in one 2.7 s hold.

## Why encode.mjs

Remotion's own GIF encoder (the template's way) uses one palette for the whole GIF, which smeared the report's red
"down" figure, and Homebrew's ffmpeg 8.1.2 drops held frames from a GIF, which breaks the timing. `encode.mjs` gives
each scene its own palette, quantises each frame that changes on its own, and lets gifsicle assemble them with delays
worked out from the frame count. It's also well under half the size of Remotion's encode of the same frames
(about 520 KB against 1.4 MB).
