# Data and API

Biotopia uses the **Bioto partner API** (`https://api.bioto.co`) for one garden, the *Puintuin Wijkpaleis* in Rotterdam, which has a Plantenluisteraar sensor (PL-15).

## Getting access

You need two things from Bioto: a **Bearer token** (`BIOTO_TOKEN`) and the **garden id** (`GARDEN_UUID`). Put them in `.env` (copy `.env.example`; `.env` is git-ignored so the token is never pushed). Every request sends the header `Authorization: Bearer <token>`.

## Endpoints

| Endpoint | Returns | Changes? | Request it |
|---|---|---|---|
| `GET /partner/garden/{uuid}/` | Garden name, GPS position and hourly sensor readings (last 7 days) | A new reading every hour | At most once per hour |
| `GET /partner/garden/{uuid}/layout` | Shape of the plantable area (GeoJSON) | No | Once |
| `GET /partner/garden/{uuid}/layout/{area_ref}` | Planting plan of one area | No | Once |

The `area_ref` is `features[].properties.ref` in the layout answer. Quick test:

```bash
curl -H "Authorization: Bearer $BIOTO_TOKEN" https://api.bioto.co/partner/garden/$GARDEN_UUID/
```

## How this project uses it politely

`lib/bioto.js` is the only code that talks to the API.

- The browser never contacts Bioto, and the token never leaves the server.
- Answers are cached in `data/` (git-ignored). Layout and planting plan are fetched once; readings at most once per clock hour (from five minutes past the hour).
- At most one request per second, exponential backoff on errors, and a 4xx answer (such as a bad token) is never retried.
- The API only returns a rolling 7 days. `data/history.json` merges every reading we have seen, so the timeline can grow beyond that window without extra requests.
- On the website, a GitHub Action does the hourly request instead of the server (see [deployment](deployment.md)).

## Data files

| File | Source | Content |
|---|---|---|
| `data/garden.json`, `data/history.json` | API (git-ignored cache) | The latest answer, and all readings merged |
| `data/layout.json`, `data/planting.json` | API (git-ignored cache) | Area shape and planting plan |
| `static-data/*.json` | Committed snapshot | Used by demo mode and as the starting point of the website |
| `public/data/plants.json` | Written by the team | Photos, texts and pollinator information per species |

## Garden and readings

`{ name, loc: { longitude, latitude, height }, readings: [ ... ] }`. The position is that of the Plantenluisteraar. Readings are exactly one hour apart.

| Field | Unit | Meaning |
|---|---|---|
| `datetime` | ISO 8601, **UTC**, no zone marker | Start of the measured hour |
| `air.temperature` | °C | Air temperature |
| `air.humidity` | % | Relative air humidity |
| `soil.temperature` | °C | Soil temperature |
| `soil.humidity` | raw sensor value | Soil moisture; no unit given, higher means wetter (assumed) |
| `light.clear` | raw counts | Total visible light |
| `light.nir` | raw counts | Near-infrared light |
| `light.f1` … `light.f8` | raw counts | Eight spectral bands, blue to red (not calibrated) |
| `record_count` | count | How many raw records were averaged into this hour (higher is more reliable) |

All light values are 0 at night. Timestamps are UTC (light peaks around 12:00 UTC in Rotterdam in November); the app converts to `Europe/Amsterdam` for display.

## Layout

A GeoJSON `FeatureCollection` (WGS84, `[longitude, latitude]`) that works directly in Leaflet, QGIS or geojson.io. Each feature is a plantable area with a `properties.ref` (the area ref, also the feature `id`), a `type` and a `surface` in m². (The Bioto manual calls the key `area_ref`; in the actual data it is `properties.ref`.)

## Planting plan

An object keyed by area ref; each value is a list of planting batches:

| Field | Description |
|---|---|
| `plant.name` | Latin name, sometimes with a cultivar, e.g. `Echinops bannaticus 'Blue Globe'` |
| `plant.vernacular_name` | Dutch name; `null` for some plants (our `plants.json` fills the gaps) |
| `plant.taxonomic_rank` | `Species`, or `Doubtful` when the identification is uncertain |
| `amount` | Number of plants; `null` for seeded or self-seeded batches |
| `stage` | `plant` or `seed` |
| `planted_on` | Date `YYYY-MM-DD`; often the first of a month, so approximate |
| `supplier.name` | Where the plants came from |

## Caveats

- The planting plan is a plan, not an observation of what is growing now.
- There is one sensor and one area, so readings cannot be linked to individual plants.
- Rain, cloud cover, mist and frost are **derived** in the app (see [how it works](how-it-works.md)); the sensor does not measure them.
