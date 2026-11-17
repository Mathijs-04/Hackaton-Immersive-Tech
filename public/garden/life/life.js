// Wildlife: background butterflies, bumblebees, beetles and birds.
// Behaviour follows the data through atmosphere.state:
//   warmth (air temperature + direct sun), day, rain → whether insects fly, how fast, how many birds.
import * as THREE from 'three';
import { Swarm, beeBody, beeWing, beetleBody, birdBody, birdWing, beeHotel } from './models.js';
import { wingGeometry, bodyGeometry, wingMaterial, PALETTES } from '../butterfly/model.js';
import { windOffset } from '../plants/archetypes.js';
import { mulberry32 } from '../world/random.js';
import { BED_HEIGHT } from '../world/world.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// Species seen in Dutch gardens; tint multiplies the generic wing pattern.
const BUTTERFLIES = [
  { name: 'Koolwitje', tint: '#f7f5ea', scale: 0.27 },
  { name: 'Citroenvlinder', tint: '#f3e04a', scale: 0.3 },
  { name: 'Kleine vos', tint: '#e5782a', scale: 0.25 },
  { name: 'Atalanta', tint: '#d8442e', scale: 0.29 },
  { name: 'Koolwitje', tint: '#f2f0e4', scale: 0.26 },
];

export class Life {
  constructor({ engine, world, atmosphere }) {
    this.engine = engine;
    this.world = world;
    this.atmosphere = atmosphere;
    this.rnd = mulberry32(2024);
    this.group = new THREE.Group();
    engine.scene.add(this.group);

    // Landing spots: every flower head on a nectar plant.
    this.heads = [];
    for (const p of world.plants) if (p.nectarValue > 0) for (const h of p.flowers) this.heads.push({ plant: p, head: h });

    // Bee hotel on the bed's north edge: home for the bees when it's too cold or wet.
    const hp = this.edgePoint(-Math.PI / 2, 0.35);
    const hotel = new THREE.Mesh(beeHotel(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    hotel.position.set(hp.x, 0, hp.z);
    hotel.rotation.y = Math.atan2(-hp.x, -hp.z) + Math.PI; // face the garden
    hotel.castShadow = true;
    this.group.add(hotel);
    this.home = new THREE.Vector3(hp.x, 0.69, hp.z).addScaledVector(new THREE.Vector3(-hp.x, 0, -hp.z).normalize(), 0.09);

    this.makeButterflies();
    this.makeBees();
    this.makeBeetles();
    this.makeBirds();
  }

  /** Point just outside the bed edge in direction `ang`. */
  edgePoint(ang, out = 0.3) {
    let r = 0;
    while (r < this.world.radius + 2 && this.world.isInside(Math.cos(ang) * r, Math.sin(ang) * r)) r += 0.05;
    return { x: Math.cos(ang) * (r + out), z: Math.sin(ang) * (r + out) };
  }

  randomHead(near, maxDist = 4) {
    const rnd = this.rnd;
    for (let i = 0; i < 12; i++) {
      const h = this.heads[Math.floor(rnd() * this.heads.length)];
      if (!near || Math.hypot(h.head.x - near.x, h.head.z - near.z) < maxDist) return h;
    }
    return this.heads[Math.floor(rnd() * this.heads.length)];
  }

  nearestHead(pos) {
    let best = null, bd = Infinity;
    for (const h of this.heads) {
      const d = Math.hypot(h.head.x - pos.x, h.head.y - pos.y, h.head.z - pos.z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  /** World position of a flower head including its wind sway. */
  headPos(t, out) {
    windOffset(t.plant, t.head.ly ?? 0.9, _w);
    return out.set(t.head.x + _w.x, t.head.y + 0.004, t.head.z + _w.z);
  }

  // ------------------------------------------------------------------ flower visitors

  makeFlyer(rnd, cfg) {
    const t = this.randomHead();
    const a = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: rnd() * 6.3, pitch: 0, roll: 0, wing: 0.5, phase: rnd() * 10,
      state: 'sit', timer: rnd() * 4, target: t, threshold: cfg.threshold + rnd() * 0.15, ...cfg };
    this.headPos(t, a.pos);
    return a;
  }

  makeButterflies() {
    const rnd = mulberry32(5);
    this.butterflies = BUTTERFLIES.map((s) => ({ ...this.makeFlyer(rnd, { speed: 0.45, threshold: 0.35, sit: [3, 8] }), scale: s.scale, name: s.name }));
    this.bSwarm = new Swarm({
      count: this.butterflies.length,
      body: bodyGeometry('#2a2420'), bodyMat: new THREE.MeshLambertMaterial({ vertexColors: true }),
      wingL: wingGeometry(true), wingR: wingGeometry(false), wingMat: wingMaterial(PALETTES.generic), shadows: true,
    });
    BUTTERFLIES.forEach((s, i) => { this.bSwarm.setColor(i, '#ffffff'); this.bSwarm.wingL.setColorAt(i, new THREE.Color(s.tint)); this.bSwarm.wingR.setColorAt(i, new THREE.Color(s.tint)); });
    this.group.add(this.bSwarm.group);
  }

  makeBees() {
    const rnd = mulberry32(6);
    this.bees = Array.from({ length: 7 }, () => ({ ...this.makeFlyer(rnd, { speed: 0.75, threshold: 0.3, sit: [1, 2.5] }), scale: 1.25, home: false }));
    const wingMat = new THREE.MeshLambertMaterial({ color: '#e8f0ff', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    this.beeSwarm = new Swarm({
      count: this.bees.length, body: beeBody(), bodyMat: new THREE.MeshLambertMaterial({ vertexColors: true }),
      wingL: beeWing(true), wingR: beeWing(false), wingMat, hingeY: 0.004, shadows: true,
    });
    this.group.add(this.beeSwarm.group);
  }

  updateFlyer(a, dt, active, isBee) {
    a.phase += dt;
    if (a.state === 'home') {
      a.scale = 0; // inside the bee hotel
      if (active) { a.state = 'fly'; a.pos.copy(this.home); a.scale = 1.25; a.target = this.randomHead(this.home, 6); }
      return;
    }
    if (a.state === 'sit') {
      this.headPos(a.target, a.pos);
      // Parked while it was cold/wet/dark: wake up a little while after conditions improve.
      if (!Number.isFinite(a.timer) && active) a.timer = 1 + this.rnd() * 4;
      a.timer -= dt;
      a.wing = isBee ? 0.05 : 0.95 + 0.3 * Math.sin(a.phase * 1.6);
      a.pitch = 0; a.roll = 0;
      if (a.timer <= 0 && (active || isBee)) {
        a.state = 'fly';
        a.target = isBee && !active ? { home: true } : this.randomHead(a.pos, isBee ? 2.5 : 4);
        a.vel.set(0, 0.25, 0);
      }
      return;
    }
    // flying
    const goal = a.target.home ? this.home : this.headPos(a.target, _v);
    const to = _w.copy(goal).sub(a.pos);
    const dist = to.length();
    const speed = a.speed * (0.5 + 0.5 * this.warmth);
    to.normalize().multiplyScalar(speed);
    // Wander: butterflies flutter, bees zig-zag.
    const wf = isBee ? 3 : 1.3;
    to.x += Math.sin(a.phase * wf * 1.7) * speed * (isBee ? 0.4 : 0.7) * Math.min(1, dist);
    to.z += Math.cos(a.phase * wf * 1.3) * speed * (isBee ? 0.4 : 0.7) * Math.min(1, dist);
    to.y += Math.sin(a.phase * wf * 2.3) * speed * 0.4 * Math.min(1, dist) + (dist > 1 ? 0.15 : 0);
    a.vel.lerp(to, damp(isBee ? 4 : 2.5, dt));
    a.pos.addScaledVector(a.vel, dt);
    const ground = this.world.groundHeight(a.pos.x, a.pos.z) + 0.04;
    if (a.pos.y < ground) { a.pos.y = ground; a.vel.y = Math.abs(a.vel.y); }
    if (Math.hypot(a.vel.x, a.vel.z) > 0.02) a.yaw = Math.atan2(-a.vel.x, -a.vel.z);
    a.pitch = clamp(-a.vel.y * 0.8, -0.5, 0.5);
    a.roll = Math.sin(a.phase * 2) * 0.15;
    a.wing = isBee ? 0.2 + 0.5 * Math.abs(Math.sin(a.phase * 90)) : 0.35 + 0.75 * Math.sin(a.phase * 14);
    if (dist < 0.025) {
      if (a.target.home) { a.state = 'home'; return; }
      a.state = 'sit';
      a.timer = active ? a.sit[0] + this.rnd() * (a.sit[1] - a.sit[0]) : Infinity;
    }
    // Too cold, dark or wet: settle on the nearest flower (butterflies) or go home (bees).
    if (!active && !a.target.home && a.state === 'fly') {
      if (isBee) a.target = { home: true };
      else if (!a.settling) { a.target = this.nearestHead(a.pos); a.settling = true; }
    }
    if (active) a.settling = false;
  }

  // ------------------------------------------------------------------ beetles

  makeBeetles() {
    const rnd = mulberry32(8);
    const kinds = [
      { tint: '#d8261c', scale: 1.0, speed: 0.025 }, // lieveheersbeestje (ladybird)
      { tint: '#d8261c', scale: 0.9, speed: 0.025 },
      { tint: '#e8a020', scale: 0.9, speed: 0.022 }, // yellow-orange ladybird
      { tint: '#d8261c', scale: 1.1, speed: 0.025 },
      { tint: '#1e2a24', scale: 1.8, speed: 0.04 },  // loopkever (ground beetle)
      { tint: '#232028', scale: 1.6, speed: 0.04 },
      { tint: '#2a3a2a', scale: 1.7, speed: 0.035 },
    ];
    this.beetles = kinds.map((k) => {
      let x, z;
      do { const a = rnd() * 6.3, r = Math.sqrt(rnd()) * this.world.radius; x = Math.cos(a) * r; z = Math.sin(a) * r; } while (!this.world.isInside(x, z, 0.2));
      return { ...k, pos: new THREE.Vector3(x, BED_HEIGHT, z), yaw: rnd() * 6.3, turn: 0, phase: rnd() * 10, wing: 0 };
    });
    this.beetleSwarm = new Swarm({ count: kinds.length, body: beetleBody(), bodyMat: new THREE.MeshLambertMaterial({ vertexColors: true }) });
    kinds.forEach((k, i) => this.beetleSwarm.setColor(i, k.tint));
    this.group.add(this.beetleSwarm.group);
  }

  updateBeetle(b, dt) {
    b.phase += dt;
    const speed = b.speed * (0.25 + 0.75 * this.warmth);
    b.turn += (Math.sin(b.phase * 0.7 + b.speed * 100) * 1.4 - b.turn) * damp(1, dt);
    b.yaw += b.turn * dt;
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    const nx = b.pos.x + fx * speed * dt, nz = b.pos.z + fz * speed * dt;
    if (!this.world.isInside(nx, nz, 0.1)) b.yaw = Math.atan2(b.pos.x, b.pos.z) + (Math.sin(b.phase) * 0.6); // turn back inwards
    else { b.pos.x = nx; b.pos.z = nz; }
    b.pos.y = BED_HEIGHT + 0.0005;
  }

  // ------------------------------------------------------------------ birds

  makeBirds() {
    const rnd = mulberry32(9);
    const tints = ['#f2f2f0', '#e8eaec', '#3a3a3e', '#f4f4f2', '#2f2f33', '#dcdfe2', '#efefed'];
    this.birds = tints.map((tint, i) => ({
      tint, radius: 7 + rnd() * 16, height: 11 + rnd() * 12, speed: 5 + rnd() * 3, angle: rnd() * 6.3,
      dir: rnd() < 0.5 ? 1 : -1, phase: rnd() * 10, flapPhase: rnd() * 10, order: i / tints.length,
      pos: new THREE.Vector3(), yaw: 0, roll: 0, pitch: 0, wing: 0, scale: 1,
    }));
    this.birdSwarm = new Swarm({
      count: this.birds.length, body: birdBody(), bodyMat: new THREE.MeshLambertMaterial({ vertexColors: true }),
      wingL: birdWing(true), wingR: birdWing(false), wingMat: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), hingeY: 0.01,
    });
    this.birds.forEach((b, i) => this.birdSwarm.setColor(i, b.tint, true));
    this.group.add(this.birdSwarm.group);
  }

  updateBird(b, dt, presence) {
    b.phase += dt;
    b.angle += (b.speed / b.radius) * b.dir * dt;
    const cx = Math.sin(b.phase * 0.05) * 4, cz = Math.cos(b.phase * 0.04) * 4;
    b.pos.set(cx + Math.cos(b.angle) * b.radius, b.height + Math.sin(b.phase * 0.3) * 1.5, cz + Math.sin(b.angle) * b.radius);
    // Tangent direction of the circle.
    const tx = -Math.sin(b.angle) * b.dir, tz = Math.cos(b.angle) * b.dir;
    b.yaw = Math.atan2(-tx, -tz);
    b.roll = -0.35 * b.dir;
    // Flap for a while, then glide.
    const cycle = (b.phase + b.flapPhase) % 7;
    b.wing = cycle < 2.5 ? Math.sin(b.phase * 9) * 0.55 : 0.08 + Math.sin(b.phase * 1.5) * 0.04;
    // Fewer birds in rain, none at night.
    const target = b.order < presence ? 1 : 0;
    b.scale += (target - b.scale) * damp(0.8, dt);
  }

  // ------------------------------------------------------------------

  update(dt) {
    const st = this.atmosphere.state;
    if (!st.sample) return;
    this.warmth = st.warmth ?? 0.5;
    const flying = (st.day ?? 1) > 0.45 && (st.rain ?? 0) < 0.3;

    this.butterflies.forEach((a, i) => {
      this.updateFlyer(a, dt, flying && this.warmth > a.threshold, false);
      this.bSwarm.set(i, a);
    });
    this.bSwarm.commit();

    this.bees.forEach((a, i) => {
      this.updateFlyer(a, dt, flying && this.warmth > a.threshold, true);
      this.beeSwarm.set(i, a);
    });
    this.beeSwarm.commit();

    this.beetles.forEach((b, i) => { this.updateBeetle(b, dt); this.beetleSwarm.set(i, b); });
    this.beetleSwarm.commit();

    const presence = clamp((st.day ?? 1) * 1.2 - 0.2, 0, 1) * (1 - 0.6 * (st.rain ?? 0));
    this.birds.forEach((b, i) => { this.updateBird(b, dt, presence); this.birdSwarm.set(i, b); });
    this.birdSwarm.commit();
  }

  /** How many critters are out and about (for diagnostics). */
  census() {
    return {
      butterfliesFlying: this.butterflies.filter((a) => a.state === 'fly').length,
      beesOut: this.bees.filter((a) => a.state !== 'home').length,
      beetles: this.beetles.length,
      birdsVisible: this.birds.filter((b) => b.scale > 0.5).length,
    };
  }
}
