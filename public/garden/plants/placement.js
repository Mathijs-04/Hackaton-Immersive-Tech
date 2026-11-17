// The API has no plant positions, so we generate them, deterministically:
// the same planting plan always produces the same garden.
//   1. greedy: per-batch clusters ("drifts") in archetype zones, with canopy-radius spacing
//   2. relaxation: overlapping canopies are pushed apart (big plants move least), kept in the bed
//   3. flower heads are transformed to world space (landing spots for insects)
import * as THREE from 'three';
import { seeded } from '../world/random.js';
import { lookupSpecies, NECTAR } from './species.js';
import { BED_HEIGHT } from '../world/world.js';
import { getArchetype } from './archetypes.js';
import { toWorldColliders } from './collision.js';

const ZONE = {
  shrub: { r: [0.58, 0.8], side: 'north' },
  umbel: { r: [0.1, 0.6] }, spike: { r: [0.1, 0.6] }, globe: { r: [0.15, 0.62] }, tuft: { r: [0.2, 0.7] },
  daisy: { r: [0.25, 0.8] }, cup: { r: [0.25, 0.8] }, bell: { r: [0.3, 0.82] },
  mat: { r: [0.68, 0.9], side: 'south' },
  seedling: { r: [0.1, 0.85] },
};
const ORDER = ['shrub', 'umbel', 'globe', 'spike', 'tuft', 'daisy', 'cup', 'bell', 'mat', 'seedling'];
export const SEED_COUNT_UNKNOWN = 6; // seed batches have amount: null
const TALL = (p) => p.sy > 0.6;

/** Expand planting.json into batches with appearance info. */
export function expandBatches(planting) {
  const batches = [];
  for (const [areaRef, list] of Object.entries(planting)) {
    list.forEach((b, i) => {
      const info = lookupSpecies(b.plant?.name);
      const isSeed = b.stage === 'seed';
      batches.push({
        id: `${areaRef}:${i}`,
        areaRef, index: i, raw: b, info,
        archetype: isSeed ? 'seedling' : info.a,
        count: b.amount ?? (isSeed ? SEED_COUNT_UNKNOWN : 1),
        amountKnown: b.amount != null,
        name: b.plant?.vernacular_name || info.base,
      });
    });
  }
  return batches;
}

/** Minimum distance between two plants' centres: canopies may touch, big ones may not overlap. */
function minDist(a, b) {
  const k = a.archetype === 'shrub' || b.archetype === 'shrub' ? 1.0 : TALL(a) && TALL(b) ? 0.92 : 0.8;
  return (a.r + b.r) * k;
}

export function placePlants(world, batches) {
  const placed = [];
  const R = world.radius;
  const sorted = [...batches].sort((a, b) => ORDER.indexOf(a.archetype) - ORDER.indexOf(b.archetype) || b.info.w - a.info.w);

  for (const batch of sorted) {
    const rnd = seeded(`${batch.id}:${batch.raw.plant?.name}`);
    const isSeed = batch.archetype === 'seedling';
    const zone = ZONE[batch.archetype];
    // Per-instance size first, so spacing uses the real canopy.
    const sizes = Array.from({ length: batch.count }, () => {
      const hJ = 0.88 + rnd() * 0.24, wJ = 0.88 + rnd() * 0.24;
      const h = (isSeed ? (batch.info.a === 'daisy' && batch.info.h > 1 ? 0.12 : 0.08) : batch.info.h) * hJ;
      const w = (isSeed ? 0.1 : batch.info.w) * wJ;
      return { h, w, r: isSeed ? 0.05 : w * 0.5 };
    });
    const rMax = Math.max(...sizes.map((s) => s.r));
    let best = [];
    let clusterR = 0.15 + rMax * 1.7 * Math.sqrt(batch.count);

    for (let attempt = 0; attempt < 160 && best.length < batch.count; attempt++) {
      if (attempt && attempt % 20 === 0) clusterR *= 1.25;
      let ang = rnd() * Math.PI * 2;
      if (zone.side === 'north' && rnd() < 0.85) ang = Math.PI + rnd() * Math.PI;
      if (zone.side === 'south' && rnd() < 0.7) ang = rnd() * Math.PI;
      const rr = (zone.r[0] + rnd() * (zone.r[1] - zone.r[0])) * R;
      const cx = Math.cos(ang) * rr, cz = Math.sin(ang) * rr;
      if (!world.isInside(cx, cz, rMax * 0.7)) continue;

      const mine = [];
      for (const size of sizes) {
        for (let tries = 0; tries < 35; tries++) {
          const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * clusterR;
          const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
          if (!world.isInside(x, z, size.r * 0.7)) continue;
          if (Math.hypot(x - world.sensor.x, z - world.sensor.z) < 0.22 + size.r * 0.7) continue;
          const cand = { x, z, ...size, archetype: batch.archetype, sy: size.h };
          const clash = (p) => Math.hypot(p.x - x, p.z - z) < minDist(p, cand);
          if (placed.some(clash) || mine.some(clash)) continue;
          mine.push(cand);
          break;
        }
      }
      if (mine.length > best.length) best = mine;
    }
    if (best.length < batch.count) console.warn(`[placement] ${batch.name}: ${best.length}/${batch.count} geplaatst`);

    best.forEach((pos, k) => {
      placed.push({
        id: `${batch.id}#${k}`,
        batch, archetype: batch.archetype,
        x: pos.x, y: BED_HEIGHT, z: pos.z, r: pos.r,
        rotY: rnd() * Math.PI * 2,
        sx: pos.w, sy: pos.h, sz: pos.w,
        hueJ: rnd() * 2 - 1, litJ: rnd() * 2 - 1,
        nectarValue: NECTAR[batch.archetype] ?? 0,
      });
    });
  }

  relax(world, placed);
  for (const p of placed) addFlowerHeads(p);
  return placed;
}

/** Push overlapping canopies apart. Lighter (smaller) plants move more. */
function relax(world, plants, iterations = 40) {
  for (let it = 0; it < iterations; it++) {
    let moved = 0;
    for (let i = 0; i < plants.length; i++) {
      for (let j = i + 1; j < plants.length; j++) {
        const a = plants[i], b = plants[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz) || 1e-4, need = minDist(a, b);
        if (d >= need) continue;
        const push = (need - d) * 0.5;
        const wa = b.r * b.r / (a.r * a.r + b.r * b.r); // a moves inversely to its size
        a.x -= (dx / d) * push * 2 * wa; a.z -= (dz / d) * push * 2 * wa;
        b.x += (dx / d) * push * 2 * (1 - wa); b.z += (dz / d) * push * 2 * (1 - wa);
        moved++;
      }
    }
    for (const p of plants) {
      // Back inside the bed (with margin) and away from the sensor post.
      for (let k = 0; k < 20 && !world.isInside(p.x, p.z, p.r * 0.6); k++) { p.x *= 0.97; p.z *= 0.97; }
      const sx = p.x - world.sensor.x, sz = p.z - world.sensor.z, sd = Math.hypot(sx, sz) || 1e-4;
      const need = 0.2 + p.r * 0.6;
      if (sd < need) { p.x += (sx / sd) * (need - sd); p.z += (sz / sd) * (need - sd); }
    }
    if (!moved) break;
  }
}

const _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function addFlowerHeads(p) {
  const { flowers, colliders } = getArchetype(p.archetype);
  p.colliders = toWorldColliders(p, colliders);
  p.flowers = flowers.map((f) => {
    _v.set(f.x * p.sx, f.y * p.sy, f.z * p.sz).applyAxisAngle(UP, p.rotY);
    return { x: p.x + _v.x, y: p.y + _v.y, z: p.z + _v.z, ly: f.y };
  });
  // Highest head = the plant's main anchor (kept for compatibility).
  p.flowerAnchor = p.flowers.length
    ? p.flowers.reduce((a, b) => (b.y > a.y ? b : a))
    : { x: p.x, y: p.y + p.sy * 0.9, z: p.z, ly: 0.9 };
}

/** Diagnostics: number of pairs whose canopies overlap more than allowed. */
export function overlapReport(plants) {
  let overlaps = 0, bigOverlaps = 0, worst = 0;
  for (let i = 0; i < plants.length; i++) {
    for (let j = i + 1; j < plants.length; j++) {
      const a = plants[i], b = plants[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z), need = minDist(a, b);
      if (d < need - 0.005) {
        overlaps++;
        worst = Math.max(worst, need - d);
        if (TALL(a) && TALL(b)) bigOverlaps++;
      }
    }
  }
  return { overlaps, bigOverlaps, worstCm: Math.round(worst * 100) };
}

export function layoutHash(plants) {
  let h = 0;
  for (const p of plants) h = (h + Math.round(p.x * 1000) * 31 + Math.round(p.z * 1000) * 17) | 0;
  return h >>> 0;
}
