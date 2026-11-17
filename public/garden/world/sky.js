// Sky dome: gradient + procedural fbm clouds (coverage from the derived cloud cover),
// sun glow, stars and moon. No textures.
import * as THREE from 'three';
import { mulberry32 } from './random.js';

const vert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }`;

const frag = /* glsl */`
  precision highp float;
  uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uCloudLit, uCloudDark;
  uniform float uSunVis, uCover, uTime;
  varying vec3 vDir;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.55)) : mix(uHorizon, uBottom, min(1.0, -h * 5.0));
    float s = max(dot(d, uSunDir), 0.0);
    float cov = 0.0;
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.18) * 1.1 + vec2(uTime * 0.012, uTime * 0.005);
      float n = fbm(uv);
      float t = mix(0.78, 0.22, uCover);
      cov = smoothstep(t, t + 0.22, n) * smoothstep(0.0, 0.12, h);
      float shade = fbm(uv * 2.3 + 5.0);
      vec3 cc = mix(uCloudDark, uCloudLit, clamp(0.35 + shade * 0.9 + pow(s, 6.0) * 0.6, 0.0, 1.0));
      c = mix(c, cc, cov * 0.96);
    }
    c += uSunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35) * uSunVis * (1.0 - cov * 0.9);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Sky {
  constructor() {
    this.group = new THREE.Group();
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#fff2d6') },
      uSunVis: { value: 1 },
      uCover: { value: 0.3 },
      uTime: { value: 0 },
      uCloudLit: { value: new THREE.Color('#ffffff') },
      uCloudDark: { value: new THREE.Color('#8a919a') },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(300, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false }),
    );
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);

    const rnd = mulberry32(7);
    const n = 260, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rnd(), y = rnd() * 0.9 + 0.08;
      const th = u * Math.PI * 2, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 280, y * 280, Math.sin(th) * r * 280], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const stars = new THREE.Points(sg, this.starMat);
    stars.frustumCulled = false;
    this.group.add(stars);

    this.moonMat = new THREE.MeshBasicMaterial({ color: '#e8eefc', transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(5, 24), this.moonMat);
    this.group.add(this.moon);
  }

  follow(camera) {
    this.group.position.copy(camera.position);
    this.moon.lookAt(camera.position);
  }

  apply({ top, horizon, bottom, sunDir, sunColor, sunVis, night, moonDir, cover, cloudLit, cloudDark, time }) {
    const u = this.uniforms;
    u.uTop.value.copy(top);
    u.uHorizon.value.copy(horizon);
    u.uBottom.value.copy(bottom);
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(sunColor);
    u.uSunVis.value = sunVis;
    u.uCover.value = cover;
    u.uTime.value = time;
    u.uCloudLit.value.copy(cloudLit);
    u.uCloudDark.value.copy(cloudDark);
    this.starMat.opacity = night * 0.9 * (1 - cover);
    this.moonMat.opacity = night * 0.85 * (1 - cover * 0.8);
    this.moon.position.copy(moonDir).multiplyScalar(250);
  }
}
