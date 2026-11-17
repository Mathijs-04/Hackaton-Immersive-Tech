// Small low-cost models for the garden's wildlife. Real-world sizes in metres.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function colorize(geo, fn) {
  const p = geo.attributes.position, arr = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { const c = fn(v.fromBufferAttribute(p, i)); arr.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
const prep = (g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };
const merge = (parts) => mergeGeometries(parts.map(prep), false);

/** Bumblebee body (~2 cm), striped: yellow / black / white tail. Forward is −Z. */
export function beeBody() {
  const black = new THREE.Color('#1c1a18'), yellow = new THREE.Color('#e9b52a'), white = new THREE.Color('#efe8d8');
  const head = new THREE.SphereGeometry(0.0038, 8, 6).translate(0, 0, -0.009);
  const thorax = new THREE.SphereGeometry(0.0055, 10, 8).translate(0, 0.001, -0.002);
  const abdomen = new THREE.SphereGeometry(1, 12, 8).scale(0.006, 0.0056, 0.0095).translate(0, 0, 0.009);
  colorize(head, () => black);
  colorize(thorax, (v) => (v.y > 0.002 ? yellow : black));
  colorize(abdomen, (v) => (v.z > 0.015 ? white : v.z > 0.006 && v.z < 0.011 ? yellow : black));
  return merge([head, thorax, abdomen]);
}

/** Translucent bee wing (one side), hinge along Z. */
export function beeWing(mirror = false) {
  const g = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2).scale(0.0075, 1, 0.0035).translate(0.0075, 0.004, 0.0);
  if (mirror) g.scale(-1, 1, 1);
  g.deleteAttribute('uv');
  return g;
}

/** Beetle (~1 cm): domed shell (white → instance tint), black spots/head/legs via vertex colour. */
export function beetleBody() {
  const black = new THREE.Color('#141212'), white = new THREE.Color('#ffffff');
  const shell = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.005, 0.0042, 0.006).translate(0, 0.0015, 0.001);
  const spots = [[0.0025, 0.0025], [-0.0025, 0.0025], [0.0028, -0.001], [-0.0028, -0.001], [0, 0.004]];
  colorize(shell, (v) => {
    if (Math.abs(v.x) < 0.0003) return black; // wing seam
    return spots.some(([sx, sz]) => Math.hypot(v.x - sx, v.z - sz) < 0.0013) ? black : white;
  });
  const head = colorize(new THREE.SphereGeometry(0.0022, 8, 6).translate(0, 0.0015, -0.0055), () => black);
  const legs = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const leg = new THREE.CylinderGeometry(0.0004, 0.0004, 0.006, 3)
        .rotateZ(side * 1.1)
        .translate(side * 0.0045, 0.0008, -0.003 + k * 0.003);
      legs.push(colorize(leg, () => black));
    }
  }
  return merge([shell, head, ...legs]);
}

/** Bird body (~25 cm), forward −Z; white, tinted per bird. */
export function birdBody() {
  const white = new THREE.Color('#ffffff'), beak = new THREE.Color('#e3a32a');
  const body = colorize(new THREE.SphereGeometry(1, 10, 8).scale(0.045, 0.04, 0.12), () => white);
  const head = colorize(new THREE.SphereGeometry(0.032, 8, 6).translate(0, 0.02, -0.12), () => white);
  const bk = colorize(new THREE.ConeGeometry(0.009, 0.035, 5).rotateX(-Math.PI / 2).translate(0, 0.016, -0.16), () => beak);
  const tail = colorize(new THREE.ConeGeometry(0.035, 0.09, 4).rotateX(Math.PI / 2).scale(1, 0.25, 1).translate(0, 0, 0.15), () => white);
  return merge([body, head, bk, tail]);
}

/** Bird wing (one side): tapered, slightly swept; darker tip. */
export function birdWing(mirror = false) {
  const shape = new THREE.Shape([[0, -0.06], [0.16, -0.05], [0.34, 0.0], [0.3, 0.035], [0.12, 0.05], [0, 0.06]].map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
  g.deleteAttribute('uv');
  const tip = new THREE.Color('#3a3a3a'), w = new THREE.Color('#ffffff');
  colorize(g, (v) => (v.x > 0.24 ? tip : w));
  if (mirror) g.scale(-1, 1, 1);
  return g;
}

/** Wooden bee hotel on a post (decorative home for the bees). */
export function beeHotel() {
  const wood = new THREE.Color('#8a6a48'), dark = new THREE.Color('#3a2a1e'), roof = new THREE.Color('#5a4030'), reed = new THREE.Color('#c2a46a');
  const parts = [
    colorize(new THREE.BoxGeometry(0.05, 0.6, 0.05).translate(0, 0.3, 0), () => dark),
    colorize(new THREE.BoxGeometry(0.26, 0.22, 0.14).translate(0, 0.71, 0), () => wood),
    colorize(new THREE.BoxGeometry(0.31, 0.025, 0.18).rotateZ(0.32).translate(-0.07, 0.85, 0), () => roof),
    colorize(new THREE.BoxGeometry(0.31, 0.025, 0.18).rotateZ(-0.32).translate(0.07, 0.85, 0), () => roof),
  ];
  for (let i = 0; i < 16; i++) {
    const x = -0.09 + (i % 5) * 0.045, y = 0.63 + Math.floor(i / 5) * 0.045;
    parts.push(colorize(new THREE.CylinderGeometry(0.012, 0.012, 0.15, 6).rotateX(Math.PI / 2).translate(x, y, 0.005), (v) => (v.z > 0.07 ? dark : reed)));
  }
  return merge(parts);
}

/**
 * Renders many identical critters with 1 body + 2 wing InstancedMeshes.
 * Call set(i, agent) per agent each frame, then commit().
 */
export class Swarm {
  constructor({ count, body, bodyMat, wingL, wingR, wingMat, hingeY = 0.004, shadows = false }) {
    this.count = count;
    this.body = new THREE.InstancedMesh(body, bodyMat, count);
    this.parts = [this.body];
    if (wingL) {
      this.wingL = new THREE.InstancedMesh(wingL, wingMat, count);
      this.wingR = new THREE.InstancedMesh(wingR, wingMat, count);
      this.parts.push(this.wingL, this.wingR);
    }
    this.hingeY = hingeY;
    for (const m of this.parts) {
      m.frustumCulled = false; // critters move every frame; bounds would be stale
      m.castShadow = shadows;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    this.group = new THREE.Group();
    this.group.add(...this.parts);
    this._m = new THREE.Matrix4(); this._w = new THREE.Matrix4(); this._r = new THREE.Matrix4();
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3();
  }

  setColor(i, color, wings = false) {
    const c = new THREE.Color(color);
    this.body.setColorAt(i, c);
    if (wings && this.wingL) { this.wingL.setColorAt(i, c); this.wingR.setColorAt(i, c); }
  }

  /** a: { pos, yaw, pitch, roll, wing, scale } — scale 0 hides the agent. */
  set(i, a) {
    const m = this._m;
    m.compose(a.pos, this._q.setFromEuler(this._e.set(a.pitch || 0, a.yaw, a.roll || 0, 'YXZ')), this._s.setScalar(a.scale));
    this.body.setMatrixAt(i, m);
    if (this.wingL) {
      this._r.makeRotationZ(-a.wing).setPosition(0, this.hingeY, 0);
      this.wingL.setMatrixAt(i, this._w.multiplyMatrices(m, this._r));
      this._r.makeRotationZ(a.wing).setPosition(0, this.hingeY, 0);
      this.wingR.setMatrixAt(i, this._w.multiplyMatrices(m, this._r));
    }
  }

  commit() {
    for (const m of this.parts) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
