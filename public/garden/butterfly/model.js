// Butterfly geometry and painted wings (generated canvases, no image files).
// Wing outline is ~0.2 m span at scale 1; models are scaled to the species' real size.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wingTexture } from '../world/textures.js';

// Wing outline (right side) in metres. x = outward from the body, z = front (−) to back (+).
export const FORE = [[0, -0.012], [0.03, -0.05], [0.07, -0.072], [0.1, -0.074], [0.098, -0.05], [0.085, -0.02], [0.05, -0.002], [0, 0.004]];
export const HIND = [[0, 0.0], [0.045, 0.004], [0.07, 0.022], [0.072, 0.045], [0.055, 0.066], [0.03, 0.074], [0.01, 0.06], [0, 0.03]];
const U = (x) => x / 0.1;
const V = (z) => (z + 0.08) / 0.16;
const OUTLINE_UV = [FORE, HIND].map((pts) => pts.map(([x, z]) => [U(x), V(z)]));

export const PALETTES = {
  // Boomblauwtje (holly blue, Celastrina argiolus, male): pale lilac sky-blue, thin dark margin, white fringe.
  boomblauwtje: {
    inner: '#5468c4', base: '#8ea6ec', base2: '#bccbf5', margin: '#262638', marginWidth: 2, fringe: '#fbfbf7',
    spots: [[U(0.06), V(-0.03), 2, 'rgba(30,30,60,0.45)']],
  },
  // Icarusblauwtje (common blue, male): violet-blue with a thin dark margin and white fringe.
  icarus: {
    inner: '#2c2f7a', base: '#4f7fe0', base2: '#86b2f5', margin: '#23233a', marginWidth: 3, fringe: '#f6f6f2',
    spots: [[U(0.06), V(-0.03), 3, 'rgba(30,30,60,0.6)']],
  },
  // Generic pattern for background butterflies: white with dark tips and spots, tinted per species.
  generic: {
    inner: '#9a9a9a', base: '#ffffff', margin: '#2a2626', marginWidth: 6, fringe: '#e8e8e8',
    spots: [[U(0.085), V(-0.062), 14, '#2a2626'], [U(0.06), V(-0.035), 7, '#2a2626'], [U(0.04), V(0.045), 6, '#3a3434']],
  },
};

/** Flat wing (one side) lying in the XZ plane, hinge along Z. `mirror` builds the left wing. */
export function wingGeometry(mirror = false) {
  const geos = [FORE, HIND].map((points) => {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
    const geo = new THREE.ShapeGeometry(shape, 4);
    geo.rotateX(Math.PI / 2); // (x, y) → (x, 0, y)
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, U(pos.getX(i)), 1 - V(pos.getZ(i)));
    return geo;
  });
  const g = mergeGeometries(geos, false);
  if (mirror) g.scale(-1, 1, 1);
  g.computeVertexNormals();
  return g;
}

/** Body + head + antennae as one geometry (vertex coloured). */
export function bodyGeometry(color = '#26201e') {
  const c = new THREE.Color(color);
  const parts = [];
  const body = new THREE.CapsuleGeometry(0.008, 0.05, 3, 8).rotateX(Math.PI / 2).translate(0, 0, 0.008);
  const head = new THREE.SphereGeometry(0.009, 10, 8).translate(0, 0, -0.028);
  parts.push(body, head);
  for (const side of [-1, 1]) {
    const a = new THREE.CylinderGeometry(0.0009, 0.0009, 0.045, 4);
    a.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(side * 0.008, 0.012, -0.045),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.0, 0, side * -0.35)),
      new THREE.Vector3(1, 1, 1)));
    const knob = new THREE.SphereGeometry(0.0022, 6, 4).translate(0, 0.023, 0);
    knob.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(side * 0.008, 0.012, -0.045),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.0, 0, side * -0.35)),
      new THREE.Vector3(1, 1, 1)));
    parts.push(a, knob);
  }
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }), false);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function wingMaterial(palette) {
  return new THREE.MeshLambertMaterial({ map: wingTexture(OUTLINE_UV, palette), side: THREE.DoubleSide });
}

/** The player's butterfly: a single animated model. */
export class ButterflyModel {
  constructor({ palette = PALETTES.boomblauwtje, scale = 0.2 } = {}) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.group.scale.setScalar(scale);
    this.tilt = new THREE.Group();
    this.group.add(this.tilt);
    const body = new THREE.Mesh(bodyGeometry('#2a2b3a'), new THREE.MeshLambertMaterial({ vertexColors: true }));
    body.castShadow = true;
    this.tilt.add(body);
    const mat = wingMaterial(palette);
    this.wings = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.y = 0.004;
      const m = new THREE.Mesh(wingGeometry(side < 0), mat);
      m.castShadow = true;
      hinge.add(m);
      hinge.userData.side = side;
      this.tilt.add(hinge);
      this.wings.push(hinge);
    }
  }

  /** a = wing angle: 0 = flat open, ~1.4 = closed above the back. */
  setWings(a) {
    for (const w of this.wings) w.rotation.z = w.userData.side * a;
  }
}
