// Loads our own cached API routes. The browser never talks to api.bioto.co directly:
// the local server holds the token and enforces the "max once per hour" rule.

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* not JSON */ }
    throw new Error(`${url} gaf HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

function check(cond, msg) { if (!cond) throw new Error(`Onverwachte data: ${msg}`); }

export async function loadHistory() {
  const h = await getJSON('/api/history');
  check(Array.isArray(h.readings) && h.readings.length > 1, 'history.readings ontbreekt of is leeg');
  check(h.loc && Number.isFinite(h.loc.latitude), 'history.loc ontbreekt');
  return h;
}

export async function loadAll() {
  const [history, layout, planting] = await Promise.all([
    loadHistory(), getJSON('/api/layout'), getJSON('/api/planting'),
  ]);
  check(layout.type === 'FeatureCollection' && layout.features?.length, 'layout heeft geen vlakken');
  check(planting && typeof planting === 'object', 'planting is geen object');
  return { history, layout, planting };
}
