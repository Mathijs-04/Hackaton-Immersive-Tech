// Procedural textures drawn into canvases at startup: no image downloads.
import * as THREE from 'three';
import { mulberry32 } from './random.js';

/** Tileable value-noise field (size×size), fbm with `octaves`. Returns Float32Array 0..1. */
function noiseField(size, { seed = 1, scale = 8, octaves = 4 } = {}) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = scale << o;
    const grid = new Float32Array(cells * cells).map(() => rnd());
    const cs = size / cells;
    for (let y = 0; y < size; y++) {
      const gy = y / cs, y0 = Math.floor(gy) % cells, y1 = (y0 + 1) % cells, fy = gy - Math.floor(gy);
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = x / cs, x0 = Math.floor(gx) % cells, x1 = (x0 + 1) % cells, fx = gx - Math.floor(gx);
        const sx = fx * fx * (3 - 2 * fx);
        const a = grid[y0 * cells + x0], b = grid[y0 * cells + x1], c = grid[y1 * cells + x0], d = grid[y1 * cells + x1];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function toTexture(canvas, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Garden soil: brown with darker clumps, organic bits and light grit. */
export function soilTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const n = noiseField(S, { seed: 11, scale: 6, octaves: 5 });
  const fine = noiseField(S, { seed: 12, scale: 48, octaves: 2 });
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = n[i] * 0.75 + fine[i] * 0.45;
    const k = Math.min(1.2, Math.max(0.45, v * 1.25));
    img.data[i * 4] = 118 * k; img.data[i * 4 + 1] = 86 * k; img.data[i * 4 + 2] = 60 * k; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const rnd = mulberry32(13);
  // grit and tiny stones
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * S, y = rnd() * S, r = rnd() * 1.6 + 0.4;
    const l = 140 + rnd() * 80;
    g.fillStyle = `rgba(${l},${l * 0.92},${l * 0.82},${0.35 + rnd() * 0.4})`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // dark organic bits (old leaf fragments, twigs)
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.strokeStyle = `rgba(${40 + rnd() * 30},${28 + rnd() * 20},${18},${0.5})`;
    g.lineWidth = 1 + rnd() * 1.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 14, y + (rnd() - 0.5) * 14); g.stroke();
  }
  return toTexture(c, 1);
}

/** Lawn base under the grass blades: mottled greens with some bare and yellowed patches (November). */
export function lawnTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const n = noiseField(S, { seed: 21, scale: 4, octaves: 5 });
  const fine = noiseField(S, { seed: 22, scale: 64, octaves: 2 });
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = n[i], f = fine[i];
    const bare = Math.max(0, (v - 0.68) * 3); // brownish patches
    const r = lerp(64, 112, bare) * (0.75 + f * 0.5);
    const gg = lerp(98, 92, bare) * (0.75 + f * 0.5);
    const b = lerp(44, 58, bare) * (0.75 + f * 0.5);
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, 1);
}

/**
 * Butterfly wing painting. `palette`: { base, inner, margin, fringe, spots?, eyes? }.
 * Painted in wing-UV space (u: body→tip, v: front→back), shared by fore- and hindwing.
 */
export function wingTexture(outline, palette) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, S, 0);
  base.addColorStop(0, palette.inner);
  base.addColorStop(0.35, palette.base);
  base.addColorStop(1, palette.base2 || palette.base);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (const pts of outline) {
    g.beginPath();
    pts.forEach(([u, v], i) => (i ? g.lineTo(u * S, v * S) : g.moveTo(u * S, v * S)));
    g.closePath();
    // Strokes are centred on the outline, so only the inner half shows: dark margin, then a pale fringe at the very edge.
    g.strokeStyle = palette.margin; g.lineWidth = (palette.marginWidth || 7) * 2; g.stroke();
    g.strokeStyle = palette.fringe; g.lineWidth = 5; g.stroke();
  }
  for (const s of palette.spots || []) {
    g.beginPath(); g.arc(s[0] * S, s[1] * S, s[2], 0, 7); g.fillStyle = s[3]; g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
