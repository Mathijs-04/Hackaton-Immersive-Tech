// Builds the instanced meshes: one foliage + one bloom InstancedMesh per archetype
// (~17 draw calls for the whole garden). Keeps instanceId ↔ plant maps so any single
// plant can be picked or highlighted (and later: visited by a butterfly).
import * as THREE from 'three';
import { getArchetype, windMaterial, STIFFNESS } from './archetypes.js';
import { BED_HEIGHT } from '../world/world.js';

export class PlantLayer {
  constructor(plants) {
    this.group = new THREE.Group();
    this.pickables = [];
    this.byId = new Map(plants.map((p) => [p.id, p]));

    const groups = new Map();
    for (const p of plants) {
      if (!groups.has(p.archetype)) groups.set(p.archetype, []);
      groups.get(p.archetype).push(p);
    }

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    const c = new THREE.Color();
    for (const [arch, list] of groups) {
      const geo = getArchetype(arch);
      const mat = windMaterial(STIFFNESS[arch] ?? 1);
      const parts = [['foliage', geo.foliage], ['bloom', geo.bloom]].filter(([, g]) => g);
      for (const [kind, g] of parts) {
        const mesh = new THREE.InstancedMesh(g, mat, list.length);
        mesh.name = `${arch}-${kind}`;
        list.forEach((p, i) => {
          m.compose(pos.set(p.x, p.y, p.z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.rotY), s.set(p.sx, p.sy, p.sz));
          mesh.setMatrixAt(i, m);
          if (kind === 'bloom') {
            c.set(p.batch.info.bloom).offsetHSL(p.hueJ * 0.012, 0, p.litJ * 0.04);
          } else {
            const k = 0.9 + p.litJ * 0.1;
            c.setRGB(k, k * (1 + p.hueJ * 0.04), k);
          }
          mesh.setColorAt(i, c);
        });
        mesh.castShadow = arch !== 'seedling';
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        mesh.userData = { plants: list, archetype: arch, kind };
        this.group.add(mesh);
        this.pickables.push(mesh);
      }
    }

    // Highlight rings: one for hover, an instanced set for the selected batch.
    const ringGeo = new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2);
    this.hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
    this.hoverRing.visible = false;
    this.selRings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0.9, depthWrite: false }), 16);
    this.selRings.count = 0;
    this.selRings.frustumCulled = false;
    this.group.add(this.hoverRing, this.selRings);
  }

  plantFromHit(hit) {
    return hit.object.userData.plants?.[hit.instanceId] ?? null;
  }

  ringScale(p) { return Math.max(0.12, p.r * 1.05); }

  setHover(p) {
    this.hoverRing.visible = !!p;
    if (p) {
      const r = this.ringScale(p);
      this.hoverRing.position.set(p.x, BED_HEIGHT + 0.012, p.z);
      this.hoverRing.scale.set(r, 1, r);
    }
  }

  setSelectedBatch(batchId) {
    const list = batchId ? [...this.byId.values()].filter((p) => p.batch.id === batchId) : [];
    const m = new THREE.Matrix4();
    list.slice(0, 16).forEach((p, i) => {
      const r = this.ringScale(p);
      m.makeScale(r, 1, r).setPosition(p.x, BED_HEIGHT + 0.015, p.z);
      this.selRings.setMatrixAt(i, m);
    });
    this.selRings.count = Math.min(16, list.length);
    this.selRings.instanceMatrix.needsUpdate = true;
    return list;
  }

  stats() {
    let tris = 0, instances = 0;
    for (const mesh of this.pickables) {
      tris += (mesh.geometry.attributes.position.count / 3) * mesh.count;
      if (mesh.userData.kind === 'foliage') instances += mesh.count;
    }
    return { tris, instances, drawCalls: this.pickables.length };
  }
}
