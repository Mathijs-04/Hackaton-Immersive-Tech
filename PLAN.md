# Plan: "Digital Puintuin", a 3D time-travelling garden

> **Status (16 Nov 2026): built.** M0–M6 implemented in `public/garden/`, see `README.md`.
> Deviations: Verbena bonariensis uses the `umbel` archetype (looks closer than `spike`). Amaranthus has an
> entry in the species table but shows as a seedling (seed batch). Readings are placed at the middle of their hour
> (an hourly average) so the light curve lines up with the sun. Quality stepping compares against the display's
> own refresh interval (a 30 Hz screen is not a slow GPU).

Audience: the agent (or person) who will build this. Read `DATA.md` first (field reference), then this file.
Existing code you build on: `lib/bioto.js` (API client and cache), `server.js` (local server), `public/` (the 2D dashboard, keep it working).

---

## 1. Concept

A small, stylised 3D replica of the Puintuin that the user can orbit around. The garden is **driven by the real sensor data**:
the sky, light, mist, ground and mood change as a **time slider** moves through the sensor history (about 7 days of hourly readings).
The planting plan is shown as **recognisable plants** (one visual per species, as many as the planting plan says) that you can click for details.

One sentence for the pitch: *"Scrub through a week in the Puintuin and watch the garden breathe, with the real plants of the real garden."*

### Goals
1. Every visual change comes from real API data, or from clearly labelled astronomy (sun position from lat/lon/time).
2. Light on the GPU: runs at 60 fps on an integrated GPU laptop and on a recent phone. No downloaded models or textures.
3. All 48 species and the planting amounts are visible and inspectable.
4. Architecture leaves room for a **player-controlled butterfly** later (section 9).

### Non-goals (for now)
Butterfly gameplay, audio, multi-garden support, editing the garden, real plant growth simulation.

---

## 2. Hard rules (carry over from the Bioto manual)

- **The browser never calls `api.bioto.co`.** It only calls our own `/api/*` routes. The token stays in `.env` and server-side.
- **No new API traffic.** Reuse the cached `layout.json`, `planting.json` and `garden.json`. Live readings refresh at most once per hour (already implemented in `lib/bioto.js`, from 5 minutes past the hour).
- No timers or loops that call the API. The only client reload is the existing "once per hour at :06" reload.
- Do not commit `.env` or `data/`.

---

## 3. Data in, and what each piece means visually

### 3.1 Facts about the data that shape the design
- Readings are **hourly, UTC, no gaps**. Light appears around 06:00 UTC and peaks around 12:00 UTC, which matches Rotterdam in November (UTC confirmed). Convert to `Europe/Amsterdam` only for **display**.
- The garden is **one polygon of about 55 m² (about 8.8 m across)**. The sensor is at `garden.loc`.
- The planting plan has **no positions**. There are 48 batches, about 113 plants (4 seed batches have `amount: null`), and all `planted_on` dates are before the reading window, so there is no growth to animate.
- There is **no wind, rain or cloud data**, so don't present those as data (see 3.3).

### 3.2 Data → visual mapping (real signals)

Normalise each channel to 0..1 using min/max over the whole stored history (compute once, expose in the legend). Interpolate **linearly between hourly readings** so the world moves smoothly.

| Data | Visual effect | Notes |
|---|---|---|
| `light.clear` | Sun/ambient light intensity, sky brightness | 0 at night gives true dark. Use a smoothed curve so overcast days (e.g. 11 Nov, peak 2642) look dull. |
| `light.f1..f8` + `light.nir` | Colour tint of the sunlight | Map the 8 bands to approximate RGB (F1 about 415 nm blue to F8 about 680 nm red). Normalise by `clear`, then **lerp only 25% toward neutral white** so the tint stays subtle. Sensor is uncalibrated, so keep it artistic. |
| `air.temperature` | Colour grade of sky and fog (cold blue to warm amber) and a thermometer in the HUD | Range 1.9 to 17 °C. |
| `air.humidity` | Fog density and number/opacity of mist particles | 49 to 100 %. High humidity means soft thick mist. |
| `soil.humidity` | Ground wetness: darker soil, lower roughness (shinier), faint puddle sheen | Raw 1787 to 2047, unit unknown, normalise per history. |
| `soil.temperature` | Soil colour warmth, plus **ground steam** when soil temp is above air temp | Soil-minus-air is a genuine derived signal (real physics: warm soil in cold air steams). |
| `record_count` | HUD "confidence" badge only | Low values (3) mean the hour averaged fewer samples. |
| `datetime` | Sun position (astronomy), clock, day/night ambience | Use the `suncalc` formulas (or about 30 lines of inline code) with `garden.loc` lat/lon. |

### 3.3 Decorative (not data), label as such in the legend
Plant sway (wind) is a constant gentle ambient animation. Stars, moon and sky gradients are decorative. Do not imply they come from the sensor. The legend panel lists "From the sensor" versus "Decorative" so it stays honest.

### 3.4 Plant data → visual mapping

| Field | Visual |
|---|---|
| `plant.name` | Selects the **archetype** and colour palette via a lookup table (section 5.2). |
| `amount` | Number of instances. If `null` (seed batches), render 6 small seedlings and show "amount unknown" in the card. |
| `stage` | `seed` renders as a **seedling** (tiny sprout), `plant` as the full archetype. |
| `plant.taxonomic_rank` | `Doubtful` shows a "cultivar / unconfirmed ID" note in the card. |
| `planted_on` | Card shows age relative to the **currently scrubbed time** ("planted 46 days ago"). |
| `supplier.name` | Card and optional filter chips. |
| `vernacular_name` (nullable) | Card title, falling back to the Latin name. |

---

## 4. Tech stack and project layout

- **Three.js** (r170, pinned), vanilla **ES modules**, **no bundler** (matches the current project).
- Install: `npm i three@0.170.0`, then add static routes in `server.js`:
  `/vendor/three/` → `node_modules/three/build/`, `/vendor/three/addons/` → `node_modules/three/examples/jsm/`.
  Use an `<script type="importmap">` for `"three"` and `"three/addons/"`. This works offline (hackathon wifi), no CDN.
- Optional tiny dependency: none. Inline the sun-position maths instead of adding `suncalc`.
- New page at **`/garden/`** (keep `/` as the 2D dashboard, add a link between them).

```
public/garden/
  index.html            # canvas, HUD containers, importmap
  main.js               # bootstraps, wires modules, runs the loop
  core/
    engine.js           # renderer, scene, camera, fixed/variable loop, system registry
    quality.js          # adaptive quality (DPR, shadows), visibility pause
    camera-rig.js       # CameraRig interface + OrbitRig (FollowRig comes later)
  data/
    api.js              # fetch /api/history, /api/layout, /api/planting, validate shape
    timeline.js         # TimeStore: current time, play/pause/speed, sample(t) → interpolated reading
    normalize.js        # min/max stats per channel, 0..1 helpers
  world/
    geo.js              # lon/lat → local metres, polygon centroid, point-in-polygon
    world.js            # GardenWorld: bounds, groundHeight(x,z), plant registry, spatial queries
    ground.js           # bed (extruded polygon) + surrounding ground, wetness uniform
    sky.js              # gradient sky dome, sun/moon, stars
    atmosphere.js       # fog + mist/steam particles, applies the data mapping
    sensor.js           # little Plantenluisteraar model at garden.loc
  plants/
    species.js          # lookup: Latin name → {archetype, height, flowerColor, ...}
    archetypes.js       # procedural low-poly geometries (merged), wind shader patch
    placement.js        # deterministic layout of all plants inside the polygon
    plant-layer.js      # builds InstancedMeshes, maps instanceId → plant
    picking.js          # hover and click via raycast
  ui/
    hud.js              # time bar, play/speed, current values
    timeline-chart.js   # tiny canvas chart of light and temp under the slider, with day/night shading
    plant-card.js       # info card and plant list/search
    legend.js           # "From sensor" vs "Decorative" explainer
```

Server addition (small): see M0 (history endpoint).

---

## 5. Scene design

### 5.1 Coordinates and world
- **Units are metres. Y up. X east, Z south** (north is −Z). Origin at the polygon centroid.
- `geo.js`: project lon/lat with an equirectangular approximation around the centroid (`x = Δlon·111320·cos(lat)`, `z = −Δlat·111320`). Accurate enough at 9 m scale.
- The garden bed is the polygon, extruded about 0.15 m as a soil bed with a slightly rounded rim. Around it a larger ground disc (radius about 14 m) in muted grass/paving colour fading into fog, so the world has no visible edge.
- The sensor (small post with a glowing top) stands at `garden.loc` projected. Its glow pulses once per hour tick.
- All ground queries go through `world.groundHeight(x, z)` (flat `0.15` inside the bed for now).

### 5.2 Plant archetypes (procedural, low-poly, no assets)

Nine archetypes cover all species. Each archetype is **two merged geometries**: `foliage` (stems/leaves, green with slight per-instance variation) and `bloom` (flower heads, tinted per instance via `instanceColor`). Both are drawn with `InstancedMesh`, so the whole garden is about 18 draw calls.

| Archetype | Shape | Species (Latin) |
|---|---|---|
| `spike` | Tall stem, vertical flower spike | Verbascum nigrum, Lythrum salicaria, Veronica longifolia, Salvia pratensis, Echium vulgare, Verbena bonariensis (airy, tall) |
| `umbel` | Stem topped with a flat/plume cluster | Filipendula ulmaria, Tanacetum vulgare, Foeniculum vulgare, Daucus carota |
| `daisy` | Stem with a disc-shaped flower head | Cichorium intybus, Leucanthemum vulgare, Aster ageratoides, Centaurea scabiosa, Centaurea jacea, Scabiosa columbaria, Catananche caerulea, Helianthus annuus (large, but only as seedling for now), Malva sylvestris, Geranium pratense, Dianthus carthusianorum, Saponaria officinalis, Silene flos-cuculi, Althaea officinalis, Primula elatior |
| `bell` | Nodding or bell-shaped flowers on a stem | Campanula trachelium, Campanula persicifolia, Geum rivale, Symphytum grandiflorum |
| `globe` | Spherical or cone flower head | Echinops bannaticus, Allium 'Millenium', Eryngium planum, Dipsacus fullonum |
| `mat` | Low flat cushion/creeping mat with tiny flowers | Thymus serpyllum, Thymus pulegioides, Thymus praecox, Sedum album, Helianthemum nummularium, Galium verum, Limonium vulgare |
| `tuft` | Upright grass/rush tuft | Juncus inflexus |
| `shrub` | Rounded shrub, thicker stems, leaf blobs | Viburnum opulus, Cornus mas, Frangula alnus, Euonymus europaeus |
| `seedling` | Two cotyledon leaves on a tiny stem | All `stage: "seed"`: Helianthus annuus, Tropaeolum majus, Papaver rhoeas, Amaranthus caudatus |

`species.js` holds, per Latin name: `archetype`, `height` (m, from general horticultural knowledge), `flowerColor` (hex), `foliageTint`. This table is **editorial metadata, not API data**. Mark it as such in code comments and in the plant card ("Appearance is illustrative"). Species missing from the table fall back to `daisy` with a neutral colour and a `console.warn`, so new API data never crashes the scene. Strip cultivar names (`'Blue Globe'`) when matching the base species and show them in the card.

Geometry budget: **under 250 triangles per archetype instance**, flat shading (`MeshLambertMaterial`, `flatShading`) for a clean stylised look.

### 5.3 Placement (`placement.js`)
No positions exist in the API, so placement is **generated but deterministic**:
- Seed a PRNG (mulberry32) from a string hash of `area_ref + batch index + plant.name`. The same data always gives the same garden.
- Poisson-disc sampling inside the polygon with a minimum distance per archetype (mat 0.15 m, bell/daisy 0.3 m, globe/umbel 0.4 m, spike 0.35 m, shrub 0.9 m).
- Ecological-looking zoning: shrubs toward the north edge, tall (`spike`, `umbel`, `globe`) in the middle ring, `mat` toward edges and the front (south), `seedling` scattered in open gaps. Instances of one batch are **clustered** within a radius of about 0.8 m so drifts look natural.
- Output: `plants[] = { id, batchId, species, archetype, x, z, scale, rotY, tint, flowerAnchor: {x,y,z} }`. `flowerAnchor` is kept for the butterfly later.

### 5.4 Wind and life (decorative)
GPU-only sway: patch `MeshLambertMaterial` via `onBeforeCompile` to offset vertices by `sin(time + worldPos.x*k) * heightFactor`. Zero CPU cost per plant. Honour `prefers-reduced-motion` (sway amplitude 0).

### 5.5 Atmosphere
- Sky: one large inside-out sphere with a vertex-colour gradient shader (horizon to zenith), no textures. Night adds about 150 star points and a simple moon disc opposite the sun.
- Sun: `DirectionalLight` on the computed solar azimuth/elevation. Below the horizon, switch to a dim blue "moonlight" ambient. A `HemisphereLight` for fill. **One** shadow-casting light, shadow map 1024², small frustum fitted to the bed (about 12 m).
- Fog: `FogExp2`, density driven by `air.humidity`; fog colour follows the sky horizon colour.
- Mist/steam: one `Points` object with about 400 to 600 soft sprites near the ground. Count and opacity scale with humidity, steam rises where soil is warmer than air. Single draw call, animated in the vertex shader.
- Tone mapping: `ACESFilmicToneMapping`, sRGB output. **No post-processing passes** (keeps it cheap).

---

## 6. Time system (`timeline.js`)

- `TimeStore` holds `t` (a float timestamp in ms) within `[firstReading, lastReading]`.
- `sample(t)` returns the linearly interpolated reading (numbers lerp, `datetime` is `t`). Provide `sampleNormalised(t)` with 0..1 values.
- Controls: **play/pause**, **speed** (1 h/s, 3 h/s, 6 h/s, 12 h/s), **scrub slider** (hour resolution with smooth drag), **"Now" button** (jump to last reading), **loop** toggle, and keyboard: `Space` play/pause, `←/→` step 1 h, `Shift+←/→` step 1 day.
- Default on load: paused at the **latest reading** ("what is happening now"), with a "Replay the week" call-to-action that plays from the start.
- Day markers on the slider, tick per midnight (Europe/Amsterdam). Hover shows the date, hour and temperature.
- `timeline-chart.js`: small canvas chart under the slider with `light.clear` as area (shows day/night rhythm) and air temperature as line. Costs nothing, makes scrubbing meaningful.
- Emits a `change` event with the sample. All systems read from the store each frame (no per-system timers).
- When the hourly reload brings new readings, **append** them to the store without moving the playhead, unless it was on "Now".

---

## 7. Interaction and UI

- **Camera:** orbit (drag), zoom (wheel/pinch), pan limited to the garden. Clamp polar angle (no looking from below the ground) and distance (1.5 to 25 m). Smooth damping. Touch supported. Start with a slow auto-orbit that stops on first interaction.
- **Hover** a plant: soft outline or brighten + cursor pointer. **Click:** camera eases toward it and a card appears (common name, Latin name, archetype colour swatch, amount, stage, planted age at the current time, supplier, rank note, "illustrative appearance" note).
- **Plant list panel** (collapsible): searchable list of all 48 batches; click to focus. Filter chips for stage (plant/seed) and supplier.
- **HUD:** current local date/time, air and soil temperature, humidity, light, soil moisture, `record_count` badge, data-source line ("Bioto API · cached · last updated hh:mm").
- **Legend:** which sensor values drive which visual, and what is decorative (section 3.3).
- **Responsive:** HUD stacks at phone width, 16 px gutters, no horizontal scroll. Respect `prefers-color-scheme` for the UI chrome (the 3D scene is its own world).
- **Loading and errors:** skeleton "Waking up the garden…" while fetching. If an endpoint fails, show a readable message and keep the last good cache. No retry loops in the client.
- **WebGL check:** if WebGL is unavailable, show a message with a link back to the 2D dashboard.

---

## 8. Performance budget and strategy

| Budget | Target |
|---|---|
| Frame rate | 60 fps desktop integrated GPU; 30+ fps mid-range phone |
| Draw calls | ≤ 40 |
| Triangles | ≤ 150k total (about 113 plants × ≤250 plus ground, sky, particles) |
| Download | ≤ 1.5 MB total JS (three.module.min is about 700 KB gzip-friendly), **zero image/model assets** |
| Texture memory | Only a tiny generated sprite for mist and the shadow map |

Tactics:
- `InstancedMesh` per archetype part; compute bounding spheres once and set `frustumCulled` appropriately.
- Static geometry, matrices written once (plants don't move on the CPU), animation only in vertex shaders and uniforms.
- Renderer: `antialias: true`, `powerPreference: "high-performance"`, **pixel ratio capped at 1.5** by default (2 max on request).
- `quality.js`: rolling average of frame time; if above about 20 ms for 2 s, step down (pixel ratio, then shadows off, then mist count halved). Never step back up within the session to avoid flicker.
- Pause the render loop when the tab is hidden (`document.visibilitychange`). **Render on demand** when time is paused and the camera is idle (damped controls settled), so an idle page uses about 0 GPU.
- Reuse materials and geometries, avoid per-frame allocations (preallocate `Vector3`/`Color`).
- Dispose everything on teardown, and don't create objects inside the render loop.

---

## 9. Butterfly readiness (future feature, build the seams now, not the butterfly)

Design constraints so a player-controlled butterfly can be added without refactoring:

1. **Camera behind an interface.** `CameraRig { update(dt), enable(), disable() }`. `OrbitRig` ships now. A `FollowRig` (chase camera behind the butterfly) swaps in later via `engine.setRig()`.
2. **Systems list with delta time.** `engine.addSystem({ update(dt, ctx) })`, where `ctx` has the `world`, the current `sample`, and `input`. The butterfly becomes one more system plus entity.
3. **Input abstraction.** `input.js` exposes actions (`move`, `ascend`, `boost`) and not raw events. Orbit uses pointer, the butterfly will use WASD/arrows/touch stick.
4. **World queries.** `world.groundHeight(x,z)`, `world.bounds` (polygon plus margin), `world.isInside(x,z)`, and `world.nearestPlants(pos, radius)` (uniform grid spatial hash, built in `placement.js`).
5. **Flower anchors.** Every plant has `flowerAnchor` (the top of its bloom) so a butterfly can land or feed. Plants carry a `nectarValue` (higher for `umbel`, `spike`, `daisy` in bloom; 0 for seedlings, `tuft`, `shrub`) for AI or scoring later.
6. **Scale and near plane.** The camera near plane is 0.05 and the far plane 200, so flying at 0.2 m above a flower doesn't clip. Plants are modelled at true scale (metres).
7. **Time keeps working.** The butterfly world reads the same `TimeStore`. Day/night and weather can affect butterfly behaviour later (butterflies rest when `light.clear` is low).
8. **Plant instances addressable.** Keep an `instanceId → plant` map per archetype mesh and a `plantId → instance` map, so individual blooms can be highlighted when visited.
9. **No global singletons** besides the engine. Modules receive their dependencies in constructors, which makes a future `butterfly/` folder easy to add.

---

## 10. Milestones (build in this order, each ends in a working, demo-able state)

### M0, Data plumbing and skeleton
- Add `data/history.json`: when `getGarden()` refreshes, **merge** new readings into `history.json` keyed by `datetime` (dedupe, sort). Expose `GET /api/history`. This lets the timeline grow beyond 7 days across the hackathon **without extra API calls**.
- `npm i three@0.170.0`, vendor routes in `server.js`, `/garden/` page with importmap, link from the dashboard.
- `data/api.js` loads the four JSON sources, validates shape, fails loudly with readable errors.
- **Done when:** `/garden/` renders an empty three.js canvas, console shows the loaded counts (readings, features, batches), and Network shows only `localhost` requests.

### M1, World base
- `geo.js`, polygon bed, surrounding ground, sensor post at the right spot, `OrbitRig`, fog, basic light.
- **Done when:** the bed has the correct shape and about 8.8 m size, orbiting feels good on desktop and touch.

### M2, Plants
- `species.js` covering **all 48 Latin names** (strip cultivars when matching), 9 archetypes, `placement.js`, instanced layers, wind shader.
- Picking, plant card, list panel.
- **Done when:** the total instance count equals the sum of `amount` (113) plus 6 × 4 seedlings (24), no overlaps (check min-distance), reload gives an identical layout, every species has a non-fallback archetype (console warns otherwise), and clicking any instance shows the right batch.

### M3, Time and sky
- `TimeStore`, controls, slider with day ticks, sun position from lat/lon/time, sky dome, day/night, shadows.
- **Done when:** scrubbing from 9 Nov to 16 Nov shows sun rising about 07:30 and setting about 16:45 Amsterdam time, night is properly dark, and playback is smooth at all speeds.

### M4, Data-driven atmosphere
- Implement the full mapping table (3.2): light intensity and tint, temperature grade, humidity fog and mist, soil wetness, steam.
- Legend panel and timeline chart.
- **Done when:** visibly distinct moods exist for: foggy cold night, overcast midday (11 Nov), clear sunny midday (12 Nov), and a changing HUD that matches the raw JSON values at any chosen hour (spot-check three timestamps against `data/garden.json`).

### M5, Polish and resilience
- Loading and error states, WebGL fallback, responsive layout, reduced motion, keyboard shortcuts, hourly append of new readings.
- Adaptive quality, visibility pause, render-on-demand.
- **Done when:** the performance budget (section 8) holds (see verification), and the app works in current Chrome, Firefox, Safari and Edge.

### M6, Butterfly seams review
- Walk through section 9 and confirm each seam exists and is used by the orbit camera and picking code (not dead code). Add a hidden debug "free-fly camera" (`?fly=1`) to prove that a second `CameraRig` can swap in.
- **Done when:** swapping rigs works with no changes outside `camera-rig.js` and `main.js`.

### Stretch (only if time remains)
- Species-specific "bloom season" overlay (editorial, marked as such).
- Ambient bees/butterflies as simple non-player boids (would also test the world queries).
- Share link with `?t=<iso>` to open the garden at a given moment.
- Ambient soundscape that follows the light level.

---

## 11. Verification (the builder should actually run these)

1. **Correctness:** pick 3 timestamps, compare HUD values and the sampled reading to `data/garden.json`. Check one in-between time for correct interpolation.
2. **Counts:** assert in a dev console helper that instances = 113 + 24, and that every `planting.json` batch is represented.
3. **Determinism:** reload twice, compare plant positions (hash of the positions array in the console).
4. **API hygiene:** DevTools Network tab: zero requests to `api.bioto.co`, only `/api/*` on localhost. Reloading the page must not change `data/garden.json` modification time (unless a new hour is due).
5. **Performance:** add a `?stats=1` overlay (fps, frame ms, draw calls, triangles via `renderer.info`). Record the numbers at the default view and at a close-up in the milestone notes. Test with CPU 4× throttle and on a phone viewport (use the Browser pane's mobile preset).
6. **Failure modes:** stop the server's cache (rename `data/layout.json` temporarily offline, or simulate 500s) and confirm the UI shows a readable error without retry storms.
7. **Visual QA:** screenshots at: dawn, noon, dusk, midnight, foggy night, overcast day, close-up of a plant.

---

## 12. Open assumptions (decide if you disagree, otherwise proceed)

- Appearance data (colours, heights, archetypes) is illustrative and curated by us, not from the API.
- Plants are shown in a "full display" state regardless of November. A season overlay is a stretch goal.
- Soil moisture has no documented unit, so it is shown as relative wetness within the observed range.
- Timestamps are treated as UTC (supported by the observed light curve).
- Desktop is the primary demo target, mobile must work but can run at reduced quality.
