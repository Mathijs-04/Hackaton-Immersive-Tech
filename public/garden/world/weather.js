// Rain: GPU-animated streaks in a box that follows the camera (one draw call).
// Intensity comes from the derived `rain` channel (see TimeStore.computeWeather).
import * as THREE from 'three';
import { mulberry32 } from './random.js';

const vert = /* glsl */`
  attribute float aRand;
  attribute float aEnd;
  uniform vec3 uCenter, uBox;
  uniform float uTime, uAmount, uLen;
  varying float vAlpha;
  void main() {
    vec3 p = position * uBox;                         // fixed world-space phase per drop
    p.y -= uTime * (5.5 + aRand * 2.5);               // falling
    vec3 origin = uCenter - uBox * 0.5;
    vec3 w = origin + mod(p - origin, uBox);          // wrap (in world space) around the camera
    w.y += aEnd * uLen;
    w.x += aEnd * uLen * 0.12;                         // slight slant
    vAlpha = step(aRand, uAmount) * (0.35 + 0.65 * aEnd);
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }`;
const frag = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.01) discard;
    gl_FragColor = vec4(uColor, vAlpha * uOpacity);
    #include <colorspace_fragment>
  }`;

export class Rain {
  constructor(count = 8000) { // taller fixed box than before, so more drops for the same density
    const rnd = mulberry32(99);
    const pos = new Float32Array(count * 6), rand = new Float32Array(count * 2), end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = rnd(), y = rnd(), z = rnd(), r = rnd();
      pos.set([x, y, z, x, y, z], i * 6);
      rand.set([r, r], i * 2);
      end.set([0, 1], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.uniforms = {
      uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(16, 10, 16) },
      uTime: { value: 0 }, uAmount: { value: 0 }, uLen: { value: 0.35 },
      uColor: { value: new THREE.Color('#c9d3de') }, uOpacity: { value: 0.32 },
    };
    this.mesh = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, transparent: true, depthWrite: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  update(time, camera, amount, small) {
    const u = this.uniforms;
    u.uTime.value = time % 900; // keeps float precision in the shader (one invisible reshuffle per 15 min)
    u.uAmount.value = amount;
    this.mesh.visible = amount > 0.01;
    // A fixed-size box centred on the camera. Drops wrap in *world* space, so moving the camera
    // (up, down or sideways) never drags the rain along: it keeps falling at its own speed.
    // (The box size must not depend on the camera position, or every drop shifts when you move.)
    // Smaller and denser at insect scale.
    // Only the *window* follows the camera: it spans from the ground to just above the camera.
    const s = small ? 6 : 16, h = small ? 4 : 22;
    u.uBox.value.set(s, h, s);
    u.uLen.value = small ? 0.12 : 0.35;
    const lo = small ? camera.position.y - h / 2 : Math.max(-0.5, camera.position.y + 3 - h);
    u.uCenter.value.set(camera.position.x, lo + h / 2, camera.position.z);
  }
}
