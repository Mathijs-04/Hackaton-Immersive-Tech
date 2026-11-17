// Polite Bioto API client: local JSON cache, max 1 request/second,
// exponential backoff on errors, never retries in a tight loop.
const fs = require('fs/promises');
const path = require('path');

const BASE = process.env.API_BASE || 'https://api.bioto.co';
const TOKEN = process.env.BIOTO_TOKEN;
const UUID = process.env.GARDEN_UUID;
const DATA_DIR = path.join(__dirname, '..', 'data');
const MIN_GAP_MS = 1100;          // < 1 request per second
const MAX_RETRIES = 4;            // 10s, 20s, 40s, 80s
const BASE_BACKOFF_MS = 10_000;

if (!TOKEN || !UUID) throw new Error('BIOTO_TOKEN and GARDEN_UUID must be set in .env');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Serialise all requests through one queue so we can never burst.
let queue = Promise.resolve();
let lastRequest = 0;
function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

async function request(apiPath) {
  let delay = BASE_BACKOFF_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await throttled(() =>
        fetch(BASE + apiPath, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } })
      );
      if (res.ok) return await res.json();
      // Client errors (bad token, unknown id) won't fix themselves: don't retry, except 429.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw Object.assign(new Error(`HTTP ${res.status} for ${apiPath}`), { fatal: true });
      }
      throw new Error(`HTTP ${res.status} for ${apiPath}`);
    } catch (err) {
      if (err.fatal || attempt >= MAX_RETRIES) throw err;
      console.warn(`[bioto] ${err.message}; retry ${attempt + 1}/${MAX_RETRIES} in ${delay / 1000}s`);
      await sleep(delay);
      delay *= 2;
    }
  }
}

async function readCache(name) {
  try {
    const file = path.join(DATA_DIR, name);
    const [text, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
    return { data: JSON.parse(text), mtime: stat.mtimeMs };
  } catch { return null; }
}

async function writeCache(name, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, name), JSON.stringify(data, null, 2));
}

// Static data (layout, planting plan): fetched once, then always from disk.
async function getStatic(name, apiPath) {
  const cached = await readCache(name);
  if (cached) return cached.data;
  const data = await request(apiPath);
  await writeCache(name, data);
  return data;
}

const getLayout = () => getStatic('layout.json', `/partner/garden/${UUID}/layout`);

async function getPlantingPlans() {
  const cached = await readCache('planting.json');
  if (cached) return cached.data;
  const layout = await getLayout();
  const refs = [...new Set(layout.features.map((f) => f.properties?.area_ref ?? f.properties?.ref ?? f.id).filter(Boolean))];
  const plans = {};
  for (const ref of refs) plans[ref] = await request(`/partner/garden/${UUID}/layout/${encodeURIComponent(ref)}`);
  await writeCache('planting.json', plans);
  return plans;
}

// Live data: refresh at most once per clock hour, a few minutes after the hour.
const REFRESH_AFTER_MIN = 5;
function lastDueTime(now = new Date()) {
  const d = new Date(now);
  d.setMinutes(REFRESH_AFTER_MIN, 0, 0);
  if (d > now) d.setHours(d.getHours() - 1);
  return d.getTime();
}

let inflight = null;
async function getGarden({ force = false } = {}) {
  const cached = await readCache('garden.json');
  const stale = !cached || cached.mtime < lastDueTime();
  if (cached && !stale && !force) return cached.data;
  if (!inflight) {
    inflight = request(`/partner/garden/${UUID}/`)
      .then(async (data) => { await writeCache('garden.json', data); return data; })
      .finally(() => { inflight = null; });
  }
  try { return await inflight; }
  catch (err) {
    if (cached) { console.warn('[bioto] using stale garden.json:', err.message); return cached.data; }
    throw err;
  }
}

// History: every reading we have ever seen, merged by datetime. The API only returns a
// rolling 7-day window, so this lets the timeline grow without any extra API calls.
async function getHistory() {
  const garden = await getGarden();
  const cached = await readCache('history.json');
  const byTime = new Map((cached?.data.readings || []).map((r) => [r.datetime, r]));
  const before = byTime.size;
  let changed = !cached;
  for (const r of garden.readings) {
    const prev = byTime.get(r.datetime);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(r)) { byTime.set(r.datetime, r); changed = true; }
  }
  const history = {
    name: garden.name,
    loc: garden.loc,
    readings: [...byTime.values()].sort((a, b) => a.datetime.localeCompare(b.datetime)),
  };
  if (changed) {
    await writeCache('history.json', history);
    if (cached) console.log(`[bioto] history: ${before} → ${history.readings.length} readings`);
  }
  return history;
}

module.exports = { getGarden, getLayout, getPlantingPlans, getHistory };
