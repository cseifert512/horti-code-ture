// Draws the plants of a RenderData: stems as one mesh of tubes, and leaves,
// inflorescences and fruit as instanced organs with per-organ level of detail.
// Ported from buildPlant in the prototype (Wisteria/src/plant.js); the
// difference is where time comes from. Here every "is it there, and in what
// state" is answered by the adapter (adapter.ts) from the engine's days.
//
// The organ geometry and colours are Wisteria sinensis's (organs.ts), and
// mechanism traits do not transfer: a honeysuckle must not be shown with
// racemes and pinnate leaves. So organs are drawn only for the taxa the assets
// belong to. Any other plant gets its stems, and `withoutOrgans` names it so
// the caption can say what is missing.
import * as THREE from 'three';
import type { RenderData, RenderFlower, RenderLeaf, RenderStem } from '@horti/core';
import type { TexturePair } from '../textures.ts';
import { clamp, hash2, lerp, smoothstep } from '../util.ts';
import { type FruitSite, RenderTimeline } from './adapter.ts';
import { LodPool, type LodRecord } from './lod.ts';
import { LEAF_LODS, LEAF_VARIANTS, RACEME_LEN, RACEME_LODS, RACEME_VARIANTS, makeLeafGeometry, makePodGeometry, makeRacemeGeometry } from './organs.ts';
import { WISTERIA_WOOD_LOOK, depthMaterial, patch } from './shaders.ts';
import { buildWoodGeometry } from './wood.ts';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
/** makePodGeometry draws its pods this long; an instance is scaled to the length in the data. */
const POD_AUTHORED_LENGTH_M = 0.125;

/** Taxa the organ assets in organs.ts may be used for: the plant they were modelled on, and the render test. */
const HAS_WISTERIA_ORGANS: ReadonlySet<string> = new Set(['wisteria-sinensis', 'render-test']);

const three = (t: readonly [number, number, number], out = new V3()): THREE.Vector3 => out.set(t[0], t[2], -t[1]);

export interface PlantMaterials {
  wood: THREE.Material;
  flower: THREE.Material;
  leafNear: THREE.Material;
  leafFar: THREE.Material;
  pod: THREE.Material;
}

export function makePlantMaterials({ bark, leafTex }: { bark: TexturePair; leafTex: THREE.Texture }): PlantMaterials {
  return {
    wood: patch(new THREE.MeshStandardMaterial({ map: bark.map, bumpMap: bark.bump, bumpScale: 3, roughness: 0.94 }), 'wood'),
    flower: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), 'raceme', { translucency: 0.3, sheen: 0.1 }),
    leafNear: patch(new THREE.MeshStandardMaterial({ map: leafTex, bumpMap: leafTex, bumpScale: 1.2, roughness: 0.5, side: THREE.DoubleSide }), 'leaf', { translucency: 0.45 }),
    leafFar: patch(new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.6, side: THREE.DoubleSide }), 'leaf', { translucency: 0.45 }),
    pod: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'pod'),
  };
}

// organ geometry does not depend on the data: build once, lazily
interface OrganGeometry {
  raceme: THREE.BufferGeometry[][];
  leaf: THREE.BufferGeometry[][];
  pod: THREE.BufferGeometry;
}
let GEO: OrganGeometry | null = null;
function geometries(): OrganGeometry {
  GEO ??= {
    raceme: Array.from({ length: RACEME_VARIANTS }, (_, v) => Array.from({ length: RACEME_LODS }, (_, l) => makeRacemeGeometry(v, l))),
    leaf: LEAF_VARIANTS.map((_, v) => Array.from({ length: LEAF_LODS }, (_, l) => makeLeafGeometry(v, l))),
    pod: makePodGeometry(),
  };
  return GEO;
}

interface LeafRecord extends LodRecord {
  leaf: RenderLeaf;
  /** The stem the leaf stands on and the point of it nearest the leaf; null if the data names no such stem. */
  stem: RenderStem | null;
  pointIndex: number;
  /** away from the support + the leaf's own direction: the way out from the contact line to the stem's surface */
  outX: number;
  outY: number;
  outZ: number;
}
interface FlowerRecord extends LodRecord {
  flower: RenderFlower;
}
interface FruitRecord extends LodRecord {
  fruit: FruitSite;
}

export interface PlantStats {
  stems: number;
  leaves: number;
  flowers: number;
  fruit: number;
  triangles: number;
}

export class PlantView {
  readonly group = new THREE.Group();
  readonly timeline: RenderTimeline;
  private readonly woodGeometry: THREE.BufferGeometry;
  private readonly leaves: LodPool<LeafRecord>;
  private readonly flowers: LodPool<FlowerRecord>;
  private readonly fruit: LodPool<FruitRecord>;
  /** Day the base of each stem was laid down and day it was removed (-1: never). */
  private readonly stemSpans: [number, number][];
  private day = 0;
  /** Labels of plants drawn as stems only, because there are no organ assets for their taxon yet. */
  readonly withoutOrgans: string[];

  constructor(data: RenderData, mats: PlantMaterials, extras: { fruit?: readonly FruitSite[] } = {}) {
    this.timeline = new RenderTimeline(data);
    this.group.name = `plants:${data.scenario}`;
    const geo = geometries();
    this.stemSpans = data.stems.filter((s) => s.bornDay.length >= 2).map((s) => [s.bornDay[0]!, s.removedDay[0]!]);
    const drawable = new Set(data.plants.filter((p) => HAS_WISTERIA_ORGANS.has(p.taxonId)).map((p) => p.id));
    this.withoutOrgans = data.plants.filter((p) => !drawable.has(p.id)).map((p) => p.label);

    // ---- wood ------------------------------------------------------------------
    this.woodGeometry = buildWoodGeometry(data.stems).geometry;
    const wood = new THREE.Mesh(this.woodGeometry, mats.wood);
    wood.name = 'stems';
    wood.castShadow = wood.receiveShadow = true;
    wood.frustumCulled = false;
    wood.customDepthMaterial = depthMaterial('wood');
    this.group.add(wood);

    const m4 = new THREE.Matrix4();
    const roll = new THREE.Matrix4();
    const X = new V3();
    const Y = new V3();
    const Z = new V3();
    const scl = new V3();
    const p = new V3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();

    // ---- leaves ----------------------------------------------------------------
    // each leaf stands on a point of its stem: find it, to seat the leaf on the
    // stem's surface as the stem thickens and to sway it with that stem
    const stems = new Map(data.stems.map((s, index) => [s.id, { s, index }]));
    const leafRecords: LeafRecord[] = [];
    data.leaves.forEach((leaf, n) => {
      if (!drawable.has(leaf.plantId)) return;
      const r1 = hash2(n, 3);
      three(leaf.direction, Z).normalize();
      X.crossVectors(UP, Z);
      if (X.lengthSq() < 1e-4) X.set(1, 0, 0);
      X.normalize();
      Y.crossVectors(Z, X);
      m4.makeBasis(X, Y, Z);
      m4.multiply(roll.makeRotationZ((r1 - 0.5) * 0.9));
      m4.scale(scl.set(leaf.lengthM, leaf.lengthM, leaf.lengthM));
      three(leaf.position, p);
      m4.setPosition(p);
      const tone = 0.88 + 0.24 * r1;

      const a = new Float32Array(16);
      let stem: RenderStem | null = null;
      let pointIndex = 0;
      let outX = 0;
      let outY = 0;
      let outZ = 0;
      const host = stems.get(leaf.stemId);
      if (host) {
        const { s, index } = host;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < s.bornDay.length; i++) {
          const d = (s.contact[3 * i]! - leaf.position[0]) ** 2 + (s.contact[3 * i + 1]! - leaf.position[1]) ** 2 + (s.contact[3 * i + 2]! - leaf.position[2]) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        stem = s;
        pointIndex = best;
        const away = three([s.away[3 * best]!, s.away[3 * best + 1]!, s.away[3 * best + 2]!]);
        outX = away.x + Z.x;
        outY = away.y + Z.y;
        outZ = away.z + Z.z;
        // aHost: base of the bearing stem (its centre at the end of the run), and its phase
        const base = three([s.contact[0]!, s.contact[1]!, s.contact[2]!]).addScaledVector(three([s.away[0]!, s.away[1]!, s.away[2]!]), s.radiusMm[0]! / 1000);
        a.set([base.x, base.y, base.z, hash2(index, 17)], 4);
        a.set([away.x, away.y, away.z, 0], 8);
      } else {
        a.set([p.x, p.y, p.z, r1], 4);
      }
      leafRecords.push({
        m: new Float32Array(m4.elements),
        c: [tone, tone, tone],
        a,
        x: p.x,
        y: p.y,
        z: p.z,
        variant: leaf.lengthM < 0.1 || r1 < 0.2 ? 0 : r1 < 0.8 ? 1 : 2,
        rank: hash2(n, 5),
        leaf,
        stem,
        pointIndex,
        outX,
        outY,
        outZ,
      });
    });
    this.leaves = new LodPool({
      geometries: geo.leaf,
      materials: [mats.leafNear, mats.leafNear, mats.leafFar],
      attrs: [
        { name: 'aState', size: 4 },
        { name: 'aHost', size: 4 },
        { name: 'aSup', size: 4 },
        { name: 'aSeat', size: 4 },
      ],
      records: leafRecords,
      depth: depthMaterial('leaf'),
    });
    this.leaves.group.name = 'leaves';
    this.group.add(this.leaves.group);

    // ---- inflorescences ----------------------------------------------------------
    const flowerRecords: FlowerRecord[] = [];
    data.flowers.forEach((flower, n) => {
      if (!drawable.has(flower.plantId)) return;
      const r1 = hash2(n, 23);
      const scale = flower.lengthM / RACEME_LEN;
      three(flower.position, p);
      m4.compose(p, q.setFromEuler(e.set(0, hash2(n, 29) * Math.PI * 2, 0)), scl.set(scale, scale, scale));
      const tone = 0.92 + 0.16 * r1;
      const warm = (hash2(n, 7) - 0.5) * 0.08;
      const a = new Float32Array(8);
      // swing room is not in the data: allow a moderate swing everywhere
      a.set([0.6, r1, 0, 0], 4);
      flowerRecords.push({ m: new Float32Array(m4.elements), c: [tone * (1 + warm), tone, tone * (1 - warm)], a, x: p.x, y: p.y - flower.lengthM / 2, z: p.z, variant: Math.floor(hash2(n, 31) * RACEME_VARIANTS), rank: hash2(n, 37), flower });
    });
    this.flowers = new LodPool({
      geometries: geo.raceme,
      materials: [mats.flower, mats.flower, mats.flower, mats.flower],
      attrs: [
        { name: 'aState', size: 4 },
        { name: 'aInst', size: 4 },
      ],
      records: flowerRecords,
      depth: depthMaterial('raceme'),
    });
    this.flowers.group.name = 'inflorescences';
    this.group.add(this.flowers.group);

    // ---- fruit (not in the contract yet: only the test plant supplies any) --------
    const fruitRecords: FruitRecord[] = (extras.fruit ?? []).map((fruit, n) => {
      const scale = fruit.lengthM / POD_AUTHORED_LENGTH_M;
      three(fruit.position, p);
      m4.compose(p, q.setFromEuler(e.set(0, hash2(n, 41) * Math.PI * 2, 0)), scl.set(scale, scale, scale));
      return { m: new Float32Array(m4.elements), c: [1, 1, 1], a: new Float32Array(4), x: p.x, y: p.y, z: p.z, variant: 0, rank: 0, fruit };
    });
    this.fruit = new LodPool({ geometries: [[geo.pod]], materials: [mats.pod], attrs: [{ name: 'aState', size: 4 }], records: fruitRecords, depth: depthMaterial('pod') });
    this.fruit.group.name = 'fruit';
    this.group.add(this.fruit.group);
  }

  /**
   * Show the plants as they were on `day`. `detail` (0 to 1) trades organ
   * density and geometric detail for speed, as in the prototype.
   *
   * The `alive` callbacks below do two things: they say whether an organ is
   * there on that day, and for those that are they write its state into the
   * record, which the pool then copies to the GPU.
   */
  update(camera: THREE.Camera, day: number, detail: number): void {
    const t = this.timeline;
    this.day = day;
    t.apply(day);
    const k = lerp(0.4, 1.25, detail);
    const density = lerp(0.45, 1, clamp(detail / 0.6, 0, 1));
    const fine = clamp((detail - 0.4) / 0.6, 0, 1);
    const [sway0, sway1] = WISTERIA_WOOD_LOOK.swayDays;

    this.leaves.update(camera, {
      alive: (r) => {
        const s = t.leafDraw(r.leaf, day);
        if (!s.visible) return false;
        const a = r.a;
        a[0] = s.expansion;
        a[1] = s.colour;
        if (!r.stem) return true;
        // young wood sways and carries its leaves with it
        a[11] = 1 - smoothstep(sway0, sway1, day - r.stem.bornDay[r.pointIndex]!);
        const radius = t.stemRadiusM(r.stem, r.pointIndex, day);
        a[12] = r.outX * radius;
        a[13] = r.outY * radius;
        a[14] = r.outZ * radius;
        return true;
      },
      density,
      dist: [1.6 * k, 5 * k],
      caps: [Math.round(lerp(0, 60, fine)), Math.round(lerp(40, 800, detail * detail))],
    });

    this.flowers.update(camera, {
      alive: (r) => {
        const s = t.flowerDraw(r.flower, day);
        if (!s.visible) return false;
        const a = r.a;
        a[0] = s.elongation;
        a[1] = s.bloom;
        a[2] = s.shed;
        a[3] = 1;
        return true;
      },
      density,
      dist: [1.3 * k, 3.2 * k, 6.5 * k],
      caps: [Math.round(lerp(0, 26, fine)), Math.round(lerp(8, 130, detail * detail)), Math.round(lerp(80, 800, detail * detail))],
    });

    this.fruit.update(camera, {
      alive: (r) => {
        const s = t.fruitDraw(r.fruit, day);
        if (!s.visible) return false;
        r.a[0] = s.size;
        r.a[1] = s.ripeness;
        return true;
      },
      dist: [],
    });
  }

  /** What is on the plants on the day last shown. */
  stats(): PlantStats {
    const day = this.day;
    return {
      stems: this.stemSpans.reduce((n, [born, removed]) => n + (born <= day && (removed < 0 || day < removed) ? 1 : 0), 0),
      leaves: this.leaves.visible,
      flowers: this.flowers.visible,
      fruit: this.fruit.visible,
      triangles: (this.woodGeometry.index?.count ?? 0) / 3 + this.leaves.triangles + this.flowers.triangles + this.fruit.triangles,
    };
  }

  dispose(): void {
    this.woodGeometry.dispose();
    this.leaves.dispose();
    this.flowers.dispose();
    this.fruit.dispose();
  }
}
