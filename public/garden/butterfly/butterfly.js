// The player butterfly: a Boomblauwtje (holly blue, ~3 cm wingspan) at real scale,
// so the 9 m garden becomes a big world. Arcade flight, landing on real flower heads
// (swaying with the wind), nectar, and a species collection.
//
// Data-driven rule (real biology): butterflies are cold-blooded and need warmth and sun.
// Warmth (atmosphere.state.warmth) comes from measured air temperature + direct sunlight
// and limits speed, climb and stamina. Rain makes wings heavy.
import * as THREE from 'three';
import { ButterflyModel, PALETTES } from './model.js';
import { windOffset } from '../plants/archetypes.js';
import { resolveSphere } from '../plants/collision.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const REST_RATE = 0.07;  // energy per second while resting after exhaustion
const REST_UNTIL = 0.3;  // rested enough to fly (and climb) again
const damp = (k, dt) => 1 - Math.exp(-k * dt);

// Flight tuning. The bee (bee/bee.js) reuses this class with its own values.
const CFG = {
  speed: 0.65,         // m/s at full warmth (~16 body lengths per second)
  boost: 1.8,
  turnRate: 2.4,       // rad/s
  climb: 0.45,         // m/s
  sink: 0.05,
  hoverHeight: 0.02,   // min height above ground
  ceiling: 5,
  drain: 0.011,        // energy per second (cruising, warm)
  landRadius: 0.09,    // auto-land when this close to a flower head and not steering
  landIdle: 0.3,
  bodyRadius: 0.012,   // collision sphere (body + inner wings)
};

export class Butterfly extends EventTarget {
  constructor({ engine, world, store, atmosphere, input, name = 'Boomblauwtje', model = null, cfg = {} }) {
    super();
    this.kind = 'butterfly';
    this.cfg = { ...CFG, ...cfg };
    this.engine = engine;
    this.world = world;
    this.store = store;
    this.atmosphere = atmosphere;
    this.input = input;
    this.name = name;
    this.model = model || new ButterflyModel({ palette: PALETTES.boomblauwtje, scale: 0.2 });
    engine.scene.add(this.model.group);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.roll = 0;
    this.pitch = 0;
    this.phase = 0;
    this.energy = 1;
    this.state = 'flying'; // flying | landing | landed
    this.flower = null;    // { plant, head } we sit on (null = resting on the ground)
    this.controlled = false;
    this.idle = 0;
    this.cooldown = 0;
    this.ignore = null;
    this.visited = new Set();
    this.totalSpecies = new Set(world.plants.filter((p) => p.nectarValue > 0).map((p) => p.batch.id)).size;
    this.warmth = 1;
    this.tmp = new THREE.Vector3();
    this.landFrom = new THREE.Vector3();
    this.landT = 0;
    this.sway = new THREE.Vector3();
    // The Plantenluisteraar's orb is a landing spot too (no nectar, but a good lookout).
    const sn = world.sensor;
    this.sensorSpot = { sensor: true, fixed: true, head: { x: sn.x, y: sn.top ?? 1, z: sn.z } };
    this.extraSpots = [this.sensorSpot]; // fixed landing spots besides flowers (subclasses add more)
    this.reset();
  }

  get position() { return this.pos; }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  /** Spawn near the sensor, at flower height, facing the centre of the garden. */
  reset() {
    this.pos.set(this.world.sensor.x + 0.3, 0.55, this.world.sensor.z + 0.6);
    this.vel.set(0, 0, 0);
    this.yaw = Math.atan2(this.pos.x, this.pos.z);
    this.state = 'flying';
    this.flower = null;
    this.energy = Math.max(this.energy, 0.6);
    this.exhausted = false;
  }

  /** World position of a flower head, swaying with the (shader) wind. */
  headPos(f, out) {
    if (f.fixed) return out.set(f.head.x, f.head.y + 0.004, f.head.z);
    windOffset(f.plant, f.head.ly ?? 0.9, this.sway);
    return out.set(f.head.x + this.sway.x, f.head.y + 0.006, f.head.z + this.sway.z);
  }

  update(dt) {
    const st = this.atmosphere.state;
    this.warmth = st.warmth ?? 1;
    this.rain = st.rain ?? 0;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.ignore && this.cooldown <= 0) {
      const a = this.ignore.head;
      if (Math.hypot(a.x - this.pos.x, a.y - this.pos.y, a.z - this.pos.z) > 0.25) this.ignore = null;
    }
    const inp = this.input;
    const steer = this.controlled ? inp.move.x : 0;
    const throttle = this.controlled ? inp.move.y : 0;
    const ascend = this.controlled ? inp.ascend : 0;
    const boost = this.controlled && inp.boost;
    const wantsToMove = !!(steer || throttle || ascend);

    if (this.state === 'landed') this.updateLanded(dt, wantsToMove);
    else if (this.state === 'landing') this.updateLanding(dt);
    else this.updateFlying(dt, { steer, throttle, ascend, boost, wantsToMove });

    this.animate(dt, { steer, ascend, boost });
    if (this.controlled || this.state !== 'landed') this.engine.wake();
  }

  updateFlying(dt, { steer, throttle, ascend, boost, wantsToMove }) {
    const vigor = (0.35 + 0.65 * this.warmth) * (1 - 0.35 * this.rain);
    const tired = this.energy <= 0;
    if (tired && this.controlled && !this.exhausted) { this.exhausted = true; this.dispatchEvent(new Event('exhausted')); }

    if (!this.controlled) {
      // Autopilot when nobody flies: drift to the nearest flower and land.
      const f = this.nearestFlower(3);
      if (f) {
        const a = this.headPos(f, this.tmp);
        const dx = a.x - this.pos.x, dz = a.z - this.pos.z;
        let d = Math.atan2(-dx, -dz) - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += clamp(d, -1, 1) * this.cfg.turnRate * 0.6 * dt;
        throttle = Math.hypot(dx, dz) > 0.05 ? 0.5 : 0;
        ascend = clamp((a.y + 0.04 - this.pos.y) * 6, -1, 1);
      } else ascend = 0;
    }

    this.yaw -= steer * this.cfg.turnRate * dt;
    const fwd = this.forward(this.tmp);
    const speed = throttle > 0 ? throttle * this.cfg.speed * (boost ? this.cfg.boost : 1) : throttle * 0.2;
    const tx = fwd.x * speed * vigor, tz = fwd.z * speed * vigor;
    let ty = tired ? -0.15 : ascend > 0 ? ascend * this.cfg.climb * vigor : ascend * 0.4 - this.cfg.sink;
    if (!this.controlled && !tired) ty = ascend * 0.3;
    this.vel.x += (tx - this.vel.x) * damp(3, dt);
    this.vel.z += (tz - this.vel.z) * damp(3, dt);
    this.vel.y += (ty - this.vel.y) * damp(4, dt);
    this.pos.addScaledVector(this.vel, dt);

    // Solid plants: stems, flower heads, cushions and shrub crowns (plus the sensor post).
    this.bumped = false;
    const near = this.world.nearestPlants(this.pos, 1.2);
    for (let it = 0; it < 2; it++) {
      for (const { plant } of near) if (resolveSphere(this.pos, this.vel, this.cfg.bodyRadius, plant.colliders)) this.bumped = true;
      if (resolveSphere(this.pos, this.vel, this.cfg.bodyRadius, this.world.staticColliders)) this.bumped = true;
    }
    if (this.bumped) this.vel.multiplyScalar(Math.exp(-dt * 6)); // friction: a bump stops you, you don't glide around it

    const ground = this.world.groundHeight(this.pos.x, this.pos.z) + this.cfg.hoverHeight;
    if (this.pos.y < ground) { this.pos.y = ground; this.vel.y = Math.max(0, this.vel.y); }
    this.pos.y = Math.min(this.cfg.ceiling, this.pos.y);
    const b = this.world.bounds;
    const r = Math.hypot(this.pos.x, this.pos.z);
    this.outOfBounds = r > b.radius;
    if (r > b.radius) { this.pos.x *= b.radius / r; this.pos.z *= b.radius / r; }

    const effort = 1 + (1 - this.warmth) + this.rain * 0.8 + (ascend > 0 ? 0.4 : 0) + (boost ? 0.8 : 0);
    this.energy = clamp(this.energy - this.cfg.drain * effort * dt, 0, 1);

    // Out of energy and down on the ground (or on a flower): set down and rest, even if steering.
    if (this.exhausted && this.pos.y <= ground + 0.005) return this.beginLanding(this.nearestFlower(this.cfg.landRadius, true));
    // …or caught on top of a plant (it can't sink through the leaves): rest right there, on the leaf.
    if (this.exhausted && this.bumped && this.vel.y > -0.05) {
      const leaf = { fixed: true, leaf: true, head: { x: this.pos.x, y: this.pos.y - 0.004, z: this.pos.z } };
      return this.beginLanding(this.nearestFlower(this.cfg.landRadius, true) || leaf);
    }
    this.idle = (throttle > 0.1 || steer) ? 0 : this.idle + dt;
    if (this.idle > this.cfg.landIdle && this.cooldown <= 0 && ascend <= 0) {
      const f = this.nearestFlower(this.cfg.landRadius + (this.controlled ? 0 : 0.06), true);
      if (f) return this.beginLanding(f);
      if (this.pos.y <= ground + 0.005 && !wantsToMove) return this.beginLanding(null);
    }
  }

  /** Nearest flower head on a nectar plant. `in3d`: true distance to the head, else horizontal. */
  nearestFlower(radius, in3d = false) {
    let best = null, bestD = Infinity;
    for (const { plant } of this.world.nearestPlants(this.pos, radius + 0.6)) {
      if (plant.nectarValue <= 0) continue;
      for (const head of plant.flowers) {
        if (this.ignore && this.ignore.head === head) continue;
        const d = in3d ? Math.hypot(head.x - this.pos.x, head.y - this.pos.y, head.z - this.pos.z) : Math.hypot(head.x - this.pos.x, head.z - this.pos.z);
        if (d < radius && d < bestD) { best = { plant, head }; bestD = d; }
      }
    }
    if (in3d) {
      for (const spot of this.extraSpots) {
        if (this.ignore === spot) continue;
        const h = spot.head;
        const d = Math.hypot(h.x - this.pos.x, h.y - this.pos.y, h.z - this.pos.z);
        const r = radius * (spot.reach ?? 1.6); // fixed spots are big: a bit more forgiving
        if (d < r && d < bestD) { best = spot; bestD = d; }
      }
    }
    return best;
  }

  beginLanding(flower) {
    this.state = 'landing';
    this.flower = flower;
    this.landFrom.copy(this.pos);
    this.landT = 0;
    this.vel.set(0, 0, 0);
  }

  landingSpot(out) {
    if (this.flower) return this.headPos(this.flower, out);
    return out.set(this.landFrom.x, this.world.groundHeight(this.landFrom.x, this.landFrom.z) + 0.003, this.landFrom.z);
  }

  updateLanding(dt) {
    this.landT = Math.min(1, this.landT + dt / 0.4);
    const k = this.landT * this.landT * (3 - 2 * this.landT);
    const a = this.landingSpot(this.tmp);
    this.pos.lerpVectors(this.landFrom, a, k);
    if (this.landT >= 1) {
      this.state = 'landed';
      const p = this.flower?.plant;
      // Only the player's own landings count towards the collection.
      let visit = null;
      if (p && this.controlled) {
        const isNew = !this.visited.has(p.batch.id);
        if (isNew) this.visited.add(p.batch.id);
        visit = { isNew, count: this.visited.size, total: this.totalSpecies };
        if (isNew) this.dispatchEvent(new CustomEvent('visit', { detail: { plant: p, ...visit } }));
      }
      this.onLand(this.flower);
      this.dispatchEvent(new CustomEvent('land', { detail: { plant: p, spot: this.flower, sensor: !!this.flower?.sensor, visit, controlled: this.controlled } }));
    }
  }

  updateLanded(dt, wantsToMove) {
    // Exhausted: rest wherever you landed (also on the ground) until you can climb again.
    if (this.exhausted) {
      this.energy = clamp(this.energy + REST_RATE * dt, 0, 1);
      if (this.energy >= REST_UNTIL) { this.exhausted = false; this.restedAt = performance.now(); this.dispatchEvent(new Event('rested')); }
    }
    if (this.flower) this.headPos(this.flower, this.pos); // sway with the flower
    this.refuel(dt);
    if (this.controlled && wantsToMove && !this.exhausted) {
      this.state = 'flying';
      this.ignore = this.flower;
      this.flower = null;
      this.cooldown = 1.0;
      this.idle = 0;
      this.vel.y = 0.25;
      this.onTakeoff();
      this.dispatchEvent(new Event('takeoff'));
    }
  }

  /** Butterflies drink nectar for themselves and bask in the sun. */
  refuel(dt) {
    const st = this.atmosphere.state;
    const sunBask = (st.sunny ?? 0) * 0.06;
    const nectar = this.flower?.plant ? this.flower.plant.nectarValue * 0.22 : 0;
    this.energy = clamp(this.energy + (nectar + sunBask + 0.005) * dt, 0, 1);
  }

  onLand() {}
  onTakeoff() {}

  animate(dt, { steer, ascend, boost }) {
    const m = this.model;
    let base, amp, freq;
    if (this.state === 'landed') {
      const sun = this.atmosphere.state.sunny ?? 0;
      base = 1.0 - sun * 0.8; amp = 0.3; freq = 0.35; // open wide in the sun, closed when cold/dark
    } else {
      const effort = clamp((ascend > 0 ? 1 : 0.45) + (boost ? 0.4 : 0), 0, 1.3);
      base = 0.3; amp = 0.5 + 0.35 * effort * (0.5 + 0.5 * this.warmth); freq = 4 + 7 * effort * (0.6 + 0.4 * this.warmth);
    }
    this.phase += dt * freq * Math.PI * 2;
    m.setWings(base + amp * Math.sin(this.phase));

    const flying = this.state === 'flying';
    this.roll += ((flying ? -steer * 0.55 : 0) - this.roll) * damp(5, dt);
    this.pitch += ((flying ? clamp(this.vel.y * 0.8, -0.4, 0.4) : 0) - this.pitch) * damp(5, dt);
    const bob = flying ? Math.sin(this.phase) * 0.003 : 0;
    m.group.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    m.group.rotation.y = this.yaw;
    m.tilt.rotation.set(this.pitch, 0, this.roll);
  }

  get restText() { return `Uitgeput: even uitrusten… ${Math.min(99, Math.round((this.energy / REST_UNTIL) * 100))}%`; }
  get justRested() { return this.state === 'landed' && !this.exhausted && performance.now() - (this.restedAt || -1e9) < 6000; }

  get statusText() {
    if (this.state === 'landed' && this.exhausted) return this.restText;
    if (this.justRested) return 'Uitgerust: je kunt weer vliegen';
    if (this.state === 'landed') {
      if (this.flower?.sensor) return 'Uitrusten op de Plantenluisteraar';
      if (this.flower) return `Nectar drinken op ${this.flower.plant.batch.name}`;
      return (this.atmosphere.state.sunny ?? 0) > 0.05 ? 'Opwarmen in de zon' : 'Rusten';
    }
    if (this.state === 'landing') return 'Landen…';
    if (this.energy <= 0) return 'Uitgeput: je zweeft naar beneden om uit te rusten';
    if (this.outOfBounds) return 'Te ver van de tuin';
    if (this.rain > 0.4) return 'Natte vleugels: zoek beschutting';
    if (this.warmth < 0.3) return 'Te koud: vleugels stijf';
    if (this.energy < 0.2) return 'Moe: zoek nectar';
    return 'Vliegen';
  }
}
