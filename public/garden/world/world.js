// GardenWorld: the single source of truth for "where is what".
// Everything that moves through the garden (the orbit camera now, a butterfly later)
// asks the world: ground height, bounds, and which plants are nearby.
import { makeProjection, ringCentroid, pointInPolygon, distanceToEdge, smoothRing, polygonArea } from './geo.js';

export const BED_HEIGHT = 0.16;

export class GardenWorld {
  constructor(layout, loc) {
    const feature = layout.features.find((f) => f.geometry?.type === 'Polygon') || layout.features[0];
    const ringLonLat = feature.geometry.coordinates[0];
    const [cLon, cLat] = ringCentroid(ringLonLat);
    this.projection = makeProjection(cLon, cLat);
    this.areaRef = feature.properties?.area_ref ?? feature.properties?.ref ?? feature.id;
    this.areaType = feature.properties?.type;
    this.surface = feature.properties?.surface;

    // Drop the closing duplicate point, then smooth the hand-drawn outline.
    const raw = ringLonLat.slice(0, -1).map(([lon, lat]) => this.projection.toLocal(lon, lat));
    this.rawPolygon = raw;
    this.polygon = smoothRing(raw, 8);
    this.area = polygonArea(this.polygon);
    this.radius = Math.max(...this.polygon.map(([x, z]) => Math.hypot(x, z)));

    const [sx, sz] = this.projection.toLocal(loc.longitude, loc.latitude);
    this.sensor = { x: sx, z: sz };

    this.plants = [];
    this.staticColliders = []; // non-plant solids (sensor post), same format as plant colliders
    this.cell = 1; // spatial hash cell size in metres
    this.grid = new Map();
  }

  /** Inside the planted bed? */
  isInside(x, z, margin = 0) {
    return pointInPolygon(x, z, this.polygon) && (margin <= 0 || distanceToEdge(x, z, this.polygon) >= margin);
  }

  edgeDistance(x, z) { return distanceToEdge(x, z, this.polygon); }

  /** Ground height in metres. Flat bed for now; terrain could replace this function later. */
  groundHeight(x, z) {
    return pointInPolygon(x, z, this.polygon) ? BED_HEIGHT : 0;
  }

  /** Area a flyer may roam: the bed plus a margin. */
  get bounds() { return { center: { x: 0, z: 0 }, radius: this.radius + 6, minY: 0, maxY: 12 }; }

  setPlants(plants) {
    this.plants = plants;
    this.grid.clear();
    for (const p of plants) {
      const key = this.key(p.x, p.z);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(p);
    }
  }

  key(x, z) { return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`; }

  /** Plants within `radius` of a point, nearest first. Fast via the spatial hash. */
  nearestPlants(pos, radius = 1) {
    const out = [];
    const r = Math.ceil(radius / this.cell);
    const cx = Math.floor(pos.x / this.cell), cz = Math.floor(pos.z / this.cell);
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        for (const p of this.grid.get(`${cx + i},${cz + j}`) || []) {
          const d = Math.hypot(p.x - pos.x, p.z - pos.z);
          if (d <= radius) out.push({ plant: p, distance: d });
        }
      }
    }
    return out.sort((a, b) => a.distance - b.distance);
  }
}
