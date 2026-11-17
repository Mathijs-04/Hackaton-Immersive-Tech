// TimeStore: owns "what moment are we looking at" and turns hourly readings into a smooth
// signal. Every system reads from here; nothing else keeps its own clock.
import { sunPosition } from './sun.js';

const HOUR = 3600e3;
// A reading labelled 10:00 is the average of 10:00–11:00 (light starts in the 06:00 reading,
// sunrise is ~06:40 UTC), so it is placed in the middle of its hour.
const MID_HOUR = HOUR / 2;
const CHANNELS = ['airT', 'airH', 'soilT', 'soilH', 'clear', 'nir', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'rc', 'cloudless',
  'cover', 'rain', 'fog', 'frost'];
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Flattens an API reading into numbers we can interpolate. */
function flatten(r) {
  const l = r.light || {};
  return {
    datetime: r.datetime,
    t: Date.parse(r.datetime + 'Z') + MID_HOUR, // timestamps are UTC without a zone
    airT: r.air?.temperature ?? NaN, airH: r.air?.humidity ?? NaN,
    soilT: r.soil?.temperature ?? NaN, soilH: r.soil?.humidity ?? NaN,
    clear: l.clear ?? 0, nir: l.nir ?? 0,
    f1: l.f1 ?? 0, f2: l.f2 ?? 0, f3: l.f3 ?? 0, f4: l.f4 ?? 0,
    f5: l.f5 ?? 0, f6: l.f6 ?? 0, f7: l.f7 ?? 0, f8: l.f8 ?? 0,
    rc: r.record_count ?? 0,
    cloudless: 0.5,
  };
}

function percentile(values, p) {
  if (!values.length) return 1;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

export class TimeStore extends EventTarget {
  constructor(apiReadings, loc) {
    super();
    this.loc = loc;
    this.readings = [];
    // Live (default): the garden shows the real current moment. The sun follows the wall clock
    // and the sensor values come from the newest hourly reading. Manual: a moment someone picked.
    this.live = true;
    this.append(apiReadings);
    this.t = this.now;
  }

  /**
   * Archived: the newest reading is more than 6 h old (the live feed stopped, e.g. the project is
   * over, or the API has been down for a long time). We then show the last reading instead of
   * pretending that the sun and the sensor values are "now".
   */
  get archived() { return Date.now() - this.end > 6 * HOUR; }
  /** "Now" for the garden: the wall clock, or the last reading when archived. */
  get now() { return this.archived ? this.end : Date.now(); }

  get start() { return this.readings[0].t; }
  get end() { return this.readings[this.readings.length - 1].t; }
  /** Latest moment you can look at: now (values after the newest reading stay at that reading). */
  get latest() { return Math.max(this.end, this.now); }
  /** The newest hourly reading (its hour starts at reading.t − 30 min). */
  get newest() { return this.readings[this.readings.length - 1]; }

  /** Adds readings (dedupes by datetime) and recomputes stats. Returns number of new readings. */
  append(apiReadings) {
    const known = new Set(this.readings.map((r) => r.datetime));
    const fresh = apiReadings.filter((r) => !known.has(r.datetime)).map(flatten);
    if (!fresh.length && this.readings.length) return 0;
    this.readings = [...this.readings, ...fresh].sort((a, b) => a.t - b.t);
    this.computeDerived();
    this.dispatchEvent(new Event('data'));
    if (this.live && this.t) this.dispatchEvent(new Event('change')); // same moment, newer values
    return fresh.length;
  }

  /**
   * Derived "cloudlessness": measured light divided by what the sun height allows, scaled so the
   * brightest 10% of daytime hours count as fully clear. A real signal computed from sensor + astronomy.
   */
  computeDerived() {
    const { latitude, longitude } = this.loc;
    const ratios = [];
    for (const r of this.readings) {
      r.sunAlt = sunPosition(r.t, latitude, longitude).altitude;
      r.ratio = r.sunAlt > 0.14 ? r.clear / Math.sin(r.sunAlt) : NaN; // > ~8° sun height
      if (Number.isFinite(r.ratio)) ratios.push(r.ratio);
    }
    const ref = percentile(ratios, 0.9) || 1;
    let last = 0.5;
    for (const r of this.readings) {
      if (Number.isFinite(r.ratio)) last = Math.min(1, r.ratio / ref);
      r.cloudless = last; // nights carry the last daytime value (no light = no information)
    }
    this.computeWeather();
    // Normalisation ranges over everything we have.
    this.stats = {};
    for (const k of CHANNELS) {
      let min = Infinity, max = -Infinity;
      for (const r of this.readings) {
        const v = r[k];
        if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
      }
      this.stats[k] = { min, max: max > min ? max : min + 1 };
    }
  }

  /**
   * DERIVED weather (there is no rain gauge or cloud sensor; soil moisture is too noisy to show rain).
   *  - cover (0..1): by day = 1 − cloudlessness (measured light vs sun height).
   *                  at night = how fast the air cools: clear skies radiate heat away, clouds hold it.
   *  - rain: cold + very humid + overcast together.
   *  - fog:  near-saturated air under a clearing sky (typical radiation fog).
   *  - frost: below ~3 °C on a clear night.
   */
  computeWeather() {
    const rs = this.readings;
    rs.forEach((r, i) => {
      const prev = rs[Math.max(0, i - 3)];
      const cooling = r.airT - prev.airT; // °C change over ~3 hours
      const day = r.sunAlt > 0.05;
      const nightCover = Math.min(1, Math.max(0, (cooling + 1.5) / 2));
      r.cover = day ? 1 - r.cloudless : nightCover;
      const wet = smoothstep(89, 97, r.airH);
      const cold = smoothstep(14, 8, r.airT);
      r.rain = wet * cold * smoothstep(0.6, 0.9, r.cover);
      r.fog = smoothstep(93, 100, r.airH) * (1 - 0.8 * smoothstep(0.5, 0.9, r.cover));
      r.frost = day ? 0 : smoothstep(4, 2, r.airT) * (1 - r.cover);
    });
  }

  norm(key, value) {
    const s = this.stats[key];
    return Math.min(1, Math.max(0, (value - s.min) / (s.max - s.min)));
  }

  /** Index i such that readings[i].t <= t < readings[i+1].t */
  indexAt(t) {
    const r = this.readings;
    let lo = 0, hi = r.length - 1;
    if (t <= r[0].t) return 0;
    if (t >= r[hi].t) return hi;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (r[mid].t <= t) lo = mid; else hi = mid;
    }
    return lo;
  }

  /** Linearly interpolated reading at time t. Pass `out` to avoid allocations. */
  sample(t = this.t, out = {}) {
    const i = this.indexAt(t);
    const a = this.readings[i], b = this.readings[Math.min(i + 1, this.readings.length - 1)];
    const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    for (const k of CHANNELS) out[k] = a[k] + (b[k] - a[k]) * f;
    out.t = t;
    out.index = i + f;
    out.nearest = f < 0.5 ? a : b;
    return out;
  }

  setTime(t) {
    const clamped = Math.min(this.latest, Math.max(this.start, t));
    if (clamped === this.t) return;
    this.t = clamped;
    this.dispatchEvent(new Event('change'));
  }

  /** Look at a chosen moment. Going to (almost) now switches back to live. */
  setManual(t) {
    if (t >= this.now - 60e3) return this.goLive();
    const wasLive = this.live;
    this.live = false;
    this.setTime(t);
    if (wasLive) this.dispatchEvent(new Event('state'));
  }

  step(hours) { this.setManual(this.t + hours * HOUR); }

  goLive() {
    const was = this.live;
    this.live = true;
    this.setTime(this.now);
    if (!was) this.dispatchEvent(new Event('state'));
  }

  /** Live: follow the wall clock. Updating every 20 s is plenty (the sun moves ~0.08° in that time). */
  update() {
    if (this.live && this.now - this.t > 20e3) this.setTime(this.now);
  }
}
