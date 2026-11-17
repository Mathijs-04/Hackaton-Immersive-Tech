// Hover + click on plants (and the sensor). Raycasts at most once per frame,
// only when the pointer actually moved.
import * as THREE from 'three';

export class Picking {
  constructor(engine, layer, sensor, { onHover, onSelect }) {
    this.engine = engine;
    this.layer = layer;
    this.sensorMeshes = [];
    sensor.group.traverse((o) => o.isMesh && this.sensorMeshes.push(o));
    this.targets = [...layer.pickables, ...this.sensorMeshes];
    this.onHover = onHover;
    this.onSelect = onSelect;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.dirty = false;
    this.inside = false;
    this.hovered = null;
    this.down = null;

    const c = engine.canvas;
    c.addEventListener('pointermove', (e) => { this.setPointer(e); this.dirty = true; });
    c.addEventListener('pointerleave', () => { this.inside = false; this.dirty = true; });
    c.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    c.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
      this.setPointer(e);
      this.onSelect(this.pick());
    });
  }

  setPointer(e) {
    const r = this.engine.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.inside = true;
  }

  /** Returns a plant, 'sensor', or null. */
  pick() {
    if (!this.inside) return null;
    this.ray.setFromCamera(this.ndc, this.engine.camera);
    const hit = this.ray.intersectObjects(this.targets, false)[0];
    if (!hit) return null;
    if (this.sensorMeshes.includes(hit.object)) return 'sensor';
    return this.layer.plantFromHit(hit);
  }

  update() {
    if (!this.dirty || this.down) return; // skip while dragging the camera
    this.dirty = false;
    const h = this.pick();
    if (h !== this.hovered) {
      this.hovered = h;
      this.engine.canvas.style.cursor = h ? 'pointer' : '';
      this.onHover(h);
      this.engine.wake();
    }
  }
}
