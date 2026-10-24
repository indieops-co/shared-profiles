// Turns the rendered PNG frames into the GIF: one palette per scene, exact timing, then gifsicle -O3.
//   node encode.mjs <frames dir> <out.gif>          (render.sh runs it; needs ffmpeg and gifsicle on PATH)
//
// Why not one ffmpeg pass, or Remotion's own GIF encoder: both use one palette for the whole GIF, which smears
// colours that are only on screen briefly (the report's red "down" figure, the bird), and Homebrew's ffmpeg 8.1.2
// also drops held frames from a GIF, which breaks the timing. Here each frame that changes is quantised on its own
// with its scene's palette (src/timeline.json says where scenes start), and gifsicle assembles them with delays
// worked out from the frame count. The closing title card reuses the opening one's palette, so the loop seam is
// pixel-identical.
import { readdirSync, readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [framesDir, out] = process.argv.slice(2);
if (!framesDir || !out) { console.error('usage: node encode.mjs <frames dir> <out.gif>'); process.exit(2); }
const TL = JSON.parse(readFileSync(new URL('./src/timeline.json', import.meta.url), 'utf8'));

const frames = readdirSync(framesDir).filter((f) => /^frame-\d+\.png$/.test(f)).sort();
const total = Object.values(TL.scenes).reduce((a, b) => a + b, 0) + TL.scenes.title;
if (frames.length !== total) throw new Error(`expected ${total} frames in ${framesDir}, found ${frames.length}`);

// Palette groups: [first frame, palette key]. The last group (the closing title card) uses palette "title".
const sc = TL.scenes, at = {};
let t = 0;
for (const k of ['title', 'complaint', 'pick', 'tune', 'preview']) { at[k] = t; t += sc[k]; }
const groups = [
  [0, 'title'], [at.complaint, 'complaint'], [at.pick, 'pick'], [at.tune, 'tune'],
  ...Object.entries(TL.previewShots).map(([k, f]) => [at.preview + f, `preview-${k}`]),
  [t, 'title'],
];
const groupOf = (i) => groups.filter(([from]) => i >= from).at(-1)[1];

const work = mkdtempSync(join(tmpdir(), 'sp-gif-'));
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });

// 1. A palette per group, from that group's frames (the closing card has none of its own).
const palettes = {};
for (let g = 0; g < groups.length - 1; g++) {
  const [from, key] = groups[g];
  const to = groups[g + 1][0];
  palettes[key] = join(work, `pal-${key}.png`);
  ff(['-framerate', String(TL.fps), '-start_number', String(from), '-i', join(framesDir, 'frame-%03d.png'),
    '-frames:v', String(to - from), '-vf', 'palettegen=max_colors=256:stats_mode=full', '-update', '1', palettes[key]]);
}

// 2. Runs of identical frames; each run becomes one GIF frame with the run's length as its delay.
const hash = (f) => createHash('sha1').update(readFileSync(join(framesDir, f))).digest('hex');
const runs = [];
frames.forEach((f, i) => {
  const h = hash(f), last = runs.at(-1);
  if (last && last.h === h && groupOf(i) === groupOf(last.from)) last.n++;
  else runs.push({ from: i, n: 1, h, file: f });
});

// 3. Quantise each run's frame with its group's palette. No dithering: it's flat colour and text.
mkdirSync(join(work, 'gif'));
const cs = (n) => Math.round((n * 100) / TL.fps);              // centiseconds since frame 0, rounded once
const args = ['--no-warnings', '--loopcount=forever'];
for (const [k, r] of runs.entries()) {
  const g = join(work, 'gif', `${String(k).padStart(3, '0')}.gif`);
  ff(['-i', join(framesDir, r.file), '-i', palettes[groupOf(r.from)], '-lavfi', '[0:v][1:v]paletteuse=dither=none', '-frames:v', '1', g]);
  args.push('-d', String(cs(r.from + r.n) - cs(r.from)), g);
}
execFileSync('gifsicle', [...args, '-O3', '-o', out], { stdio: 'inherit' });
console.log(`${out}: ${runs.length} frames, ${(cs(frames.length) / 100).toFixed(2)} s`);
