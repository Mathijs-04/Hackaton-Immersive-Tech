// Ground V2: textured soil bed, mottled lawn with instanced grass, generic undergrowth
// (clover, fallen autumn leaves, gravel), rubble rim ("puin") and a hedge/tree backdrop.
// Everything is instanced: ~8 draw calls for the whole ground layer. All decorative.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { BED_HEIGHT } from './world.js';
import { seeded } from './random.js';
import { soilTexture, lawnTexture } from './textures.js';
import { windMaterial, STIFFNESS } from '../plants/archetypes.js';

const SOIL_DRY = new THREE.Color('#ffffff');
const SOIL_WET = new THREE.Color('#5a4a40');
const FROST = new THREE.Color('#dfe9f2');
const WHITE = new THREE.Color('#ffffff');
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

function setInstance(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz, color) {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
  mesh.setMatrixAt(i, _m);
  if (color) mesh.setColorAt(i, _c.set(color));
}

function vColors(geo, fn) {
  const p = geo.attributes.position, arr = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { const c = fn(v.fromBufferAttribute(p, i)); arr.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Grass tuft: `n` curved tapering blades in a unit box (height 1). */
function tuftGeometry(n = 5, seed = 3) {
  const rnd = seeded(`tuft${seed}`);
  const pos = [], col = [], idx = [];
  const base = new THREE.Color('#2f5a24'), tip = new THREE.Color('#9dbb62');
  for (let b = 0; b < n; b++) {
    const a = rnd() * Math.PI * 2, lean = 0.15 + rnd() * 0.35, h = 0.65 + rnd() * 0.35, w = 0.035 + rnd() * 0.02;
    const ox = Math.cos(a) * 0.12 * rnd(), oz = Math.sin(a) * 0.12 * rnd();
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx; // lean direction / blade width direction
    const start = pos.length / 3;
    const rows = 3;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, y = t * h, bend = lean * t * t;
      const hw = r === rows ? 0 : w * (1 - t * 0.8);
      const cx = ox + dx * bend, cz = oz + dz * bend;
      const c = base.clone().lerp(tip, t);
      pos.push(cx - px * hw, y, cz - pz * hw, cx + px * hw, y, cz + pz * hw);
      col.push(c.r, c.g, c.b, c.r * 0.9, c.g * 0.9, c.b * 0.9);
    }
    for (let r = 0; r < rows; r++) {
      const i0 = start + r * 2;
      idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Grass normals point mostly up: softer, less "paper" look.
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(nrm, i).lerp(new THREE.Vector3(0, 1, 0), 0.6).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** Small rounded leaf lying flat (for clover and fallen leaves). */
function flatLeaf(len, wid, curl = 0.15) {
  const g = new THREE.CircleGeometry(1, 7);
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setXYZ(i, (x + 1) * 0.5 * len, curl * (x * x + y * y) * wid * 0.5, y * wid * 0.5 * (1 - Math.max(0, x) * 0.5));
  }
  g.computeVertexNormals();
  return g;
}

function cloverGeometry() {
  const rnd = seeded('clover');
  const parts = [];
  for (let k = 0; k < 6; k++) {
    const a = rnd() * Math.PI * 2, d = 0.15 + rnd() * 0.3, h = 0.25 + rnd() * 0.4;
    for (let l = 0; l < 3; l++) {
      const leaf = flatLeaf(0.22, 0.2, 0.25);
      leaf.applyMatrix4(new THREE.Matrix4().makeRotationY(a + (l / 3) * Math.PI * 2));
      leaf.translate(Math.cos(a) * d, h, Math.sin(a) * d);
      parts.push(vColors(leaf, () => new THREE.Color(l === 0 ? '#4f8a3c' : '#5d9645')));
    }
  }
  return mergeGeometries(parts, false);
}

function blobGeometry(seed, n, colorFn) {
  const rnd = seeded(seed);
  const parts = [];
  for (let i = 0; i < n; i++) {
    let g = new THREE.IcosahedronGeometry(1, 1);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const s = 1 + (rnd() - 0.5) * 0.4; p.setXYZ(k, p.getX(k) * s, p.getY(k) * s, p.getZ(k) * s); }
    const r = 0.28 + rnd() * 0.12;
    g.scale(r, r * 0.9, r);
    g.translate((rnd() - 0.5) * 0.5, 0.25 + rnd() * 0.45, (rnd() - 0.5) * 0.5);
    g.computeVertexNormals();
    parts.push(vColors(g, colorFn));
  }
  return mergeGeometries(parts, false);
}

function treeGeometry() {
  const rnd = seeded('tree');
  const bark = new THREE.Color('#4a3a2e');
  const trunk = new THREE.CylinderGeometry(0.025, 0.045, 0.55, 6, 1, true).translate(0, 0.275, 0);
  trunk.deleteAttribute('uv');
  const parts = [vColors(trunk, () => bark)];
  const lo = new THREE.Color('#3c5a2c'), hi = new THREE.Color('#7d9a48');
  for (let i = 0; i < 7; i++) {
    let g = new THREE.IcosahedronGeometry(1, 1);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const s = 1 + (rnd() - 0.5) * 0.35; p.setXYZ(k, p.getX(k) * s, p.getY(k) * s, p.getZ(k) * s); }
    const r = 0.16 + rnd() * 0.1;
    g.scale(r, r, r).translate((rnd() - 0.5) * 0.28, 0.55 + rnd() * 0.32, (rnd() - 0.5) * 0.28);
    g.computeVertexNormals();
    parts.push(vColors(g, (v) => lo.clone().lerp(hi, Math.min(1, Math.max(0, (v.y - 0.45) / 0.5)))));
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

export class Ground {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    const R = world.radius;

    // --- Lawn base (fades into fog)
    const lawnTex = lawnTexture();
    lawnTex.repeat.set(110, 110);
    const lawnGeo = new THREE.CircleGeometry(160, 64).rotateX(-Math.PI / 2);
    this.lawnMat = new THREE.MeshLambertMaterial({ map: lawnTex });
    const lawn = new THREE.Mesh(lawnGeo, this.lawnMat);
    lawn.receiveShadow = true;
    this.group.add(lawn);

    // --- Soil bed in the polygon shape
    const shape = new THREE.Shape(world.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
    const bedGeo = new THREE.ExtrudeGeometry(shape, {
      depth: BED_HEIGHT - 0.04, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.12, bevelSegments: 3, curveSegments: 4,
    });
    bedGeo.rotateX(-Math.PI / 2);
    const soil = soilTexture();
    soil.repeat.set(0.55, 0.55);
    this.soilMat = new THREE.MeshStandardMaterial({ map: soil, roughness: 0.95, metalness: 0, color: SOIL_DRY.clone() });
    const bed = new THREE.Mesh(bedGeo, this.soilMat);
    bed.receiveShadow = true;
    this.group.add(bed);

    this.group.add(this.makeRubble());
    this.grass = this.makeGrass();
    this.group.add(this.grass);
    this.group.add(this.makeClover(), this.makeFallenLeaves(), this.makeGravel(), this.makeHedge(), this.makeTrees());
  }

  makeRubble() {
    const world = this.world, rnd = seeded(`rubble:${world.areaRef}`);
    let geo = new THREE.IcosahedronGeometry(1, 1);
    geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
    geo = mergeVertices(geo);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) { const s = 1 + (rnd() - 0.5) * 0.45; p.setXYZ(k, p.getX(k) * s, p.getY(k) * s, p.getZ(k) * s); }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const poly = world.polygon, rim = 170, scatter = 40;
    const mesh = new THREE.InstancedMesh(geo, mat, rim + scatter);
    const tones = ['#9c5a45', '#a8674f', '#8f8b85', '#a29f98', '#b9b2a6', '#7d4a3a', '#c4b8a4'];
    for (let i = 0; i < rim + scatter; i++) {
      let x, z, y;
      if (i < rim) {
        const a = poly[Math.floor(rnd() * poly.length)], len = Math.hypot(a[0], a[1]) || 1, out = rnd.range(0.02, 0.38);
        x = a[0] + (a[0] / len) * out; z = a[1] + (a[1] / len) * out; y = rnd.range(0.02, 0.1);
      } else {
        const ang = rnd() * Math.PI * 2, r = world.radius + rnd.range(0.6, 3.5);
        x = Math.cos(ang) * r; z = Math.sin(ang) * r; y = 0.01;
      }
      const size = i < rim ? rnd.range(0.06, 0.17) : rnd.range(0.04, 0.1);
      setInstance(mesh, i, x, y, z, rnd() * 0.6, rnd() * 6.3, rnd() * 0.6, size * rnd.range(0.9, 1.6), size * rnd.range(0.5, 0.9), size * rnd.range(0.8, 1.3), rnd.pick(tones));
    }
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  makeGrass() {
    const world = this.world, rnd = seeded('grass');
    const geo = tuftGeometry(4);
    this.grassMat = windMaterial(STIFFNESS.grass);
    const lawnN = 5600, bedN = 400;
    const mesh = new THREE.InstancedMesh(geo, this.grassMat, lawnN + bedN);
    const tones = ['#ffffff', '#f2f5e6', '#e6edd8', '#f4f0d0', '#e9e2b8', '#d8e4c8'];
    let i = 0;
    const R0 = world.radius + 0.12;
    while (i < lawnN) {
      const r = R0 + (16 - R0) * Math.pow(rnd(), 1.7), a = rnd() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (world.isInside(x, z, -0.12)) continue;
      const h = rnd.range(0.1, 0.24) * (r < R0 + 0.6 ? 1.3 : 1); // longer along the bed edge
      const s = rnd.range(0.12, 0.2);
      setInstance(mesh, i++, x, 0, z, 0, rnd() * 6.3, 0, s, h, s, rnd.pick(tones));
    }
    // Weeds and grass creeping into the bed, mostly along the edge.
    for (let n = 0; n < bedN; ) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * world.radius;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!world.isInside(x, z, 0.05)) continue;
      if (world.edgeDistance(x, z) > 0.6 && rnd() > 0.25) continue;
      const h = rnd.range(0.06, 0.16), s = rnd.range(0.08, 0.14);
      setInstance(mesh, i++, x, BED_HEIGHT, z, 0, rnd() * 6.3, 0, s, h, s, rnd.pick(tones));
      n++;
    }
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.grassTotal = mesh.count;
    return mesh;
  }

  makeClover() {
    const world = this.world, rnd = seeded('clovers');
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const n = 240;
    const mesh = new THREE.InstancedMesh(cloverGeometry(), mat, n);
    for (let i = 0; i < n; ) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * world.radius;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!world.isInside(x, z, 0.08)) continue;
      const s = rnd.range(0.07, 0.13);
      setInstance(mesh, i++, x, BED_HEIGHT, z, 0, rnd() * 6.3, 0, s, s * 0.45, s, rnd() < 0.3 ? '#d9e6b0' : '#ffffff');
    }
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  makeFallenLeaves() {
    const world = this.world, rnd = seeded('leaves');
    const geo = flatLeaf(1, 0.55, 0.12);
    vColors(geo, () => WHITE);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const n = 320;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const tones = ['#b5642a', '#c98b2f', '#8a4a22', '#d0a040', '#6e5a2a', '#a33f22', '#9a7a3a'];
    for (let i = 0; i < n; ) {
      const inBed = i < 190;
      const a = rnd() * Math.PI * 2;
      const r = inBed ? Math.sqrt(rnd()) * world.radius : world.radius + rnd.range(0.1, 3);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (inBed && !world.isInside(x, z, 0.04)) continue;
      const y = (inBed ? BED_HEIGHT : 0) + 0.004;
      const s = rnd.range(0.04, 0.075);
      setInstance(mesh, i++, x, y, z, rnd.range(-0.25, 0.25), rnd() * 6.3, rnd.range(-0.25, 0.25), s, s, s, rnd.pick(tones));
    }
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  makeGravel() {
    const world = this.world, rnd = seeded('gravel');
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
    const n = 320;
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat, n);
    const tones = ['#9d9890', '#857c72', '#b0a898', '#a0705a', '#6f6a64'];
    for (let i = 0; i < n; ) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * world.radius;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!world.isInside(x, z, 0.03)) continue;
      const s = rnd.range(0.006, 0.018);
      setInstance(mesh, i++, x, BED_HEIGHT + s * 0.3, z, rnd() * 3, rnd() * 3, 0, s * 1.3, s * 0.8, s, rnd.pick(tones));
    }
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  makeHedge() {
    const rnd = seeded('hedge');
    const lo = new THREE.Color('#2c4a24'), hi = new THREE.Color('#5a7a3a');
    const geo = blobGeometry('hedgeblob', 6, (v) => lo.clone().lerp(hi, Math.min(1, v.y)));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const radius = 12.5, segs = 84, gapFrom = 0.15, gapTo = 0.95; // opening towards the south-east (default view)
    const list = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (a > gapFrom && a < gapTo) continue;
      list.push(a);
    }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((a, i) => {
      const r = radius + rnd.range(-0.2, 0.2);
      setInstance(mesh, i, Math.cos(a) * r, -0.15, Math.sin(a) * r, 0, -a + Math.PI / 2, 0, 1.9, rnd.range(1.4, 1.8), 1.3, rnd() < 0.2 ? '#e8e0b8' : '#ffffff');
    });
    mesh.computeBoundingSphere();
    return mesh;
  }

  makeTrees() {
    const rnd = seeded('trees');
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const n = 16;
    const mesh = new THREE.InstancedMesh(treeGeometry(), mat, n);
    const tints = ['#ffffff', '#f6e6a8', '#f0c890', '#e9f0d8', '#ffd9a0']; // some autumn colour
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3, r = rnd.range(19, 34);
      const h = rnd.range(6, 9.5);
      setInstance(mesh, i, Math.cos(a) * r, 0, Math.sin(a) * r, 0, rnd() * 6.3, 0, h * 0.9, h, h * 0.9, rnd.pick(tints));
    }
    mesh.computeBoundingSphere();
    return mesh;
  }

  /** Fraction of grass tufts drawn (adaptive quality). */
  setGrassDensity(f) { this.grass.count = Math.floor(this.grassTotal * f); }

  apply({ wetness, soilWarmth, frost, rain }) {
    // Moisture/rain: darker, glossier soil and lawn. Frost: pale grass and lawn.
    this.soilMat.color.copy(SOIL_DRY).lerp(SOIL_WET, wetness * 0.85);
    this.soilMat.color.multiplyScalar(0.92 + soilWarmth * 0.08);
    this.soilMat.roughness = 0.95 - wetness * 0.5;
    this.lawnMat.color.copy(WHITE).multiplyScalar(1 - 0.25 * wetness).lerp(FROST, frost * 0.55);
    this.grassMat.color.copy(WHITE).multiplyScalar(1 - 0.15 * rain).lerp(FROST, frost * 0.6);
  }
}
