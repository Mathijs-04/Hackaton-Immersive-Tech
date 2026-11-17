// A honeybee hive (bijenkast) just outside the bed, facing the garden.
// Home of the player's bee and of the honeybee foragers. Decorative, but solid for flyers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function box(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  g.deleteAttribute('uv');
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g.index ? g.toNonIndexed() : g;
}

function hiveGeometry() {
  const parts = [];
  // Stand: four legs and a top frame.
  for (const [x, z] of [[-0.18, -0.2], [0.18, -0.2], [-0.18, 0.2], [0.18, 0.2]]) parts.push(box(0.035, 0.3, 0.035, x, 0.15, z, '#5a4430'));
  parts.push(box(0.44, 0.03, 0.5, 0, 0.3, 0, '#6b5038'));
  // Two painted boxes (brood box + honey super), as many Dutch hives are.
  parts.push(box(0.4, 0.24, 0.46, 0, 0.435, 0, '#e8d27a'));
  parts.push(box(0.4, 0.18, 0.46, 0, 0.645, 0, '#9cc0d8'));
  parts.push(box(0.41, 0.012, 0.47, 0, 0.555, 0, '#7a6a4a'));
  // Roof.
  parts.push(box(0.48, 0.05, 0.54, 0, 0.76, 0, '#6e7a72'));
  // Entrance: dark slit with a landing board in front (local +Z faces the garden).
  parts.push(box(0.22, 0.018, 0.01, 0, 0.33, 0.231, '#1a120c'));
  parts.push(box(0.26, 0.012, 0.07, 0, 0.318, 0.265, '#8a6a48'));
  return mergeGeometries(parts, false);
}

export class Hive {
  /** `ang`: direction from the garden centre (radians); `out`: metres outside the bed edge. */
  constructor(world, { ang = 0.62, out = 0.7 } = {}) {
    let r = 0;
    while (r < world.radius + 2 && world.isInside(Math.cos(ang) * r, Math.sin(ang) * r)) r += 0.05;
    const x = Math.cos(ang) * (r + out), z = Math.sin(ang) * (r + out);
    const mesh = new THREE.Mesh(hiveGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.position.set(x, 0, z);
    mesh.rotation.y = Math.atan2(-x, -z); // local +Z points at the garden centre
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mesh = mesh;

    const face = new THREE.Vector3(-x, 0, -z).normalize();
    // Where bees land: the front of the landing board.
    this.entrance = new THREE.Vector3(x, 0.33, z).addScaledVector(face, 0.27);
    // Where foragers vanish into the hive: just inside the slit.
    this.inside = new THREE.Vector3(x, 0.335, z).addScaledVector(face, 0.22);
    this.position = new THREE.Vector3(x, 0, z);
    world.hive = this;
    world.staticColliders.push({ k: 'ell', c: [x, 0.52, z], r: [0.26, 0.3, 0.26] });
  }
}
