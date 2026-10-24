// Screenshots of the real brand/preview.html for the demo GIF, in light and dark page themes.
//   node capture/shots.mjs <preview.html> <out dir>        (capture.sh runs it)
// Writes <out>/{top,social,landing,report}-{light,dark}.png and <out>/shots.json (where to crop and click).
// Every shot is a plain viewport screenshot of the page as it is: the GIF only crops and scales them.
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) { console.error('usage: node capture/shots.mjs <preview.html> <out dir>'); process.exit(2); }
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// The GIF's browser window shows 933×477.5 px of page. 1440 wide is the narrowest width where
// "Side by side" puts light and dark next to each other rather than one under the other.
const ASPECT = 933 / 477.5;
const W = 1440, H = Math.round(W / ASPECT);
const PAD = 14;                                   // page margin kept around the main column in a crop
const SECTIONS = { social: 'Social posts', landing: 'Landing page', report: 'Report page' };

mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
const meta = { viewport: { w: W, h: H } };

// Web fonts come from Google Fonts. Wait until every family has arrived and the page's own
// "Web fonts unavailable offline" chip is hidden, so the shots show the real fonts.
async function settle(page) {
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(async () => {
      await document.fonts.ready;
      const links = [...document.querySelectorAll('link[rel=stylesheet]')];
      return links.every((l) => l.sheet) && document.getElementById('fontchip').hidden && document.fonts.status === 'loaded';
    });
    if (ok) { await sleep(400); return; }
    await sleep(250);
  }
  throw new Error('web fonts did not load (the preview would show its offline fallbacks) — check the network and re-run');
}

for (const theme of ['light', 'dark']) {
  // A fresh profile per theme: the page remembers "Side by side" in localStorage.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await page.goto('file://' + resolve(file), { waitUntil: 'networkidle0' });
  // shared-profiles 1.1.0 bug: `.chip{display:inline-block}` overrides the `hidden` attribute, so the
  // "Web fonts unavailable offline" chip shows even when every font has loaded. Honour the page's own
  // `hidden` state (the fix is `.chip[hidden]{display:none}` in templates/theme-preview.html). A no-op once fixed.
  await page.addStyleTag({ content: '.chip[hidden]{display:none}' });
  await settle(page);

  // 1. The page as it opens: the brand shown in its own base mode (Light for this design).
  await page.screenshot({ path: join(outDir, `top-${theme}.png`) });
  const both = await page.$eval('[data-bm="both"]', (b) => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });

  // 2. "Side by side", then each layout with its heading near the top.
  await page.click('[data-bm="both"]');
  await sleep(300);
  await settle(page);
  const crops = {};
  for (const [key, title] of Object.entries(SECTIONS)) {
    const box = await page.evaluate((title, pad) => {
      const h = [...document.querySelectorAll('h3.secthead')].find((e) => e.textContent.trim() === title);
      const main = document.querySelector('main').getBoundingClientRect();
      window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - pad);
      return { x: Math.round(main.left - pad), w: Math.round(main.width + 2 * pad) };
    }, title, PAD);
    await sleep(250);
    await page.screenshot({ path: join(outDir, `${key}-${theme}.png`) });
    crops[key] = { x: box.x, y: 0, w: box.w, h: Math.round(box.w / ASPECT) };
  }
  meta[theme] = { both, crops };
  await context.close();
}
await browser.close();
writeFileSync(join(outDir, 'shots.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`shots: ${W}×${H}, light and dark → ${outDir}`);
