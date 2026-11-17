// HUD (live values + weather) and the minimal timebar (play/pause; 1 hour = 1 second).
import { clock, short, num } from './format.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(store, garden, atmosphere) {
    this.store = store;
    this.atmosphere = atmosphere;
    this.els = {
      hud: $('hud'), name: $('garden-name'), clock: $('clock'), weather: $('weather'), values: $('values'),
      bar: $('timebar'), play: $('btn-play'), label: $('time-label'),
    };
    const e = this.els;
    e.name.textContent = garden.name;
    e.hud.hidden = false;
    e.bar.hidden = false;
    this.sample = {};
    this.keysEnabled = () => true;
    store.loop = true;

    e.play.addEventListener('click', () => store.toggle());
    window.addEventListener('keydown', (ev) => {
      if (ev.target.closest?.('button, input, select, textarea')) return;
      if (!this.keysEnabled()) return; // flying: Space and arrows steer the butterfly
      if (ev.code === 'Space') { ev.preventDefault(); store.toggle(); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); store.step(ev.shiftKey ? 24 : 1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); store.step(ev.shiftKey ? -24 : -1); }
    });
    store.addEventListener('state', () => this.renderState());
    store.addEventListener('data', () => this.render(true));
    this.renderState();
  }

  renderState() {
    const p = this.store.playing;
    this.els.play.textContent = p ? '❚❚' : '▶';
    this.els.play.setAttribute('aria-label', p ? 'Pauzeren' : 'Afspelen');
  }

  /** Called every frame; only touches the DOM when the shown minute or the weather changes. */
  render(force = false) {
    const s = this.store, st = this.atmosphere.state;
    const w = st.weather ? `${st.weather.icon} ${st.weather.text}` : '';
    const key = `${Math.floor(s.t / 60000)}|${w}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    const v = s.sample(s.t, this.sample);
    const n = (k) => s.norm(k, v[k]);
    const e = this.els;
    e.clock.textContent = clock(s.t);
    e.weather.textContent = w;
    e.label.textContent = s.t >= s.end - 1 ? `${short(s.t)} · nu` : short(s.t);
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
