// Local server: serves the dashboards and a tiny JSON API backed by the disk cache.
// The Bioto token never leaves this process (it is not sent to the browser).
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { getGarden, getLayout, getPlantingPlans, getHistory } = require('./lib/bioto');

const PUBLIC = path.join(__dirname, 'public');
const THREE = path.join(__dirname, 'node_modules', 'three');
// URL prefix → directory on disk. Order matters: longest prefix first.
const STATIC = [
  ['/vendor/three/addons/', path.join(THREE, 'examples', 'jsm')],
  ['/vendor/three/', path.join(THREE, 'build')],
  ['/', PUBLIC],
];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
};

const routes = {
  '/api/garden': getGarden,
  '/api/history': getHistory,
  '/api/layout': getLayout,
  '/api/planting': getPlantingPlans,
};

async function serveStatic(pathname, res) {
  for (const [prefix, dir] of STATIC) {
    if (!pathname.startsWith(prefix)) continue;
    let rel = decodeURIComponent(pathname.slice(prefix.length));
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(dir, rel));
    if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
    const stat = await fs.stat(file);
    if (stat.isDirectory()) {
      // "/garden" → "/garden/" so relative URLs resolve inside the folder.
      res.writeHead(301, { Location: pathname + '/' });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    return res.end(await fs.readFile(file));
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (routes[url.pathname]) {
      const data = await routes[url.pathname]();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(data));
    }
    await serveStatic(url.pathname, res);
  } catch (err) {
    const notFound = err.code === 'ENOENT';
    if (!notFound) console.error(err);
    res.writeHead(notFound ? 404 : 502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: notFound ? 'not found' : err.message }));
  }
}).listen(process.env.PORT || 3000, () => console.log(`Dashboard on http://localhost:${process.env.PORT || 3000}`));

// Live data: refresh the cache once per hour at :05, even when no one has the page open, so the
// garden always opens on the current hour. getHistory() itself never calls the API more than
// once per clock hour (see lib/bioto.js).
function scheduleHourly() {
  const now = new Date(), next = new Date(now);
  next.setMinutes(5, 30, 0);
  if (next <= now) next.setHours(next.getHours() + 1);
  setTimeout(async () => {
    try { await getHistory(); } catch (err) { console.warn('[bioto] hourly refresh failed:', err.message); }
    scheduleHourly();
  }, next - now);
}
getHistory().catch((err) => console.warn('[bioto] startup refresh failed:', err.message));
scheduleHourly();
