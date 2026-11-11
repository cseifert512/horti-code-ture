import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { ST, buildStructure } from './structure.js';
import { buildPlant, makePlantMaterials } from './plant.js';
import { shared } from './shaders.js';
import { smoothstep, clamp, lerp } from './util.js';
import {
  makeBarkTextures,
  makeGlulamTextures,
  makeLeafTexture,
  makeGroundTexture,
  makeGravelTexture,
} from './textures.js';

const canvas = document.getElementById('scene');
const statsEl = document.getElementById('stats');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const url = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;

const T_START = 0.2; // planting day: mid-March of year 1
const T_END = 12.45;

const params = {
  time: Number(url.get('t')) || 11.345,
  playing: false,
  speed: 0.15, // years per second
  holdBloom: false,
  detail: Number(url.get('detail')) || (coarse ? 0.35 : 0.75),
  adaptive: url.get('adaptive') !== '0',
  wind: reduceMotion ? 0 : 0.6,
  sunElevation: 40,
  sunAzimuth: -62,
  autoRotate: false,
  seed: Number(url.get('seed')) || 7,
};

// ---------------------------------------------------------------------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  const el = document.getElementById('error');
  el.style.display = 'flex';
  el.textContent = 'This model needs WebGL 2, which is not available in this browser.';
  throw e;
}
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.62;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 600);
camera.position.set(5.6, 1.9, 7.6);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.9, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.3;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * 0.53;
controls.autoRotateSpeed = 0.5;
controls.update();

// ---- sky, sun, image-based ambient ----------------------------------------
const sky = new Sky();
sky.scale.setScalar(450);
scene.add(sky);
sky.material.uniforms.turbidity.value = 5;
sky.material.uniforms.rayleigh.value = 1.6;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.82;

const sun = new THREE.DirectionalLight(0xfff0dc, 3.4);
sun.castShadow = true;
sun.shadow.camera.left = -6.5;
sun.shadow.camera.right = 6.5;
sun.shadow.camera.top = 6.5;
sun.shadow.camera.bottom = -6.5;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 45;
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.012;
sun.target.position.set(0, 1.4, 0);
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x8a9a6a, 0.35));
scene.fog = new THREE.Fog(0xcfdbe4, 16, 160);

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = new Sky();
envSky.scale.setScalar(450);
envSky.material.uniforms = sky.material.uniforms;
envScene.add(envSky);
let envRT = null;
const sunDir = new THREE.Vector3();

function updateSun() {
  const phi = THREE.MathUtils.degToRad(90 - params.sunElevation);
  const theta = THREE.MathUtils.degToRad(params.sunAzimuth);
  sunDir.setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  sun.position.copy(sunDir).multiplyScalar(20).add(sun.target.position);
  const low = THREE.MathUtils.smoothstep(params.sunElevation, 2, 30);
  sun.color.setRGB(1, 0.72 + 0.22 * low, 0.5 + 0.36 * low);
  sun.intensity = 0.6 + 2.8 * low;
  shared.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity * 0.32);
  if (envRT) envRT.dispose();
  const exp = renderer.toneMappingExposure;
  renderer.toneMappingExposure = 0.35;
  envRT = pmrem.fromScene(envScene, 0.02);
  renderer.toneMappingExposure = exp;
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.9;
}

// ---- ground ---------------------------------------------------------------
{
  const gt = makeGroundTexture();
  gt.repeat.set(220, 220);
  const lawn = new THREE.Mesh(
    new THREE.CircleGeometry(300, 64),
    new THREE.MeshStandardMaterial({ map: gt, roughness: 1 })
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  scene.add(lawn);

  // gravel walk through the vault, with planting beds either side
  const gv = makeGravelTexture();
  gv.repeat.set(3, 14);
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 15),
    new THREE.MeshStandardMaterial({ map: gv, roughness: 1 })
  );
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.004;
  path.receiveShadow = true;
  scene.add(path);

  const soil = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 });
  for (const sx of [-1, 1]) {
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(0.9, ST.L + 0.6), soil);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(sx * (ST.Rx + 0.12), 0.003, 0);
    bed.receiveShadow = true;
    scene.add(bed);
  }
}

// ---- structure + plant ----------------------------------------------------
{
  const gl = makeGlulamTextures();
  const glulam = new THREE.MeshStandardMaterial({ map: gl.map, bumpMap: gl.bump, bumpScale: 0.6, roughness: 0.62 });
  const larch = new THREE.MeshStandardMaterial({
    map: gl.map,
    bumpMap: gl.bump,
    bumpScale: 0.6,
    roughness: 0.75,
    color: 0xe6d6c0,
  });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xa9a294, roughness: 0.95 });
  scene.add(buildStructure({ glulam, larch, steel, stone }));
}

const plantMats = makePlantMaterials({ bark: makeBarkTextures(), leafTex: makeLeafTexture() });
let plant = null;
let lodDirty = true;

function rebuild() {
  if (plant) {
    scene.remove(plant.group);
    plant.dispose();
  }
  plant = buildPlant(params.seed, plantMats);
  scene.add(plant.group);
  lodDirty = true;
}

// ---------------------------------------------------------------------------
// The calendar. Extension growth only happens between early April and late
// September; `grow` is the count of growing seasons completed so far.
// ---------------------------------------------------------------------------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const state = { grow: 0, year: 0, day: 0, locked: false };

function computeState() {
  const t = params.time;
  const yi = Math.floor(t);
  const d = t - yi;
  state.locked = params.holdBloom;
  state.year = t;
  if (params.holdBloom) {
    state.day = 0.35;
    state.grow = t;
    state.growing = 1;
  } else {
    state.day = d;
    state.grow = yi + smoothstep(0.26, 0.74, d);
    state.growing = smoothstep(0.26, 0.3, d) * (1 - smoothstep(0.7, 0.74, d));
  }
  shared.uGrow.value = state.grow;
  shared.uYear.value = state.year;
  shared.uDay.value = state.day;
  shared.uGrowing.value = state.growing;
}

// The label follows the calendar, but must not claim organs the plant does not
// have yet: no flowers before the first bloom year, nothing to prune or shed
// on a newly planted cane.
function phaseName(d, yi) {
  const firstBloom = plant ? plant.sk.plants[0].firstBloom : 0;
  const flowers = yi >= firstBloom;
  // pods come from the previous year's flowers
  if (d < 0.2) return yi > firstBloom ? 'Dormant · pods still hanging' : 'Dormant';
  if (d < 0.255) return yi < 1 ? 'Newly planted · dormant' : 'Dormant · winter-pruned to spurs';
  if (d < 0.3) return flowers ? 'Buds break · racemes lengthen' : 'Buds break';
  if (d < 0.39) return flowers ? 'In flower' : 'Leaves expand · too young to flower';
  if (d < 0.45) return flowers ? 'Petal fall · leaves expand' : 'Leaves expand';
  if (d < 0.56) return 'Extension growth · whips twining';
  if (d < 0.62) return 'Summer prune';
  if (d < 0.74) return 'Pods swell · wood ripens';
  if (d < 0.86) return 'Autumn colour';
  if (d < 0.94) return 'Leaf fall';
  return 'Dormant';
}

const dateEl = document.getElementById('date');
const phaseEl = document.getElementById('phase');
const scrub = document.getElementById('scrub');
const playBtn = document.getElementById('play');
scrub.min = T_START;
scrub.max = T_END;

function updateTimelineUI() {
  const t = params.time;
  const d = t - Math.floor(t);
  const month = MONTHS[Math.min(11, Math.floor(d * 12))];
  dateEl.textContent = `Year ${Math.floor(t) + 1} · ${params.holdBloom ? 'held in bloom' : month}`;
  phaseEl.textContent = params.holdBloom ? 'Structure grows, season held at early May' : phaseName(d, Math.floor(t));
  scrub.value = t;
  playBtn.innerHTML = params.playing ? '&#10073;&#10073;' : '&#9654;';
}
function setTime(t) {
  params.time = clamp(t, T_START, T_END);
  computeState();
  updateTimelineUI();
  lodDirty = true;
}
scrub.addEventListener('input', () => setTime(Number(scrub.value)));
playBtn.addEventListener('click', () => {
  if (!params.playing && params.time >= T_END - 0.01) setTime(T_START);
  params.playing = !params.playing;
  updateTimelineUI();
});
document.getElementById('replant').addEventListener('click', () => {
  setTime(T_START);
  params.playing = true;
  updateTimelineUI();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    playBtn.click();
  }
});

// ---------------------------------------------------------------------------
// Detail. One number (0..1) drives organ density, LOD distances and caps,
// render resolution and shadow quality. With "adaptive" on, the effective
// value floats below the user's ceiling to hold the frame rate.
// ---------------------------------------------------------------------------
let effDetail = params.detail;
let applied = { pr: 0, shadow: 0 };
let shadowEvery = 1;

function applyDetail() {
  const e = effDetail;
  const pr = Math.round(Math.min(window.devicePixelRatio, lerp(0.7, 2, e)) * 8) / 8;
  if (pr !== applied.pr) {
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    applied.pr = pr;
  }
  const size = e < 0.25 ? 1024 : e < 0.6 ? 2048 : 4096;
  if (size !== applied.shadow) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
    applied.shadow = size;
  }
  shadowEvery = e < 0.35 ? 3 : e < 0.7 ? 2 : 1;
  lodDirty = true;
}

// ---- controls -------------------------------------------------------------
const gui = new GUI({ title: 'Wisteria sinensis' });
const fT = gui.addFolder('Time-lapse');
fT.add(params, 'speed', 0.02, 1, 0.01).name('Years / second');
fT.add(params, 'holdBloom')
  .name('Hold in bloom')
  .onChange(() => setTime(params.time));
const fD = gui.addFolder('Detail');
fD.add(params, 'detail', 0.05, 1, 0.01)
  .name('Detail')
  .onChange((v) => {
    effDetail = v;
    applyDetail();
  });
fD.add(params, 'adaptive').name('Adapt to device');
const fS = gui.addFolder('Scene');
fS.add(params, 'wind', 0, 2, 0.01).name('Wind');
fS.add(params, 'sunElevation', 3, 80, 1).name('Sun height').onChange(updateSun);
fS.add(params, 'sunAzimuth', -180, 180, 1).name('Sun direction').onChange(updateSun);
fS.add(params, 'autoRotate').name('Orbit');
fS.add(params, 'seed', 1, 999, 1).name('Seed').onFinishChange(rebuild);
if (window.innerWidth < 800) gui.close();

updateSun();
applyDetail();
rebuild();
setTime(params.time);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- loop -----------------------------------------------------------------
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let lodTimer = 0;
let frameNo = 0;
let ema = 1 / 60;
let adaptTimer = 0;
let statTimer = 0;
let lastFrame = performance.now();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  frameNo++;
  shared.uTime.value += dt;
  shared.uWind.value += (params.wind - shared.uWind.value) * Math.min(1, dt * 3);

  if (params.playing) {
    params.time += dt * params.speed;
    if (params.time >= T_END) {
      params.time = T_END;
      params.playing = false;
    }
    computeState();
    updateTimelineUI();
  }

  controls.autoRotate = params.autoRotate;
  controls.update();

  lodTimer += dt;
  if (lodDirty || lodTimer > 0.18) {
    plant.update(camera, state, effDetail);
    lodTimer = 0;
    lodDirty = false;
  }

  shared.uSunDirView.value.copy(tmp.copy(sunDir).transformDirection(camera.matrixWorldInverse));
  if (frameNo % shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);

  // hold the frame rate by trading detail (ignore frames stalled by a
  // backgrounded tab, which say nothing about the device)
  const stalled = clock.oldTime - lastFrame > 250;
  lastFrame = clock.oldTime;
  if (!stalled) ema += (dt - ema) * 0.05;
  adaptTimer += dt;
  if (params.adaptive && adaptTimer > 0.6 && !document.hidden && !stalled) {
    adaptTimer = 0;
    const before = effDetail;
    if (ema > 1 / 38) effDetail = Math.max(0.08, effDetail - (ema > 1 / 24 ? 0.1 : 0.04));
    else if (ema < 1 / 55) effDetail = Math.min(params.detail, effDetail + 0.02);
    if (effDetail !== before) applyDetail();
  } else if (!params.adaptive && effDetail !== params.detail) {
    effDetail = params.detail;
    applyDetail();
  }

  statTimer += dt;
  if (statTimer > 0.5) {
    statTimer = 0;
    const s = plant.stats();
    statsEl.textContent =
      `${s.racemes.toLocaleString()} racemes · ${s.leaves.toLocaleString()} leaves · ` +
      `${(s.triangles / 1e6).toFixed(2)} M triangles · ${Math.round(1 / ema)} fps · detail ${Math.round(effDetail * 100)}%`;
  }
}
renderer.setAnimationLoop(frame);

// handy for debugging / screenshots
window.__wisteria = {
  scene,
  camera,
  controls,
  renderer,
  params,
  state,
  setTime,
  shared,
  get plant() {
    return plant;
  },
  get detail() {
    return effDetail;
  },
};
