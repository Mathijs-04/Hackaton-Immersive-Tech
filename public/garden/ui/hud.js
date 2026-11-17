// HUD (live values + weather) and the time picker. Default is live: the garden as it is right now.
// The picker lets you look back hour by hour; "Live" (or sliding all the way right) returns to now.
import { clock, short, time, num } from './format.js';

const $ = (id) => document.getElementById(id);
const HOUR = 3600e3;

export class Hud {
  constructor(store, garden, atmosphere) {
    this.store = store;
    this.atmosphere = atmosphere;
    this.els = {
      hud: $('hud'), name: $('garden-name'), clock: $('clock'), weather: $('weather'), values: $('values'), age: $('data-age'),
      bar: $('timebar'), live: $('btn-live'), range: $('time-range'), label: $('time-label'),
    };
    const e = this.els;
    e.name.textContent = garden.name; // the real garden; the app itself is Biotopia
    e.hud.hidden = false;
    e.bar.hidden = false;
    this.sample = {};
    this.keysEnabled = () => true;

    e.live.addEventListener('click', () => store.goLive());
    // Slider value = whole hours before now (0 = live).
    e.range.addEventListener('input', () => {
      const v = Number(e.range.value);
      if (v >= 0) store.goLive();
      else store.setManual(store.now + v * HOUR);
    });
    window.addEventListener('keydown', (ev) => {
      if (ev.target.closest?.('button, input, select, textarea')) return;
      if (!this.keysEnabled()) return; // flying: arrows steer the butterfly
      if (ev.key === 'ArrowRight') { ev.preventDefault(); store.step(ev.shiftKey ? 24 : 1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); store.step(ev.shiftKey ? -24 : -1); }
      else if (ev.key === 'l' || ev.key === 'L') store.goLive();
    });
    store.addEventListener('state', () => this.render(true));
    store.addEventListener('data', () => this.render(true));
  }

  /** Called every frame; only touches the DOM when the shown minute, weather or mode changes. */
  render(force = false) {
    const s = this.store, st = this.atmosphere.state;
    const w = st.weather ? `${st.weather.icon} ${st.weather.text}` : '';
    const key = `${Math.floor(s.t / 60000)}|${w}|${s.live}|${s.readings.length}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    const v = s.sample(s.t, this.sample);
    const n = (k) => s.norm(k, v[k]);
    const e = this.els;
    e.clock.textContent = clock(s.t);
    e.weather.textContent = w;

    // Where the values come from: the newest reading (live) or the hour you picked.
    const newest = s.newest, from = newest.t - HOUR / 2;
    const ageH = (Date.now() - (from + HOUR)) / HOUR;
    e.age.textContent = s.archived
      ? (s.live ? `Laatste opname: ${short(from)} · de live-koppeling is gestopt` : 'Je kijkt terug in de tijd. Druk op Laatste voor de laatste opname.')
      : s.live
        ? `Laatste meting: ${time(from)}–${time(from + HOUR)}${ageH > 3 ? ` (${Math.round(ageH)} uur geleden)` : ''} · elk uur ververst`
        : `Je kijkt terug in de tijd. Druk op Live voor nu.`;
    e.hud.classList.toggle('past', !s.live);
    $('hud-eyebrow').textContent = s.live ? (s.archived ? 'Laatste opname' : 'Live uit de echte tuin') : 'Terugkijken';
    $('live-label').textContent = s.archived ? 'Laatste' : 'Live';

    // Time picker.
    const min = -Math.ceil((s.now - s.start) / HOUR);
    const val = s.live ? 0 : Math.max(min, Math.round((s.t - s.now) / HOUR));
    e.range.min = String(min);
    e.range.max = '0';
    e.range.value = String(val);
    const label = s.live ? `${s.archived ? 'Laatste' : 'Nu'} · ${time(s.t)}` : short(s.t);
    e.range.setAttribute('aria-valuetext', s.live ? `${s.archived ? 'Laatste opname' : 'Live, nu'} ${time(s.t)}` : short(s.t));
    e.label.textContent = label;
    e.live.setAttribute('aria-pressed', String(s.live));

    const row = (label, value, unit, frac) =>
      `<div><dt>${label}</dt><dd>${value}<small> ${unit}</small></dd><div class="bar"><i style="width:${Math.round(frac * 100)}%"></i></div></div>`;
    e.values.innerHTML =
      row('Lucht', num(v.airT), '°C', n('airT')) +
      row('Luchtvocht', num(v.airH, 0), '%', v.airH / 100) +
      row('Bodem', num(v.soilT), '°C', n('soilT')) +
      row('Bodemvocht', Math.round(n('soilH') * 100), '%', n('soilH')) +
      row('Licht', Math.round(v.clear), '', Math.min(1, v.clear / s.stats.clear.max)) +
      row('Bewolking', Math.round(v.cover * 100), '%', v.cover);
  }
}
