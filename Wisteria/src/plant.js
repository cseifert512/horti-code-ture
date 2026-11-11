import * as THREE from 'three';
import { RNG, lerp, clamp } from './util.js';
import { growWisteria, buildWoodGeometry, GEND } from './skeleton.js';
import {
  RACEME_LEN,
  RACEME_VARIANTS,
  RACEME_LODS,
  LEAF_VARIANTS,
  LEAF_LODS,
  makeRacemeGeometry,
  makeLeafGeometry,
  makePodGeometry,
  makeLitterGeometry,
} from './parts.js';
import { LodPool } from './lod.js';
import { patch, depthMaterial } from './shaders.js';
import { ST } from './structure.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

// organ geometry is seed-independent: build once, lazily
let GEO = null;
function geometries() {
  if (!GEO) {
    GEO = {
      raceme: Array.from({ length: RACEME_VARIANTS }, (_, v) =>
        Array.from({ length: RACEME_LODS }, (_, l) => makeRacemeGeometry(v, l))
      ),
      leaf: LEAF_VARIANTS.map((_, v) => Array.from({ length: LEAF_LODS }, (_, l) => makeLeafGeometry(v, l))),
      pod: makePodGeometry(),
      litter: makeLitterGeometry(),
    };
  }
  return GEO;
}

export function makePlantMaterials({ bark, leafTex }) {
  const wood = patch(
    new THREE.MeshStandardMaterial({ map: bark.map, bumpMap: bark.bump, bumpScale: 3, roughness: 0.94 }),
    'wood'
  );
  const flower = patch(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
    'raceme',
    { translucency: 0.3, sheen: 0.1 }
  );
  const leafNear = patch(
    new THREE.MeshStandardMaterial({
      map: leafTex,
      bumpMap: leafTex,
      bumpScale: 1.2,
      roughness: 0.5,
      side: THREE.DoubleSide,
    }),
    'leaf',
    { translucency: 0.45 }
  );
  const leafFar = patch(
    new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.6, side: THREE.DoubleSide }),
    'leaf',
    { translucency: 0.45 }
  );
  const pod = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'pod');
  const litter = patch(new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }), 'litter');
  return { wood, flower, leafNear, leafFar, pod, litter };
}

// deterministic per-(id, year) random number
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// share of spurs that flower, by years since the plant first bloomed
const BLOOM_RAMP = [0.3, 0.55, 0.8, 0.92, 1];

export function buildPlant(seed, mats) {
  const geo = geometries();
  const sk = growWisteria(seed);
  const rng = new RNG(seed * 31 + 5);
  const group = new THREE.Group();

  // ---- wood ----------------------------------------------------------------
  const woodGeo = buildWoodGeometry(sk);
  const wood = new THREE.Mesh(woodGeo, mats.wood);
  wood.castShadow = wood.receiveShadow = true;
  wood.frustumCulled = false;
  wood.customDepthMaterial = depthMaterial('wood');
  group.add(wood);

  const m4 = new THREE.Matrix4();
  const X = new V3();
  const Y = new V3();
  const Z = new V3();
  const scl = new V3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  // ---- leaves --------------------------------------------------------------
  const leafRecs = sk.leaves.map((lf) => {
    Z.copy(lf.dir).normalize();
    X.crossVectors(UP, Z);
    if (X.lengthSq() < 1e-4) X.set(1, 0, 0);
    X.normalize();
    Y.crossVectors(Z, X);
    m4.makeBasis(X, Y, Z);
    m4.multiply(new THREE.Matrix4().makeRotationZ((lf.r1 - 0.5) * 0.9));
    m4.scale(scl.set(lf.len, lf.len, lf.len));
    m4.setPosition(lf.p);
    const v = 0.88 + 0.24 * lf.r1;
    return {
      m: new Float32Array(m4.elements),
      c: [v, v, v],
      a: new Float32Array([
        lf.birth, lf.death, lf.r1, 0,
        lf.anchor.x, lf.anchor.y, lf.anchor.z, lf.phase,
        lf.sup.x, lf.sup.y, lf.sup.z, lf.nodeR,
        lf.nodeBirth, lf.over[0], lf.over[1], lf.over[2],
      ]),
      x: lf.p.x,
      y: lf.p.y,
      z: lf.p.z,
      variant: lf.len < 0.1 ? 0 : lf.r1 < 0.2 ? 0 : lf.r1 < 0.8 ? 1 : 2,
      rank: lf.rank,
      birth: lf.birth,
      death: lf.death,
    };
  });
  const leaves = new LodPool({
    geometries: geo.leaf,
    materials: [mats.leafNear, mats.leafNear, mats.leafFar],
    attrs: [
      { name: 'aLife', size: 4 },
      { name: 'aHost', size: 4 },
      { name: 'aNodeA', size: 4 },
      { name: 'aNodeB', size: 4 },
    ],
    records: leafRecs,
    depth: depthMaterial('leaf'),
  });
  group.add(leaves.group);

  // ---- racemes -------------------------------------------------------------
  const racemeRecs = sk.racemes.map((rc) => {
    q.setFromEuler(e.set(0, rc.yaw, 0));
    m4.compose(rc.p, q, scl.set(rc.scale, rc.scale, rc.scale));
    const tone = 0.92 + 0.16 * rc.r1;
    const warm = (hash2(rc.id, 7) - 0.5) * 0.08;
    return {
      m: new Float32Array(m4.elements),
      c: [tone * (1 + warm), tone, tone * (1 - warm)],
      a: new Float32Array([rc.phase, rc.r1, rc.swing, 0]),
      x: rc.p.x,
      y: rc.p.y - 0.12,
      z: rc.p.z,
      variant: rc.variant,
      rank: rc.rank,
      bloomYear: rc.bloomYear,
      id: rc.id,
      pod: rc.pod,
    };
  });
  const racemes = new LodPool({
    geometries: geo.raceme,
    materials: [mats.flower, mats.flower, mats.flower, mats.flower],
    attrs: [{ name: 'aInst', size: 4 }],
    records: racemeRecs,
    depth: depthMaterial('raceme'),
  });
  group.add(racemes.group);

  // ---- pods ----------------------------------------------------------------
  const podRecs = racemeRecs
    .filter((r) => r.pod)
    .map((r) => {
      const s = 0.85 + 0.4 * hash2(r.id, 3);
      m4.compose(new V3(r.x, r.y + 0.12, r.z), q.setFromEuler(e.set(0, hash2(r.id, 5) * 6.28, 0)), scl.set(s, s, s));
      return { ...r, m: new Float32Array(m4.elements), c: [1, 1, 1], a: new Float32Array(0), variant: 0, rank: 0 };
    });
  const pods = new LodPool({
    geometries: [[geo.pod]],
    materials: [mats.pod],
    attrs: [],
    records: podRecs,
    depth: depthMaterial('pod'),
  });
  group.add(pods.group);

  // ---- ground litter -------------------------------------------------------
  const NL = 2600;
  const litter = new THREE.InstancedMesh(geo.litter.clone(), mats.litter, NL);
  const inst = new Float32Array(NL * 4);
  const col = new THREE.Color();
  for (let i = 0; i < NL; i++) {
    const isLeaf = i % 2;
    const x = rng.range(-1, 1) * (ST.Rx + 0.5);
    const z = rng.range(-1, 1) * (ST.L / 2 + 0.5);
    const s = isLeaf ? rng.range(0.03, 0.055) : rng.range(0.011, 0.018);
    q.setFromEuler(e.set(rng.range(-0.2, 0.2), rng.range(0, 6.28), rng.range(-0.2, 0.2)));
    m4.compose(new V3(x, 0.006 + rng.range(0, 0.006), z), q, scl.set(s, s, s * (isLeaf ? 0.6 : 1)));
    litter.setMatrixAt(i, m4);
    if (isLeaf) col.setHSL(rng.range(0.09, 0.14), rng.range(0.5, 0.8), rng.range(0.32, 0.5));
    else col.setHSL(rng.range(0.7, 0.74), rng.range(0.45, 0.7), rng.range(0.7, 0.84));
    litter.setColorAt(i, col);
    inst.set([rng.f(), rng.range(3, 9), isLeaf, 0], i * 4);
  }
  litter.geometry.setAttribute('aInst', new THREE.InstancedBufferAttribute(inst, 4));
  litter.receiveShadow = true;
  litter.frustumCulled = false;
  group.add(litter);

  // -------------------------------------------------------------------------
  const firstBloom = sk.plants[0].firstBloom;
  const api = {
    group,
    sk,
    /**
     * state:  { grow, year, day, locked }
     * detail: 0..1 effective detail
     */
    update(camera, state, detail) {
      const { grow, year, day, locked } = state;
      const yi = Math.floor(year);
      const k = lerp(0.4, 1.25, detail);
      const density = lerp(0.45, 1, clamp(detail / 0.6, 0, 1));

      const leafSeason = locked || (day > 0.265 && day < 0.96);
      leaves.update(camera, {
        alive: (r) => leafSeason && grow >= r.birth - 0.01 && year < r.death,
        density,
        dist: [1.6 * k, 5 * k],
        caps: [Math.round(lerp(0, 60, clamp((detail - 0.4) / 0.6, 0, 1))), Math.round(lerp(40, 800, detail * detail))],
      });

      const bloomSeason = day > 0.24 && day < 0.49;
      racemes.update(camera, {
        alive: (r) =>
          bloomSeason &&
          yi >= r.bloomYear &&
          hash2(r.id, yi) < BLOOM_RAMP[Math.min(BLOOM_RAMP.length - 1, yi - firstBloom)],
        density,
        dist: [1.3 * k, 3.2 * k, 6.5 * k],
        caps: [
          Math.round(lerp(0, 26, clamp((detail - 0.4) / 0.6, 0, 1))),
          Math.round(lerp(8, 130, detail * detail)),
          Math.round(lerp(80, 800, detail * detail)),
        ],
      });

      const podSeason = !locked && (day > 0.44 || day < 0.15);
      pods.update(camera, {
        alive: (r) => podSeason && yi >= r.bloomYear + 1 && hash2(r.id, yi - (day < 0.15 ? 1 : 0)) < 0.6,
        dist: [],
      });
      litter.visible = !locked;
    },
    stats() {
      return {
        racemes: racemes.visible,
        leaves: leaves.visible,
        triangles: woodGeo.index.count / 3 + racemes.triangles + leaves.triangles + pods.triangles,
        lods: racemes.used,
      };
    },
    dispose() {
      woodGeo.dispose();
      leaves.dispose();
      racemes.dispose();
      pods.dispose();
      litter.dispose();
    },
  };
  return api;
}

export { GEND, RACEME_LEN };
