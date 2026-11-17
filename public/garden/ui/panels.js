// Plant list and a minimal plant card (name, number, planting date).
import { esc, date } from './format.js';
import { SEED_COUNT_UNKNOWN } from '../plants/placement.js';

const $ = (id) => document.getElementById(id);

export class Panels {
  constructor({ store, batches, garden, onFocusBatch, onClear }) {
    this.store = store;
    this.batches = [...batches].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    this.garden = garden;
    this.onFocusBatch = onFocusBatch;
    this.onClear = onClear;
    this.q = '';
    this.current = null;

    $('toolbar').hidden = false;
    const btn = $('btn-plants');
    btn.addEventListener('click', () => this.togglePanel());
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.togglePanel(false)));
    $('plant-search').addEventListener('input', (e) => { this.q = e.target.value.toLowerCase(); this.renderList(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.current) { this.closeCard(); onClear(); } });
    this.renderList();
  }

  togglePanel(force) {
    const panel = $('plant-panel');
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    $('btn-plants').setAttribute('aria-expanded', String(open));
  }

  renderList() {
    const list = this.batches.filter((b) => !this.q || `${b.name} ${b.raw.plant?.name}`.toLowerCase().includes(this.q));
    $('plant-list').innerHTML = list.map((b) => `
      <li data-id="${esc(b.id)}" class="${this.current?.batch?.id === b.id ? 'on' : ''}">
        <span class="swatch" style="background:${b.info.bloom}"></span>
        <span class="nm"><b>${esc(b.name)}</b></span>
        <span class="ct">${b.amountKnown ? `${b.count}×` : 'zaad'}</span>
      </li>`).join('') || '<li>Geen planten gevonden</li>';
    $('plant-list').onclick = (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const batch = this.batches.find((b) => b.id === li.dataset.id);
      this.showBatch(batch);
      this.onFocusBatch(batch);
    };
  }

  showBatch(batch) { this.current = { batch }; this.renderCard(); this.renderList(); }
  showSensor() { this.current = { sensor: true }; this.renderCard(); this.renderList(); }
  closeCard() { this.current = null; $('plant-card').hidden = true; this.renderList(); }

  renderCard() {
    const card = $('plant-card');
    card.hidden = false;
    let title, rows;
    if (this.current.sensor) {
      title = '<span class="swatch" style="background:#5fdc90"></span>Plantenluisteraar';
      rows = '<dt>Meet</dt><dd>lucht, bodem en licht · elk uur</dd>';
    } else {
      const b = this.current.batch;
      title = `<span class="swatch" style="background:${b.info.bloom}"></span>${esc(b.name)}`;
      rows = `<dt>Aantal</dt><dd>${b.amountKnown ? b.count : `gezaaid (${SEED_COUNT_UNKNOWN} kiemplantjes)`}</dd>
              <dt>Geplant</dt><dd>${esc(date(b.raw.planted_on))}</dd>`;
    }
    card.innerHTML = `<button class="icon-btn close" aria-label="Sluiten">✕</button><h2>${title}</h2><dl>${rows}</dl>`;
    card.querySelector('.close').onclick = () => { this.closeCard(); this.onClear(); };
  }
}
