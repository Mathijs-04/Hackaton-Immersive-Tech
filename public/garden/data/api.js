// Loads our own copy of the data. The browser never talks to api.bioto.co directly:
//  - locally, server.js serves /api/*.json from its disk cache (token stays in .env);
//  - on GitHub Pages, a scheduled workflow writes the same files as static JSON (see PAGES.md).
// URLs are relative to /garden/ so both setups (and a /<repo>/ sub-path) work.

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' }); // always revalidate: new readings arrive hourly
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* not JSON */ }
    throw new Error(`${url} gaf HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

function check(cond, msg) { if (!cond) throw new Error(`Onverwachte data: ${msg}`); }

export async function loadHistory() {
  const h = await getJSON('../api/history.json');
  check(Array.isArray(h.readings) && h.readings.length > 1, 'history.readings ontbreekt of is leeg');
  check(h.loc && Number.isFinite(h.loc.latitude), 'history.loc ontbreekt');
  return h;
}

export async function loadAll() {
  const [history, layout, planting] = await Promise.all([
    loadHistory(), getJSON('../api/layout.json'), getJSON('../api/planting.json'),
  ]);
  check(layout.type === 'FeatureCollection' && layout.features?.length, 'layout heeft geen vlakken');
  check(planting && typeof planting === 'object', 'planting is geen object');
  return { history, layout, planting };
}
