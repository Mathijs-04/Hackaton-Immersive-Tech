// Digitale Puintuin V2: bootstraps the world from our cached Bioto data.
import * as THREE from 'three';
import { loadAll, loadHistory } from './data/api.js';
import { TimeStore } from './data/timeline.js';
import { Engine } from './core/engine.js';
import { Quality } from './core/quality.js';
import { Input } from './core/input.js';
import { OrbitRig, FreeFlyRig, FollowRig } from './core/camera-rig.js';
import { GardenWorld } from './world/world.js';
import { Ground } from './world/ground.js';
import { Sky } from './world/sky.js';
import { Sensor } from './world/sensor.js';
import { Atmosphere } from './world/atmosphere.js';
import { expandBatches, placePlants, layoutHash, overlapReport } from './plants/placement.js';
import { PlantLayer } from './plants/plant-layer.js';
import { windUniforms } from './plants/archetypes.js';
import { Picking } from './plants/picking.js';
import { Butterfly } from './butterfly/butterfly.js';
import { Life } from './life/life.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { FlightHud } from './ui/flight-hud.js';
import { esc, num } from './ui/format.js';
import { loadPlantInfo, infoFor, plantHTML, sensorHTML } from './ui/plant-info.js';

const params = new URLSearchParams(location.search);
const overlay = document.getElementById('overlay');

function fail(message) {
  document.getElementById('loader').innerHTML =
    `<div class="sprout">🥀</div><p><b>De tuin kon niet laden.</b></p><p>${esc(message)}</p>` +
    '<p><a href="/">Naar het 2D-dashboard</a></p>';
  console.error(message);
}

function webglAvailable() {
  try { return !!(window.WebGL2RenderingContext && document.createElement('canvas').getContext('webgl2')); } catch { return false; }
}

async function boot() {
  if (!webglAvailable()) return fail('Deze browser ondersteunt geen WebGL2. Probeer een recente Chrome, Edge, Firefox of Safari.');
  let data;
  let plantInfo;
  try { [data, plantInfo] = await Promise.all([loadAll(), loadPlantInfo()]); } catch (e) { return fail(e.message); }
  const { history, layout, planting } = data;

  const engine = new Engine(document.getElementById('scene'));
  const { scene, camera } = engine;
  const store = new TimeStore(history.readings, history.loc);
  const world = new GardenWorld(layout, history.loc);

  // --- World
  const ground = new Ground(world);
  const sky = new Sky();
  const sensor = new Sensor(world);
  scene.add(sky.group, ground.group, sensor.group);

  const batches = expandBatches(planting);
  const plants = placePlants(world, batches);
  world.setPlants(plants);
  const layer = new PlantLayer(plants);
  scene.add(layer.group);

  const atmosphere = new Atmosphere(engine, store, world, sky, ground);
  const life = new Life({ engine, world, atmosphere });
  const input = new Input();
  const orbit = new OrbitRig(engine, { limitRadius: world.radius });
  camera.position.set(7.5, 5.5, 10).multiplyScalar(world.radius / 4.6 * Math.max(1, 1 / camera.aspect) ** 0.75);
  engine.setRig(params.has('fly') ? new FreeFlyRig(engine, input, world) : orbit);
  windUniforms.uWind.value = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;

  // --- UI
  const $ = (id) => document.getElementById(id);
  const hud = new Hud(store, history, atmosphere);
  let flying = false;
  const anyDialogOpen = () => !!document.querySelector('dialog[open]');
  const focusBatch = (batch) => {
    const list = layer.setSelectedBatch(batch.id);
    if (!list.length || engine.rig !== orbit) return;
    const c = list.reduce((a, p) => a.add(new THREE.Vector3(p.x, p.y + p.sy * 0.4, p.z)), new THREE.Vector3()).divideScalar(list.length);
    const spread = Math.max(...list.map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
    orbit.flyTo(c, 2.2 + spread * 1.6 + Math.max(...list.map((p) => p.sy)));
  };
  const clearSelection = () => { layer.setSelectedBatch(null); engine.wake(); };
  const getReading = () => store.sample(store.t, {});
  const panels = new Panels({ batches, plantInfo, onFocusBatch: focusBatch, onClear: clearSelection, getReading });

  const picking = new Picking(engine, layer, sensor, {
    onHover: (h) => layer.setHover(!flying && h && h !== 'sensor' ? h : null),
    onSelect: (h) => {
      if (flying) return; // in flight, clicks/drags are for looking around
      if (h === 'sensor') panels.showSensor();
      else if (h) { layer.setSelectedBatch(h.batch.id); panels.showBatch(h.batch); }
      else if (panels.current) panels.close();
      engine.wake();
    },
  });

  // --- Dialogs (native <dialog>: focus trap, Esc to close, inert background)
  const showDialog = (dlg, focusEl) => {
    if (!dlg.open) dlg.showModal();
    input.enabled = false;
    (focusEl || dlg.querySelector('.btn.primary'))?.focus();
    engine.wake();
  };
  for (const dlg of document.querySelectorAll('dialog')) {
    dlg.addEventListener('close', () => { input.enabled = !anyDialogOpen(); engine.wake(); });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    // A click on the backdrop closes it too.
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
  const introDlg = $('dlg-intro'), flyDlg = $('dlg-fly'), landDlg = $('dlg-land');

  // --- Butterfly (player)
  const butterfly = new Butterfly({ engine, world, store, atmosphere, input });
  const follow = new FollowRig(engine, butterfly, world);
  const flightHud = new FlightHud(butterfly, input);
  const modeView = $('mode-view'), modeFly = $('mode-fly');
  const setFlying = (on) => {
    if (on === flying) return;
    flying = on;
    butterfly.controlled = on;
    input.flightKeys = on;
    atmosphere.smallScale = on;
    // Viewing: 1 hour per second. Flying: 10x slower, so a flight doesn't race through the day.
    store.speed = on ? 0.1 : 1;
    document.body.classList.toggle('flying', on);
    modeView.setAttribute('aria-pressed', String(!on));
    modeFly.setAttribute('aria-pressed', String(on));
    panels.setEnabled(!on);
    flightHud.show(on);
    // Butterfly-eye lens: tiny near plane and a wider view make the flowers tower overhead.
    camera.near = on ? 0.004 : 0.05;
    camera.fov = on ? 62 : 45;
    camera.updateProjectionMatrix();
    if (on) {
      orbit.controls.autoRotate = false;
      clearSelection();
      layer.setHover(null);
      if (butterfly.state !== 'landed') butterfly.reset();
      engine.setRig(follow);
      flightHud.toast(`Zoek bloemen en land erop om nectar te drinken · nog ${butterfly.totalSpecies - butterfly.visited.size} soorten te ontdekken`);
    } else {
      if (landDlg.open) landDlg.close();
      orbit.controls.target.copy(butterfly.position).setY(Math.max(0.4, butterfly.position.y));
      camera.position.copy(orbit.controls.target).add(new THREE.Vector3(2.2, 1.6, 2.2));
      engine.setRig(orbit);
    }
    if (document.activeElement && !document.activeElement.closest('nav')) document.activeElement.blur?.();
    engine.wake();
  };
  hud.keysEnabled = () => !flying && !anyDialogOpen();

  /** How the garden's current (real) weather feels to a butterfly, in one sentence. */
  const flyingWeather = () => {
    const st = atmosphere.state, v = getReading();
    const w = st.weather ? `${st.weather.icon} ${st.weather.text.toLowerCase()}` : '';
    const warmth = st.warmth ?? 1, rain = st.rain ?? 0;
    const verdict = rain > 0.4 ? 'Het regent: je vleugels worden zwaar en je raakt sneller moe.'
      : warmth < 0.35 ? 'Het is koud: je vleugels zijn stijf. Land vaak om op te warmen en bij te tanken.'
      : warmth < 0.7 ? 'Een beetje fris: je vliegt, maar je energie raakt sneller op.'
      : 'Prima vliegweer!';
    return `<strong>Nu in de tuin:</strong> ${esc(num(v.airT))} °C${w ? `, ${esc(w)}` : ''}. ${verdict}`;
  };

  const openFlyDialog = () => {
    $('fly-now').innerHTML = flyingWeather();
    $('fly-start').textContent = flying ? 'Verder vliegen' : 'Start met vliegen';
    $('fly-cancel').textContent = flying ? 'Stop met vliegen' : 'Terug';
    $('fly-controls').hidden = flightHud.touch;
    $('fly-controls-touch').hidden = !flightHud.touch;
    showDialog(flyDlg);
  };
  $('fly-start').addEventListener('click', () => { flyDlg.close(); setFlying(true); });
  $('fly-cancel').addEventListener('click', () => { flyDlg.close(); setFlying(false); });
  modeFly.addEventListener('click', () => { if (!flying) openFlyDialog(); });
  modeView.addEventListener('click', () => setFlying(false));
  $('btn-help').addEventListener('click', () => (flying ? openFlyDialog() : showDialog(introDlg)));

  // Landing: the same info as the view mode, plus a fun fact.
  butterfly.addEventListener('land', (e) => {
    const { plant, sensor: onSensor, visit, controlled } = e.detail;
    if (!flying || !controlled || anyDialogOpen()) return;
    let html;
    if (plant) html = plantHTML(plant.batch, infoFor(plantInfo, plant.batch), { headingId: 'land-title', funFact: true, visit });
    else if (onSensor) html = sensorHTML({ headingId: 'land-title', now: getReading(), immersive: true });
    else return;
    $('land-body').innerHTML = html;
    landDlg.scrollTop = 0;
    showDialog(landDlg);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea') || anyDialogOpen()) return;
    if (e.code === 'KeyV') (flying ? setFlying(false) : openFlyDialog());
    if (e.key === 'Escape' && flying) setFlying(false);
  }, true);

  // --- Systems (order matters: input → time → world → creatures → picking → UI)
  engine.addSystem({ update: () => input.update() });
  engine.addSystem({ update: (dt) => { store.update(dt); if (store.playing) engine.wake(); } });
  engine.addSystem({ update: (dt, ctx) => { windUniforms.uTime.value = ctx.elapsed; } });
  engine.addSystem(atmosphere);
  engine.addSystem({ update: (dt) => sensor.update(dt, atmosphere.state.sample, atmosphere.state.night) });
  engine.addSystem(butterfly);
  engine.addSystem({ update: (dt) => { life.update(dt); engine.wake(); } }); // wildlife is always moving
  engine.addSystem(picking);
  engine.addSystem({ update: () => { hud.render(); flightHud.render(); } });
  store.addEventListener('change', () => engine.wake());

  const quality = new Quality(engine, {
    onShadows: (on) => atmosphere.setShadows(on),
    onMist: (s) => { atmosphere.setMistScale(s); ground.setGrassDensity(0.55); },
  });

  if (params.has('stats')) {
    const el = document.getElementById('stats');
    el.hidden = false;
    let frames = 0, acc = 0;
    engine.frameListeners.push((dt) => {
      frames++; acc += dt;
      if (acc < 0.5) return;
      const info = engine.renderer.info.render;
      el.textContent = `${Math.round(frames / acc)} fps  ${(1000 * acc / frames).toFixed(1)} ms\n` +
        `draws ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k\n` +
        `dpr ${engine.renderer.getPixelRatio()}  kwaliteit ${quality.label}`;
      frames = 0; acc = 0;
    });
  }

  // --- New readings: reload once per hour, a few minutes after the hour (server caches; no API spam).
  const scheduleRefresh = () => {
    const now = new Date(), next = new Date(now);
    next.setMinutes(7, 0, 0);
    if (next <= now) next.setHours(next.getHours() + 1);
    setTimeout(async () => {
      try {
        const added = store.append((await loadHistory()).readings);
        if (added) console.info(`[data] ${added} nieuwe uurmeting(en)`);
      } catch (e) { console.warn('[data] verversen mislukt, volgende poging over een uur:', e.message); }
      scheduleRefresh();
    }, next - now);
  };
  scheduleRefresh();

  const counts = {
    readings: store.readings.length,
    batches: batches.length,
    instances: plants.length,
    layoutHash: layoutHash(plants),
    ...overlapReport(plants),
    ...layer.stats(),
  };
  window.garden = { engine, store, world, plants, batches, layer, atmosphere, ground, life, quality, input, orbit, butterfly, follow, setFlying, panels, plantInfo, counts, THREE };
  console.info('[garden] geladen', counts);

  engine.start();
  overlay.classList.add('gone');
  setTimeout(() => overlay.remove(), 700);
  if (params.has('vlinder')) setFlying(true);
  else if (params.get('intro') !== '0') setTimeout(() => showDialog(introDlg), 350);
}

boot();
