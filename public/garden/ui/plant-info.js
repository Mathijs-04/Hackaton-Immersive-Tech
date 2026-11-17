// Educational content per plant (public/data/plants.json) and the shared info layout used by
// the view-mode drawer and the butterfly's landing popup.
import { esc, date, num } from './format.js';
import { SEED_COUNT_UNKNOWN } from '../plants/placement.js';

export const BIOTO_URL = 'https://bioto.co/';

/** Map of API plant name (latin, incl. cultivar) → info entry. Never throws: the 3D garden works without it. */
export async function loadPlantInfo() {
  try {
    const res = await fetch('/data/plants.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { plants } = await res.json();
    return new Map(plants.map((p) => [p.latinName, p]));
  } catch (e) {
    console.warn('[plants] plantinformatie kon niet laden:', e.message);
    return new Map();
  }
}

export const infoFor = (map, batch) => map.get(batch.raw.plant?.name) || map.get(batch.info.base) || null;

/** Display name: the Dutch name from our JSON (fills gaps in the API), else the batch name. */
export const nameFor = (map, batch) => infoFor(map, batch)?.dutchName || batch.name;

// Roles a plant can play in a butterfly's life (plants.json → butterflyLife.roles).
export const ROLES = {
  nectar:       { icon: '🍯', label: 'Voedsel (nectar)' },
  waardplant:   { icon: '🥚', label: 'Eitjes en rupsenvoer' },
  schuilplek:   { icon: '🌿', label: 'Schuilen en rusten' },
  zonnen:       { icon: '☀️', label: 'Opwarmen in de zon' },
  uitkijkpost:  { icon: '👀', label: 'Uitkijkpost, partner zoeken' },
  overwinteren: { icon: '❄️', label: 'Overwinteren' },
};

function lifeHTML(life, { player = false } = {}) {
  if (!life) return '';
  const chips = (life.roles || []).filter((r) => ROLES[r])
    .map((r) => `<li class="role role-${r}"><span aria-hidden="true">${ROLES[r].icon}</span> ${ROLES[r].label}</li>`).join('');
  return `<section class="life" aria-labelledby="life-h-${player ? 'p' : 'v'}">
      <h3 id="life-h-${player ? 'p' : 'v'}">Rol in het leven van een vlinder</h3>
      ${chips ? `<ul class="roles">${chips}</ul>` : ''}
      ${life.text ? `<p>${esc(life.text)}</p>` : ''}
      ${player && life.boomblauwtje ? `<div class="for-you"><h4>🦋 Voor jou als boomblauwtje</h4><p>${esc(life.boomblauwtje)}</p></div>` : ''}
    </section>`;
}

/** For the player's bee: how good is this plant for you, and why. */
function beeHTML(pv) {
  if (!pv) return '';
  const v = Math.round(pv.bees ?? 0);
  const verdict = v >= 4 ? 'Een topbloem voor jou: veel nectar of stuifmeel.' : v >= 2 ? 'Hier is wel wat te halen.' : 'Voor een bij is hier weinig te halen.';
  return `<section class="pollinators bee-value" aria-labelledby="bee-h">
      <h3 id="bee-h">🐝 Wat heb jij als bij hieraan?</h3>
      ${rating('Waarde voor bijen', pv.bees)}
      <p><strong>${verdict}</strong>${pv.note ? ` ${esc(pv.note)}` : ''}</p>
    </section>`;
}

function rating(label, n) {
  const v = Math.max(0, Math.min(5, Math.round(n ?? 0)));
  const dots = Array.from({ length: 5 }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('');
  return `<div class="rating"><span class="rating-label">${label}</span>` +
    `<span class="dots" role="img" aria-label="${label}: ${v} van 5">${dots}</span></div>`;
}

function photo(img, name) {
  if (!img?.url) return '';
  const credit = [img.author && `Foto: ${esc(img.author)}`, img.license && esc(img.license)].filter(Boolean).join(' · ');
  return `<figure class="photo">
    <img src="${esc(img.url)}" alt="Foto van ${esc(name)}" loading="lazy" decoding="async"
         onerror="this.closest('figure').classList.add('broken')">
    ${credit ? `<figcaption>${img.sourcePage ? `<a href="${esc(img.sourcePage)}" target="_blank" rel="noopener">${credit}</a>` : credit}</figcaption>` : ''}
  </figure>`;
}

/**
 * Info for one planting batch.
 * opts.headingId: id for the <h2> (dialogs label themselves with it).
 * opts.funFact: show the "Wist je dat?" box (immersive mode).
 * opts.visit: { isNew, count, total } from the player's collection.
 * opts.player: 'butterfly' | 'bee' | null (view mode). Decides which "what does this mean for me" section shows.
 */
export function plantHTML(batch, info, { headingId = '', funFact = false, visit = null, player = null } = {}) {
  const name = info?.dutchName || batch.name;
  const latin = info?.latinName || batch.raw.plant?.name || '';
  const count = batch.amountKnown ? `${batch.count} ${batch.count === 1 ? 'plant' : 'planten'}` : `gezaaid (± ${SEED_COUNT_UNKNOWN} kiemplantjes)`;
  const pv = info?.pollinatorValue;
  const visitBadge = visit
    ? `<p class="badge ${visit.isNew ? 'new' : ''}">${visit.isNew ? `🌟 Nieuwe soort ontdekt! ${visit.count} van ${visit.total}` : `Al eerder bezocht · ${visit.count} van ${visit.total} soorten`}</p>`
    : '';
  return `
    ${visitBadge}
    ${photo(info?.image, name)}
    <h2 id="${esc(headingId)}" class="info-title" tabindex="-1"><span class="swatch" style="background:${batch.info.bloom}" aria-hidden="true"></span>${esc(name)}</h2>
    ${latin ? `<p class="latin"><i lang="la">${esc(latin)}</i></p>` : ''}
    ${info?.description ? `<p>${esc(info.description)}</p>` : '<p>Over deze plant hebben we nog geen beschrijving.</p>'}
    ${player === 'bee' ? beeHTML(pv) : lifeHTML(info?.butterflyLife, { player: player === 'butterfly' })}
    ${funFact && info?.funFact ? `<div class="funfact"><h3>💡 Wist je dat?</h3><p>${esc(info.funFact)}</p></div>` : ''}
    ${pv && player !== 'bee' ? `<section class="pollinators" aria-label="Waarde voor bestuivers">
      <h3>Waarde voor insecten</h3>
      ${rating('🦋 Vlinders', pv.butterflies)}
      ${rating('🐝 Bijen', pv.bees)}
      ${pv.note ? `<p>${esc(pv.note)}</p>` : ''}
    </section>` : ''}
    <dl class="facts-list">
      <dt>In de Puintuin</dt><dd>${count}</dd>
      <dt>Geplant</dt><dd>${esc(date(batch.raw.planted_on))}</dd>
    </dl>`;
}

const SENSOR_ART = `<svg class="sensor-art" viewBox="0 0 120 120" aria-hidden="true">
  <rect x="0" y="0" width="120" height="120" rx="14" fill="var(--paper-2)"/>
  <path d="M0 98 Q30 88 60 96 T120 94 V120 H0Z" fill="var(--leaf)" opacity=".55"/>
  <rect x="57" y="52" width="6" height="52" rx="3" fill="#e9ebe5" stroke="#b9bdb2"/>
  <circle cx="60" cy="38" r="22" fill="#f7f8f5" stroke="#b9bdb2"/>
  <path d="M42 30h36M40 37h40M41 44h38M44 51h32" stroke="#c9ccc4" stroke-width="1.5"/>
  <circle cx="60" cy="56" r="2.5" fill="#3fbf74"/>
</svg>`;

/**
 * The Plantenluisteraar. `now` is the current reading (from the TimeStore) so people see
 * exactly what it measures at this moment.
 */
export function sensorHTML({ headingId = '', now = null, immersive = false } = {}) {
  const live = now ? `<dl class="facts-list live">
      <dt>Luchttemperatuur</dt><dd>${num(now.airT)} °C</dd>
      <dt>Luchtvochtigheid</dt><dd>${num(now.airH, 0)} %</dd>
      <dt>Bodemtemperatuur</dt><dd>${num(now.soilT)} °C</dd>
      <dt>Licht</dt><dd>${Number.isFinite(now.clear) ? Math.round(now.clear) : '–'}</dd>
    </dl>` : '';
  return `
    ${immersive ? '<p class="badge">🦋 Je zit bovenop het meetstation!</p>' : ''}
    ${SENSOR_ART}
    <h2 id="${esc(headingId)}" class="info-title" tabindex="-1">Plantenluisteraar</h2>
    <p class="latin">Meetstation van <a href="${BIOTO_URL}" target="_blank" rel="noopener">Bioto</a></p>
    <p>Dit is de <strong>Plantenluisteraar van Bioto</strong>. Hij staat echt in de Puintuin en "luistert" naar de tuin: elk uur meet hij de lucht, de bodem en het licht, en stuurt die live data door.</p>
    <p>Deze app gebruikt precies die metingen. Het weer, de zon, de mist en zelfs hoeveel energie jouw vlinder heeft, komen allemaal uit de echte tuin.</p>
    ${live ? `<h3>Wat hij nu meet</h3>${live}` : ''}
    <p><a class="btn small" href="${BIOTO_URL}" target="_blank" rel="noopener">Meer over Bioto ↗</a></p>`;
}

// Short facts shown one by one after each delivery at the hive (the bee's reward: learning).
const HIVE_FACTS = [
  'Terug in de kast doe je de <strong>kwispeldans</strong>. Met die dans vertel je andere bijen in welke richting en hoe ver de bloemen zijn.',
  'Jonge bijen in de kast nemen je nectar over. Ze <strong>wapperen met hun vleugels</strong> zodat het water verdampt: zo wordt nectar langzaam honing.',
  'Voor één pot honing van 500 gram zijn <strong>tienduizenden vluchten</strong> nodig. Elke vlucht telt!',
  'Een bijenvolk heeft in de zomer zo\'n <strong>30.000 tot 50.000 bijen</strong>, maar maar één koningin. Zij legt alle eitjes.',
  'Bijen zien geen rood, maar wel <strong>ultraviolet</strong>. Veel bloemen hebben UV-strepen die als landingsbaan naar de nectar werken.',
  'Een werkster leeft in de zomer maar <strong>zo\'n 5 à 6 weken</strong>. Pas in haar laatste weken vliegt ze uit om te verzamelen, zoals jij nu.',
  'Bijen bestuiven terwijl ze verzamelen: stuifmeel blijft aan hun harige lijf plakken en gaat mee naar de volgende bloem. Zo kunnen planten zaad maken.',
];

/** The hive card after a delivery. Honey ≈ 35% of the nectar mass (nectar is mostly water). */
export function hiveHTML({ headingId = '', mg, trips, total }) {
  const fact = HIVE_FACTS[(trips - 1) % HIVE_FACTS.length];
  const honey = Math.max(1, Math.round(total * 0.35));
  return `
    <p class="badge new">🍯 +${mg} mg nectar afgeleverd</p>
    <div class="hive-art" aria-hidden="true">🏠🐝🐝🐝</div>
    <h2 id="${esc(headingId)}" class="info-title" tabindex="-1">Thuis in de bijenkast</h2>
    <p class="latin">Je volk is blij met je!</p>
    <dl class="facts-list live">
      <dt>Vluchten</dt><dd>${trips}</dd>
      <dt>Nectar in totaal</dt><dd>${total} mg</dd>
      <dt>Wordt ongeveer</dt><dd>${honey} mg honing</dd>
    </dl>
    <div class="funfact"><h3>💡 Wist je dat?</h3><p>${fact}</p></div>
    <p class="fine">Je energie is weer vol: je hebt thuis een slokje honing genomen.</p>`;
}
