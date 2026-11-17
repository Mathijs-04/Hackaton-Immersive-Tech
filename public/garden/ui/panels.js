// View mode drawer: the plant list, and the info page for a plant or the Plantenluisteraar.
// One drawer with two views, so the list and the info never fight for the same screen space.
import { esc } from './format.js';
import { infoFor, nameFor, plantHTML, sensorHTML } from './plant-info.js';

const $ = (id) => document.getElementById(id);

export class Panels {
  constructor({ batches, plantInfo, onFocusBatch, onClear, getReading }) {
    this.plantInfo = plantInfo;
    this.batches = [...batches].sort((a, b) => nameFor(plantInfo, a).localeCompare(nameFor(plantInfo, b), 'nl'));
    this.onFocusBatch = onFocusBatch;
    this.onClear = onClear;
    this.getReading = getReading;
    this.q = '';
    this.current = null; // { batch } | { sensor: true } | null (list)
    this.enabled = true;
    this.el = { drawer: $('drawer'), list: $('drawer-list'), detail: $('drawer-detail'), title: $('drawer-title'), back: $('drawer-back'), btn: $('btn-plants') };

    $('toolbar').hidden = false;
    this.el.btn.addEventListener('click', () => (this.isOpen && !this.current ? this.close() : this.openList()));
    $('drawer-close').addEventListener('click', () => this.close(true));
    this.el.back.addEventListener('click', () => this.openList(true));
    $('btn-sensor').addEventListener('click', () => this.showSensor(true));
    $('plant-search').addEventListener('input', (e) => { this.q = e.target.value.toLowerCase().trim(); this.renderList(); });
    $('plant-list').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-id]');
      if (!btn) return;
      const batch = this.batches.find((b) => b.id === btn.dataset.id);
      this.showBatch(batch, true);
      this.onFocusBatch(batch);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen && !document.querySelector('dialog[open]')) this.close(true);
    });
    this.renderList();
  }

  get isOpen() { return !this.el.drawer.hidden; }

  setEnabled(on) {
    this.enabled = on;
    this.el.btn.disabled = !on;
    if (!on) this.close();
  }

  open() {
    this.el.drawer.hidden = false;
    document.body.classList.add('drawer-open');
  }

  /** `focus`: move keyboard focus into the drawer (when opened from a button, not from a 3D click). */
  openList(focus = false) {
    if (this.current) this.onClear();
    this.current = null;
    this.open();
    this.el.list.hidden = false;
    this.el.detail.hidden = true;
    this.el.back.hidden = true;
    this.el.title.textContent = 'Planten in de tuin';
    this.el.title.hidden = false;
    this.el.drawer.setAttribute('aria-labelledby', 'drawer-title');
    this.el.btn.setAttribute('aria-expanded', 'true');
    this.renderList();
    if (focus || document.activeElement === this.el.btn) $('plant-search').focus();
  }

  showBatch(batch, focus = false) {
    this.current = { batch };
    const info = infoFor(this.plantInfo, batch);
    this.renderDetail(plantHTML(batch, info, { headingId: 'detail-title' }), focus);
  }

  showSensor(focus = false) {
    this.current = { sensor: true };
    this.onClear();
    this.renderDetail(sensorHTML({ headingId: 'detail-title', now: this.getReading() }), focus);
  }

  renderDetail(html, focus) {
    this.open();
    this.el.list.hidden = true;
    this.el.detail.hidden = false;
    this.el.detail.innerHTML = html;
    this.el.detail.scrollTop = 0;
    this.el.back.hidden = false;
    this.el.title.hidden = true; // the info has its own heading
    this.el.btn.setAttribute('aria-expanded', 'false');
    this.el.drawer.setAttribute('aria-labelledby', 'detail-title');
    if (focus) $('detail-title')?.focus();
  }

  close(returnFocus = false) {
    const wasOpen = this.isOpen;
    this.el.drawer.hidden = true;
    this.el.drawer.setAttribute('aria-labelledby', 'drawer-title');
    document.body.classList.remove('drawer-open');
    this.el.btn.setAttribute('aria-expanded', 'false');
    if (this.current) this.onClear();
    this.current = null;
    if (wasOpen && returnFocus) this.el.btn.focus();
  }

  renderList() {
    const list = this.batches.filter((b) => {
      if (!this.q) return true;
      const info = infoFor(this.plantInfo, b);
      return `${b.name} ${b.raw.plant?.name} ${info?.dutchName ?? ''}`.toLowerCase().includes(this.q);
    });
    $('plant-list').innerHTML = list.map((b) => {
      const info = infoFor(this.plantInfo, b);
      return `<li><button type="button" data-id="${esc(b.id)}">
        <span class="swatch" style="background:${b.info.bloom}" aria-hidden="true"></span>
        <span class="nm"><b>${esc(nameFor(this.plantInfo, b))}</b><i lang="la">${esc(info?.latinName || b.raw.plant?.name || '')}</i></span>
        <span class="ct">${b.amountKnown ? `${b.count}×` : 'zaad'}</span>
      </button></li>`;
    }).join('') || '<li class="empty">Geen planten gevonden</li>';
  }
}
