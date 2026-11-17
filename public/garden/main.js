// Biotopia: bootstraps the digital Puintuin from our cached Bioto data.
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
import { Bee, LOAD_MG } from './bee/bee.js';
import { Hive } from './life/hive.js';
import { Life } from './life/life.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { FlightHud } from './ui/flight-hud.js';
import { esc, num } from './ui/format.js';
import { loadPlantInfo, infoFor, nameFor, plantHTML, sensorHTML, hiveHTML } from './ui/plant-info.js';

const params = new URLSearchParams(location.search);
const overlay = document.getElementById('overlay');

function fail(message) {
  document.getElementById('loader').innerHTML =
    `<div class="sprout">🥀</div><div class="loader-brand">Biotopia</div><p><b>De tuin kon niet laden.</b></p><p>${esc(message)}</p>` +
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

  const hive = new Hive(world);
  scene.add(hive.mesh);
  const atmosphere = new Atmosphere(engine, store, world, sky, ground);
  const life = new Life({ engine, world, atmosphere });
  const input = new Input();
  const orbit = new OrbitRig(engine, { limitRadius: world.radius });
  camera.position.set(7.5, 5.5, 10).multiplyScalar(world.radius / 4.6 * Math.max(1, 1 / camera.aspect) ** 0.75);
  if (camera.position.length() > 18.5) camera.position.setLength(18.5); // stay inside the forest ring
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
    dlg.addEventListener('close', () => {
      input.enabled = !anyDialogOpen();
      // A closed dialog hands focus back to the button that opened it; in flight that button would
      // catch Space. Drop the focus after the browser has restored it.
      if (document.body.classList.contains('flying')) requestAnimationFrame(() => document.activeElement?.blur?.());
      engine.wake();
    });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    // A click on the backdrop closes it too.
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
  const introDlg = $('dlg-intro'), chooseDlg = $('dlg-choose'), landDlg = $('dlg-land');
  const charDlg = { butterfly: $('dlg-fly'), bee: $('dlg-bee') };
  // One controls table, shown in both character dialogs (keyboard or touch).
  for (const box of document.querySelectorAll('[data-controls]')) box.append($('tpl-controls').content.cloneNode(true));

  // --- Players: the butterfly explores, the bee has a job. Same flight core, own camera lens.
  const butterfly = new Butterfly({ engine, world, store, atmosphere, input });
  const bee = new Bee({ engine, world, store, atmosphere, input });
  const players = { butterfly, bee };
  const rigs = { butterfly: new FollowRig(engine, butterfly, world), bee: new FollowRig(engine, bee, world) };
  Object.assign(rigs.bee, { distance: 0.075, minDist: 0.03, maxDist: 1.2, pitch: 0.25 }); // a smaller animal: closer camera
  const LENS = { butterfly: { near: 0.004, fov: 62 }, bee: { near: 0.0025, fov: 68 } };
  let player = butterfly;
  const flightHud = new FlightHud(input, camera);
  flightHud.setPlayer(player);
  const modeView = $('mode-view'), modeFly = $('mode-fly');

  const setFlying = (on, kind = player.kind) => {
    if (on && flying && kind !== player.kind) setFlying(false); // switch character
    if (on === flying) return;
    flying = on;
    if (on) { player = players[kind]; flightHud.setPlayer(player); }
    player.controlled = on;
    input.flightKeys = on;
    atmosphere.smallScale = on;
    document.body.classList.toggle('flying', on);
    document.body.dataset.player = on ? player.kind : '';
    modeView.setAttribute('aria-pressed', String(!on));
    modeFly.setAttribute('aria-pressed', String(on));
    panels.setEnabled(!on);
    flightHud.show(on);
    // Insect-eye lens: tiny near plane and a wider view make the flowers tower overhead.
    const lens = LENS[player.kind];
    camera.near = on ? lens.near : 0.05;
    camera.fov = on ? lens.fov : 45;
    camera.updateProjectionMatrix();
    if (on) {
      orbit.controls.autoRotate = false;
      clearSelection();
      layer.setHover(null);
      if (player.state !== 'landed') player.reset();
      engine.setRig(rigs[player.kind]);
      flightHud.toast(player.kind === 'bee'
        ? 'Vlieg naar de bloemen, zuig nectar en breng het naar de bijenkast'
        : `Zoek bloemen en land erop · nog ${player.totalSpecies - player.visited.size} soorten te ontdekken`);
    } else {
      if (landDlg.open) landDlg.close();
      orbit.controls.target.copy(player.position).setY(Math.max(0.4, player.position.y));
      camera.position.copy(orbit.controls.target).add(new THREE.Vector3(2.2, 1.6, 2.2));
      engine.setRig(orbit);
    }
    // Starting a flight: nothing may keep focus, or Space ("up") would press that button.
    if (on || !document.activeElement?.closest('nav')) document.activeElement?.blur?.();
    engine.wake();
  };
  hud.keysEnabled = () => !flying && !anyDialogOpen();

  /** How the garden's current (real) weather feels to this animal, in one sentence. */
  const flyingWeather = (kind) => {
    const st = atmosphere.state, v = getReading();
    const w = st.weather ? `${st.weather.icon} ${st.weather.text.toLowerCase()}` : '';
    const warmth = st.warmth ?? 1, rain = st.rain ?? 0;
    const beeNote = kind === 'bee' && (rain > 0.2 || v.airT < 12) ? ' Bij dit weer blijven de meeste bijen in de kast: jij bent een dappere uitzondering.' : '';
    const verdict = rain > 0.4 ? 'Het regent: je vleugels worden zwaar en je raakt sneller moe.'
      : warmth < 0.35 ? 'Het is koud: vliegen kost veel energie. Land vaak om bij te tanken.'
      : warmth < 0.7 ? 'Een beetje fris: je vliegt, maar je energie raakt sneller op.'
      : 'Prima vliegweer!';
    return `<strong>Nu in de tuin:</strong> ${esc(num(v.airT))} °C${w ? `, ${esc(w)}` : ''}. ${verdict}${beeNote}`;
  };

  const openChooser = () => {
    for (const b of chooseDlg.querySelectorAll('[data-char]')) b.setAttribute('aria-current', String(flying && b.dataset.char === player.kind));
    showDialog(chooseDlg, chooseDlg.querySelector(`[data-char="${player.kind}"]`));
  };
  const openCharDialog = (kind) => {
    const dlg = charDlg[kind];
    dlg.querySelector('[data-now]').innerHTML = flyingWeather(kind);
    const current = flying && kind === player.kind;
    dlg.querySelector('[data-start]').textContent = current ? 'Verder vliegen' : 'Start met vliegen';
    dlg.querySelector('[data-back]').textContent = current ? 'Stop met vliegen' : 'Andere keuze';
    dlg.dataset.current = String(current);
    dlg.querySelectorAll('.keys').forEach((el) => { el.hidden = flightHud.touch; });
    dlg.querySelectorAll('.touch-keys').forEach((el) => { el.hidden = !flightHud.touch; });
    showDialog(dlg);
  };
  for (const btn of chooseDlg.querySelectorAll('[data-char]')) {
    btn.addEventListener('click', () => { chooseDlg.close(); openCharDialog(btn.dataset.char); });
  }
  for (const [kind, dlg] of Object.entries(charDlg)) {
    dlg.querySelector('[data-start]').addEventListener('click', () => { dlg.close(); setFlying(true, kind); });
    dlg.querySelector('[data-back]').addEventListener('click', () => {
      dlg.close();
      if (dlg.dataset.current === 'true') setFlying(false); else openChooser();
    });
  }
  modeFly.addEventListener('click', openChooser);
  modeView.addEventListener('click', () => setFlying(false));
  $('btn-help').addEventListener('click', () => (flying ? openCharDialog(player.kind) : showDialog(introDlg)));

  const showLandDialog = (html, button = 'Verder vliegen') => {
    $('land-body').innerHTML = html;
    landDlg.querySelector('.btn.primary').textContent = button;
    landDlg.scrollTop = 0;
    showDialog(landDlg);
  };

  // Landing: the same info as the view mode, plus a fun fact and what the plant means for you.
  // The bee visits many flowers, so she only gets the full card for a species she hasn't seen yet.
  for (const p of [butterfly, bee]) {
    p.addEventListener('land', (e) => {
      const { plant, sensor: onSensor, visit, controlled } = e.detail;
      if (!flying || p !== player || !controlled || anyDialogOpen()) return;
      if (plant && (p.kind === 'butterfly' || visit?.isNew)) {
        showLandDialog(plantHTML(plant.batch, infoFor(plantInfo, plant.batch), { headingId: 'land-title', funFact: true, visit, player: p.kind }));
      } else if (onSensor) showLandDialog(sensorHTML({ headingId: 'land-title', now: getReading(), immersive: true }));
    });
  }
  bee.addEventListener('flower', (e) => {
    if (!bee.controlled) return;
    const { plant, empty, full, constant } = e.detail;
    const name = esc(nameFor(plantInfo, plant.batch));
    if (full) flightHud.toast('🍯 Je honingmaag is vol. Volg het kompas naar de bijenkast!');
    else if (empty) flightHud.toast(`👃 Deze ${name} ruikt naar bij: net leeggedronken. Probeer een andere bloem.`);
    else if (constant) flightHud.toast(`🌸 Bloemvast! Weer ${name}: je verzamelt sneller en bestuift de bloemen echt.`);
  });
  bee.addEventListener('collected', (e) => {
    if (!bee.controlled) return;
    const { gained, load } = e.detail;
    flightHud.toast(`+${Math.round(gained * LOAD_MG)} mg nectar · honingmaag ${Math.round(load * 100)}%${load >= 0.999 ? ' · vol!' : ''}`, 2600);
  });
  // Exhaustion and recovery are explained once, in the status line (no second toast saying the same).
  bee.addEventListener('home', () => { if (bee.controlled) flightHud.toast('🏠 Thuis: even bijtanken. Ga nu nectar zoeken!'); });
  bee.addEventListener('deliver', (e) => {
    if (!bee.controlled || anyDialogOpen()) return;
    showLandDialog(hiveHTML({ ...e.detail, headingId: 'land-title' }), 'Volgende vlucht');
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea') || anyDialogOpen()) return;
    // In flight, Space means "up": never let it activate a focused button (Enter still works).
    if (flying && e.code === 'Space' && e.target.closest?.('button, a, summary')) { e.preventDefault(); e.target.blur(); }
    if (e.code === 'KeyV') (flying ? setFlying(false) : openChooser());
    if (e.key === 'Escape' && flying) setFlying(false);
  }, true);

  // --- Systems (order matters: input → time → world → creatures → picking → UI)
  engine.addSystem({ update: () => input.update() });
  engine.addSystem({ update: () => store.update() }); // live: follows the wall clock
  engine.addSystem({ update: (dt, ctx) => { windUniforms.uTime.value = ctx.elapsed; } });
  engine.addSystem(atmosphere);
  engine.addSystem({ update: (dt) => sensor.update(dt, atmosphere.state.sample, atmosphere.state.night) });
  engine.addSystem(butterfly);
  engine.addSystem(bee);
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

  // --- New readings: reload once per hour, a few minutes after the hour. The server fetches from
  // the Bioto API at most once per clock hour and caches it, so this never spams the API.
  let lastFetch = Date.now();
  const refresh = async () => {
    lastFetch = Date.now();
    try {
      const added = store.append((await loadHistory()).readings);
      if (added) console.info(`[data] ${added} nieuwe uurmeting(en)`);
    } catch (e) { console.warn('[data] verversen mislukt, volgende poging over een uur:', e.message); }
  };
  // Background tabs throttle timers: catch up when the page becomes visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const due = new Date(); due.setMinutes(7, 0, 0);
    if (due > Date.now()) due.setHours(due.getHours() - 1);
    if (lastFetch < due.getTime()) refresh();
    if (store.live) store.goLive();
  });
  const scheduleRefresh = () => {
    const now = new Date(), next = new Date(now);
    next.setMinutes(7, 0, 0);
    if (next <= now) next.setHours(next.getHours() + 1);
    setTimeout(async () => {
      await refresh();
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
  window.garden = { engine, store, world, plants, batches, layer, atmosphere, ground, life, quality, input, orbit, butterfly, bee, hive, rigs, setFlying, getPlayer: () => player, panels, plantInfo, counts, THREE };
  console.info('[garden] geladen', counts);

  engine.start();
  overlay.classList.add('gone');
  setTimeout(() => overlay.remove(), 700);
  if (params.has('vlinder')) setFlying(true, 'butterfly');
  else if (params.has('bij')) setFlying(true, 'bee');
  else if (params.get('intro') !== '0') setTimeout(() => showDialog(introDlg), 350);
}

boot();
