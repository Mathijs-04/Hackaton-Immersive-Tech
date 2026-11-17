# How Biotopia works

A technical guide for people who want to understand, change or extend the app. For installation and the main features, see the [README](../README.md).

## 1. Overview

```
Bioto API ─► lib/bioto.js ─► server.js ─► /api/*.json ─► public/garden (Three.js scene)
(hourly)      cache + rate     (or GitHub      history      TimeStore → Atmosphere → world,
              limit            Action)         layout       plants, wildlife, players, UI
                                               planting
```

- The browser loads three JSON files: `history.json` (garden name, GPS position and hourly sensor readings), `layout.json` (the shape of the plantable area) and `planting.json` (which plants, how many, when planted). A fourth file, `public/data/plants.json`, holds our own plant information.
- `TimeStore` (`data/timeline.js`) owns "which moment are we looking at". Everything else reads from it.
- `Atmosphere` (`world/atmosphere.js`) turns the sensor values of that moment into sky, light, fog, rain and soil. Other systems (wildlife, flight) read the resulting weather from it.
- The scene is built once at start-up and updated every frame by a list of systems (`core/engine.js`). The loop drops to a lower frame rate when nothing moves.

## 2. Time: live, look back, archive

- **Live (default):** the sun and moon follow the wall clock, the sensor values come from the newest hourly reading.
- **Look back:** the slider (or `←` `→`) picks an earlier hour. **Live** returns to now.
- **Archive:** if the newest reading is more than 6 hours old (the data feed stopped, or the demo snapshot is old), the app shows the last recorded moment and says so, instead of mixing a fake "now" with old data.
- Readings are hourly averages. They are placed in the middle of their hour and interpolated, so the light curve lines up with the sun. Data is UTC; everything shown to people is `Europe/Amsterdam` (`ui/format.js`).

## 3. From sensor values to visuals

| Sensor value | Used for |
|---|---|
| Light (`clear`) | Sun and sky brightness |
| Light spectrum F1–F8 | A subtle tint of the sunlight |
| Air temperature | Horizon colour, and how warm it feels to insects |
| Air humidity | Fog and mist |
| Soil moisture | Dark, glossy wet soil |
| Soil warmer than air | Rising steam |

The sensor has no rain gauge or cloud sensor, so the weather is **derived** (in `data/timeline.js`):

- **Cloud cover:** by day, the measured light compared with the light the sun's height allows. At night, how fast the air cools (clear skies cool faster).
- **Rain:** cold, very humid and overcast together.
- **Mist:** near-saturated air under a clearing sky.
- **Frost:** below about 3 °C on a clear night.

The weather label in the top left corner (Regen, Mist, Zonnig…) comes from the same values. Night, rain and fog are deliberately kept readable (raised ambient light), because this is a learning tool.

## 4. The garden

- **Layout and plants:** the bed shape and the plant batches come from the API. Plant *positions* are generated deterministically (the same plan always gives the same garden) with no overlapping canopies (`plants/placement.js`).
- **Plant shapes** are procedural (`plants/archetypes.js`): spike, umbel, daisy, cup, bell, globe, mat, tuft, shrub and seedling. Species-specific height, width and flower colour are in `plants/species.js`.
- **Plant information** (photo, description, value for butterflies and bees, role in a butterfly's life, fun fact) is in `public/data/plants.json`.
- **Scenery:** soil, lawn, grass, hedge, a forest of deciduous trees and conifers with shrubs and ferns (`world/ground.js`). The forest starts beyond the reach of the orbit camera so it never blocks the view. Wind, clouds, rain and fog are shader-based.
- The Plantenluisteraar is modelled at its real GPS position (`world/sensor.js`) and is clickable and landable.

## 5. The two characters

Both share one flight core (`butterfly/butterfly.js`); the bee (`bee/bee.js`) extends it with its own tuning and rules. A follow camera sits very close behind the animal and the lens is changed so plants tower overhead.

**Butterfly (Boomblauwtje, about 3 cm):**
- Cold-blooded: warmth (air temperature plus direct sun) limits speed, climb and stamina. Rain makes the wings heavy.
- Energy is limited and refills on flowers. Landing on a flower head shows the plant, a fun fact and what the plant means for a butterfly (food, eggs and caterpillar food, shelter, basking, lookout).
- With no energy left the animal glides down and rests until it can climb again.

**Honeybee (about 1.3 cm):** smaller and faster, with a job.
- A **honey stomach** holds about 40 mg of nectar, roughly 5–6 flowers. A compass points to the hive (`life/hive.js`); landing there delivers the load, refills energy and shows a new bee fact.
- **Flower constancy:** staying with one species during a trip is faster (×1.3 from the second flower).
- **Scent marks:** a flower that was just emptied stays empty for a while (also for the foraging bees in the scene).
- **Nectar as fuel:** when energy runs low the bee burns part of her load.

## 6. Wildlife

All animals are instanced meshes (`life/`) and react to the same weather values:

| Animal | Behaviour |
|---|---|
| Butterflies (5), bumblebees (7) | Fly when it is warm, light and dry; otherwise settle on flowers or go to the bee hotel |
| Honeybee foragers (10) | Leave the hive above about 12 °C, dry and light; visit 3–5 flowers and fly home |
| Dragonflies (3) | Hover and dart on warm, sunny, dry days; perch on tall plants otherwise |
| Ladybirds and ground beetles | Crawl in any weather, slower in the cold |
| Snails (7) | Come out when it is damp, rainy or night |
| Wood mice (3) | Dash and sniff around the bed at dusk and night |
| Bats (3) | Hunt in loops at night when dry and above about 6 °C |
| Birds (7) | Circle overhead by day, fewer in rain, none at night |

## 7. Code map (`public/garden/`)

| Folder | Contents |
|---|---|
| `main.js` | Start-up: loads data, builds the world, wires the UI, characters and refresh |
| `core/` | Engine loop, adaptive quality, input, camera rigs (orbit, follow, free-fly) |
| `data/` | API loading (`api.js`), `TimeStore` with derived weather (`timeline.js`), sun position (`sun.js`) |
| `world/` | Projection and bounds, ground and scenery, sky and clouds, atmosphere, rain, sensor model, textures |
| `plants/` | Species table, procedural shapes, placement, instancing, picking, collision |
| `life/` | Wildlife models and behaviour, bee hotel, beehive |
| `butterfly/`, `bee/` | The two playable characters |
| `ui/` | Status panel and time bar, plant drawer, flight HUD, plant and hive cards, music |
| `index.html`, `style.css` | Page structure, dialogs and the garden-journal theme |

## 8. Performance and accessibility

- Everything is instanced and generated in code: about 80 draw calls and 475k triangles. On integrated graphics it runs smoothly; if frames get slow, `core/quality.js` lowers the pixel ratio, shadows, mist and grass density, one step at a time.
- The interface uses native `<dialog>` elements, visible keyboard focus, large touch targets, AA colour contrast in light and dark mode, and respects *reduced motion*.

## 9. Changing the plants

The app looks plants up by their **Latin name as written in the Bioto planting plan** (including a cultivar such as `Echinops bannaticus 'Blue Globe'`).

1. **Appearance:** add the species to `plants/species.js` (shape, height, width, flower colour). An unknown species still appears, with a default shape and a warning in the console.
2. **Information:** add an entry to `public/data/plants.json` with the same `latinName`: `dutchName`, `description`, `image` (url, sourcePage, author, license), `pollinatorValue` (butterflies and bees, 0–5, plus a note), `butterflyLife` (roles and a text) and `funFact`.
3. If the planting plan or layout changed in Bioto, delete `data/layout.json` and `data/planting.json`, run `npm run fetch`, and copy the new files into `static-data/` (used by demo mode and the website).

## 10. Debugging

- `?stats=1` shows frame rate, draw calls and triangles; `?fly=1` starts a free-fly camera; `?intro=0`, `?vlinder=1`, `?bij=1` skip the welcome or start flying.
- In the browser console, `garden` exposes the engine, time store, world, plants, characters and wildlife (for example `garden.life.census()` counts the animals that are out).
