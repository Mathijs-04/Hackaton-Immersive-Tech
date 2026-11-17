const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const getJSON = async (u) => { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); };
const fmtTime = (iso) => new Date(iso).toLocaleString('nl-NL', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let charts = [];
function line(canvasId, labels, datasets) {
  charts.push(new Chart($(canvasId), {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((d) => ({
        ...d, borderColor: css(d.color), backgroundColor: css(d.color),
        borderWidth: 2, pointRadius: 0, tension: 0.25, spanGaps: true,
      })),
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: datasets.length > 1 } },
      scales: { x: { ticks: { maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false } } },
    },
  }));
}

function kpi(label, value, unit, prev) {
  const d = value != null && prev != null ? value - prev : null;
  return `<div class="card kpi"><div class="label">${label}</div>
    <div class="value">${value ?? '–'}<span class="unit"> ${unit}</span></div>
    <div class="delta">${d == null ? '' : (d >= 0 ? '+' : '') + d.toFixed(1) + ' t.o.v. vorig uur'}</div></div>`;
}

function renderReadings(garden) {
  charts.forEach((c) => c.destroy());
  charts = [];
  const r = [...garden.readings].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const last = r.at(-1), prev = r.at(-2) || {};
  const labels = r.map((x) => fmtTime(x.datetime));
  $('title').textContent = `Biotopia · ${garden.name}`;
  $('status').textContent = `Laatste meting: ${fmtTime(last.datetime)} · ${r.length} uurwaarden · data lokaal opgeslagen, max. 1× per uur ververst`;
  $('kpis').innerHTML =
    kpi('Lucht', last.air?.temperature, '°C', prev.air?.temperature) +
    kpi('Luchtvochtigheid', last.air?.humidity, '%', prev.air?.humidity) +
    kpi('Bodem', last.soil?.temperature, '°C', prev.soil?.temperature) +
    kpi('Bodemvocht', last.soil?.humidity, '', prev.soil?.humidity) +
    kpi('Licht (clear)', last.light?.clear, '', prev.light?.clear);
  line('cAirT', labels, [{ label: 'Lucht', data: r.map((x) => x.air?.temperature), color: '--c1' }]);
  line('cAirH', labels, [{ label: 'Vochtigheid', data: r.map((x) => x.air?.humidity), color: '--c2' }]);
  line('cSoilT', labels, [{ label: 'Bodem', data: r.map((x) => x.soil?.temperature), color: '--c3' }]);
  line('cSoilH', labels, [{ label: 'Bodemvocht', data: r.map((x) => x.soil?.humidity), color: '--c5' }]);
  line('cLight', labels, [
    { label: 'Clear', data: r.map((x) => x.light?.clear), color: '--c4' },
    { label: 'NIR', data: r.map((x) => x.light?.nir), color: '--c1' },
  ]);
  const bands = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];
  charts.push(new Chart($('cSpec'), {
    type: 'bar',
    data: {
      labels: bands.map((b) => b.toUpperCase()),
      datasets: [{ data: bands.map((b) => last.light?.[b]), backgroundColor: css('--green') }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } } },
  }));
}

function renderMap(layout, garden) {
  const map = L.map('map');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 21, maxNativeZoom: 19, attribution: '© OpenStreetMap',
  }).addTo(map);
  const gj = L.geoJSON(layout, {
    style: { color: css('--green'), weight: 2, fillOpacity: 0.35 },
    onEachFeature: (f, l) => l.bindPopup(`Vlak (${esc(f.properties.type)}), ${Math.round(f.properties.surface)} m²`),
  }).addTo(map);
  map.fitBounds(gj.getBounds(), { maxZoom: 20, padding: [20, 20] });
  if (garden.loc) {
    L.circleMarker([garden.loc.latitude, garden.loc.longitude], { radius: 6, color: css('--c1'), fillOpacity: 1 })
      .addTo(map).bindTooltip('Plantenluisteraar');
  }
}

function renderPlants(plans) {
  const rows = Object.values(plans).flat().sort((a, b) => (b.planted_on || '').localeCompare(a.planted_on || ''));
  $('plants').innerHTML = '<table><tr><th>Plant</th><th>Aantal</th><th>Stadium</th><th>Geplant</th></tr>' +
    rows.map((p) => `<tr><td>${esc(p.plant.vernacular_name || p.plant.name)}<br><i class="sub">${esc(p.plant.name)}</i></td>
      <td>${p.amount ?? '–'}</td><td>${esc(p.stage)}</td><td>${esc(p.planted_on)}</td></tr>`).join('') + '</table>';
}

// No polling: load once, then reload once an hour a few minutes past the hour.
// The server answers from its disk cache and only calls Bioto when data is out of date.
let mapDone = false;
async function load() {
  try {
    const [garden, layout, plans] = await Promise.all([getJSON('api/garden.json'), getJSON('api/layout.json'), getJSON('api/planting.json')]);
    renderReadings(garden);
    if (!mapDone) { renderMap(layout, garden); renderPlants(plans); mapDone = true; }
  } catch (e) { $('status').innerHTML = `<span class="err">Fout: ${esc(e.message)}</span>`; }
}
function scheduleNext() {
  const n = new Date(), t = new Date(n);
  t.setMinutes(6, 0, 0);
  if (t <= n) t.setHours(t.getHours() + 1);
  setTimeout(async () => { await load(); scheduleNext(); }, t - n);
}
load();
scheduleNext();
