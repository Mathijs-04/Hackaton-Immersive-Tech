// Camera rigs share one tiny interface: enable(), disable(), update(dt, ctx).
// OrbitRig is the default. FreeFlyRig (?fly=1) proves a second rig can swap in;
// a butterfly FollowRig will plug in the same way.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class OrbitRig {
  constructor(engine, { center = new THREE.Vector3(0, 0.6, 0), limitRadius = 7 } = {}) {
    this.engine = engine;
    this.limitRadius = limitRadius;
    const c = new OrbitControls(engine.camera, engine.canvas);
    c.target.copy(center);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 1.2;
    c.maxDistance = 28;
    c.maxPolarAngle = 1.48; // never look from below the ground
    c.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.autoRotateSpeed = 0.35;
    c.addEventListener('start', () => { c.autoRotate = false; this.tween = null; engine.wake(); });
    c.addEventListener('change', () => engine.wake());
    c.enabled = false;
    this.controls = c;
    this.tween = null;
  }

  enable() { this.controls.enabled = true; }
  disable() { this.controls.enabled = false; }

  /** Smoothly move the orbit target (and keep a sensible distance). */
  flyTo(target, distance = 3.2) {
    const cam = this.engine.camera;
    const c = this.controls;
    const dir = cam.position.clone().sub(c.target).normalize();
    if (dir.y < 0.35) { dir.y = 0.35; dir.normalize(); }
    this.tween = {
      t: 0, dur: 0.9,
      fromTarget: c.target.clone(), toTarget: target.clone(),
      fromPos: cam.position.clone(), toPos: target.clone().addScaledVector(dir, distance),
    };
    c.autoRotate = false;
  }

  update(dt) {
    const c = this.controls;
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = ease(tw.t);
      c.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
      this.engine.camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
      if (tw.t >= 1) this.tween = null;
      this.engine.wake();
    }
    // Keep panning inside the garden.
    const r = Math.hypot(c.target.x, c.target.z);
    if (r > this.limitRadius) {
      const s = this.limitRadius / r;
      c.target.x *= s; c.target.z *= s;
    }
    c.target.y = Math.min(3, Math.max(0, c.target.y));
    c.update(dt);
    if (c.autoRotate) this.engine.wake();
  }
}

/**
 * Chase camera behind a target that exposes `position` (Vector3) and `yaw`.
 * Drag to look around (springs back while flying), wheel/pinch to change distance.
 */
export class FollowRig {
  constructor(engine, target, world) {
    this.engine = engine;
    this.target = target;
    this.world = world;
    this.distance = 0.14;  // close behind a 4 cm butterfly: flowers tower over you
    this.minDist = 0.06;
    this.maxDist = 2.0;
    this.yawOffset = 0;
    this.pitch = 0.22;
    this.look = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.dragging = false;
    this.pointers = new Map();
    this.onDown = (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragging = true;
    };
    this.onUp = (e) => { this.pointers.delete(e.pointerId); this.dragging = this.pointers.size > 0; };
    this.onMove = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 2) {
        // Pinch zoom: compare distance between the two pointers.
        const [a, b] = [...this.pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        if (before > 0) this.distance = THREE.MathUtils.clamp(this.distance * before / after, this.minDist, this.maxDist);
        return;
      }
      this.yawOffset -= (e.clientX - p.x) * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - p.y) * 0.004, -0.15, 1.3);
      p.x = e.clientX; p.y = e.clientY;
      engine.wake();
    };
    this.onWheel = (e) => {
      e.preventDefault();
      this.distance = THREE.MathUtils.clamp(this.distance * (1 + e.deltaY * 0.0012), this.minDist, this.maxDist);
      engine.wake();
    };
  }

  enable() {
    const c = this.engine.canvas;
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('pointermove', this.onMove);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    this.look.copy(this.target.position);
  }

  disable() {
    const c = this.engine.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('wheel', this.onWheel);
    this.pointers.clear();
    this.dragging = false;
  }

  update(dt) {
    const t = this.target, p = t.position;
    const moving = t.state === 'flying' && Math.hypot(t.vel.x, t.vel.z) > 0.2;
    // Let the look-around offset drift back behind the butterfly while it flies.
    if (!this.dragging && moving) this.yawOffset *= Math.exp(-dt * 1.5);
    const yaw = t.yaw + this.yawOffset;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.desired.set(
      p.x + Math.sin(yaw) * this.distance * cp,
      p.y + this.distance * sp + this.distance * 0.12,
      p.z + Math.cos(yaw) * this.distance * cp,
    );
    const cam = this.engine.camera;
    cam.position.lerp(this.desired, 1 - Math.exp(-dt * 10));
    const minY = this.world.groundHeight(cam.position.x, cam.position.z) + 0.02;
    if (cam.position.y < minY) cam.position.y = minY;
    this.look.lerp(p, 1 - Math.exp(-dt * 10));
    cam.lookAt(this.look.x, this.look.y + this.distance * 0.08, this.look.z);
  }
}

/** Debug free-fly camera: WASD to move, Q/E down/up, drag to look. */
export class FreeFlyRig {
  constructor(engine, input, world) {
    this.engine = engine;
    this.input = input;
    this.world = world;
    this.yaw = 0;
    this.pitch = -0.2;
    this.dragging = false;
    this.onDown = (e) => { this.dragging = true; this.px = e.clientX; this.py = e.clientY; };
    this.onUp = () => { this.dragging = false; };
    this.onMove = (e) => {
      if (!this.dragging) return;
      this.yaw -= (e.clientX - this.px) * 0.004;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - (e.clientY - this.py) * 0.004));
      this.px = e.clientX; this.py = e.clientY;
      engine.wake();
    };
  }

  enable() {
    const cam = this.engine.camera;
    cam.position.set(0, 1.2, 6);
    this.yaw = 0; this.pitch = -0.15;
    const c = this.engine.canvas;
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointermove', this.onMove);
  }

  disable() {
    const c = this.engine.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointermove', this.onMove);
  }

  update(dt) {
    const cam = this.engine.camera;
    const inp = this.input;
    const speed = (inp.boost ? 4 : 1.5) * dt;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    cam.position.addScaledVector(fwd, inp.move.y * speed);
    cam.position.addScaledVector(right, inp.move.x * speed);
    cam.position.y += inp.ascend * speed;
    // World queries keep the flyer above ground and inside a sensible area.
    const minY = this.world.groundHeight(cam.position.x, cam.position.z) + 0.1;
    cam.position.y = Math.max(minY, Math.min(12, cam.position.y));
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (inp.active) this.engine.wake();
  }
}
