// Flight HUD for the current character (butterfly or bee): energy, warmth, species collection,
// status, toasts, touch controls. The bee also gets a honey-stomach meter, the delivered total
// and a compass that points to the hive.
const $ = (id) => document.getElementById(id);

export class FlightHud {
  constructor(input, camera) {
    this.input = input;
    this.camera = camera;
    this.b = null;
    this.el = $('flight');
    this.toastEl = $('toast');
    this.touchEl = $('touch-controls');
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.last = '';
    this.fwd = { x: 0, z: 0 };
    this.setupTouch();
  }

  setPlayer(p) {
    this.b = p;
    this.last = '';
    this.shown = undefined; // show the new animal's first status immediately
    this.pending = null;
    $('fl-name').textContent = `${p.kind === 'bee' ? '🐝' : '🦋'} ${p.name}`;
    $('bee-row').hidden = p.kind !== 'bee';
    this.el.classList.toggle('is-bee', p.kind === 'bee');
  }

  show(on) {
    this.el.hidden = !on;
    this.touchEl.hidden = !(on && this.touch);
    if (!on) this.resetTouch();
  }

  toast(html, ms = 4200) {
    const t = this.toastEl;
    t.innerHTML = html;
    t.hidden = false;
    t.classList.remove('out');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => { t.hidden = true; }, 400);
    }, ms);
  }

  /**
   * One message at a time: a new status must hold for 0.4 s before it replaces the shown one, so a
   * rule that flips on and off (e.g. around an energy threshold) can never make the text flicker.
   * Messages that only differ by a counting number ("…61%") count as the same message.
   */
  stableStatus(next) {
    const now = performance.now();
    const same = (a, b) => a.replace(/\d+%/, '#') === b.replace(/\d+%/, '#'); // ignore counting numbers
    if (this.shown === undefined || same(next, this.shown)) { this.shown = next; this.pending = null; return this.shown; }
    if (!this.pending || !same(this.pending.text, next)) this.pending = { text: next, since: now };
    else if (now - this.pending.since >= 400) { this.shown = next; this.pending = null; }
    return this.shown;
  }

  /** Direction to the hive relative to where the camera looks: radians, 0 = straight ahead. */
  hiveBearing() {
    const hive = this.b.world.hive, p = this.b.pos;
    const v = this.camera.getWorldDirection(this._d || (this._d = this.camera.position.clone()));
    const camAng = Math.atan2(v.x, -v.z);
    const toAng = Math.atan2(hive.entrance.x - p.x, -(hive.entrance.z - p.z));
    let d = toAng - camAng;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return { angle: d, dist: Math.hypot(hive.entrance.x - p.x, hive.entrance.z - p.z) };
  }

  /** Called every frame; only touches the DOM when something visible changed. */
  render() {
    if (this.el.hidden || !this.b) return;
    const b = this.b, bee = b.kind === 'bee';
    const bear = bee ? this.hiveBearing() : null;
    const status = this.stableStatus(b.statusText);
    const key = `${Math.round(b.energy * 50)}|${Math.round(b.warmth * 50)}|${b.visited.size}|${status}` +
      (bee ? `|${Math.round(b.load * 50)}|${b.delivered}|${Math.round(bear.angle * 18)}|${Math.round(bear.dist * 5)}` : '');
    if (key === this.last) return;
    this.last = key;
    const pct = (v) => `${Math.round(v * 100)}%`;
    $('fl-energy').style.width = pct(b.energy);
    $('fl-energy').classList.toggle('low', b.energy < 0.2);
    $('fl-warmth').style.width = pct(b.warmth);
    $('fl-warmth').classList.toggle('low', b.warmth < 0.3);
    $('m-energy').setAttribute('aria-valuenow', Math.round(b.energy * 100));
    $('m-warmth').setAttribute('aria-valuenow', Math.round(b.warmth * 100));
    $('fl-visits').textContent = `${b.visited.size}/${b.totalSpecies}`;
    $('fl-status').textContent = status;
    if (bee) {
      $('fl-load').style.width = pct(b.load);
      $('m-load').setAttribute('aria-valuenow', Math.round(b.load * 100));
      $('m-load').classList.toggle('full', b.full);
      $('fl-delivered').textContent = `${b.delivered} mg`;
      const deg = Math.round(bear.angle * 180 / Math.PI);
      $('fl-arrow').style.transform = `rotate(${deg}deg)`;
      const side = Math.abs(deg) < 30 ? 'recht vooruit' : Math.abs(deg) > 150 ? 'achter je' : deg > 0 ? 'rechts' : 'links';
      $('fl-compass').setAttribute('aria-label', `Bijenkast: ${side}, ${bear.dist.toFixed(1).replace('.', ',')} meter`);
      $('fl-dist').textContent = `${bear.dist < 1 ? Math.round(bear.dist * 100) + ' cm' : bear.dist.toFixed(1).replace('.', ',') + ' m'}`;
      $('fl-compass').classList.toggle('urgent', b.full);
    }
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
