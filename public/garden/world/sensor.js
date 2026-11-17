// The Plantenluisteraar (Bioto PL-15): a white orb with horizontal ribs on a thin white stick,
// at its real GPS position. A small status LED blinks when a new hourly reading starts.
import * as THREE from 'three';
import { BED_HEIGHT } from './world.js';

const STICK = 0.68;  // visible stick length above the soil (m)
const ORB_R = 0.1;   // orb radius (m)

/** Ribbed sphere: a lathe profile whose radius dips into narrow grooves at regular heights. */
function ribbedOrb() {
  const pts = [];
  const N = 96, ribs = 11;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI;               // 0 = bottom, π = top
    const y = -Math.cos(th);
    const band = (y * 0.5 + 0.5) * ribs;         // which rib we're on
    const f = band - Math.floor(band);
    // Narrow groove at each rib boundary, only on the upper ~3/4 (like the photo).
    const groove = y > -0.55 ? Math.max(0, 1 - Math.abs(f - 0.5) / 0.12) * 0.06 : 0;
    const r = Math.sin(th) * (1 - groove);
    pts.push(new THREE.Vector2(Math.max(0.0001, r) * ORB_R, y * ORB_R));
  }
  const g = new THREE.LatheGeometry(pts, 40);
  g.deleteAttribute('uv');
  // Grooves slightly darker (shadowed plastic).
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const full = Math.sqrt(Math.max(0, ORB_R * ORB_R - y * y));
    const k = full > 1e-4 ? Math.min(1, Math.hypot(x, z) / full) : 1;
    const v = 0.78 + 0.22 * Math.pow(k, 6);
    col.set([v, v, v * 0.99], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class Sensor {
  constructor(world) {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: '#f4f5f2', roughness: 0.45, metalness: 0 });
    const orbMat = new THREE.MeshStandardMaterial({ color: '#f7f8f5', roughness: 0.4, metalness: 0, vertexColors: true });

    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, STICK + 0.1, 12), white);
    stick.position.y = (STICK - 0.1) / 2; // 10 cm into the soil
    const orb = new THREE.Mesh(ribbedOrb(), orbMat);
    const orbY = STICK + ORB_R * 0.85;
    orb.position.y = orbY;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.03, 12), white);
    collar.position.y = STICK - 0.005;

    // Small status LED under the orb (pulses on each new hourly reading).
    this.ledMat = new THREE.MeshBasicMaterial({ color: '#7cf2a8' });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 6), this.ledMat);
    led.position.set(0, orbY - ORB_R * 0.55, ORB_R * 0.82);

    for (const m of [stick, orb, collar]) { m.castShadow = true; m.receiveShadow = true; }
    g.add(stick, orb, collar, led);
    g.position.set(world.sensor.x, BED_HEIGHT, world.sensor.z);
    g.rotation.y = Math.atan2(world.sensor.x, world.sensor.z); // LED faces outward
    g.userData.isSensor = true;
    this.group = g;

    // Landing spot for the butterfly: the top of the orb.
    world.sensor.top = BED_HEIGHT + orbY + ORB_R;

    // Solid for the butterfly.
    const base = [world.sensor.x, BED_HEIGHT, world.sensor.z];
    world.staticColliders.push(
      { k: 'cap', a: base, b: [base[0], BED_HEIGHT + orbY, base[2]], r: 0.013 },
      { k: 'ell', c: [base[0], BED_HEIGHT + orbY, base[2]], r: [ORB_R, ORB_R, ORB_R] },
    );

    this.pulse = 0;
    this.lastHour = -1;
    this.base = new THREE.Color('#3fbf74');
    this.flash = new THREE.Color('#d9ffe8');
  }

  update(dt, sample, night) {
    if (!sample) return;
    const hour = Math.floor(sample.index);
    if (hour !== this.lastHour) { if (this.lastHour !== -1) this.pulse = 1; this.lastHour = hour; }
    this.pulse = Math.max(0, this.pulse - dt * 1.8);
    this.ledMat.color.copy(this.base).multiplyScalar(0.7 + night * 0.8).lerp(this.flash, this.pulse);
  }
}
