// Local server for Biotopia: serves the website and the same api/*.json files that GitHub Pages serves.
//
//   live mode  BIOTO_TOKEN and GARDEN_UUID are set in .env: data comes from the Bioto API, cached on disk
//              (at most one API request per clock hour, see lib/bioto.js). The token never leaves this process.
//   demo mode  no credentials: the snapshot in static-data/ is served, no API access needed.
const http = require('http');
const fs = require('fs/promises');
const path = require('path');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* no .env file: demo mode */ }

const LIVE = Boolean(process.env.BIOTO_TOKEN && process.env.GARDEN_UUID);
const bioto = LIVE ? require('./lib/bioto') : null;
const PORT = process.env.PORT || 3000;

const PUBLIC = path.join(__dirname, 'public');
const SNAPSHOT = path.join(__dirname, 'static-data');
const THREE = path.join(__dirname, 'node_modules', 'three');
// URL prefix -> directory on disk. Order matters: longest prefix first.
const STATIC = [
  ['/vendor/three/addons/', path.join(THREE, 'examples', 'jsm')],
  ['/vendor/three/', path.join(THREE, 'build')],
  ['/', PUBLIC],
];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
};

const readSnapshot = async (name) => JSON.parse(await fs.readFile(path.join(SNAPSHOT, `${name}.json`), 'utf8'));
const API = LIVE
  ? { garden: bioto.getGarden, history: bioto.getHistory, layout: bioto.getLayout, planting: bioto.getPlantingPlans }
  : {
    garden: async () => { const h = await readSnapshot('history'); return { ...h, readings: h.readings.slice(-7 * 24) }; },
    history: () => readSnapshot('history'),
    layout: () => readSnapshot('layout'),
    planting: () => readSnapshot('planting'),
  };

/** Serves a file from disk, with byte ranges (audio needs them to seek back to the start when it loops). */
async function serveStatic(pathname, req, res) {
  for (const [prefix, dir] of STATIC) {
    if (!pathname.startsWith(prefix)) continue;
    let rel = decodeURIComponent(pathname.slice(prefix.length));
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(dir, rel));
    if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
    const stat = await fs.stat(file);
    if (stat.isDirectory()) {
      // "/garden" -> "/garden/" so relative URLs resolve inside the folder.
      res.writeHead(301, { Location: `${pathname}/` });
      return res.end();
    }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const buf = await fs.readFile(file);
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, buf.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), buf.length - 1) : buf.length - 1;
      if (start > end || start >= buf.length) { res.writeHead(416, { 'Content-Range': `bytes */${buf.length}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': end - start + 1 });
      return res.end(buf.subarray(start, end + 1));
    }
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': buf.length });
    return res.end(buf);
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    const api = /^\/api\/(garden|history|layout|planting)\.json$/.exec(url.pathname);
    if (api) {
      const data = await API[api[1]]();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(data));
    }
    await serveStatic(url.pathname, req, res);
  } catch (err) {
    const notFound = err.code === 'ENOENT';
    if (!notFound) console.error(err);
    res.writeHead(notFound ? 404 : 502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: notFound ? 'not found' : err.message }));
  }
}).listen(PORT, () => {
  console.log(`Biotopia on http://localhost:${PORT} (${LIVE ? 'live data' : 'demo data: add BIOTO_TOKEN and GARDEN_UUID to .env for live data'})`);
});

if (LIVE) {
  // Keep the cache fresh once per hour (at :05) even when nobody has the page open.
  // getHistory() itself never calls the API more than once per clock hour.
  const refresh = () => bioto.getHistory().catch((err) => console.warn('[bioto] refresh failed:', err.message));
  const scheduleHourly = () => {
    const now = new Date(), next = new Date(now);
    next.setMinutes(5, 30, 0);
    if (next <= now) next.setHours(next.getHours() + 1);
    setTimeout(() => { refresh(); scheduleHourly(); }, next - now);
  };
  refresh();
  scheduleHourly();
}
