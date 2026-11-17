// Honeybee (worker, Apis mellifera) at real size: ~1.3 cm long. Forward is −Z.
// Shared by the player's bee and the foragers in the garden (life/life.js).
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

const DARK = new THREE.Color('#2a1d12');
const BROWN = new THREE.Color('#7a5428');
const GOLD = new THREE.Color('#d9a032');
const EYE = new THREE.Color('#151010');

/** Head, hairy thorax, legs and antennae. */
function honeybeeFront() {
  const head = colorize(new THREE.SphereGeometry(1, 10, 8).scale(0.0019, 0.0018, 0.0015).translate(0, 0.0003, -0.0058), () => DARK);
  const eyes = [-1, 1].map((s) => colorize(new THREE.SphereGeometry(0.0009, 6, 5).scale(0.6, 1.1, 1).translate(s * 0.0015, 0.0005, -0.0056), () => EYE));
  const thorax = colorize(new THREE.SphereGeometry(0.0026, 10, 8).translate(0, 0.0004, -0.0026), (v) => (v.y > 0.0012 ? BROWN : DARK));
  const parts = [head, ...eyes, thorax];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const leg = new THREE.CylinderGeometry(0.00022, 0.00018, 0.0042, 3)
        .rotateZ(side * (0.9 + k * 0.15)).rotateX(0.3 - k * 0.3)
        .translate(side * 0.0022, -0.0016, -0.0036 + k * 0.0014);
      parts.push(colorize(leg, () => DARK));
    }
    const ant = new THREE.CylinderGeometry(0.00012, 0.00012, 0.0032, 3).rotateX(-1.1).rotateZ(side * -0.4)
      .translate(side * 0.0008, 0.0018, -0.0078);
    parts.push(colorize(ant, () => DARK));
  }
  return merge(parts);
}

/** Abdomen with golden and dark bands; origin at its front so it can swell with nectar. */
function honeybeeAbdomen() {
  const g = new THREE.SphereGeometry(1, 12, 10).scale(0.0029, 0.0026, 0.0047).translate(0, -0.0002, 0.0047);
  return colorize(g, (v) => {
    const band = Math.floor((v.z - 0.001) / 0.0016);
    if (v.z > 0.0082) return DARK; // tip
    return band % 2 === 0 ? GOLD : DARK;
  });
}

/** Whole bee as one geometry (for instanced foragers). */
export function honeybeeBody() { return merge([honeybeeFront(), honeybeeAbdomen()]); }

/** Mirroring flips the triangle order; swap two corners of every triangle so both sides shade alike. */
function flipWinding(g) {
  for (const name of ['position', 'normal', 'color']) {
    const a = g.attributes[name];
    if (!a) continue;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.array[(i + 1) * a.itemSize + k];
        a.array[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k];
        a.array[(i + 2) * a.itemSize + k] = t;
      }
    }
  }
  return g;
}

/** Fore + hind wing for one side, hinge along Z. */
export function honeybeeWing(mirror = false) {
  const fore = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2).scale(0.0047, 1, 0.0016).rotateY(-0.25).translate(0.0045, 0.0021, -0.0012);
  const hind = new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2).scale(0.003, 1, 0.0012).rotateY(-0.1).translate(0.0031, 0.002, 0.0012);
  const g = merge([fore, hind]);
  if (mirror) { g.scale(-1, 1, 1); flipWinding(g); }
  g.computeVertexNormals();
  return g;
}

export const wingMat = () => new THREE.MeshLambertMaterial({ color: '#eef4ff', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });

/** The player's bee: same interface as ButterflyModel (group, tilt, setWings). */
export class BeeModel {
  constructor({ scale = 1 } = {}) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.group.scale.setScalar(scale);
    this.tilt = new THREE.Group();
    this.group.add(this.tilt);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const front = new THREE.Mesh(honeybeeFront(), mat);
    this.abdomen = new THREE.Mesh(honeybeeAbdomen(), mat);
    for (const m of [front, this.abdomen]) { m.castShadow = true; this.tilt.add(m); }
    const wm = wingMat();
    this.wings = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(0, 0.0004, -0.0025);
      hinge.add(new THREE.Mesh(honeybeeWing(side < 0), wm));
      hinge.userData.side = side;
      this.tilt.add(hinge);
      this.wings.push(hinge);
    }
  }

  /** a: wing angle (0 = flat, positive = raised). Folded wings lie back along the abdomen. */
  setWings(a, folded = false) {
    for (const w of this.wings) {
      w.rotation.z = w.userData.side * a;
      w.rotation.y = folded ? w.userData.side * -0.9 : 0;
    }
  }

  /** A full honey stomach visibly swells the abdomen a little. */
  setLoad(load) { this.abdomen.scale.set(1 + 0.12 * load, 1 + 0.15 * load, 1 + 0.08 * load); }
}
