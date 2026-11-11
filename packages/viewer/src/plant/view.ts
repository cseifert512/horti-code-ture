// Draws the plants of a RenderData: stems as tubes, and leaves, flowers, fruit
// and the small parts a plant holds on with as instanced organs with per-organ
// level of detail. Ported from buildPlant in the prototype
// (Wisteria/src/plant.js); the difference is where time comes from. Here every
// "is it there, and in what state" is answered by the adapter (adapter.ts) from
// the engine's days.
//
// Each plant is drawn with the look of its own taxon (taxa/<id>.ts, through
// registry.ts): its leaf, flower and fruit models in the form the data names,
// its own wood. A plant whose taxon has no models gets the stand-in, and what
// could not be drawn is listed here so that the caption can say so.
import * as THREE from 'three';
import type { AppendageKind, RenderAppendage, RenderData, RenderFlower, RenderFruit, RenderLeaf, RenderStem } from '@horti/core';
import type { TexturePair } from '../textures.ts';
import { clamp, hash2, lerp } from '../util.ts';
import { RenderTimeline, agedShare } from './adapter.ts';
import { LodPool, type LodRecord } from './lod.ts';
import { type AppendageAsset, type FlowerAsset, type FruitAsset, type LeafAsset, type OrganModel, type Poise, type TaxonLook, type WoodLook, formOf } from './look.ts';
import { lookFor } from './registry.ts';
import { depthMaterial, patch } from './shaders.ts';
import { buildWoodGeometry } from './wood.ts';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const TAU = Math.PI * 2;

const three = (t: readonly [number, number, number], out = new V3()): THREE.Vector3 => out.set(t[0], t[2], -t[1]);

/** Materials are made once and kept: one set per organ model and one bark per taxon, since each carries its taxon's colours. */
export interface PlantMaterials {
  /** The bark of one taxon, and the material its shadow is cast with. */
  wood(look: TaxonLook): { material: THREE.Material; depth: THREE.Material };
  /** [near, near, far] for the three levels of detail of a leaf. */
  leaf(asset: LeafAsset): THREE.Material[];
  flower(asset: FlowerAsset): THREE.Material;
  fruit(asset: FruitAsset): THREE.Material;
  appendage(asset: AppendageAsset): THREE.Material;
}

/** `bark` makes the bark texture for a grain (WoodLook.grain; undefined is the default fissured bark). */
export function makePlantMaterials({ bark, leafTex }: { bark: (grain: WoodLook['grain']) => TexturePair; leafTex: THREE.Texture }): PlantMaterials {
  const barks = new Map<string, TexturePair>();
  const woods = new Map<string, { material: THREE.Material; depth: THREE.Material }>();
  const leaves = new Map<string, THREE.Material[]>();
  const flowers = new Map<string, THREE.Material>();
  const fruits = new Map<string, THREE.Material>();
  const appendages = new Map<string, THREE.Material>();
  return {
    wood(look) {
      let w = woods.get(look.taxonId);
      if (!w) {
        const grain = JSON.stringify(look.wood.grain ?? null);
        let tex = barks.get(grain);
        if (!tex) barks.set(grain, (tex = bark(look.wood.grain)));
        const material = patch(new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: look.wood.relief, roughness: look.wood.roughness }), 'wood', { wood: look.wood });
        woods.set(look.taxonId, (w = { material, depth: depthMaterial('wood', { wood: look.wood }) }));
      }
      return w;
    },
    leaf(asset) {
      let m = leaves.get(asset.key);
      if (!m) {
        const options = { translucency: asset.translucency, palette: asset.palette };
        const near = patch(new THREE.MeshStandardMaterial({ map: leafTex, bumpMap: leafTex, bumpScale: 1.2, roughness: asset.roughness, side: THREE.DoubleSide }), 'leaf', options);
        const far = patch(new THREE.MeshStandardMaterial({ map: leafTex, roughness: Math.min(1, asset.roughness + 0.1), side: THREE.DoubleSide }), 'leaf', options);
        leaves.set(asset.key, (m = [near, near, far]));
      }
      return m;
    },
    flower(asset) {
      let m = flowers.get(asset.key);
      if (!m) flowers.set(asset.key, (m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), 'flower', { translucency: asset.translucency, sheen: asset.sheen, budTint: asset.budTint })));
      return m;
    },
    fruit(asset) {
      let m = fruits.get(asset.key);
      if (!m) fruits.set(asset.key, (m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: asset.roughness, side: THREE.DoubleSide }), 'fruit', { ripe: asset.ripe, ripeShade: asset.ripeShade })));
      return m;
    },
    appendage(asset) {
      let m = appendages.get(asset.key);
      if (!m) appendages.set(asset.key, (m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: asset.roughness, side: THREE.DoubleSide }), 'appendage', { aged: asset.aged })));
      return m;
    },
  };
}

// organ geometry does not depend on the data: build each model once, when first needed
const GEOMETRY = new Map<string, THREE.BufferGeometry[][]>();
function geometriesOf(asset: OrganModel): THREE.BufferGeometry[][] {
  let g = GEOMETRY.get(asset.key);
  if (!g) GEOMETRY.set(asset.key, (g = Array.from({ length: asset.variants }, (_, v) => Array.from({ length: asset.lods }, (_, l) => asset.make(v, l)))));
  return g;
}

/** Where an organ stands on its stem: the stem and the point of it nearest the organ, and the way out to the stem's surface. */
interface Seat {
  /** Null if the data names no such stem. */
  stem: RenderStem | null;
  pointIndex: number;
  /** away from the support + the organ's own direction: the way out from the contact line to the stem's surface */
  outX: number;
  outY: number;
  outZ: number;
}
interface LeafRecord extends LodRecord, Seat {
  leaf: RenderLeaf;
}
interface FlowerRecord extends LodRecord {
  flower: RenderFlower;
}
interface FruitRecord extends LodRecord {
  fruit: RenderFruit;
}
interface AppendageRecord extends LodRecord, Seat {
  appendage: RenderAppendage;
}

export interface PlantStats {
  stems: number;
  leaves: number;
  /** Flowers and flowerheads the core counts as open, and those still in bud. Both are drawn. */
  flowers: number;
  buds: number;
  fruit: number;
  /** Tendrils, coiled leaf stalks, patches of rootlets and prickles. */
  appendages: number;
  triangles: number;
}

/** How the camera distance turns into levels of detail for a model that states its own distances and caps. */
function stated(asset: { detailAt: readonly number[]; detailCaps: readonly number[] }, k: number, fine: number, detail: number): { dist: number[]; caps: number[] } {
  return {
    dist: asset.detailAt.map((d) => d * k),
    // the finest model only at high detail; the rest in growing numbers
    caps: asset.detailCaps.map((cap, i) => Math.round(i === 0 ? lerp(0, cap, fine) : lerp(cap * 0.08, cap, detail * detail))),
  };
}

export class PlantView {
  readonly group = new THREE.Group();
  readonly timeline: RenderTimeline;
  /** Labels of plants drawn with the stand-in look, because there are no organ models for their taxon. */
  readonly provisionalLooks: string[];
  /** Labels of plants that flower in the data but have no flower model, so are drawn without flowers. */
  readonly withoutFlowers: string[];
  /** Labels of plants that fruit in the data but have no fruit model. */
  readonly withoutFruit: string[];
  /** Plants that have tendrils, coiled stalks, rootlets or prickles in the data and no model for them: "label (kind, kind)". */
  readonly withoutAppendages: string[];
  /** Forms the data names that a plant's look does not have, drawn in its ordinary form: "label: leaf form "adult"". */
  readonly unknownForms: string[];
  private readonly wood: { geometry: THREE.BufferGeometry; triangles: number }[] = [];
  private readonly leafPools: { asset: LeafAsset; look: TaxonLook; pool: LodPool<LeafRecord> }[] = [];
  private readonly flowerPools: { asset: FlowerAsset; pool: LodPool<FlowerRecord> }[] = [];
  private readonly fruitPools: { asset: FruitAsset; pool: LodPool<FruitRecord> }[] = [];
  private readonly appendagePools: { asset: AppendageAsset; look: TaxonLook; pool: LodPool<AppendageRecord> }[] = [];
  /** Day the base of each stem was laid down and day it was removed (-1: never). */
  private readonly stemSpans: [number, number][];
  private day = 0;
  private open = 0;

  constructor(data: RenderData, mats: PlantMaterials) {
    this.timeline = new RenderTimeline(data);
    this.group.name = `plants:${data.scenario}`;
    this.stemSpans = data.stems.filter((s) => s.bornDay.length >= 2).map((s) => [s.bornDay[0]!, s.removedDay[0]!]);

    const looks = new Map<string, TaxonLook>(data.plants.map((p) => [p.id, lookFor(p.taxonId)]));
    const labels = new Map(data.plants.map((p) => [p.id, p.label]));
    const plantsWith = (ids: Iterable<string>) => {
      const set = new Set(ids);
      return data.plants.filter((p) => set.has(p.id));
    };
    this.provisionalLooks = data.plants.filter((p) => looks.get(p.id)!.provisional).map((p) => p.label);
    this.withoutFlowers = plantsWith(data.flowers.map((f) => f.plantId))
      .filter((p) => !looks.get(p.id)!.flowers)
      .map((p) => p.label);
    this.withoutFruit = plantsWith(data.fruits.map((f) => f.plantId))
      .filter((p) => !looks.get(p.id)!.fruits)
      .map((p) => p.label);
    const missingKinds = new Map<string, Set<AppendageKind>>();
    for (const a of data.appendages) {
      const look = looks.get(a.plantId);
      if (!look || look.appendages[a.kind]) continue;
      if (!missingKinds.has(a.plantId)) missingKinds.set(a.plantId, new Set());
      missingKinds.get(a.plantId)!.add(a.kind);
    }
    this.withoutAppendages = [...missingKinds].map(([id, kinds]) => `${labels.get(id)} (${[...kinds].map((k) => k.replaceAll('_', ' ')).join(', ')})`);
    const unknown = new Set<string>();
    const noteForm = (plantId: string, organ: string, form: string | undefined, forms: object | null | undefined) => {
      if (form !== undefined && form !== 'default' && forms && !(form in forms)) unknown.add(`${labels.get(plantId)}: ${organ} form "${form}"`);
    };

    // ---- wood: the stems of each taxon in its own bark ---------------------------
    const stemsByLook = new Map<TaxonLook, { stems: RenderStem[]; index: number[] }>();
    const orphan = lookFor('');
    data.stems.forEach((stem, index) => {
      const look = looks.get(stem.plantId) ?? orphan;
      let group = stemsByLook.get(look);
      if (!group) stemsByLook.set(look, (group = { stems: [], index: [] }));
      group.stems.push(stem);
      group.index.push(index);
    });
    for (const [look, { stems, index }] of stemsByLook) {
      const { geometry } = buildWoodGeometry(stems, (at) => index[at]!);
      const { material, depth } = mats.wood(look);
      const wood = new THREE.Mesh(geometry, material);
      wood.name = `stems:${look.taxonId}`;
      wood.castShadow = wood.receiveShadow = true;
      wood.frustumCulled = false;
      wood.customDepthMaterial = depth;
      this.group.add(wood);
      this.wood.push({ geometry, triangles: (geometry.index?.count ?? 0) / 3 });
    }

    const m4 = new THREE.Matrix4();
    const roll = new THREE.Matrix4();
    const X = new V3();
    const Y = new V3();
    const Z = new V3();
    const axis = new V3();
    const scl = new V3();
    const p = new V3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();

    // each leaf, tendril and prickle stands on a point of its stem: find it, to seat the
    // organ on the stem's surface as the stem thickens and to sway it with that stem
    const stems = new Map(data.stems.map((s, index) => [s.id, { s, index }]));
    /** Fills a record's aHost (offset 4) and aSup (offset 8), and says where on its stem the organ stands. `Z` is the organ's direction, `p` its position. */
    const seat = (stemId: string, position: readonly [number, number, number], r1: number, a: Float32Array): Seat => {
      const host = stems.get(stemId);
      if (!host) {
        a.set([p.x, p.y, p.z, r1], 4);
        return { stem: null, pointIndex: 0, outX: 0, outY: 0, outZ: 0 };
      }
      const { s, index } = host;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < s.bornDay.length; i++) {
        const d = (s.contact[3 * i]! - position[0]) ** 2 + (s.contact[3 * i + 1]! - position[1]) ** 2 + (s.contact[3 * i + 2]! - position[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const away = three([s.away[3 * best]!, s.away[3 * best + 1]!, s.away[3 * best + 2]!]);
      // aHost: base of the bearing stem (its centre at the end of the run), and its phase
      const base = three([s.contact[0]!, s.contact[1]!, s.contact[2]!]).addScaledVector(three([s.away[0]!, s.away[1]!, s.away[2]!]), s.radiusMm[0]! / 1000);
      a.set([base.x, base.y, base.z, hash2(index, 17)], 4);
      a.set([away.x, away.y, away.z, 0], 8);
      return { stem: s, pointIndex: best, outX: away.x + Z.x, outY: away.y + Z.y, outZ: away.z + Z.z };
    };
    /** A frame with +Z along `direction` (core frame) and +Y as far towards the sky as it will go, rolled a little about +Z. Leaves Z set. */
    const along = (direction: readonly [number, number, number], rollBy: number, length: number) => {
      three(direction, Z).normalize();
      X.crossVectors(UP, Z);
      if (X.lengthSq() < 1e-4) X.set(1, 0, 0);
      X.normalize();
      Y.crossVectors(Z, X);
      m4.makeBasis(X, Y, Z);
      m4.multiply(roll.makeRotationZ(rollBy));
      m4.scale(scl.set(length, length, length));
    };
    /**
     * How a flower or fruit is turned (see Poise in look.ts). With no direction it is as authored, turned to a compass
     * bearing of its own. With one, the model's axis goes on to it and the model's +Z as far towards the sky as it will.
     * Leaves `axis` set to the way the organ runs from its attachment.
     */
    const hold = (poise: Poise, direction: readonly [number, number, number] | undefined, bearing: number) => {
      const sign = poise === 'hangs' ? -1 : 1;
      if (direction) three(direction, axis).normalize();
      else axis.set(0, sign, 0);
      // plumb, in the sense the model was authored in: nothing to turn but the bearing
      if (!direction || axis.y * sign > 0.999) {
        q.setFromEuler(e.set(0, bearing, 0));
        return;
      }
      Y.copy(axis).multiplyScalar(sign);
      Z.copy(UP).addScaledVector(Y, -UP.dot(Y));
      // told to run straight against the way it was authored: any side will do for the sky side
      if (Z.lengthSq() < 1e-6) Z.set(Math.cos(bearing), 0, Math.sin(bearing));
      Z.normalize();
      X.crossVectors(Y, Z);
      q.setFromRotationMatrix(m4.makeBasis(X, Y, Z));
    };
    const collect = <A, R>(map: Map<A, R[]>, asset: A, record: R) => {
      const list = map.get(asset);
      if (list) list.push(record);
      else map.set(asset, [record]);
    };

    // ---- leaves ----------------------------------------------------------------
    const leafRecords = new Map<LeafAsset, LeafRecord[]>();
    const lookOfLeaf = new Map<LeafAsset, TaxonLook>();
    data.leaves.forEach((leaf, n) => {
      const look = looks.get(leaf.plantId);
      if (!look) return;
      noteForm(leaf.plantId, 'leaf', leaf.form, look.leaves);
      const asset = formOf(look.leaves, leaf.form);
      lookOfLeaf.set(asset, look);
      const r1 = hash2(n, 3);
      along(leaf.direction, (r1 - 0.5) * 0.9, leaf.lengthM);
      three(leaf.position, p);
      m4.setPosition(p);
      const tone = 0.88 + 0.24 * r1;
      const a = new Float32Array(16);
      const at = seat(leaf.stemId, leaf.position, r1, a);
      collect(leafRecords, asset, { m: new Float32Array(m4.elements), c: [tone, tone, tone], a, x: p.x, y: p.y, z: p.z, variant: asset.pick(leaf.lengthM, r1), rank: hash2(n, 5), leaf, ...at });
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
      this.leafPools.push({ asset, look: lookOfLeaf.get(asset)!, pool });
    }

    // ---- flowers -----------------------------------------------------------------
    const flowerRecords = new Map<FlowerAsset, FlowerRecord[]>();
    data.flowers.forEach((flower, n) => {
      const forms = looks.get(flower.plantId)?.flowers;
      if (!forms) return;
      noteForm(flower.plantId, 'flower', flower.form, forms);
      const asset = formOf(forms, flower.form);
      const r1 = hash2(n, 23);
      const scale = flower.lengthM / asset.authoredSize;
      three(flower.position, p);
      hold(asset.poise, flower.direction, hash2(n, 29) * TAU);
      m4.compose(p, q, scl.set(scale, scale, scale));
      const tone = 0.92 + 0.16 * r1;
      const warm = (hash2(n, 7) - 0.5) * 0.08;
      const a = new Float32Array(8);
      // how much room it has to swing is not in the data: each model swings as freely as its habit suggests
      a.set([asset.swing, r1, 0, 0], 4);
      const reach = flower.lengthM * asset.centreAlong;
      collect(flowerRecords, asset, { m: new Float32Array(m4.elements), c: [tone * (1 + warm), tone, tone * (1 - warm)], a, x: p.x + axis.x * reach, y: p.y + axis.y * reach, z: p.z + axis.z * reach, variant: asset.pick(hash2(n, 31)), rank: hash2(n, 37), flower });
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
        depth: depthMaterial('flower'),
      });
      pool.group.name = asset.key;
      this.group.add(pool.group);
      this.flowerPools.push({ asset, pool });
    }

    // ---- fruit ---------------------------------------------------------------------
    const fruitRecords = new Map<FruitAsset, FruitRecord[]>();
    data.fruits.forEach((fruit, n) => {
      const forms = looks.get(fruit.plantId)?.fruits;
      if (!forms) return;
      noteForm(fruit.plantId, 'fruit', fruit.form, forms);
      const asset = formOf(forms, fruit.form);
      const scale = fruit.lengthM / asset.authoredSize;
      three(fruit.position, p);
      hold(asset.poise, fruit.direction, hash2(n, 41) * TAU);
      m4.compose(p, q, scl.set(scale, scale, scale));
      const a = new Float32Array(4);
      a[2] = asset.swing;
      const reach = fruit.lengthM * asset.centreAlong;
      collect(fruitRecords, asset, { m: new Float32Array(m4.elements), c: [1, 1, 1], a, x: p.x + axis.x * reach, y: p.y + axis.y * reach, z: p.z + axis.z * reach, variant: asset.pick(hash2(n, 43)), rank: 0, fruit });
    });
    for (const [asset, records] of fruitRecords) {
      const material = mats.fruit(asset);
      const pool = new LodPool({ geometries: geometriesOf(asset), materials: Array.from({ length: asset.lods }, () => material), attrs: [{ name: 'aState', size: 4 }], records, depth: depthMaterial('fruit') });
      pool.group.name = asset.key;
      this.group.add(pool.group);
      this.fruitPools.push({ asset, pool });
    }

    // ---- what the plant holds on with ------------------------------------------------
    const appendageRecords = new Map<AppendageAsset, AppendageRecord[]>();
    const lookOfAppendage = new Map<AppendageAsset, TaxonLook>();
    data.appendages.forEach((appendage, n) => {
      const look = looks.get(appendage.plantId);
      const asset = look?.appendages[appendage.kind];
      if (!look || !asset) return;
      lookOfAppendage.set(asset, look);
      const r1 = hash2(n, 53);
      along(appendage.direction, (r1 - 0.5) * 0.5, appendage.lengthM);
      three(appendage.position, p);
      m4.setPosition(p);
      const a = new Float32Array(16);
      a[2] = asset.swing;
      a[3] = r1;
      const at = seat(appendage.stemId, appendage.position, r1, a);
      const tone = 0.9 + 0.2 * hash2(n, 59);
      collect(appendageRecords, asset, { m: new Float32Array(m4.elements), c: [tone, tone, tone], a, x: p.x, y: p.y, z: p.z, variant: asset.pick(hash2(n, 61), appendage.holding, appendage.heldDiameterMm), rank: hash2(n, 67), appendage, ...at });
    });
    for (const [asset, records] of appendageRecords) {
      const material = mats.appendage(asset);
      const pool = new LodPool({
        geometries: geometriesOf(asset),
        materials: Array.from({ length: asset.lods }, () => material),
        attrs: [
          { name: 'aState', size: 4 },
          { name: 'aHost', size: 4 },
          { name: 'aSup', size: 4 },
          { name: 'aSeat', size: 4 },
        ],
        records,
        depth: depthMaterial('appendage'),
      });
      pool.group.name = asset.key;
      this.group.add(pool.group);
      this.appendagePools.push({ asset, look: lookOfAppendage.get(asset)!, pool });
    }
    this.unknownForms = [...unknown];
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
    /** Writes what an organ takes from the stem it stands on: how freely that stem still sways (aSup.w) and the way out to its surface (aSeat). */
    const seatOn = (r: Seat & LodRecord, stiffDays: readonly [number, number]) => {
      if (!r.stem) return;
      // young wood sways and carries what grows on it
      r.a[11] = 1 - agedShare(t.stemAgeDays(r.stem, r.pointIndex, day), stiffDays);
      const radius = t.stemRadiusM(r.stem, r.pointIndex, day);
      r.a[12] = r.outX * radius;
      r.a[13] = r.outY * radius;
      r.a[14] = r.outZ * radius;
    };

    for (const { asset, look, pool } of this.leafPools) {
      pool.update(camera, {
        alive: (r) => {
          const s = t.leafDraw(r.leaf, day);
          if (!s.visible) return false;
          r.a[0] = s.expansion;
          r.a[1] = s.colour;
          seatOn(r, look.wood.stiffDays);
          return true;
        },
        density,
        dist: [1.6 * k * asset.detailReach, 5 * k * asset.detailReach],
        caps: [Math.round(lerp(0, 60, fine)), Math.round(lerp(40, 800, detail * detail))],
      });
    }

    this.open = 0;
    for (const { asset, pool } of this.flowerPools) {
      pool.update(camera, {
        alive: (r) => {
          const s = t.flowerDraw(r.flower, day);
          if (!s.visible) return false;
          if (s.open) this.open++;
          const a = r.a;
          a[0] = s.elongation;
          a[1] = s.bloom;
          a[2] = s.shed;
          a[3] = 1;
          return true;
        },
        density,
        ...stated(asset, k, fine, detail),
      });
    }

    for (const { asset, pool } of this.fruitPools) {
      pool.update(camera, {
        alive: (r) => {
          const s = t.fruitDraw(r.fruit, day);
          if (!s.visible) return false;
          r.a[0] = s.size;
          r.a[1] = s.ripeness;
          return true;
        },
        ...stated(asset, k, fine, detail),
      });
    }

    for (const { asset, look, pool } of this.appendagePools) {
      pool.update(camera, {
        alive: (r) => {
          const s = t.appendageDraw(r.appendage, day);
          if (!s.visible) return false;
          r.a[1] = asset.aged ? agedShare(s.ageDays, asset.agedDays) : 0;
          seatOn(r, look.wood.stiffDays);
          return true;
        },
        density,
        ...stated(asset, k, fine, detail),
      });
    }
  }

  /** What is on the plants on the day last shown. */
  stats(): PlantStats {
    const day = this.day;
    const sum = (pools: { pool: { visible: number; triangles: number } }[], key: 'visible' | 'triangles') => pools.reduce((n, p) => n + p.pool[key], 0);
    return {
      stems: this.stemSpans.reduce((n, [born, removed]) => n + (born <= day && (removed < 0 || day < removed) ? 1 : 0), 0),
      leaves: sum(this.leafPools, 'visible'),
      flowers: this.open,
      buds: sum(this.flowerPools, 'visible') - this.open,
      fruit: sum(this.fruitPools, 'visible'),
      appendages: sum(this.appendagePools, 'visible'),
      triangles: this.wood.reduce((n, w) => n + w.triangles, 0) + sum(this.leafPools, 'triangles') + sum(this.flowerPools, 'triangles') + sum(this.fruitPools, 'triangles') + sum(this.appendagePools, 'triangles'),
    };
  }

  dispose(): void {
    for (const w of this.wood) w.geometry.dispose();
    for (const { pool } of [...this.leafPools, ...this.flowerPools, ...this.fruitPools, ...this.appendagePools]) pool.dispose();
  }
}
