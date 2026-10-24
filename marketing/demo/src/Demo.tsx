/**
 * Shared Profiles demo GIF: BRAND.md "The demo GIF". 960×540, 15 fps, under 20 s: title card → the complaint →
 * pick a starting design and import it → make it the client's (accent + display font) → the live preview, light and
 * dark side by side → the same title card, so the loop joins as one hold.
 *
 * Literal by rule: every command and output line below is copied from a real run of scripts/ioc.mjs in a throwaway
 * library (capture/capture.sh prints it), and the browser shots are the real brand/preview.html it builds
 * (capture/shots.mjs). A line may be cut short or left out, never reworded. If the output changes, re-run, re-copy
 * and re-render; see README.md. The user's prompts, Claude's prose (drawn as grey bars), the complaint and the
 * title card's subtitle are the only things that aren't product output.
 */
import { AbsoluteFill, Img, interpolate, Easing, staticFile, useCurrentFrame } from 'remotion';
import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import SHOTS from '../public/shots/shots.json';
import TL from './timeline.json';

const { fontFamily: TITLE } = loadFraunces('normal', { weights: ['900'], subsets: ['latin'] });
const { fontFamily: SANS } = loadMontserrat('normal', { weights: ['500', '600'], subsets: ['latin'] });
const { fontFamily: MONO } = loadMono('normal', { weights: ['400', '600'], subsets: ['latin'] });

type ThemeName = 'light' | 'dark';
const THEMES = {
  light: { bg: '#f7f3ea', ink: '#1f1b16', sub: '#5c554b', win: '#fdfbf5', winLine: '#e2dacb', bar: '#efe7da', barText: '#4a443b', dots: '#cbc2b3', row: '#efe7da', mono: '#2a2620', muted: '#7d766a', ghost: '#e3dccf', ghost2: '#d3cabb', accent: '#b07a2a', ok: '#3f7a3a' },
  dark: { bg: '#151209', ink: '#f3ecdf', sub: '#b5ad9f', win: '#1b1813', winLine: '#2f2a22', bar: '#110e0a', barText: '#d8d0c2', dots: '#4a443a', row: '#0c0a07', mono: '#e8e0d0', muted: '#9a917f', ghost: '#2f2b23', ghost2: '#3d382e', accent: '#dba84f', ok: '#8cc56b' },
};
type Theme = typeof THEMES.light;

/* ---------- timeline (frames at 15 fps): src/timeline.json, which encode.mjs also reads for its palettes ---------- */
const S = TL.scenes;
const AT = {
  complaint: S.title,
  pick: S.title + S.complaint,
  tune: S.title + S.complaint + S.pick,
  preview: S.title + S.complaint + S.pick + S.tune,
  end: S.title + S.complaint + S.pick + S.tune + S.preview,
};
export const TOTAL = AT.end + S.title;

const fadeIn = (f: number, from: number, len = 4) => interpolate(f, [from, from + len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/* ---------- title card: identical at both ends, static at frame 0 so the loop has no jump ---------- */
const TitleCard: React.FC<{ t: Theme }> = ({ t }) => (
  <AbsoluteFill style={{ background: t.bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
    <Img src={staticFile('bird.png')} style={{ width: 72, height: 72, marginBottom: 6 }} />
    <div style={{ fontFamily: TITLE, fontWeight: 900, fontSize: 104, lineHeight: 1, color: t.ink, letterSpacing: -1 }}>Shared Profiles</div>
    <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 25, color: t.sub, marginTop: 18 }}>Turn one brand colour into a whole brand theme.</div>
  </AbsoluteFill>
);

/* ---------- the complaint, in the reader's words ---------- */
const Complaint: React.FC<{ t: Theme; f: number }> = ({ t, f }) => (
  <AbsoluteFill style={{ background: t.bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', opacity: fadeIn(f, 0) }}>
    <div style={{ fontFamily: TITLE, fontWeight: 900, fontSize: 74, lineHeight: 1.04, color: t.ink, letterSpacing: -0.5, textAlign: 'center' }}>The client’s brand?<br />One hex code.</div>
    <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 25, color: t.sub, marginTop: 20, opacity: fadeIn(f, 4) }}>And they still want posts, a site and a report that match.</div>
  </AbsoluteFill>
);

/* ---------- window chrome shared by the terminal and the browser ---------- */
const WIN_W = 960 - 24 - 3; // the content area: 933 px wide (12 px margin, 1.5 px border)
const Window: React.FC<{ t: Theme; title: string; children: React.ReactNode }> = ({ t, title, children }) => (
  <AbsoluteFill style={{ background: t.bg, padding: 12 }}>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t.win, border: `1.5px solid ${t.winLine}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ height: 34, flex: 'none', background: t.bar, borderBottom: `1.5px solid ${t.winLine}`, display: 'flex', alignItems: 'center', position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 6, background: t.dots }} />)}</div>
        <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: SANS, fontWeight: 600, fontSize: 14, color: t.barText }}>{title}</div>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>
    </div>
  </AbsoluteFill>
);

/* ---------- terminal lines ---------- */
type Line =
  | { at: number; kind: 'user'; text: string; type?: number }
  | { at: number; kind: 'ghost'; widths: number[]; bullet?: boolean; indent?: boolean }
  | { at: number; kind: 'tool'; text: string }
  | { at: number; kind: 'out'; text: string; strong?: boolean; dim?: boolean };

const Terminal: React.FC<{ t: Theme; f: number; lines: Line[] }> = ({ t, f, lines }) => (
  <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 7 }}>
    {lines.filter((l) => f >= l.at).map((l, i) => {
      if (l.kind === 'ghost') {
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '4px 0', paddingLeft: l.indent ? 22 : 0 }}>
            {l.widths.map((w, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 8, color: t.muted, fontFamily: MONO, fontSize: 13 }}>{l.bullet && j === 0 ? '●' : ''}</span>
                <span style={{ height: 8, width: w, borderRadius: 4, background: j === 0 && l.bullet ? t.ghost2 : t.ghost }} />
              </div>
            ))}
          </div>
        );
      }
      if (l.kind === 'user') {
        const n = l.type ? Math.floor(interpolate(f, [l.at, l.at + l.type], [0, l.text.length], { extrapolateRight: 'clamp' })) : l.text.length;
        return (
          <div key={i} style={{ background: t.row, borderRadius: 6, padding: '6px 10px', margin: '4px 0', fontFamily: MONO, fontSize: 15, color: t.ink }}>
            <span style={{ color: t.muted }}>{'> '}</span>{l.text.slice(0, n)}
            {n < l.text.length ? <span style={{ display: 'inline-block', width: 8, height: 16, marginLeft: 2, verticalAlign: -2, background: t.ink }} /> : null}
          </div>
        );
      }
      if (l.kind === 'tool') {
        return (
          <div key={i} style={{ fontFamily: MONO, fontSize: 13, color: t.mono, marginTop: 4, whiteSpace: 'pre' }}>
            <span style={{ color: t.accent }}>● </span>{l.text}
          </div>
        );
      }
      return (
        <div key={i} style={{ fontFamily: MONO, fontSize: 13, fontWeight: l.strong ? 600 : 400, color: l.dim ? t.muted : t.mono, whiteSpace: 'pre', borderLeft: `2.5px solid ${t.accent}`, paddingLeft: 12, marginLeft: 6 }}>
          {l.text}
        </div>
      );
    })}
  </div>
);

/* Copied from a real run (capture/capture.sh). The CLI indents everything by two spaces; that indent is dropped. */
const PICK: Line[] = [
  { at: 0, kind: 'user', text: 'Give Acme Plumbing & Heating a brand theme.', type: 10 },
  { at: 13, kind: 'ghost', widths: [540, 300], bullet: true },
  { at: 15, kind: 'ghost', widths: [420, 380, 440], indent: true },
  { at: 20, kind: 'user', text: 'Start from Stripe.', type: 5 },
  { at: 29, kind: 'tool', text: 'Bash(node scripts/ioc.mjs theme import stripe --business "Acme Plumbing & Heating")' },
  { at: 32, kind: 'out', strong: true, text: 'Imported Stripe for Acme Plumbing & Heating' },
  { at: 33, kind: 'out', dim: true, text: 'base mode: light (the other is derived)' },
  { at: 35, kind: 'out', dim: true, text: 'ROLE      TOKEN                 LIGHT             DARK' },
  { at: 36, kind: 'out', text: 'accent    primary               #533afd           #5342f3' },
  { at: 37, kind: 'out', text: 'onAccent  on-primary            #ffffff 6.2:1     #ffffff 6.1:1' },
  { at: 38, kind: 'out', text: 'ink       ink                   #0d253d 15.6:1    #d3e3f5 14.8:1' },
  { at: 40, kind: 'out', text: 'font display  Inter                for sohne-var — named as the substitute for sohne-var in the source' },
  { at: 41, kind: 'out', text: 'font text     Inter                for sohne-var — named as the substitute for sohne-var in the source' },
];
const TUNE: Line[] = [
  { at: 0, kind: 'ghost', widths: [560, 470, 260], bullet: true },
  { at: 4, kind: 'user', text: 'Their green is #0a7c66. Fraunces for headings.', type: 12 },
  { at: 19, kind: 'tool', text: 'Bash(node scripts/ioc.mjs theme set --business acme-plumbing-heating accent "#0a7c66" fonts.display Fraunces)' },
  { at: 22, kind: 'out', strong: true, text: 'Acme Plumbing & Heating: saved (revision 2).' },
  { at: 23, kind: 'out', dim: true, text: 'ROLE      TOKEN                 LIGHT             DARK' },
  { at: 24, kind: 'out', text: 'accent    primary               #0a7c66           #0a7c66' },
  { at: 25, kind: 'out', text: 'onAccent  on-primary            #ffffff 5.1:1     #ffffff 5.1:1' },
  { at: 30, kind: 'tool', text: 'Bash(node scripts/ioc.mjs theme build --business acme-plumbing-heating --open)' },
  // The CLI prints the full path; the start of it (the user's home folder) is cut.
  { at: 33, kind: 'out', text: 'built: …/businesses/acme-plumbing-heating/brand/preview.html  (revision 2)' },
];

/* ---------- the real preview page, in a browser window ---------- */
// top: the page as it opens (shown whole). Then "Side by side" is pressed and each layout is shown
// with the page cropped to its main column (shots.json has the crops, measured at capture time).
const CLICK = { appear: 9, from: 11, to: 19, press: 20 };
const SCENES = [
  { file: 'top', from: TL.previewShots.top },
  { file: 'social', from: TL.previewShots.social },
  { file: 'landing', from: TL.previewShots.landing },
  { file: 'report', from: TL.previewShots.report },
] as const;

const Cursor: React.FC<{ x: number; y: number; down: boolean }> = ({ x, y, down }) => (
  <svg width="22" height="30" viewBox="0 0 22 30" style={{ position: 'absolute', left: x - 3, top: y - 2, transform: `scale(${down ? 0.86 : 1})`, transformOrigin: '3px 2px', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.35))' }}>
    <path d="M3 2 L3 24 L8.6 18.6 L12.4 27.4 L16 25.8 L12.3 17.2 L19.8 17.2 Z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const Preview: React.FC<{ t: Theme; theme: ThemeName; f: number }> = ({ t, theme, f }) => {
  const meta = SHOTS[theme];
  const scene = [...SCENES].reverse().find((s) => f >= s.from)!;
  let img: React.ReactNode;
  if (scene.file === 'top') {
    const k = WIN_W / SHOTS.viewport.w;
    img = <Img src={staticFile(`shots/top-${theme}.png`)} style={{ position: 'absolute', left: 0, top: 0, width: SHOTS.viewport.w * k }} />;
  } else {
    const c = meta.crops[scene.file];
    const k = WIN_W / c.w;
    img = <Img src={staticFile(`shots/${scene.file}-${theme}.png`)} style={{ position: 'absolute', left: -c.x * k, top: -c.y * k, width: SHOTS.viewport.w * k }} />;
  }
  // The pointer glides to "Side by side" and presses it; the next shot is the result.
  const k0 = WIN_W / SHOTS.viewport.w;
  const target = { x: meta.both.x * k0 - 8, y: meta.both.y * k0 + 6 }; // tip just under the label, so it stays readable
  const start = { x: target.x + 190, y: target.y + 150 };
  const p = interpolate(f, [CLICK.from, CLICK.to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const showCursor = scene.file === 'top' && f >= CLICK.appear;
  const down = f >= CLICK.press && f < CLICK.press + 2;
  return (
    <Window t={t} title="preview.html">
      {img}
      {showCursor ? <Cursor x={start.x + (target.x - start.x) * p} y={start.y + (target.y - start.y) * p} down={down} /> : null}
    </Window>
  );
};

export const Demo: React.FC<{ theme: ThemeName }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const t = THEMES[theme];
  if (frame < AT.complaint) return <TitleCard t={t} />;
  if (frame < AT.pick) return <Complaint t={t} f={frame - AT.complaint} />;
  if (frame < AT.tune) return <AbsoluteFill style={{ background: t.bg }}><AbsoluteFill style={{ opacity: fadeIn(frame - AT.pick, 0) }}><Window t={t} title="shared-profiles"><Terminal t={t} f={frame - AT.pick} lines={PICK} /></Window></AbsoluteFill></AbsoluteFill>;
  if (frame < AT.preview) return <AbsoluteFill style={{ background: t.bg }}><AbsoluteFill style={{ opacity: fadeIn(frame - AT.tune, 0) }}><Window t={t} title="shared-profiles"><Terminal t={t} f={frame - AT.tune} lines={TUNE} /></Window></AbsoluteFill></AbsoluteFill>;
  if (frame < AT.end) return <AbsoluteFill style={{ background: t.bg }}><AbsoluteFill style={{ opacity: fadeIn(frame - AT.preview, 0) }}><Preview t={t} theme={theme} f={frame - AT.preview} /></AbsoluteFill></AbsoluteFill>;
  return <AbsoluteFill style={{ background: t.bg }}><AbsoluteFill style={{ opacity: fadeIn(frame - AT.end, 0) }}><TitleCard t={t} /></AbsoluteFill></AbsoluteFill>;
};
