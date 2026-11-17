// Flight HUD: energy, warmth, species collection, status, toasts, and touch controls.
import { esc } from './format.js';

const $ = (id) => document.getElementById(id);

export class FlightHud {
  constructor(butterfly, input) {
    this.b = butterfly;
    this.input = input;
    this.el = $('flight');
    this.toastEl = $('toast');
    this.touchEl = $('touch-controls');
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.last = '';
    $('fl-name').textContent = `🦋 ${butterfly.name}`;
    butterfly.addEventListener('visit', (e) => {
      const { plant, count, total } = e.detail;
      this.toast(`🌼 Nieuw bezocht: <b>${esc(plant.batch.name)}</b> · ${count}/${total}`);
    });
    this.setupTouch();
  }

  show(on) {
    this.el.hidden = !on;
    this.touchEl.hidden = !(on && this.touch);
    if (!on) this.resetTouch();
  }

  toast(html) {
    const t = this.toastEl;
    t.innerHTML = html;
    t.hidden = false;
    t.classList.remove('out');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => { t.hidden = true; }, 400);
    }, 2600);
  }

  /** Called every frame; only touches the DOM when something visible changed. */
  render() {
    if (this.el.hidden) return;
    const b = this.b;
    const key = `${Math.round(b.energy * 50)}|${Math.round(b.warmth * 50)}|${b.visited.size}|${b.statusText}`;
    if (key === this.last) return;
    this.last = key;
    const pct = (v) => `${Math.round(v * 100)}%`;
    $('fl-energy').style.width = pct(b.energy);
    $('fl-energy').classList.toggle('low', b.energy < 0.2);
    $('fl-warmth').style.width = pct(b.warmth);
    $('fl-warmth').classList.toggle('low', b.warmth < 0.3);
    $('fl-visits').textContent = `${b.visited.size}/${b.totalSpecies}`;
    $('fl-status').textContent = b.statusText;
  }

  setupTouch() {
    const stick = this.touchEl.querySelector('.stick');
    const knob = this.touchEl.querySelector('.knob');
    let id = null;
    const set = (e) => {
      const r = stick.getBoundingClientRect();
      const R = r.width / 2;
      let dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
      this.input.virtual.x = Math.abs(dx) > 0.12 ? dx : 0;
      this.input.virtual.y = Math.abs(dy) > 0.12 ? -dy : 0;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      this.input.virtual.x = this.input.virtual.y = 0;
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    for (const btn of this.touchEl.querySelectorAll('[data-v]')) {
      const v = btn.dataset.v === 'up' ? 1 : -1;
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); this.input.virtual.ascend = v; });
      const stop = () => { this.input.virtual.ascend = 0; };
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
    }
  }

  resetTouch() {
    Object.assign(this.input.virtual, { x: 0, y: 0, ascend: 0 });
    const knob = this.touchEl.querySelector('.knob');
    if (knob) knob.style.transform = '';
  }
}
