// Checks dist/ before it is published. Any problem fails the workflow, so nothing broken or leaky goes live.
//  1. every local file/URL referenced by the pages and scripts exists (case-sensitive, like GitHub Pages);
//  2. nothing uses a root-absolute URL ("/api/..."), which would break under /<repo>/;
//  3. every module import (and the import map) resolves;
//  4. no secret leaked: the token / garden id from the environment must appear in no file, and no
//     .env / .git / node_modules content may be present.
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const problems = [];
const fail = (m) => problems.push(m);
const rel = (p) => path.relative(DIST, p).split(path.sep).join('/');

/** Exact-case existence (the dev machine may be Windows/macOS: case-insensitive). */
function existsExact(p) {
  const parts = path.relative(DIST, p).split(path.sep);
  let dir = DIST;
  for (const part of parts) {
    if (!fs.existsSync(dir) || !fs.readdirSync(dir).includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = walk(DIST);
const text = (p) => fs.readFileSync(p, 'utf8');
const isRemote = (u) => /^(https?:)?\/\//.test(u) || u.startsWith('data:') || u.startsWith('#') || u.startsWith('mailto:');
const clean = (u) => u.split('#')[0].split('?')[0];

// --- required files
for (const f of ['index.html', 'garden/index.html', 'garden/main.js', 'api/history.json', 'api/garden.json', 'api/layout.json', 'api/planting.json', 'data/plants.json', 'vendor/three/three.module.min.js']) {
  if (!existsExact(path.join(DIST, f))) fail(`missing required file: ${f}`);
}

// --- 1+2. HTML: src/href and the import map
const pages = files.filter((f) => f.endsWith('.html'));
const importMaps = {};
for (const page of pages) {
  const html = text(page), dir = path.dirname(page);
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const u = m[1];
    if (isRemote(u)) continue;
    if (u.startsWith('/')) { fail(`${rel(page)}: root-absolute URL "${u}" (breaks under /<repo>/)`); continue; }
    const target = path.join(dir, clean(u));
    if (clean(u) && !existsExact(target) && !(fs.existsSync(target) && fs.statSync(target).isDirectory() && existsExact(path.join(target, 'index.html')))) fail(`${rel(page)}: "${u}" does not exist`);
  }
  const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (map) {
    importMaps[page] = JSON.parse(map[1]).imports;
    for (const [k, v] of Object.entries(importMaps[page])) {
      if (v.startsWith('/')) fail(`${rel(page)}: import map "${k}" is root-absolute`);
      else if (!v.endsWith('/') && !existsExact(path.resolve(dir, v))) fail(`${rel(page)}: import map "${k}" → ${v} does not exist`);
    }
  }
}

// --- 2+3. JavaScript: imports, fetch() URLs, absolute URLs
const garden = path.join(DIST, 'garden');
const mapFor = importMaps[path.join(garden, 'index.html')] || {};
for (const js of files.filter((f) => f.endsWith('.js') && !rel(f).startsWith('vendor/'))) {
  const src = text(js), dir = path.dirname(js);
  const inGarden = js.startsWith(garden + path.sep);
  const docDir = inGarden ? garden : DIST; // fetch() URLs resolve against the page, not the script
  for (const m of src.matchAll(/(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (spec.startsWith('.')) { if (!existsExact(path.resolve(dir, spec))) fail(`${rel(js)}: import "${spec}" does not exist`); continue; }
    const key = Object.keys(mapFor).find((k) => (k.endsWith('/') ? spec.startsWith(k) : spec === k));
    if (!key) { fail(`${rel(js)}: bare import "${spec}" is not in the import map`); continue; }
    const target = path.resolve(garden, mapFor[key] + (key.endsWith('/') ? spec.slice(key.length) : ''));
    if (!existsExact(target)) fail(`${rel(js)}: import "${spec}" → ${rel(target)} does not exist`);
  }
  for (const m of src.matchAll(/(?:fetch|getJSON)\(\s*['"`]([^'"`$]+)['"`]/g)) {
    const u = m[1];
    if (isRemote(u)) continue;
    if (u.startsWith('/')) { fail(`${rel(js)}: root-absolute fetch "${u}"`); continue; }
    if (!existsExact(path.resolve(docDir, clean(u)))) fail(`${rel(js)}: fetch "${u}" → ${rel(path.resolve(docDir, clean(u)))} does not exist`);
  }
  for (const m of src.matchAll(/['"`](\/(?:api|vendor|data|garden)\/[^'"`]*)['"`]/g)) fail(`${rel(js)}: root-absolute path "${m[1]}"`);
}

// --- 4. secrets and private files
for (const f of files) {
  const r = rel(f);
  if (/(^|\/)(\.env|\.git|node_modules)(\/|$|\.)/.test(r) || /\.(pem|key)$/.test(r)) fail(`must not be published: ${r}`);
}
const secrets = { BIOTO_TOKEN: process.env.BIOTO_TOKEN, GARDEN_UUID: process.env.GARDEN_UUID };
for (const [name, value] of Object.entries(secrets)) {
  if (!value || value.length < 8) continue;
  for (const f of files) if (fs.readFileSync(f).includes(value)) fail(`SECRET LEAK: ${name} found in ${rel(f)}`);
}
const patterns = [[/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/, 'bearer token'], [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'UUID']];
for (const f of files.filter((p) => /\.(js|json|html|css|md|txt)$/.test(p) && !rel(p).startsWith('vendor/'))) {
  const src = text(f);
  for (const [re, what] of patterns) if (re.test(src)) fail(`${rel(f)}: looks like a ${what}`);
}

if (problems.length) {
  console.error(`[verify] ${problems.length} problem(s):\n - ` + problems.join('\n - '));
  process.exit(1);
}
const size = files.reduce((n, f) => n + fs.statSync(f).size, 0);
console.log(`[verify] dist OK: ${files.length} files, ${(size / 1e6).toFixed(1)} MB, all URLs/imports resolve, no secrets found.`);
