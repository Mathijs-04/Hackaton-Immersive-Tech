// Simple solid colliders for flying things: capsules (stems, spikes, posts) and
// axis-aligned ellipsoids (flower heads, cushions, shrub crowns). Push-out resolution.
const UP_ROT = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];

/** Unit-space archetype colliders → world space for one plant instance. */
export function toWorldColliders(plant, unit) {
  const P = ([x, y, z]) => {
    const [rx, rz] = UP_ROT(x * plant.sx, z * plant.sz, plant.rotY);
    return [plant.x + rx, plant.y + y * plant.sy, plant.z + rz];
  };
  return unit.map((c) => (c.k === 'cap'
    ? { k: 'cap', a: P(c.a), b: P(c.b), r: c.r * plant.sx }
    : { k: 'ell', c: P(c.c), r: [Math.max(c.r[0], c.r[2]) * plant.sx, c.r[1] * plant.sy, Math.max(c.r[0], c.r[2]) * plant.sz] }));
}

/**
 * Push a sphere (pos, radius) out of the colliders and remove the velocity component that points
 * into them (so you slide along a stem instead of sticking). Returns true if anything was hit.
 */
export function resolveSphere(pos, vel, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    let nx, ny, nz;
    if (c.k === 'cap') {
      const [ax, ay, az] = c.a, [bx, by, bz] = c.b;
      const ex = bx - ax, ey = by - ay, ez = bz - az;
      const len2 = ex * ex + ey * ey + ez * ez || 1e-9;
      const t = Math.max(0, Math.min(1, ((pos.x - ax) * ex + (pos.y - ay) * ey + (pos.z - az) * ez) / len2));
      const qx = ax + ex * t, qy = ay + ey * t, qz = az + ez * t;
      let dx = pos.x - qx, dy = pos.y - qy, dz = pos.z - qz;
      const R = c.r + radius;
      let d = Math.hypot(dx, dy, dz);
      if (d >= R) continue;
      if (d < 1e-6) { dx = 1; dy = 0; dz = 0; d = 1; }
      nx = dx / d; ny = dy / d; nz = dz / d;
      pos.set(qx + nx * R, qy + ny * R, qz + nz * R);
    } else {
      const [cx, cy, cz] = c.c;
      const Rx = c.r[0] + radius, Ry = c.r[1] + radius, Rz = c.r[2] + radius;
      let qx = (pos.x - cx) / Rx, qy = (pos.y - cy) / Ry, qz = (pos.z - cz) / Rz;
      const d = Math.hypot(qx, qy, qz);
      if (d >= 1) continue;
      if (d < 1e-6) { qx = 0; qy = 1; qz = 0; } else { qx /= d; qy /= d; qz /= d; }
      pos.set(cx + qx * Rx, cy + qy * Ry, cz + qz * Rz);
      nx = qx / Rx; ny = qy / Ry; nz = qz / Rz;
      const n = Math.hypot(nx, ny, nz);
      nx /= n; ny /= n; nz /= n;
    }
    const into = vel.x * nx + vel.y * ny + vel.z * nz;
    if (into < 0) { vel.x -= nx * into; vel.y -= ny * into; vel.z -= nz * into; }
    hit = true;
  }
  return hit;
}
