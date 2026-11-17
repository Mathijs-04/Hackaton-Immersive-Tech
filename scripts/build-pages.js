// Builds the static GitHub Pages site into dist/.  See PAGES.md.
//
//   node scripts/build-pages.js             no API call: uses the data already published/committed
//   node scripts/build-pages.js --refresh   one request to the Bioto API (needs BIOTO_TOKEN + GARDEN_UUID)
//
// API budget (this script is the only thing on GitHub that talks to Bioto):
//   - exactly ONE request per run (/partner/garden/{uuid}/): layout and planting plan are committed
//     once in static-data/ and never fetched again;
//   - only inside the window in pages.config.json ("activeUntil"); after that it never calls the API;
//   - skipped when the published site was refreshed less than 45 minutes ago (double triggers, manual runs);
//   - at most 2 attempts, and only for server errors / network errors (never retried on 4xx).
// Secrets only exist in this process: the token is sent as a header, never written to a file or logged.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STATIC = path.join(ROOT, 'static-data');
const HOUR = 3600e3;
const KEEP_READINGS = 21 * 24;       // keep three weeks of hourly readings
const COOLDOWN_MS = 45 * 60e3;
const API_BASE = process.env.API_BASE || 'https://api.bioto.co';
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(data)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[pages]', ...a);
const warn = (msg) => console.log(`::warning::${msg}`);

const isHistory = (h) => h && Array.isArray(h.readings) && h.readings.length > 1 && h.loc && Number.isFinite(h.loc.latitude);

/** JSON from the published site (previous deploy), or null. Used to keep history and to rate-limit. */
async function fromSite(file) {
  if (!SITE_URL) return null;
  try {
    const res = await fetch(`${SITE_URL}/api/${file}?t=${Date.now()}`, { signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

/** One request to the Bioto API. Error messages never contain the URL (it holds the garden id). */
async function fetchGarden() {
  const { BIOTO_TOKEN, GARDEN_UUID } = process.env;
  if (!BIOTO_TOKEN || !GARDEN_UUID) throw new Error('BIOTO_TOKEN and GARDEN_UUID must be set (repository secrets)');
  let last;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/partner/garden/${GARDEN_UUID}/`, {
        headers: { Authorization: `Bearer ${BIOTO_TOKEN}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return await res.json();
      last = new Error(`Bioto API answered HTTP ${res.status}`);
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw Object.assign(last, { fatal: true }); // bad token etc.: don't retry
    } catch (e) {
      if (e.fatal) throw e;
      last = e.message?.startsWith('Bioto API') ? e : new Error(`Bioto API not reachable (${e.name || 'error'})`);
    }
    if (attempt < 2) { log(`attempt ${attempt} failed (${last.message}); one more try in 30 s`); await sleep(Number(process.env.PAGES_RETRY_MS) || 30000); }
  }
  throw last;
}

function merge(...lists) {
  const byTime = new Map();
  for (const list of lists) for (const r of list || []) byTime.set(r.datetime, r);
  return [...byTime.values()].sort((a, b) => a.datetime.localeCompare(b.datetime)).slice(-KEEP_READINGS);
}

function copyVendor() {
  const three = path.join(ROOT, 'node_modules', 'three');
  const out = path.join(DIST, 'vendor', 'three');
  const files = [
    ['build/three.module.min.js', 'three.module.min.js'],
    ['examples/jsm/controls/OrbitControls.js', 'addons/controls/OrbitControls.js'],
    ['examples/jsm/utils/BufferGeometryUtils.js', 'addons/utils/BufferGeometryUtils.js'],
  ];
  for (const [from, to] of files) {
    fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
    fs.copyFileSync(path.join(three, from), path.join(out, to));
  }
  fs.copyFileSync(path.join(three, 'LICENSE'), path.join(out, 'LICENSE'));
}

async function main() {
  const config = readJSON(process.env.PAGES_CONFIG || path.join(ROOT, 'pages.config.json')); // PAGES_CONFIG: tests only
  const until = config.activeUntil ? Date.parse(config.activeUntil) : 0;
  const inWindow = Date.now() < until;
  let refresh = process.argv.includes('--refresh');

  // 1. Static parts: the front end, plus Three.js and the area layout / planting plan.
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });
  copyVendor();
  const layout = readJSON(path.join(STATIC, 'layout.json'));
  const planting = readJSON(path.join(STATIC, 'planting.json'));

  // 2. Data we already have: the committed snapshot plus whatever the live site currently serves.
  const committed = readJSON(path.join(STATIC, 'history.json'));
  const published = await fromSite('history.json');
  const meta = await fromSite('meta.json');
  const base = isHistory(published) ? published : committed;
  let readings = merge(committed.readings, isHistory(published) ? published.readings : []);
  let refreshedAt = meta?.refreshedAt || null;
  log(`existing data: ${readings.length} readings, published site ${isHistory(published) ? 'reachable' : 'not reachable (using committed snapshot)'}`);

  // 3. Fresh data: one API request, only when allowed.
  let refreshed = false;
  if (refresh && !inWindow) { log(`outside the active window (until ${config.activeUntil || 'not set'}): NOT calling the API`); refresh = false; }
  if (refresh && refreshedAt && Date.now() - Date.parse(refreshedAt) < COOLDOWN_MS) {
    log(`site was refreshed ${Math.round((Date.now() - Date.parse(refreshedAt)) / 60e3)} min ago (< 45 min): NOT calling the API`);
    refresh = false;
  }
  if (refresh) {
    try {
      const garden = await fetchGarden();
      if (!Array.isArray(garden.readings) || !garden.readings.length) throw new Error('Bioto API answer has no readings');
      readings = merge(readings, garden.readings);
      base.name = garden.name || base.name;
      base.loc = garden.loc || base.loc;
      refreshed = true;
      refreshedAt = new Date().toISOString();
      log(`API request ok: ${garden.readings.length} readings received, ${readings.length} in total`);
    } catch (e) {
      // Keep the site working with the data we have; the next run tries again.
      warn(`Could not refresh data: ${e.message}. Deploying the existing data.`);
    }
  }

  // 4. Write the data files (same names the local server answers with).
  const history = { name: base.name, loc: { latitude: base.loc.latitude, longitude: base.loc.longitude, height: base.loc.height ?? null }, readings };
  writeJSON(path.join(DIST, 'api', 'history.json'), history);
  writeJSON(path.join(DIST, 'api', 'garden.json'), { ...history, readings: readings.slice(-7 * 24) }); // the 2D dashboard shows the last 7 days
  writeJSON(path.join(DIST, 'api', 'layout.json'), layout);
  writeJSON(path.join(DIST, 'api', 'planting.json'), planting);
  writeJSON(path.join(DIST, 'api', 'meta.json'), {
    builtAt: new Date().toISOString(), refreshedAt, refreshedThisRun: refreshed, readings: readings.length,
    newestReading: readings[readings.length - 1].datetime, activeUntil: config.activeUntil || null,
  });
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
  log(`site built in dist/ (newest reading ${readings[readings.length - 1].datetime}, refreshed this run: ${refreshed})`);
}

main().catch((e) => { console.error('[pages] build failed:', e.message); process.exit(1); });
