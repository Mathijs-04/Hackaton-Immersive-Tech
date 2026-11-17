# Biotopia

Bioto hackathon (team 14). Biotopia brings the real Puintuin to life with live data from the Plantenluisteraar.

Two views on the real Plantenluisteraar data from the Puintuin:

| URL | What |
|---|---|
| `http://localhost:3000/` | 2D dashboard (charts, map, planting list) |
| `http://localhost:3000/garden/` | **Biotopia**: 3D garden showing the garden live (current hour); fly as a butterfly or a honeybee |

## Run

```bash
npm install
cp .env.example .env   # fill in BIOTO_TOKEN and GARDEN_UUID
npm start              # http://localhost:3000
```

`npm run fetch` pre-downloads the layout and planting plan (also happens automatically on first request).

**Hosting on GitHub Pages** (static site, hourly data via a GitHub Action for a limited window, no secrets in the site): see [PAGES.md](PAGES.md).

## How data flows (and why the API stays happy)

- The browser only calls our own `/api/*`. The token lives in `.env` on the server.
- `lib/bioto.js` caches everything in `data/`, max 1 request per second, exponential backoff, no retry loops on 4xx.
- Layout and planting plan: fetched once. Live readings: at most once per clock hour (from :05).
- `data/history.json` merges every reading we have seen, so the 3D timeline keeps growing beyond the API's 7-day window without extra API calls.

## 3D garden (V2): what is real and what is illustrative

| From the sensor | Visual |
|---|---|
| light (`clear`) | sun and sky brightness |
| spectrum F1–F8 | subtle tint of the sunlight |
| air temperature | horizon colour grade, insect warmth |
| air humidity | fog and mist |
| soil moisture | dark, glossy wet soil |
| soil warmer than air | rising steam |

**Derived weather** (there is no rain gauge or cloud sensor; soil moisture is too noisy to show rain):
- **Cloud cover:** by day, measured light compared with the light the sun's height allows. At night, how fast the air cools: clear skies radiate heat away, clouds hold it.
- **Rain:** cold, very humid and overcast together (≈15 % of hours).
- **Mist:** near-saturated air under a clearing sky.
- **Frost:** below about 3 °C on a clear night.

The HUD shows the weather (🌧️ Regen, 🌫️ Mist, ☀️ Zonnig …). The sky has procedural clouds, rain falls as GPU streaks, and frost whitens the grass.

**Wildlife follows the weather.**
- Five butterflies (koolwitje, citroenvlinder, kleine vos, atalanta) and seven bumblebees fly when it is warm, light and dry; otherwise the butterflies settle on flowers and the bumblebees return to the bee hotel.
- Ten **honeybee foragers** fly from the beehive (needs ~12 °C, sun and no rain), visit 3–5 flowers, leave scent marks and fly home.
- Three **dragonflies** hover and dart over the bed on warm, sunny, dry days, and perch on tall plants otherwise.
- **Ladybirds** and ground beetles crawl in any weather, slower in the cold. **Snails** come out when it is damp, rainy or night.
- **Wood mice** dash and sniff around the bed at dusk and night. **Pipistrelle bats** hunt in loops at night when it is dry and above ~6 °C.
- Birds circle overhead by day, fewer in rain, none at night.

From the API (planting plan and layout): bed shape, sensor position, which species, how many, planting dates.
Astronomy: sun and moon position from date, time and GPS.
Illustrative (no data): plant positions (generated deterministically, no overlapping canopies), plant shapes and colours (`plants/species.js`), grass, undergrowth, hedge, the forest around the garden (deciduous trees in autumn colours, conifers, shrubs, ferns), wind, rubble, the beehive.

**Live by default:** the garden shows the real current moment. The sun and moon follow the wall clock; sensor values come from the newest hourly reading. If it is dark and raining in the Puintuin, it is dark and raining here. The server refreshes from the Bioto API once per hour (at :05, also when nobody has the page open) and the page reloads the data at :07 and when a sleeping tab becomes visible again.

**Time picker:** the bar at the bottom lets you look back hour by hour with the slider (or `← →`, `Shift` for ±1 day). **Live** (or `L`) returns to now. Night, rain and fog are deliberately kept readable (raised ambient light), since this is a learning tool.

**Controls:** drag/scroll to orbit/zoom, click a plant or the Plantenluisteraar for info.
**Debug:** `?stats=1` (fps, draw calls, triangles), `?fly=1` (free-fly camera), `?vlinder=1` (start as the butterfly). In the console, `garden` exposes everything, including `garden.life.census()` and `garden.counts` (overlaps, layout hash).

## Code map (`public/garden/`)

```
main.js       wiring, flight mode, hourly refresh, debug handle
core/         engine loop + systems, adaptive quality, input actions, camera rigs (orbit, follow, free-fly)
data/         API loading, TimeStore (interpolation, derived weather), sun position
world/        projection, GardenWorld, ground (soil, grass, undergrowth, hedge, trees), sky + clouds, rain, atmosphere, textures
plants/       species table, procedural archetypes + wind shader, placement (+ relaxation), instancing, picking
life/         wildlife models and behaviour (butterflies, bumblebees, honeybee foragers, dragonflies, beetles, snails, mice, bats, birds), bee hotel, beehive
butterfly/    the player's butterfly: model, flight, landing, energy (shared flight core)
bee/          the player's honeybee: model, nectar collecting, delivery
ui/           HUD, live/time picker, plant info drawer, dialogs, flight HUD
```

### Two characters: choose in **Beleef** (or press `V`)
A short chooser shows both animals in one line each; the details follow after choosing (tips and controls are folded away). `?vlinder=1` / `?bij=1` start straight in flight.

### The honeybee 🐝
A worker honeybee (~1.3 cm): smaller than the butterfly (closer camera, wider lens), faster and more agile, but she burns energy faster. She has a job: fill her honey stomach with nectar and bring it to the beehive next to the garden.

- **Collecting:** land on a flower to sip. A good flower gives up to 20% of a full load; after 5–6 flowers the honey stomach (≈40 mg) is full. A compass in the HUD points to the hive.
- **Delivering:** land on the hive's landing board. You get a card with your total (and how much honey it becomes) and a new bee fact each trip (waggle dance, fanning nectar into honey, colony size, UV vision…). Energy refills at home.
- **Real bee rules:** *flower constancy* (staying with one species per trip gives ×1.3 from the second flower), *scent marks* (a flower you or a forager just emptied stays empty for a while), *nectar as fuel* (when tired she burns part of her load), and the same data-driven warmth/rain effects as the butterfly.
- **Less interruption:** the full plant card only appears for a species she hasn't visited yet; after that, short toasts.

### The butterfly 🦋
Press **🦋 Vliegen** (or `V`) to fly a **Boomblauwtje** (holly blue). It is life-size (about 3 cm) and the camera sits close behind it, so the 9 m garden feels like a big world and the flowers tower overhead.

- **Controls:** `WASD`/arrows steer, `Space` up, `Q` down, `Shift` faster, `Esc` stop. Drag to look around, scroll to zoom. On phones: a joystick and up/down buttons.
- **Landing:** let go above a flower and the butterfly lands on a real flower head, sways with it in the wind and drinks nectar, which refills its energy. Each new species counts towards your collection (43 nectar species).
- **Data-driven:** warmth comes from air temperature plus direct sun. A cold night means stiff, slow wings; rain means heavy wings and faster tiring.
- **When nobody is flying it:** it drifts to the nearest flower and rests there.

## Performance (measured)
V2 on an Intel UHD integrated GPU at 1024×768: about 10 ms per frame (median, forced GPU sync). That is about 380k triangles (half of it grass) and about 50 draw calls. The forest and extra wildlife add roughly 90k triangles and ~25 draw calls, all instanced and shadow-free; the forest starts just beyond the orbit camera's reach (max 19 m) so it never blocks the view. There are still no image or model files: every texture is generated in a canvas at startup. Adaptive quality lowers resolution, shadows, mist and grass density if frames get slow.
