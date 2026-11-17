// Background music: off by default, switched on with the volume button (or the M key).
// Plays softly, fades in and out, loops until switched off, and pauses while the tab is hidden.
// Browsers only allow sound after a click, so it can never start by itself: the button is that click.
const $ = (id) => document.getElementById(id);

const VOLUME = 0.22;      // soft: it sits under the garden, never over it
const FADE_IN_MS = 1800;
const FADE_OUT_MS = 700;

export class Music {
  constructor({ onError } = {}) {
    this.el = $('bg-music');
    this.btn = $('btn-sound');
    this.on = false;
    this.onError = onError;
    this.fadeTimer = null;
    this.el.loop = true;
    this.el.volume = 0;

    this.btn.addEventListener('click', () => this.set(!this.on));
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.('input, select, textarea') || document.querySelector('dialog[open]')) return;
      this.set(!this.on);
    });
    // A hidden tab should be quiet; it picks up again when you come back (if the music is on).
    document.addEventListener('visibilitychange', () => {
      if (!this.on) return;
      if (document.hidden) this.el.pause();
      else this.el.play().catch(() => {});
    });
    this.el.addEventListener('error', () => { if (this.on) this.fail(); });
    this.render();
  }

  async set(on) {
    if (on === this.on) return;
    this.on = on;
    this.render();
    if (on) {
      try {
        this.el.volume = 0;
        await this.el.play();
        if (this.on) this.fadeTo(VOLUME, FADE_IN_MS);
      } catch { this.fail(); }
    } else {
      this.fadeTo(0, FADE_OUT_MS, () => { if (!this.on) this.el.pause(); });
    }
  }

  fail() {
    this.on = false;
    clearInterval(this.fadeTimer);
    this.el.pause();
    this.render();
    this.onError?.();
  }

  /** Linear volume ramp (setInterval, not requestAnimationFrame: it must also run in a background tab). */
  fadeTo(target, ms, done) {
    clearInterval(this.fadeTimer);
    const from = this.el.volume, t0 = performance.now();
    this.fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      this.el.volume = Math.max(0, Math.min(1, from + (target - from) * k));
      if (k >= 1) { clearInterval(this.fadeTimer); done?.(); }
    }, 40);
  }

  render() {
    this.btn.setAttribute('aria-pressed', String(this.on));
    this.btn.title = this.on ? 'Muziek uit (M)' : 'Muziek aan (M)';
  }
}
