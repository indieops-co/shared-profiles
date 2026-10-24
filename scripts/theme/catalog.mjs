// catalog — where themes come from: github.com/VoltAgent/awesome-design-md (MIT).
//
// Fetched live, never cached: the collection grows most weeks. Every import pins
// the commit it came from. IOC_THEME_SOURCE_DIR points at a local copy laid out
// like the repo (README.md, LICENSE, design-md/<folder>/DESIGN.md) — for tests,
// and for anyone behind a proxy Node's fetch can't use (or use --file).

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const REPO = 'VoltAgent/awesome-design-md';
export const REPO_URL = `https://github.com/${REPO}`;
const RAW = (ref, path) => `https://raw.githubusercontent.com/${REPO}/${ref}/${path}`;
const API = `https://api.github.com/repos/${REPO}`;
const MAX = 512 * 1024;

export class NetworkError extends Error {}

const FOLDER = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
export const isFolderName = (s) => typeof s === 'string' && FOLDER.test(s) && !s.includes('..');

async function get(url, { accept, timeout = 15000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'indieops-shared-profiles', ...(accept ? { Accept: accept } : {}) } });
    if (r.status === 404) return null;
    if (!r.ok) throw new NetworkError(`${url} answered HTTP ${r.status}${r.status === 403 ? ' (GitHub rate limit? try again in a few minutes)' : ''}`);
    if (Number(r.headers.get('content-length') || 0) > MAX) throw new NetworkError(`${url} is larger than ${MAX / 1024} KB — refusing it`);
    const text = await r.text();
    if (text.length > MAX) throw new NetworkError(`${url} is larger than ${MAX / 1024} KB — refusing it`);
    return text;
  } catch (e) {
    if (e instanceof NetworkError) throw e;
    throw new NetworkError(`couldn't reach ${new URL(url).host}: ${e.name === 'AbortError' ? 'timed out after 15s' : e.cause?.code || e.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function readLocal(path) {
  try { return await readFile(path, 'utf8'); } catch { return null; }
}

/** The source of themes: GitHub, or a local mirror. */
export function themeSource(env = process.env) {
  const dir = env.IOC_THEME_SOURCE_DIR;
  if (dir) {
    return {
      label: `local copy at ${dir}`,
      readme: () => readLocal(join(dir, 'README.md')),
      folders: async () => (await readdir(join(dir, 'design-md'), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name),
      commit: async () => null,
      designMd: (ref, folder) => readLocal(join(dir, 'design-md', folder, 'DESIGN.md')),
      license: () => readLocal(join(dir, 'LICENSE')),
    };
  }
  return {
    label: 'github.com/' + REPO,
    readme: () => get(RAW('main', 'README.md')),
    folders: async () => {
      const t = await get(`${API}/contents/design-md`, { accept: 'application/vnd.github+json' });
      return t ? JSON.parse(t).filter((x) => x.type === 'dir').map((x) => x.name) : [];
    },
    commit: async () => {
      try { const t = await get(`${API}/commits/main`, { accept: 'application/vnd.github.sha' }); return t && /^[0-9a-f]{40}$/.test(t.trim()) ? t.trim() : null; } catch { return null; }
    },
    designMd: (ref, folder) => get(RAW(ref || 'main', `design-md/${encodeURIComponent(folder)}/DESIGN.md`)),
    license: (ref) => get(RAW(ref || 'main', 'LICENSE')),
  };
}

/** README "## Collection" → [{ folder, name, category, blurb }]. */
export function parseReadme(md) {
  const out = [];
  let on = false, cat = null, cur = null;
  for (const l of String(md || '').split('\n')) {
    if (/^##\s+Collection\b/i.test(l)) { on = true; continue; }
    if (!on) continue;
    if (/^##\s+/.test(l)) break;
    const h = l.match(/^###\s+(.+?)\s*$/);
    if (h) { cat = h[1].trim(); cur = null; continue; }
    const m = l.match(/^\s*[-*]\s+\[\*\*(.+?)\*\*\]\((https?:\/\/[^)\s]+)\)\s*(?:[-–—:]\s*)?(.*)$/);
    if (m) {
      const folder = m[2].match(/getdesign\.md\/([^/]+)\/design-md/)?.[1] || m[2].match(/design-md\/([^/)]+)/)?.[1];
      cur = folder && isFolderName(folder) ? { folder, name: m[1].trim(), category: cat || 'Other', blurb: m[3].trim(), page: m[2] } : null;
      if (cur) out.push(cur);
      continue;
    }
    if (cur && l.trim() && /^\s{2,}\S/.test(l)) cur.blurb += ' ' + l.trim();
    else if (!l.trim()) cur = null;
  }
  return out;
}

const title = (folder) => folder.replace(/\.(app|ai|com|io)$/, '').split(/[-_.]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** The README's entries, plus any folder the README forgot (it lags the folders). */
export async function loadCatalog(src) {
  const [readme, folders] = await Promise.all([src.readme(), src.folders()]);
  const listed = parseReadme(readme);
  const set = new Set(folders);
  const entries = listed.filter((e) => !folders.length || set.has(e.folder));
  const known = new Set(entries.map((e) => e.folder));
  for (const f of folders) if (!known.has(f) && isFolderName(f)) entries.push({ folder: f, name: title(f), category: 'Other', blurb: '', page: `https://getdesign.md/${f}/design-md` });
  return entries;
}

/** "linear" → linear.app, "Mistral" → mistral.ai. Returns every match, best first. */
export function matchCatalog(entries, query) {
  const q = String(query).trim().toLowerCase();
  const n = (s) => s.toLowerCase();
  const tiers = [
    (e) => n(e.folder) === q,
    (e) => n(e.name) === q,
    (e) => n(e.folder).split('.')[0] === q,
    (e) => n(e.folder).startsWith(q) || n(e.name).startsWith(q),
    (e) => n(e.folder).includes(q) || n(e.name).includes(q),
  ];
  for (const t of tiers) { const hits = entries.filter(t); if (hits.length) return hits; }
  return [];
}
