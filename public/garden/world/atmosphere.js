// Atmosphere: turns one interpolated sensor sample into light, sky, clouds, weather, fog and soil.
import * as THREE from 'three';
import { sunPosition, sunDirection } from '../data/sun.js';
import { mulberry32 } from './random.js';
import { Rain } from './weather.js';

const C = (hex) => new THREE.Color(hex);
const PAL = {
  dayTopClear: C('#3f7fca'), dayTopGrey: C('#9ba5b0'),
  dayHorClear: C('#bcd6ee'), dayHorGrey: C('#cfd4d8'),
  nightTop: C('#0d1730'), nightHor: C('#2a3b56'),
  dusk: C('#e8875a'),
  cold: C('#a9c6ea'), warm: C('#f3cf9a'),
  fogDay: C('#d2d6d9'), fogNight: C('#3b4b63'),
  groundBounce: C('#4a3a2a'),
  sunWarm: C('#ffb26b'), moon: C('#b4c6ef'), moonAmbient: C('#8094c2'),
  cloudLit: C('#f4f4f2'), cloudRain: C('#8e959c'), cloudNight: C('#34405a'), cloudDark: C('#8a9199'),
};

// Approximate RGB of the light sensor's spectral bands F1..F8 (415–680 nm).
const BANDS = [
  [0.35, 0.0, 0.8], [0.15, 0.05, 1.0], [0.0, 0.45, 1.0], [0.1, 1.0, 0.3],
  [0.6, 1.0, 0.0], [1.0, 0.75, 0.0], [1.0, 0.3, 0.0], [0.8, 0.0, 0.0],
];
const FLAT = BANDS.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function spectrumColor(s, out) {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < 8; i++) {
    const v = s[`f${i + 1}`];
    r += v * BANDS[i][0]; g += v * BANDS[i][1]; b += v * BANDS[i][2];
  }
  if (r + g + b <= 0) return out.setRGB(1, 1, 1);
  r /= FLAT[0]; g /= FLAT[1]; b /= FLAT[2];
  const m = Math.max(r, g, b);
  return out.setRGB(r / m, g / m, b / m);
}

/** Weather label shown in the HUD. */
function weatherLabel({ rain, fog, frost, cover, day }) {
  if (rain > 0.55) return { icon: '🌧️', text: 'Regen' };
  if (rain > 0.2) return { icon: '🌦️', text: 'Motregen' };
  if (fog > 0.55) return { icon: '🌫️', text: 'Mist' };
  if (frost > 0.5) return { icon: '❄️', text: 'Vorst' };
  if (cover > 0.7) return { icon: '☁️', text: 'Bewolkt' };
  if (cover > 0.35) return { icon: day > 0.5 ? '⛅' : '☁️', text: 'Half bewolkt' };
  return day > 0.5 ? { icon: '☀️', text: 'Zonnig' } : { icon: '🌙', text: 'Heldere nacht' };
}

const mistVert = /* glsl */`
  attribute float aRand;
  uniform float uTime, uAmount, uRise, uSize;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float speed = 0.03 + uRise * 0.25;
    float h = 0.2 + uRise * 1.4;
    p.y = mod(p.y + uTime * speed * (0.5 + aRand), h);
    p.x += sin(uTime * 0.15 + aRand * 40.0) * 0.6;
    p.z += cos(uTime * 0.12 + aRand * 30.0) * 0.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float visible = step(aRand, uAmount);
    float fade = smoothstep(0.0, 0.15, p.y) * (1.0 - smoothstep(h * 0.6, h, p.y));
    vAlpha = visible * fade * smoothstep(0.15, 1.2, -mv.z); // no puffs right in front of the lens
    gl_PointSize = visible * min(uSize * (0.6 + aRand) / -mv.z, 400.0);
  }`;
const mistFrag = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-d * d * 4.0) * (1.0 - d) * vAlpha * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }`;

export class Atmosphere {
  constructor(engine, store, world, sky, ground) {
    this.engine = engine;
    this.store = store;
    this.world = world;
    this.sky = sky;
    this.ground = ground;
    const scene = engine.scene;

    this.hemi = new THREE.HemisphereLight('#bcd6ee', '#4a3a2a', 1);
    scene.add(this.hemi);

    const sun = new THREE.DirectionalLight('#ffffff', 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const r = world.radius + 1.5;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 60 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.015;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.sun = sun;

    scene.fog = new THREE.FogExp2('#c2c7cb', 0.02);

    this.mistScale = 1;
    this.mist = this.makeMist();
    scene.add(this.mist);
    this.rain = new Rain();
    scene.add(this.rain.mesh);
    this.smallScale = false; // butterfly view: rain box shrinks

    this.sample = {};
    this.v = { sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), lightDir: new THREE.Vector3() };
    this.c = {
      top: new THREE.Color(), hor: new THREE.Color(), bottom: new THREE.Color(),
      spec: new THREE.Color(), sunCol: new THREE.Color(), fog: new THREE.Color(), white: new THREE.Color(1, 1, 1),
      cloudLit: new THREE.Color(), cloudDark: new THREE.Color(),
    };
    this.state = {};
  }

  makeMist() {
    // Evenly spread (stratified grid + jitter) over a wide area around the garden.
    const rnd = mulberry32(42), R = this.world.radius + 9, cells = 34;
    const list = [];
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const x = ((i + rnd()) / cells * 2 - 1) * R, z = ((j + rnd()) / cells * 2 - 1) * R;
        if (Math.hypot(x, z) <= R) list.push([x, rnd() * 1.6, z]);
      }
    }
    const n = list.length;
    const pos = new Float32Array(n * 3), rand = new Float32Array(n);
    list.forEach((p, i) => { pos.set(p, i * 3); rand[i] = rnd(); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    this.mistUniforms = {
      uTime: { value: 0 }, uAmount: { value: 0.3 }, uRise: { value: 0 }, uSize: { value: 900 },
      uColor: { value: new THREE.Color('#ffffff') }, uOpacity: { value: 0.25 },
    };
    const m = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: mistVert, fragmentShader: mistFrag, uniforms: this.mistUniforms, transparent: true, depthWrite: false,
    }));
    m.frustumCulled = false;
    m.renderOrder = 5;
    return m;
  }

  setShadows(on) { this.sun.castShadow = on; }
  setMistScale(s) { this.mistScale = s; }

  update(dt, ctx) {
    const store = this.store, s = store.sample(store.t, this.sample);
    const { latitude, longitude } = store.loc;
    const { top, hor, bottom, spec, sunCol, fog, white, cloudLit, cloudDark } = this.c;
    const { sunDir, moonDir, lightDir } = this.v;

    // --- Astronomy
    const pos = sunPosition(s.t, latitude, longitude);
    sunDirection(pos, sunDir);
    moonDir.copy(sunDir).negate();
    if (moonDir.y < 0.25) moonDir.y = 0.25 + (0.25 - moonDir.y) * 0.3;
    moonDir.normalize();
    const sinAlt = Math.sin(pos.altitude);
    const day = smooth(-0.1, 0.12, sinAlt);
    const sunVis = smooth(-0.03, 0.06, sinAlt);
    const dusk = Math.max(0, 1 - Math.abs(sinAlt - 0.02) / 0.14);

    // --- Sensor signals and derived weather
    const lightN = Math.min(1, s.clear / store.stats.clear.max);
    const cloudless = s.cloudless;
    const humN = store.norm('airH', s.airH);
    const tempN = store.norm('airT', s.airT);
    const wetN = store.norm('soilH', s.soilH);
    const soilWarmN = store.norm('soilT', s.soilT);
    const steam = Math.min(1, Math.max(0, (s.soilT - s.airT) / 5));
    const { cover, rain, fog: fogW, frost } = s;
    const sunny = lightN * cloudless * day;
    // Cold-blooded insects need warmth: air temperature + direct sun. Used by all critters.
    const warmth = Math.min(1, Math.max(0.05, (s.airT - 5) / 13 + 0.35 * sunny));

    // --- Sky colours
    top.copy(PAL.dayTopGrey).lerp(PAL.dayTopClear, 1 - cover);
    hor.copy(PAL.dayHorGrey).lerp(PAL.dayHorClear, 1 - cover);
    const dayBright = (0.68 + 0.32 * Math.sqrt(lightN)) * (1 - 0.12 * rain); // never gloomier than a bright overcast day
    top.multiplyScalar(dayBright); hor.multiplyScalar(dayBright);
    top.lerp(PAL.nightTop, 1 - day);
    hor.lerp(PAL.nightHor, 1 - day);
    hor.lerp(PAL.dusk, dusk * 0.55 * (0.3 + 0.7 * (1 - cover)));
    const tempAmt = Math.abs(tempN - 0.5) * 2 * 0.22;
    hor.lerp(tempN < 0.5 ? PAL.cold : PAL.warm, tempAmt * (0.3 + 0.7 * day));
    fog.copy(PAL.fogNight).lerp(PAL.fogDay, day).multiplyScalar(0.5 + 0.5 * dayBright);
    hor.lerp(fog, Math.min(1, humN * 0.3 + fogW * 0.3 + rain * 0.25));
    bottom.copy(hor).multiplyScalar(0.6);
    cloudLit.copy(PAL.cloudNight).lerp(PAL.cloudLit, day).lerp(PAL.cloudRain, rain * day * 0.8).multiplyScalar(0.55 + 0.45 * dayBright);
    cloudDark.copy(PAL.cloudNight).multiplyScalar(0.7).lerp(PAL.cloudDark, day).lerp(PAL.cloudRain, rain * 0.6).multiplyScalar(0.7 + 0.3 * dayBright);
    cloudLit.lerp(PAL.dusk, dusk * 0.35);

    // --- Light colour: measured spectrum (subtle) + low-sun warmth
    spectrumColor(s, spec);
    sunCol.copy(white).lerp(spec, 0.35).lerp(PAL.sunWarm, smooth(0.35, 0.02, sinAlt) * 0.6);

    // --- Light intensities: total light from the sensor, split into direct vs diffuse by cloud cover.
    const total = Math.pow(lightN, 0.55);
    const direct = 3.4 * total * (0.12 + 0.88 * (1 - cover)) * sunVis;
    const moonI = 0.7 * (1 - day) * (1 - 0.35 * cover); // stylised moonlight: night stays readable
    if (direct >= moonI) {
      lightDir.copy(sunDir);
      this.sun.color.copy(sunCol);
      this.sun.intensity = direct;
    } else {
      lightDir.copy(moonDir);
      this.sun.color.copy(PAL.moon);
      this.sun.intensity = moonI;
    }
    this.sun.position.copy(lightDir).multiplyScalar(20);
    this.sun.target.position.set(0, 0, 0);
    this.hemi.color.copy(top).lerp(hor, 0.5).lerp(PAL.moonAmbient, (1 - day) * 0.7);
    this.hemi.groundColor.copy(PAL.groundBounce).multiplyScalar(0.6 + 0.4 * day);
    // Floor of diffuse light: overcast, rain and night all keep a readable garden.
    this.hemi.intensity = 0.8 + 1.3 * total * (1 - 0.4 * (1 - cover)) + 0.6 * (1 - day) + 0.35 * cover * day;
    this.engine.renderer.toneMappingExposure = 1 + 0.3 * (1 - day) + 0.12 * rain;

    // --- Fog: humidity, mist and rain
    this.engine.scene.fog.color.copy(hor);
    // Kept moderate: the garden should stay readable even at 100 % humidity.
    this.engine.scene.fog.density = 0.007 + 0.007 * Math.pow(humN, 3) + 0.011 * fogW + 0.004 * rain;

    // --- Ground mist / steam: a thin, even layer (many small faint puffs, not a few big clumps)
    const mu = this.mistUniforms;
    mu.uTime.value = ctx.elapsed;
    mu.uAmount.value = Math.min(1, 0.15 + 0.45 * Math.pow(humN, 2) + 0.4 * fogW) * this.mistScale;
    mu.uRise.value = steam;
    mu.uOpacity.value = (0.01 + 0.018 * humN + 0.03 * fogW + 0.035 * steam) * (0.5 + 0.5 * day);
    // Same colour as the fog itself (only slightly lighter by day), so puffs blend instead of blotching.
    mu.uColor.value.copy(hor).lerp(white, 0.2 * day);
    mu.uSize.value = 700 * this.engine.renderer.getPixelRatio();

    // --- Rain
    this.rain.uniforms.uColor.value.copy(hor).lerp(white, 0.5).multiplyScalar(0.6 + 0.4 * day);
    this.rain.update(ctx.elapsed, this.engine.camera, rain, this.smallScale);

    // --- Ground: moisture + rain make it darker and glossier, frost whitens grass.
    this.ground.apply({ wetness: Math.min(1, wetN * 0.6 + rain * 0.8), soilWarmth: soilWarmN, frost, rain, time: ctx.elapsed });

    // --- Sky
    this.sky.apply({
      top, horizon: hor, bottom, sunDir, sunColor: sunCol, sunVis: sunVis * (0.3 + 0.7 * (1 - cover)),
      night: 1 - day, moonDir, cover: Math.min(1, cover + rain * 0.3), cloudLit, cloudDark, time: ctx.elapsed,
    });
    this.sky.follow(this.engine.camera);

    this.state = {
      day, night: 1 - day, sunAlt: pos.altitude, lightN, cloudless, cover, rain, fog: fogW, frost, sunny,
      humN, tempN, wetN, steam, warmth, sample: s,
      weather: weatherLabel({ rain, fog: fogW, frost, cover, day }),
    };
  }
}
