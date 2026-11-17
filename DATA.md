# Puintuin data overview

Source: Bioto partner API (`https://api.bioto.co`, Bearer token), garden **Puintuin Wijkpaleis** (Rotterdam, Plantenluisteraar PL-15).
Snapshot taken 16 Nov 2026. Local copies live in `data/` (git-ignored). Fetched with `npm run fetch`.

| Endpoint | Local file | Changes? | Refresh |
|---|---|---|---|
| `GET /partner/garden/{uuid}/` | `data/garden.json` | New reading every hour | Max once per hour |
| `GET /partner/garden/{uuid}/layout` | `data/layout.json` | No (static) | Fetch once |
| `GET /partner/garden/{uuid}/layout/{area_ref}` | `data/planting.json` (keyed by area ref) | No (static) | Fetch once |

---

## 1. Garden and sensor readings: `garden.json`

```
{ name, loc: {longitude, latitude, height}, readings: [ ... ] }
```

| Field | Description |
|---|---|
| `name` | Garden name: "Puintuin Wijkpaleis" |
| `loc.latitude` / `loc.longitude` | Position of the Plantenluisteraar (about 51.9152, 4.4606). `height` is `null`. |
| `readings` | 167 hourly measurements, 9 Nov 12:00 to 16 Nov 10:00 (2026). No gaps, always exactly 1 hour apart. |

### One reading

| Field | Unit | Observed range | Meaning |
|---|---|---|---|
| `datetime` | ISO 8601, no timezone | n/a | Start of the measured hour |
| `air.temperature` | °C | 1.9 to 17 | Air temperature |
| `air.humidity` | % | 49 to 100 | Relative air humidity |
| `soil.temperature` | °C | 5.1 to 10.4 | Soil temperature |
| `soil.humidity` | raw sensor value | 1787 to 2047 | Soil moisture. No unit given, higher means wetter (assumed). |
| `light.clear` | raw counts | 0 to 8707 | Total visible light (broadband) |
| `light.nir` | raw counts | 0 to 4842 | Near-infrared light |
| `light.f1` to `light.f8` | raw counts | 0 to about 10000 | Spectral bands of the light sensor (8 channels, blue to red, F1 shortest wavelength). Not calibrated. |
| `record_count` | count | 3 to 10 | Number of raw sensor records averaged into this hourly value (higher means more reliable) |

Notes:
- Values are 0 at night for all light fields.
- No `null` values in this snapshot.
- Timestamps carry no timezone. Treat them as local or UTC and check against the daylight curve before relying on it.

---

## 2. Garden layout: `layout.json`

GeoJSON `FeatureCollection` (WGS84, `[longitude, latitude]`). Works directly in Leaflet, MapBox, QGIS and geojson.io.
This garden contains **1 feature**:

| Field | Value |
|---|---|
| `geometry.type` | `Polygon` (8 corner points, small roundish bed) |
| `id` / `properties.ref` | `i2WdfCcDSy6Rqr6DfrTZtxm7r0gyESKV`, the **area ref** used for the planting endpoint |
| `properties.type` | `plantable` |
| `properties.surface` | about 55.4 (m²) |

Note: the manual calls the key `area_ref`, but in the actual data it is `properties.ref` (same as the feature `id`).

---

## 3. Planting plan: `planting.json`

Object keyed by area ref, each value is a list of planting batches. Currently 1 area with **48 batches**.

| Field | Description |
|---|---|
| `plant.name` | Latin name, e.g. "Filipendula ulmaria" |
| `plant.vernacular_name` | Dutch name, e.g. "Moerasspirea". `null` for 11 of 48. |
| `plant.taxonomic_rank` | `Species` or `Doubtful` (identification uncertain) |
| `amount` | Number of plants. `null` for 4 of 48 (e.g. seeded or self-seeded). |
| `stage` | `plant` or `seed` |
| `planted_on` | Date (`YYYY-MM-DD`), from 2026-04-01. Often the 1st of a month, so it's approximate. |
| `supplier.name` | `Natuurlijk sterker`, `Own collection`, `Bolster` or `Self-seeded` |

---

## Ideas for combining the data

- Compare `light.clear` and the spectral bands against the plant list (sun-loving or shade plants).
- Soil temperature lags behind air temperature, which shows how well the soil buffers cold nights.
- Air humidity and soil moisture patterns around rain events.
- Use `record_count` as a data-quality filter.

## Caveats

- The planting plan is a plan, not a live observation of what is growing.
- Only one sensor and one area, so readings can't be linked to specific plants.
- The 7-day window rolls forward, so save snapshots if you want a longer history (see the hourly refresh rule in the manual).
