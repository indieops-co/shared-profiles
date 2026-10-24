// pointers — the one line of Markdown the theme command owns in me.md and
// profile.md. The theme itself is JSON; this line is the human-readable record
// that it exists. Every other line in those files belongs to the user and to
// the Skilllets that wrote them, and is never touched here.

// The line, plus any indented lines it wraps onto.
const THEME_LINE = /^- \*\*Theme:\*\*.*(?:\n[ \t]+\S.*)*$/m;
const today = () => new Date().toISOString().slice(0, 10);

export function themeLine(displayName) {
  return displayName
    ? `- **Theme:** brand/theme.json (based on ${displayName}, from awesome-design-md) · open brand/preview.html to see or edit`
    : '- **Theme:** brand/theme.json · open brand/preview.html to see or edit';
}

export const BRAND_SECTION = (line) => `## Brand
How it looks — for anything that renders: reports, posts, pages, decks. The theme is the structured
version every Skilllet reads; the lines below are the same thing in words.

${line}
- **Fonts:**
- **Colours:**
- **Look, in a phrase:**
- **Logo file:** *(a path, if there is one)*
`;

function sectionBounds(md, heading) {
  const re = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
  const m = re.exec(md);
  if (!m) return null;
  const start = m.index;
  const after = md.slice(start + m[0].length);
  const next = after.search(/^## /m);
  return { start, bodyStart: start + m[0].length, end: next === -1 ? md.length : start + m[0].length + next };
}

/** Put (or replace) the Theme line. Returns { md, changed }. */
export function setThemePointer(md, kind, line) {
  const heading = kind === 'me' ? 'Brand defaults' : 'Brand';
  let out = md;
  const sec = sectionBounds(out, heading);
  if (sec) {
    const body = out.slice(sec.bodyStart, sec.end);
    let nb;
    if (THEME_LINE.test(body)) nb = body.replace(THEME_LINE, line);
    else {
      const i = body.search(/^- \*\*/m);
      nb = i === -1 ? body.replace(/\s*$/, `\n\n${line}\n\n`) : body.slice(0, i) + line + '\n' + body.slice(i);
    }
    out = out.slice(0, sec.bodyStart) + nb + out.slice(sec.end);
  } else {
    const block = kind === 'me' ? `## Brand defaults\nFor anything that renders — courses, publications, reports, graphics.\n\n${line}\n` : BRAND_SECTION(line);
    const before = ['Voice', 'Working preferences', 'Unknown', 'Never here', 'Not here'].map((h) => sectionBounds(out, h)).find(Boolean);
    out = before ? out.slice(0, before.start) + block + '\n' + out.slice(before.start) : out.replace(/\s*$/, '\n\n') + block;
  }
  const changed = out !== md;
  if (changed) {
    out = out.replace(/^Last updated:\s*[^\n·]*?(\s*·|$)/m, (m0, tail) => `Last updated: ${today()}${tail}`);
    if (kind !== 'me') out = out.replace(/(^Last updated:[^\n]*·\s*Last touched by:\s*)[^\n]*/m, '$1shared-profiles');
  }
  return { md: out, changed };
}

/** The free-text Fonts / Colours / Look lines, so a disagreement can be raised, not overwritten. */
export function freeText(md, kind) {
  const sec = sectionBounds(md, kind === 'me' ? 'Brand defaults' : 'Brand');
  if (!sec) return {};
  const body = md.slice(sec.bodyStart, sec.end);
  const get = (label) => body.match(new RegExp(`^- \\*\\*${label}[^*]*:\\*\\*[ \\t]*(.*)$`, 'm'))?.[1].replace(/\*\(.*?\)\*/g, '').trim() || '';
  return { fonts: get('Fonts'), colours: get('Colours'), look: get('Look'), logo: get('Logo file') };
}

export function readField(md, label) {
  return md.match(new RegExp(`^- \\*\\*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^*]*:\\*\\*[ \\t]*(.*)$`, 'm'))?.[1].replace(/\*\(.*?\)\*/g, '').trim() || '';
}
