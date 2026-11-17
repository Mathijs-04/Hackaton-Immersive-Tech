// Adaptive quality: if frames are consistently slow, step down once at a time.
// Never steps back up within a session (avoids flicker).
export class Quality {
  constructor(engine, { onShadows, onMist } = {}) {
    this.engine = engine;
    this.level = 0;
    this.samples = [];
    this.onShadows = onShadows;
    this.onMist = onMist;
    this.cooldown = 3; // seconds before we start judging (shader compiles etc.)
    this.steps = [
      () => engine.setPixelRatio(1),
      () => this.onShadows?.(false),
      () => this.onMist?.(0.5),
      () => engine.setPixelRatio(0.75),
    ];
    engine.frameListeners.push((dt, now, idle) => this.tick(dt, idle));
  }

  get label() { return ['hoog', 'middel', 'laag', 'lager', 'laagst'][this.level]; }

  tick(dt, idle) {
    if (idle) { this.samples.length = 0; return; } // eco mode frames say nothing about the GPU
    if (this.cooldown > 0) { this.cooldown -= dt; return; }
    this.samples.push(dt);
    if (this.samples.length < 120) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    // The fastest frames approximate the display's refresh interval. Only step down when we
    // regularly miss it: a 30 Hz screen (or a throttled tab) is not a slow GPU.
    const refresh = sorted[Math.floor(sorted.length * 0.1)];
    this.samples.length = 0;
    const slow = avg > Math.max(0.024, refresh * 1.5);
    this.strikes = slow ? (this.strikes || 0) + 1 : 0;
    if (this.strikes >= 2 && this.level < this.steps.length) {
      this.strikes = 0;
      this.steps[this.level++]();
      this.cooldown = 2;
      console.info(`[quality] avg frame ${(avg * 1000).toFixed(1)} ms → level ${this.label}`);
    }
  }
}
