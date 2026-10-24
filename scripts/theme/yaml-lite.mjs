// yaml-lite — the YAML subset that DESIGN.md front matter uses. Not a YAML parser.
//
// Supported: nested maps by indentation, plain / "double" / 'single' scalars,
// block scalars (| |- |+ > >- >+), full-line and trailing comments.
// Refused, with the file and line: lists, flow collections, anchors, tabs.
// A format change upstream should fail loudly here, not quietly produce a theme
// with half its tokens missing.

export class YamlLiteError extends Error {}

/** Split "---\n<yaml>\n---\n<body>". No front matter → { yaml: null, body }. */
export function splitFrontMatter(text) {
  const s = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = s.split('\n');
  if (lines[0].trimEnd() !== '---') return { yaml: null, body: s };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') {
      return { yaml: lines.slice(1, i).join('\n'), body: lines.slice(i + 1).join('\n'), bodyLine: i + 2 };
    }
  }
  return { yaml: null, body: s };
}

const isBlank = (l) => /^\s*(#.*)?$/.test(l);

export function parseYaml(src, file = 'front matter', lineOffset = 2) {
  const lines = String(src).split('\n');
  const root = {};
  const warnings = [];
  const stack = [{ indent: -1, obj: root }];
  const fail = (i, msg) => { throw new YamlLiteError(`${file}:${i + lineOffset}: ${msg}`); };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (isBlank(raw)) continue;
    const lead = raw.match(/^[ \t]*/)[0];
    if (lead.includes('\t')) fail(i, 'tab in indentation');
    const indent = lead.length;
    const line = raw.slice(indent);

    if (line === '-' || line.startsWith('- ')) fail(i, 'lists are not supported in DESIGN.md front matter');
    if (/^[&*!]/.test(line)) fail(i, 'anchors, aliases and tags are not supported');

    // Key: quoted, or everything up to the first ":" followed by a space or the end.
    let key, rest;
    const q = line.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')\s*:(?:\s+|$)/);
    if (q) {
      key = unquote(q[1]);
      rest = line.slice(q[0].length);
    } else {
      const m = line.match(/^(.*?):(?:\s+|$)/);
      if (!m || !m[1].trim()) fail(i, `expected "key: value", got ${JSON.stringify(line.slice(0, 60))}`);
      key = m[1].trim();
      rest = line.slice(m[0].length);
    }

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent.childIndent !== undefined && indent !== parent.childIndent) {
      fail(i, `inconsistent indentation (expected ${parent.childIndent} spaces, got ${indent})`);
    }
    parent.childIndent = indent;
    const target = parent.obj;
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      warnings.push(`${file}:${i + lineOffset}: duplicate key "${key}" (last one wins)`);
    }

    const value = rest.replace(/\s+$/, '');

    // Block scalar.
    const block = value.match(/^([|>])([+-]?)(\s+#.*)?$/);
    if (block) {
      const collected = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (!l.trim()) { collected.push(''); continue; }
        if (l.match(/^ */)[0].length <= indent) break;
        collected.push(l);
      }
      while (collected.length && collected[collected.length - 1] === '') collected.pop();
      const strip = Math.min(...collected.filter((l) => l).map((l) => l.match(/^ */)[0].length));
      const body = collected.map((l) => l.slice(Number.isFinite(strip) ? strip : 0));
      let text = block[1] === '|'
        ? body.join('\n')
        : body.join('\n').split(/\n{2,}/).map((p) => p.split('\n').join(' ')).join('\n');
      if (block[2] !== '-') text += '\n';
      target[key] = text;
      i = j - 1;
      continue;
    }

    if (value === '' || /^#/.test(value) && !/^#[0-9a-fA-F]{3,8}\b/.test(value)) {
      // Nested map, or an empty value if nothing deeper follows.
      let j = i + 1;
      while (j < lines.length && isBlank(lines[j])) j++;
      const nextIndent = j < lines.length ? lines[j].match(/^ */)[0].length : -1;
      if (nextIndent > indent) {
        const obj = {};
        target[key] = obj;
        stack.push({ indent, obj });
      } else {
        target[key] = null;
      }
      continue;
    }

    target[key] = scalar(value, (msg) => fail(i, msg), (msg) => warnings.push(`${file}:${i + lineOffset}: ${msg}`));
  }
  return { data: root, warnings };
}

function unquote(tok) {
  if (tok.startsWith('"')) {
    try { return JSON.parse(tok); } catch { return tok.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\'); }
  }
  return tok.slice(1, -1).replace(/''/g, "'");
}

function scalar(v, fail, warn) {
  if (v.startsWith('"')) {
    const m = v.match(/^"((?:[^"\\]|\\.)*)"(.*)$/);
    if (!m) fail('unterminated double-quoted string');
    if (m[2].trim() && !/^\s+#/.test(m[2])) fail(`unexpected text after quoted string: ${JSON.stringify(m[2].slice(0, 40))}`);
    return unquote(`"${m[1]}"`);
  }
  if (v.startsWith("'")) {
    const m = v.match(/^'((?:[^']|'')*)'(.*)$/);
    if (!m) fail('unterminated single-quoted string');
    if (m[2].trim() && !/^\s+#/.test(m[2])) fail(`unexpected text after quoted string: ${JSON.stringify(m[2].slice(0, 40))}`);
    return m[1].replace(/''/g, "'");
  }
  if (/^[[{]/.test(v)) {
    // "{colors.primary}" left unquoted is a flow map to real YAML. Upstream always
    // quotes refs; accept a bare ref with a warning rather than failing the import.
    if (/^\{[a-z]+\.[^{}\s]+\}$/.test(v)) { warn(`unquoted token ref ${v}`); return v; }
    fail('flow collections ({…} / […]) are not supported');
  }
  const plain = v.replace(/\s+#.*$/, '').trim();
  if (/^-?\d+(\.\d+)?$/.test(plain)) return Number(plain);
  if (plain === 'true') return true;
  if (plain === 'false') return false;
  if (plain === 'null' || plain === '~') return null;
  return plain;
}
