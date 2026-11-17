// The player's second character: a honeybee worker (honingbij, ~1.3 cm). Same flight core as the
// butterfly, but with a job: fill the honey stomach with nectar and bring it home to the hive.
//
// Real bee behaviour, turned into game rules:
//  - Honey stomach: a forager carries ~40 mg of nectar per trip (here: ~5–6 good flowers).
//  - Scent marks: a bee leaves a scent on a flower she emptied; others skip it for a while.
//  - Flower constancy (bloemvastheid): sticking to one species per trip is efficient → bonus.
//  - Fuel: bees burn the nectar they carry; when tired, part of the load becomes energy.
//  - Weather: like all insects, cold and rain make flying heavy (same data-driven warmth).
import * as THREE from 'three';
import { Butterfly } from '../butterfly/butterfly.js';
import { BeeModel } from './model.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);

export const LOAD_MG = 40;             // nectar per full honey stomach (mg)
const SIP_RATE = 0.16;                 // load per second on a flower with nectarValue 1
const PER_FLOWER = 0.2;                // max load one flower head gives per visit
const SCENT_MS = 45e3;                 // how long a flower stays "empty" after a visit
const CONSTANCY_BONUS = 1.3;

export class Bee extends Butterfly {
  constructor(opts) {
    super({
      ...opts,
      name: 'Honingbij',
      model: new BeeModel(),
      cfg: {
        speed: 0.95, boost: 1.7, turnRate: 3.3, climb: 0.6, sink: 0.06,
        drain: 0.016,       // bees burn energy fast…
        landRadius: 0.06,   // …and are smaller, so they need to aim a bit better
        bodyRadius: 0.006, hoverHeight: 0.012,
      },
    });
    this.kind = 'bee';
    this.load = 0;            // honey stomach, 0..1
    this.delivered = 0;       // mg delivered to the hive (this session)
    this.trips = 0;
    this.tripSpecies = null;  // first species of this trip (flower constancy)
    this.constant = true;     // still flower-constant this trip?
    this.tripFlowers = 0;     // flowers that gave nectar this trip
    this.sip = null;          // { head, gained, budget, bonus } while on a flower
    this.lastGain = 0;
    const hive = this.world.hive;
    this.hiveSpot = { hive: true, fixed: true, reach: 2.5, head: { x: hive.entrance.x, y: hive.entrance.y, z: hive.entrance.z } };
    this.extraSpots.push(this.hiveSpot);
    this.reset();
  }

  /** Start on the hive's landing board, facing the garden. */
  reset() {
    const hive = this.world.hive;
    if (!hive) return super.reset();
    this.pos.copy(hive.entrance).add(new THREE.Vector3(0, 0.03, 0)).addScaledVector(hive.entrance.clone().sub(hive.position).setY(0).normalize(), 0.06);
    this.vel.set(0, 0, 0);
    this.yaw = Math.atan2(this.pos.x, this.pos.z);
    this.state = 'flying';
    this.flower = null;
    this.energy = Math.max(this.energy, 0.7);
    this.exhausted = false;
  }

  get full() { return this.load >= 0.999; }

  /** Nobody plays the bee: she waits on the hive's landing board (ready for the next flight). */
  update(dt) {
    if (this.controlled) return super.update(dt);
    if (this.flower !== this.hiveSpot) {
      this.flower = this.hiveSpot;
      this.state = 'landed';
      this.sip = null;
      this.yaw = Math.atan2(this.hiveSpot.head.x, this.hiveSpot.head.z);
    }
    this.headPos(this.hiveSpot, this.pos);
    this.energy = Math.min(1, this.energy + 0.05 * dt);
    this.animate(dt, { steer: 0, ascend: 0, boost: false });
  }

  /** Flowers with a fresh scent mark are skipped by the autopilot and give no nectar. */
  isEmpty(head) { return (head.scentUntil ?? 0) > performance.now(); }

  onLand(spot) {
    this.sip = null;
    if (!spot || !this.controlled) return;
    if (spot.hive) return this.deliver();
    if (!spot.plant) return;
    const empty = this.isEmpty(spot.head);
    const species = spot.plant.batch.id;
    if (!this.tripSpecies) this.tripSpecies = species;
    const sameSpecies = species === this.tripSpecies;
    if (!sameSpecies) this.constant = false;
    this.sip = {
      head: spot.head, gained: 0, empty,
      budget: empty || this.full ? 0 : PER_FLOWER * spot.plant.nectarValue,
      bonus: this.constant && sameSpecies && this.tripFlowers > 0 ? CONSTANCY_BONUS : 1, // from the 2nd flower on
    };
    // `constant`: not the first flower of this trip, and still the same species.
    this.dispatchEvent(new CustomEvent('flower', { detail: { plant: spot.plant, empty, full: this.full, constant: this.sip.bonus > 1 } }));
  }

  onTakeoff() {
    const s = this.sip;
    if (s && s.gained > 0.005) {
      s.head.scentUntil = performance.now() + SCENT_MS; // we leave a scent mark behind
      this.lastGain = s.gained;
      this.tripFlowers++;
      this.dispatchEvent(new CustomEvent('collected', { detail: { gained: s.gained, load: this.load, bonus: s.bonus > 1 } }));
    }
    this.sip = null;
  }

  deliver() {
    const mg = Math.round(this.load * LOAD_MG);
    this.energy = 1; // a sip of honey at home
    if (mg < 2) { this.dispatchEvent(new CustomEvent('home', { detail: { mg: 0 } })); return; }
    this.delivered += mg;
    this.trips++;
    this.load = 0;
    this.tripSpecies = null;
    this.constant = true;
    this.tripFlowers = 0;
    this.dispatchEvent(new CustomEvent('deliver', { detail: { mg, trips: this.trips, total: this.delivered } }));
  }

  refuel(dt) {
    const s = this.sip;
    if (this.flower?.hive) { this.energy = clamp(this.energy + 0.3 * dt, 0, 1); return; }
    if (!s || !this.flower?.plant) { this.energy = clamp(this.energy + 0.004 * dt, 0, 1); return; }
    // A bee drinks a little for herself, the rest goes into the honey stomach.
    const v = this.flower.plant.nectarValue;
    if (s.gained < s.budget && !this.full) {
      const take = Math.min(SIP_RATE * v * s.bonus * dt, s.budget * s.bonus - s.gained, 1 - this.load);
      if (take > 0) { s.gained += take; this.load += take; }
      this.energy = clamp(this.energy + 0.08 * v * dt, 0, 1);
    }
    if (this.model.setLoad) this.model.setLoad(this.load);
  }

  updateFlying(dt, ctl) {
    super.updateFlying(dt, ctl);
    // Out of energy but carrying nectar: burn some of the load to keep going.
    if (this.controlled && this.energy < 0.12 && this.load > 0.01) {
      const use = Math.min(this.load, 0.05 * dt);
      this.load -= use;
      this.energy = clamp(this.energy + use * 1.6, 0, 1);
      this.burning = true;
    } else this.burning = false;
    this.model.setLoad(this.load);
  }

  /** Autopilot (when nobody plays the bee): skip scent-marked flowers. */
  nearestFlower(radius, in3d = false) {
    const f = super.nearestFlower(radius, in3d);
    if (f?.head && !f.plant) return f;
    if (f && !this.controlled && this.isEmpty(f.head)) return null;
    return f;
  }

  animate(dt, { steer, ascend, boost }) {
    const m = this.model;
    const flying = this.state !== 'landed';
    // Real bee wings beat ~230×/s: far too fast to see, so we show a blur-like flicker.
    this.phase += dt * (flying ? 60 : 0.5);
    if (flying) m.setWings(0.25 + 0.45 * Math.abs(Math.sin(this.phase * 2.3)), false);
    else m.setWings(0.05, true);
    this.roll += ((flying ? -steer * 0.6 : 0) - this.roll) * damp(7, dt);
    this.pitch += ((flying ? clamp(this.vel.y * 0.9, -0.45, 0.45) : 0.15) - this.pitch) * damp(6, dt);
    const bob = flying ? Math.sin(this.phase * 0.11) * 0.0015 : 0;
    m.group.position.set(this.pos.x, this.pos.y + bob + 0.0015, this.pos.z);
    m.group.rotation.y = this.yaw;
    m.tilt.rotation.set(this.pitch, 0, this.roll);
  }

  get statusText() {
    if (this.state === 'landed' && this.exhausted) return this.restText;
    if (this.state === 'landed') {
      if (this.flower?.hive) return 'Thuis in de bijenkast';
      if (this.flower?.sensor) return 'Uitrusten op de Plantenluisteraar';
      const s = this.sip;
      if (this.flower?.plant && s) {
        if (s.empty) return 'Leeg: hier was net een bij (geurmerk)';
        if (this.full) return 'Honingmaag vol: terug naar de kast!';
        if (s.gained >= s.budget * s.bonus - 1e-4) return 'Bloem leeg: vlieg door';
        return s.bonus > 1 ? 'Nectar zuigen · bloemvast ×1,3' : 'Nectar zuigen';
      }
      return 'Rusten';
    }
    if (this.state === 'landing') return 'Landen…';
    if (this.energy <= 0) return 'Uitgeput: je zweeft naar beneden';
    if (this.burning) return 'Moe: je verbruikt je eigen nectar';
    if (this.outOfBounds) return 'Te ver van de tuin';
    if (this.full) return 'Vol! Vlieg naar de bijenkast';
    if (this.rain > 0.4) return 'Regen: zware, natte vleugels';
    if (this.warmth < 0.3) return 'Te koud: vliegen kost veel energie';
    return 'Zoek bloemen met nectar';
  }
}
