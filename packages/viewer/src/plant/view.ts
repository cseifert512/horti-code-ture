// Draws the plants of a RenderData: stems as one mesh of tubes, and leaves,
// flowers and fruit as instanced organs with per-organ level of detail.
// Ported from buildPlant in the prototype (Wisteria/src/plant.js); the
// difference is where time comes from. Here every "is it there, and in what
// state" is answered by the adapter (adapter.ts) from the engine's days.
//
// Each plant is drawn with the leaf and flower models of its own taxon
// (assets.ts). A plant whose taxon has none is drawn as stems only, and
// `withoutOrgans` names it so the caption can say what is missing.
import * as THREE from 'three';
import type { RenderData, RenderFlower, RenderLeaf, RenderStem } from '@horti/core';
import type { TexturePair } from '../textures.ts';
import { clamp, hash2, lerp, smoothstep } from '../util.ts';
import { type FruitSite, RenderTimeline } from './adapter.ts';
import { type FlowerAsset, type LeafAsset, type TaxonAssets, assetsFor } from './assets.ts';
import { LodPool, type LodRecord } from './lod.ts';
import { makePodGeometry } from './organs.ts';
import { WISTERIA_WOOD_LOOK, depthMaterial, patch } from './shaders.ts';
import { buildWoodGeometry } from './wood.ts';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
/** makePodGeometry draws its pods this long; an instance is scaled to the length in the data. */
const POD_AUTHORED_LENGTH_M = 0.125;

const three = (t: readonly [number, number, number], out = new V3()): THREE.Vector3 => out.set(t[0], t[2], -t[1]);

/** Materials are made once and kept: one set of leaf and flower materials per organ model, since each carries its taxon's colours. */
export interface PlantMaterials {
  wood: THREE.Material;
  pod: THREE.Material;
  /** [near, near, far] for the three levels of detail of a leaf. */
  leaf(asset: LeafAsset): THREE.Material[];
  flower(asset: FlowerAsset): THREE.Material;
}

export function makePlantMaterials({ bark, leafTex }: { bark: TexturePair; leafTex: THREE.Texture }): PlantMaterials {
  const leaves = new Map<string, THREE.Material[]>();
  const flowers = new Map<string, THREE.Material>();
  return {
    wood: patch(new THREE.MeshStandardMaterial({ map: bark.map, bumpMap: bark.bump, bumpScale: 3, roughness: 0.94 }), 'wood'),
    pod: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'pod'),
    leaf(asset) {
      let m = leaves.get(asset.key);
      if (!m) {
        const options = { translucency: 0.45, palette: asset.palette };
        const near = patch(new THREE.MeshStandardMaterial({ map: leafTex, bumpMap: leafTex, bumpScale: 1.2, roughness: asset.roughness, side: THREE.DoubleSide }), 'leaf', options);
        const far = patch(new THREE.MeshStandardMaterial({ map: leafTex, roughness: Math.min(1, asset.roughness + 0.1), side: THREE.DoubleSide }), 'leaf', options);
        leaves.set(asset.key, (m = [near, near, far]));
      }
      return m;
    },
    flower(asset) {
      let m = flowers.get(asset.key);
      if (!m) flowers.set(asset.key, (m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), 'raceme', { translucency: asset.translucency, sheen: asset.sheen, budTint: asset.budTint })));
      return m;
    },
  };
}

// organ geometry does not depend on the data: build each model once, when first needed
const GEOMETRY = new Map<string, THREE.BufferGeometry[][]>();
function geometriesOf(asset: LeafAsset | FlowerAsset): THREE.BufferGeometry[][] {
  let g = GEOMETRY.get(asset.key);
  if (!g) GEOMETRY.set(asset.key, (g = Array.from({ length: asset.variants }, (_, v) => Array.from({ length: asset.lods }, (_, l) => asset.make(v, l)))));
  return g;
}
let POD: THREE.BufferGeometry | null = null;

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
  /** Labels of plants drawn as stems only, because there are no organ models for their taxon. */
  readonly withoutOrgans: string[];
  /** Labels of plants that flower in the data but have no flower model, so are drawn in leaf only. */
  readonly withoutFlowers: string[];
  private readonly woodGeometry: THREE.BufferGeometry;
  private readonly leafPools: { asset: LeafAsset; pool: LodPool<LeafRecord> }[] = [];
  private readonly flowerPools: { asset: FlowerAsset; pool: LodPool<FlowerRecord> }[] = [];
  private readonly fruit: LodPool<FruitRecord>;
  /** Day the base of each stem was laid down and day it was removed (-1: never). */
  private readonly stemSpans: [number, number][];
  private day = 0;

  constructor(data: RenderData, mats: PlantMaterials, extras: { fruit?: readonly FruitSite[] } = {}) {
    this.timeline = new RenderTimeline(data);
    this.group.name = `plants:${data.scenario}`;
    this.stemSpans = data.stems.filter((s) => s.bornDay.length >= 2).map((s) => [s.bornDay[0]!, s.removedDay[0]!]);

    const assets = new Map<string, TaxonAssets | null>(data.plants.map((p) => [p.id, assetsFor(p.taxonId)]));
    this.withoutOrgans = data.plants.filter((p) => !assets.get(p.id)).map((p) => p.label);
    const flowering = new Set(data.flowers.map((f) => f.plantId));
    this.withoutFlowers = data.plants.filter((p) => flowering.has(p.id) && assets.get(p.id) && !assets.get(p.id)!.flower).map((p) => p.label);

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
    const leafRecords = new Map<LeafAsset, LeafRecord[]>();
    data.leaves.forEach((leaf, n) => {
      const asset = assets.get(leaf.plantId)?.leaf;
      if (!asset) return;
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
      const record: LeafRecord = { m: new Float32Array(m4.elements), c: [tone, tone, tone], a, x: p.x, y: p.y, z: p.z, variant: asset.pick(leaf.lengthM, r1), rank: hash2(n, 5), leaf, stem, pointIndex, outX, outY, outZ };
      const list = leafRecords.get(asset);
      if (list) list.push(record);
      else leafRecords.set(asset, [record]);
    });
    for (const [asset, records] of leafRecords) {
      const pool = new LodPool({
        geometries: geometriesOf(asset),
        materials: mats.leaf(asset),
        attrs: [
          { name: 'aState', size: 4 },
          { name: 'aHost', size: 4 },
          { name: 'aSup', size: 4 },
          { name: 'aSeat', size: 4 },
        ],
        records,
        depth: depthMaterial('leaf'),
      });
      pool.group.name = asset.key;
      this.group.add(pool.group);
      this.leafPools.push({ asset, pool });
    }

    // ---- flowers -----------------------------------------------------------------
    const flowerRecords = new Map<FlowerAsset, FlowerRecord[]>();
    data.flowers.forEach((flower, n) => {
      const asset = assets.get(flower.plantId)?.flower;
      if (!asset) return;
      const r1 = hash2(n, 23);
      const scale = flower.lengthM / asset.authoredSize;
      three(flower.position, p);
      m4.compose(p, q.setFromEuler(e.set(0, hash2(n, 29) * Math.PI * 2, 0)), scl.set(scale, scale, scale));
      const tone = 0.92 + 0.16 * r1;
      const warm = (hash2(n, 7) - 0.5) * 0.08;
      const a = new Float32Array(8);
      // how much room it has to swing is not in the data: each model swings as freely as its habit suggests
      a.set([asset.swing, r1, 0, 0], 4);
      const record: FlowerRecord = { m: new Float32Array(m4.elements), c: [tone * (1 + warm), tone, tone * (1 - warm)], a, x: p.x, y: p.y - flower.lengthM * asset.centreDrop, z: p.z, variant: asset.pick(hash2(n, 31)), rank: hash2(n, 37), flower };
      const list = flowerRecords.get(asset);
      if (list) list.push(record);
      else flowerRecords.set(asset, [record]);
    });
    for (const [asset, records] of flowerRecords) {
      const material = mats.flower(asset);
      const pool = new LodPool({
        geometries: geometriesOf(asset),
        materials: Array.from({ length: asset.lods }, () => material),
        attrs: [
          { name: 'aState', size: 4 },
          { name: 'aInst', size: 4 },
        ],
        records,
        depth: depthMaterial('raceme'),
      });
      pool.group.name = asset.key;
      this.group.add(pool.group);
      this.flowerPools.push({ asset, pool });
    }

    // ---- fruit (not in the contract yet: only the test plant supplies any) --------
    const fruitRecords: FruitRecord[] = (extras.fruit ?? []).map((fruit, n) => {
      const scale = fruit.lengthM / POD_AUTHORED_LENGTH_M;
      three(fruit.position, p);
      m4.compose(p, q.setFromEuler(e.set(0, hash2(n, 41) * Math.PI * 2, 0)), scl.set(scale, scale, scale));
      return { m: new Float32Array(m4.elements), c: [1, 1, 1], a: new Float32Array(4), x: p.x, y: p.y, z: p.z, variant: 0, rank: 0, fruit };
    });
    POD ??= makePodGeometry();
    this.fruit = new LodPool({ geometries: [[POD]], materials: [mats.pod], attrs: [{ name: 'aState', size: 4 }], records: fruitRecords, depth: depthMaterial('pod') });
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

    for (const { asset, pool } of this.leafPools) {
      pool.update(camera, {
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
        dist: [1.6 * k * asset.detailReach, 5 * k * asset.detailReach],
        caps: [Math.round(lerp(0, 60, fine)), Math.round(lerp(40, 800, detail * detail))],
      });
    }

    for (const { asset, pool } of this.flowerPools) {
      pool.update(camera, {
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
        dist: asset.detailAt.map((d) => d * k),
        // the finest model only at high detail; the rest in growing numbers
        caps: asset.detailCaps.map((cap, i) => Math.round(i === 0 ? lerp(0, cap, fine) : lerp(cap * 0.08, cap, detail * detail))),
      });
    }

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
    const sum = (pools: { pool: { visible: number; triangles: number } }[], key: 'visible' | 'triangles') => pools.reduce((n, p) => n + p.pool[key], 0);
    return {
      stems: this.stemSpans.reduce((n, [born, removed]) => n + (born <= day && (removed < 0 || day < removed) ? 1 : 0), 0),
      leaves: sum(this.leafPools, 'visible'),
      flowers: sum(this.flowerPools, 'visible'),
      fruit: this.fruit.visible,
      triangles: (this.woodGeometry.index?.count ?? 0) / 3 + sum(this.leafPools, 'triangles') + sum(this.flowerPools, 'triangles') + this.fruit.triangles,
    };
  }

  dispose(): void {
    this.woodGeometry.dispose();
    for (const { pool } of this.leafPools) pool.dispose();
    for (const { pool } of this.flowerPools) pool.dispose();
    this.fruit.dispose();
  }
}
