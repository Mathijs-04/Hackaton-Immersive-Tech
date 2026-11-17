// Procedural plant shapes, V2: smooth-shaded, curved tapered stems, real leaf blades with a
// midrib fold and droop, individual petals and florets, vertex-colour gradients and fake
// ambient occlusion. Still no model files and ~300–900 triangles per plant.
//
// Each archetype lives in a unit box (radius ~0.5, height 1); instances scale it to the species'
// spread (x/z) and height (y). Two parts per archetype:
//   foliage: stems, leaves, flower centres. Instance colour = slight tint.
//   bloom:   petals/florets in white-ish; instance colour = species bloom colour.
// `flowers` lists the local centres of the flower heads (landing spots for insects).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../world/random.js';

const C = (h) => new THREE.Color(h);
const COL = {
  stem: C('#4b7b35'), stemDark: C('#33592a'),
  leaf: C('#4a8a3a'), leafDark: C('#335f28'), leafTip: C('#8bbb5e'), leafGrey: C('#7a9a76'),
  centre: C('#e2b02c'), centreDark: C('#7a4e1a'), bark: C('#5c4636'), barkDark: C('#3e2f25'),
  rush: C('#5d8b55'), rushTip: C('#a3b47a'), white: C('#ffffff'), petalBase: C('#d8d8d8'),
};
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- collision shapes
// Builders register simple solids (unit space) while they make geometry, so collision matches
// what you see: capsules for stems/spikes, ellipsoids for flower heads, cushions and crowns.
let COLLIDERS = [];
const cap = (a, b, r) => COLLIDERS.push({ k: 'cap', a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], r });
const ell = (c, rx, ry, rz = rx) => COLLIDERS.push({ k: 'ell', c: [c.x, c.y, c.z], r: [rx, ry, rz] });

// ---------------------------------------------------------------- geometry helpers

/** Give a geometry a colour attribute: a Color, or fn(position, i) → Color. */
function paint(geo, color) {
  const p = geo.attributes.position, n = p.count, arr = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const c = typeof color === 'function' ? color(v.fromBufferAttribute(p, i), i) : color;
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Normalise any three.js primitive: indexed, smooth normals, no uv. */
function smoothPrim(geo) {
  let g = geo.clone();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  g.computeVertexNormals();
  return g;
}

function build(positions, colors, indices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Leaf/petal blade along +X: length `len`, width `wid`. `fold` lifts the midrib (V-shape),
 * `droop` bends the tip down, `cup` curls the edges up (petals). Colour c0 (base) → c1 (tip).
 */
function blade({ len, wid, segs = 4, fold = 0.25, droop = 0.25, cup = 0, c0 = COL.leafDark, c1 = COL.leafTip, shape = 'lance' }) {
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t * len;
    let hw = shape === 'round'
      ? (wid / 2) * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, t * 0.55 + 0.12))), 0.6) * (t > 0.85 ? Math.sqrt((1 - t) / 0.15) : 1)
      : (wid / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.97 + 0.03)), 0.85) * (1 - 0.25 * t);
    if (i === segs) hw = 0;
    const yMid = -droop * len * t * t;
    const yEdge = yMid - fold * hw + cup * hw;
    c.copy(c0).lerp(c1, t);
    pos.push(x, yEdge, -hw, x, yMid, 0, x, yEdge, hw);
    for (let k = 0; k < 3; k++) col.push(c.r * (k === 1 ? 1.06 : 0.96), c.g * (k === 1 ? 1.06 : 0.96), c.b * (k === 1 ? 1.06 : 0.96));
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 3, b = a + 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  return build(pos, col, idx);
}

/** Place a blade: base at `at`, pointing to compass angle `yaw`, raised by `pitch`, rolled by `roll`. */
function placeBlade(geo, at, yaw, pitch, roll = 0) {
  const m = new THREE.Matrix4()
    .makeTranslation(at.x, at.y, at.z)
    .multiply(new THREE.Matrix4().makeRotationY(yaw))
    .multiply(new THREE.Matrix4().makeRotationZ(pitch))
    .multiply(new THREE.Matrix4().makeRotationX(roll));
  return geo.applyMatrix4(m);
}

/** Tapered tube along a quadratic Bézier from a to b with control point c. */
function tube(a, ctrl, b, r0, r1, { radial = 5, segs = 5, c0 = COL.stemDark, c1 = COL.stem } = {}) {
  const pos = [], col = [], idx = [];
  const p = new THREE.Vector3(), tan = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3(), c = new THREE.Color();
  const curve = new THREE.QuadraticBezierCurve3(a, ctrl, b);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPoint(t, p);
    curve.getTangent(t, tan);
    nrm.crossVectors(tan, Math.abs(tan.y) < 0.95 ? UP : V(1, 0, 0)).normalize();
    bin.crossVectors(tan, nrm).normalize();
    const r = r0 + (r1 - r0) * t;
    c.copy(c0).lerp(c1, t);
    for (let j = 0; j < radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const cx = Math.cos(ang), sy = Math.sin(ang);
      pos.push(p.x + (nrm.x * cx + bin.x * sy) * r, p.y + (nrm.y * cx + bin.y * sy) * r, p.z + (nrm.z * cx + bin.z * sy) * r);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a0 = i * radial + j, a1 = i * radial + ((j + 1) % radial);
      const b0 = a0 + radial, b1 = a1 + radial;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  return build(pos, col, idx);
}

const trs = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(sx, sy, sz));

/** Bumpy smooth blob (icosphere with noise), for cushions, shrub crowns and globe flowers. */
function blob(rnd, detail, bump, color, matrix) {
  const g = smoothPrim(new THREE.IcosahedronGeometry(1, detail));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (rnd() - 0.5) * bump;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  g.applyMatrix4(matrix);
  return paint(g, color);
}

function tiny(color, matrix, detail = 0) {
  return paint(smoothPrim(new THREE.OctahedronGeometry(1, detail)).applyMatrix4(matrix), color);
}

/** Fan of leaves at the base. */
function rosette(rnd, n, len, wid, { pitch = 0.35, droop = 0.35, y = 0.01, c1 = COL.leafTip } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + rnd() * 0.6;
    const l = len * (0.7 + rnd() * 0.45);
    out.push(placeBlade(blade({ len: l, wid: wid * (0.85 + rnd() * 0.3), droop, c0: COL.leafDark, c1 }), V(0, y, 0), yaw, pitch + rnd() * 0.3, (rnd() - 0.5) * 0.4));
  }
  return out;
}

/** Stems curving outward from the base; returns tips with direction plus stem/leaf geometry. */
function stems(rnd, n, { spread = 0.16, minH = 0.7, maxH = 1.0, r = 0.016, leaves = 2, leafLen = 0.16, leafWid = 0.05 } = {}) {
  const tips = [], parts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.8;
    const base = V(Math.cos(a) * 0.035, 0, Math.sin(a) * 0.035);
    const h = minH + rnd() * (maxH - minH);
    const s = spread * (0.45 + rnd() * 0.55);
    const top = V(Math.cos(a) * s, h, Math.sin(a) * s);
    const ctrl = V(Math.cos(a) * s * 0.2, h * 0.55, Math.sin(a) * s * 0.2);
    parts.push(tube(base, ctrl, top, r, r * 0.55));
    const curve = new THREE.QuadraticBezierCurve3(base, ctrl, top);
    for (let k = 0; k < leaves; k++) {
      const t = 0.22 + (k / Math.max(1, leaves)) * 0.45 + rnd() * 0.05;
      const at = curve.getPoint(t);
      parts.push(placeBlade(blade({ len: leafLen * (1 - t * 0.4), wid: leafWid, droop: 0.4, c0: COL.leaf, c1: COL.leafTip }), at, a + (k % 2 ? 2.4 : -0.7) + rnd() * 0.5, 0.45));
    }
    const dir = curve.getTangent(1, new THREE.Vector3());
    const mid = curve.getPoint(0.5);
    cap(base, mid, r);
    cap(mid, top, r * 0.8);
    tips.push({ base, top, ctrl, dir, angle: a, curve });
  }
  return { tips, parts };
}

/** Radial flower head: `n` petals + domed centre, facing `dir`. */
function flowerHead(rnd, at, dir, { n = 11, len = 0.075, wid = 0.03, cup = 0.4, centre = 0.022, centreColor = COL.centre, droop = -0.05 }) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  const m = new THREE.Matrix4().compose(at, q, V(1, 1, 1));
  const petals = [];
  const spin = rnd() * Math.PI;
  for (let i = 0; i < n; i++) {
    const p = blade({ len, wid, segs: 3, fold: -0.1, droop, cup, c0: COL.petalBase, c1: COL.white, shape: 'round' });
    placeBlade(p, V(0, 0, 0), spin + (i / n) * Math.PI * 2, 0.12 + rnd() * 0.08);
    petals.push(p.applyMatrix4(m));
  }
  const ctr = paint(smoothPrim(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)), (v) => centreColor.clone().lerp(COL.centreDark, 1 - v.y * 0.6))
    .applyMatrix4(new THREE.Matrix4().compose(V(0, 0, 0), new THREE.Quaternion(), V(centre, centre * 0.55, centre)))
    .applyMatrix4(m);
  return { petals, centre: ctr };
}

// ---------------------------------------------------------------- archetypes

const BUILDERS = {
  spike(rnd) {
    const { tips, parts } = stems(rnd, 3, { spread: 0.12, minH: 0.72, maxH: 1.0, leaves: 3, leafLen: 0.2, leafWid: 0.06 });
    const foliage = [...rosette(rnd, 6, 0.34, 0.1), ...parts];
    const bloom = [], flowers = [];
    for (const { curve } of tips) {
      const N = 14;
      for (let k = 0; k < N; k++) {
        const t = 0.62 + (k / N) * 0.38;
        const p = curve.getPoint(t);
        const taper = 1 - (k / N) * 0.6;
        const ang = k * 2.4;
        const off = 0.026 * taper;
        // Rounded florets, opening outward from the spike.
        bloom.push(tiny(k > N - 3 ? COL.petalBase : COL.white, trs(p.x + Math.cos(ang) * off, p.y, p.z + Math.sin(ang) * off, 0.3, -ang, 0, 0.02 * taper + 0.008, 0.013, 0.02 * taper + 0.008), 1));
      }
      flowers.push(curve.getPoint(0.8));
      cap(curve.getPoint(0.62), curve.getPoint(1), 0.03);
    }
    return { foliage, bloom, flowers };
  },

  umbel(rnd) {
    const { tips, parts } = stems(rnd, 3, { spread: 0.2, minH: 0.72, maxH: 1.0, leaves: 2, leafLen: 0.18, leafWid: 0.07 });
    const foliage = [...rosette(rnd, 6, 0.3, 0.12), ...parts];
    const bloom = [], flowers = [];
    for (const { top } of tips) {
      const R = 0.11;
      for (let k = 0; k < 13; k++) {
        const a = k * 2.4 + rnd() * 0.3, d = Math.sqrt((k + 0.5) / 13) * R;
        const fx = top.x + Math.cos(a) * d, fz = top.z + Math.sin(a) * d;
        const fy = top.y + 0.035 - (d / R) * (d / R) * 0.03;
        foliage.push(tube(top, V((top.x + fx) / 2, fy - 0.005, (top.z + fz) / 2), V(fx, fy, fz), 0.003, 0.002, { radial: 3, segs: 2, c0: COL.stem, c1: COL.stem }));
        bloom.push(tiny(k % 3 ? COL.white : COL.petalBase, trs(fx, fy + 0.006, fz, 0, a, 0, 0.024, 0.012, 0.024)));
      }
      flowers.push(V(top.x, top.y + 0.045, top.z));
      ell(V(top.x, top.y + 0.025, top.z), 0.12, 0.03);
    }
    return { foliage, bloom, flowers };
  },

  daisy(rnd) {
    const { tips, parts } = stems(rnd, 4, { spread: 0.24, minH: 0.55, maxH: 1.0, r: 0.012, leaves: 1, leafLen: 0.14, leafWid: 0.04 });
    const foliage = [...rosette(rnd, 7, 0.26, 0.09), ...parts];
    const bloom = [], flowers = [];
    for (const { top, dir } of tips) {
      const face = dir.clone().lerp(UP, 0.4).normalize();
      const { petals, centre } = flowerHead(rnd, top, face, { n: 11, len: 0.065, wid: 0.026 });
      bloom.push(...petals);
      foliage.push(centre);
      flowers.push(top.clone().addScaledVector(face, 0.015));
      ell(top, 0.07, 0.022);
    }
    return { foliage, bloom, flowers };
  },

  // Five broad, cupped petals (mallow, cranesbill, soapwort, pinks).
  cup(rnd) {
    const { tips, parts } = stems(rnd, 4, { spread: 0.26, minH: 0.55, maxH: 1.0, r: 0.012, leaves: 2, leafLen: 0.13, leafWid: 0.07 });
    const foliage = [...rosette(rnd, 6, 0.24, 0.13, { droop: 0.45 }), ...parts];
    const bloom = [], flowers = [];
    for (const { top, dir } of tips) {
      const face = dir.clone().lerp(UP, 0.5).normalize();
      const { petals, centre } = flowerHead(rnd, top, face, { n: 5, len: 0.06, wid: 0.05, cup: 0.9, centre: 0.012, centreColor: C('#f0e6d0') });
      bloom.push(...petals);
      foliage.push(centre);
      flowers.push(top.clone().addScaledVector(face, 0.03)); // on the rim of the cup, not inside it
      ell(top.clone().addScaledVector(face, 0.012), 0.055, 0.025);
    }
    return { foliage, bloom, flowers };
  },

  bell(rnd) {
    const { tips, parts } = stems(rnd, 3, { spread: 0.26, minH: 0.7, maxH: 1.0, r: 0.012, leaves: 2, leafLen: 0.13, leafWid: 0.05 });
    const foliage = [...rosette(rnd, 6, 0.24, 0.12, { droop: 0.45 }), ...parts];
    const bloom = [], flowers = [];
    const profile = [[0.004, 0], [0.016, -0.01], [0.024, -0.035], [0.028, -0.058], [0.04, -0.07]].map(([x, y]) => new THREE.Vector2(x, y));
    const bellGeo = new THREE.LatheGeometry(profile, 7);
    bellGeo.deleteAttribute('uv');
    for (const { curve, angle } of tips) {
      for (let k = 0; k < 3; k++) {
        const t = 0.68 + k * 0.13;
        const at = curve.getPoint(t);
        const side = k % 2 ? 1 : -1;
        const ox = Math.cos(angle + side * 1.3) * 0.03, oz = Math.sin(angle + side * 1.3) * 0.03;
        foliage.push(tube(at, V(at.x + ox * 0.6, at.y + 0.01, at.z + oz * 0.6), V(at.x + ox, at.y - 0.005, at.z + oz), 0.003, 0.002, { radial: 3, segs: 2 }));
        const g = paint(bellGeo.clone(), (v) => COL.white.clone().lerp(COL.petalBase, Math.min(1, -v.y * 10)))
          .applyMatrix4(trs(at.x + ox, at.y - 0.005, at.z + oz, side * 0.35, angle, 0, 1.15, 1.15, 1.15));
        bloom.push(g);
        if (k === 1) flowers.push(V(at.x + ox, at.y - 0.03, at.z + oz));
      }
    }
    return { foliage, bloom, flowers };
  },

  globe(rnd) {
    const { tips, parts } = stems(rnd, 3, { spread: 0.14, minH: 0.75, maxH: 1.0, leaves: 2, leafLen: 0.2, leafWid: 0.05 });
    const foliage = [...rosette(rnd, 6, 0.32, 0.07, { pitch: 0.5, c1: COL.leafGrey }), ...parts];
    const bloom = [], flowers = [];
    for (const { top } of tips) {
      bloom.push(blob(rnd, 2, 0.18, (v) => COL.white.clone().lerp(COL.petalBase, Math.max(0, -v.y) * 0.8), trs(top.x, top.y + 0.045, top.z, 0, rnd() * 3, 0, 0.055, 0.06, 0.055)));
      for (let k = 0; k < 5; k++) {
        const b = blade({ len: 0.05, wid: 0.012, segs: 2, droop: 0.2, c0: COL.leafGrey, c1: COL.leafTip });
        foliage.push(placeBlade(b, V(top.x, top.y + 0.01, top.z), (k / 5) * Math.PI * 2, 0.3));
      }
      flowers.push(V(top.x, top.y + 0.1, top.z));
      ell(V(top.x, top.y + 0.045, top.z), 0.055, 0.06);
    }
    return { foliage, bloom, flowers };
  },

  mat(rnd) {
    const foliage = [], bloom = [], flowers = [];
    const lumps = [];
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2, d = i === 0 ? 0 : 0.13 + rnd() * 0.1;
      const r = 0.2 + rnd() * 0.08;
      lumps.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r });
      ell(V(Math.cos(a) * d, 0, Math.sin(a) * d), r, 0.95);
      foliage.push(blob(rnd, 1, 0.35, (v) => (v.y > 0.6 ? COL.leafTip : COL.leaf).clone().lerp(COL.leafDark, 1 - Math.min(1, v.y)), trs(Math.cos(a) * d, 0, Math.sin(a) * d, 0, rnd() * 3, 0, r, 1, r)));
    }
    for (let i = 0; i < 26; i++) {
      const L = lumps[Math.floor(rnd() * lumps.length)];
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * L.r * 0.85;
      const y = Math.sqrt(Math.max(0, 1 - (d / L.r) ** 2)) * 0.95;
      bloom.push(tiny(COL.white, trs(L.x + Math.cos(a) * d, y, L.z + Math.sin(a) * d, 0, a, 0, 0.03, 0.12, 0.03)));
    }
    flowers.push(V(0, 1.0, 0));
    return { foliage, bloom, flowers };
  },

  tuft(rnd) {
    const foliage = [], bloom = [], flowers = [];
    cap(V(0, 0, 0), V(0, 0.75, 0), 0.08); // the dense core of the clump
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2, tilt = rnd() * 0.4;
      const len = 0.7 + rnd() * 0.3;
      const base = V(Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03);
      const top = V(Math.cos(a) * (0.03 + Math.sin(tilt) * len), Math.cos(tilt) * len, Math.sin(a) * (0.03 + Math.sin(tilt) * len));
      foliage.push(tube(base, V(base.x, len * 0.5, base.z), top, 0.012, 0.002, { radial: 4, segs: 4, c0: COL.leafDark, c1: COL.rushTip }));
      if (i < 5) {
        const p = new THREE.Vector3().lerpVectors(base, top, 0.72);
        bloom.push(tiny(COL.white, trs(p.x, p.y, p.z, 0, a, 0, 0.02, 0.035, 0.02), 1));
      }
    }
    return { foliage, bloom, flowers };
  },

  shrub(rnd) {
    const foliage = [], bloom = [], flowers = [];
    // Young multi-stemmed shrub: branches fan out low, foliage from knee height to the top.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rnd();
      const top = V(Math.cos(a) * 0.26, 0.45 + rnd() * 0.15, Math.sin(a) * 0.26);
      foliage.push(tube(V(Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02), V(Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08), top, 0.025, 0.01, { radial: 5, segs: 4, c0: COL.barkDark, c1: COL.bark }));
      cap(V(Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02), top, 0.025);
    }
    const blobs = [];
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2, d = i < 2 ? rnd() * 0.08 : 0.14 + rnd() * 0.22;
      const y = i < 2 ? 0.62 + rnd() * 0.2 : 0.22 + rnd() * 0.5;
      const b = { x: Math.cos(a) * d, y, z: Math.sin(a) * d, r: 0.14 + rnd() * 0.09 };
      blobs.push(b);
      ell(V(b.x, b.y, b.z), b.r * 0.9, b.r * 0.8);
      foliage.push(blob(rnd, 1, 0.45, (v) => COL.leafDark.clone().lerp(COL.leaf, Math.min(1, Math.max(0, (v.y - b.y + b.r) / (2 * b.r)) * 1.2)), trs(b.x, b.y, b.z, rnd(), rnd() * 3, 0, b.r, b.r * 0.85, b.r)));
    }
    for (let i = 0; i < 26; i++) {
      const b = blobs[Math.floor(rnd() * blobs.length)];
      const th = rnd() * Math.PI * 2, ph = rnd() * 1.3;
      bloom.push(tiny(COL.white, trs(
        b.x + Math.cos(th) * Math.sin(ph + 0.3) * b.r, b.y + Math.cos(ph) * b.r * 0.82, b.z + Math.sin(th) * Math.sin(ph + 0.3) * b.r,
        0, th, 0, 0.022, 0.022, 0.022), 1));
    }
    const topBlob = blobs.reduce((a, b) => (b.y + b.r > a.y + a.r ? b : a));
    flowers.push(V(topBlob.x, topBlob.y + topBlob.r * 0.8, topBlob.z));
    return { foliage, bloom, flowers };
  },

  seedling(rnd) {
    const top = V(0, 0.55, 0);
    cap(V(0, 0, 0), top, 0.06);
    const foliage = [tube(V(0, 0, 0), V(0.03, 0.3, 0), top, 0.035, 0.025, { c0: COL.stem, c1: COL.leafTip })];
    const a = rnd() * Math.PI;
    for (const s of [0, Math.PI]) {
      foliage.push(placeBlade(blade({ len: 0.42, wid: 0.3, droop: 0.15, fold: 0.1, c0: COL.leaf, c1: COL.leafTip, shape: 'round' }), top, a + s, 0.35));
    }
    foliage.push(placeBlade(blade({ len: 0.25, wid: 0.14, droop: 0.1, c0: COL.leafDark, c1: COL.leaf }), V(0, 0.6, 0), a + 1.57, 0.9));
    return { foliage, bloom: [], flowers: [] };
  },
};

export const ARCHETYPES = Object.keys(BUILDERS);

/** Fake ambient occlusion: darker near the ground, inside clumps. */
function applyAO(geo, strength = 0.5, top = 0.45) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const y = Math.max(0, Math.min(1, p.getY(i) / top));
    const k = 1 - strength + strength * (y * y * (3 - 2 * y));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
}

const AO = { mat: [0.35, 1.0], shrub: [0.45, 0.7], seedling: [0.3, 0.6] };

const cache = new Map();
/** { foliage, bloom|null, flowers: Vector3[], colliders } in unit space (cached, deterministic). */
export function getArchetype(name) {
  if (!cache.has(name)) {
    COLLIDERS = [];
    const { foliage, bloom, flowers } = BUILDERS[name](mulberry32(name.length * 7919 + name.charCodeAt(0)));
    const colliders = COLLIDERS;
    const f = mergeGeometries(foliage, false);
    const [s, t] = AO[name] || [0.5, 0.45];
    applyAO(f, s, t);
    const b = bloom.length ? mergeGeometries(bloom, false) : null;
    if (b) applyAO(b, 0.25, 0.6);
    f.computeBoundingSphere(); b?.computeBoundingSphere();
    cache.set(name, { foliage: f, bloom: b, flowers, colliders });
  }
  return cache.get(name);
}

// ---------------------------------------------------------------- wind (decorative, GPU)

export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
export const STIFFNESS = { shrub: 0.25, mat: 0.12, seedling: 0.3, tuft: 0.9, grass: 1.3 };
const AMP_X = 0.06, AMP_Z = 0.045;

export function windMaterial(stiffness = 1, { side = THREE.DoubleSide } = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uStiff = { value: stiffness };
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform float uStiff;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #else
          vec2 ip = vec2(0.0);
        #endif
        float hh = clamp(position.y, 0.0, 1.2); hh *= hh;
        float ph = uTime * 1.4 + ip.x * 1.7 + ip.y * 1.3;
        float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ip.x * 0.25);
        float amp = hh * uWind * uStiff * gust;
        transformed.x += sin(ph) * ${AMP_X} * amp;
        transformed.z += cos(ph * 0.83) * ${AMP_Z} * amp;
      `);
  };
  mat.customProgramCacheKey = () => `garden-wind-${side}`;
  return mat;
}

const _o = new THREE.Vector3();
/**
 * CPU copy of the wind shader: world-space offset of a point at local height `ly` on `plant`.
 * Lets insects sitting on a flower sway along with it.
 */
export function windOffset(plant, ly, out) {
  const t = windUniforms.uTime.value, w = windUniforms.uWind.value;
  const hh = Math.min(1.2, Math.max(0, ly)) ** 2;
  const ph = t * 1.4 + plant.x * 1.7 + plant.z * 1.3;
  const gust = 0.6 + 0.4 * Math.sin(t * 0.37 + plant.x * 0.25);
  const amp = hh * w * (STIFFNESS[plant.archetype] ?? 1) * gust;
  _o.set(Math.sin(ph) * AMP_X * amp * plant.sx, 0, Math.cos(ph * 0.83) * AMP_Z * amp * plant.sz);
  _o.applyAxisAngle(UP, plant.rotY);
  return out.copy(_o);
}
