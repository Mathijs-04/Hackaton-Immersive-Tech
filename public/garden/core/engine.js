// Engine: renderer, scene, camera, and one update loop with a list of systems.
// A future butterfly is "just another system" + a different CameraRig.
import * as THREE from 'three';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxPixelRatio = 1.5;

    this.scene = new THREE.Scene();
    // Near plane small enough for a butterfly flying 20 cm above a flower.
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 400);
    this.camera.position.set(9, 6, 11);

    this.systems = [];
    this.rig = null;
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.lastActivity = performance.now();
    this.lastRender = 0;
    this.frameListeners = [];

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  addSystem(system) { this.systems.push(system); return system; }

  setRig(rig) {
    this.rig?.disable();
    this.rig = rig;
    rig.enable();
  }

  /** Call when something visible changed; keeps the loop at full frame rate for a while. */
  wake() { this.lastActivity = performance.now(); }

  setPixelRatio(max) {
    this.maxPixelRatio = max;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.wake();
  }

  start() {
    const frame = (now) => {
      requestAnimationFrame(frame);
      // Eco mode: after 8 s without interaction or playback, render at ~20 fps.
      // (rAF itself stops while the tab is hidden.)
      const idle = now - this.lastActivity > 8000;
      if (idle && now - this.lastRender < 48) return;
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.elapsed += dt;
      const ctx = { dt, elapsed: this.elapsed, engine: this };
      for (const s of this.systems) s.update?.(dt, ctx);
      this.rig?.update(dt, ctx);
      this.renderer.render(this.scene, this.camera);
      this.lastRender = now;
      for (const fn of this.frameListeners) fn(dt, now, idle);
    };
    requestAnimationFrame(frame);
  }
}
