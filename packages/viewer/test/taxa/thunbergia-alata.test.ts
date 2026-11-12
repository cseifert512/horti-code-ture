// Thunbergia alata (black-eyed Susan vine): its look against what is recorded of its shape, and its year on the
// specimen frame as the engine grows it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  Calendar,
  appendagePresent,
  characterNumber,
  characterRange,
  flowerState,
  fruitState,
  hasCharacter,
  known,
  leafState,
  param,
  parseGrowthModel,
  parseMorphology,
  parseTaxon,
  readBower,
  seasonsOf,
  stemPointAlive,
  toRenderData,
} from '@horti/core';
import { growPlanting } from '../../src/plant/grow.ts';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { look } from '../../src/plant/taxa/thunbergia-alata.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';

const ID = 'thunbergia-alata';
const read = (path: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8'));
const morphology = parseMorphology(read(`species/${ID}/morphology.json`), 'morphology.json');
const model = parseGrowthModel(read(`species/${ID}/model.json`), 'model.json');
const profile = parseTaxon(read(`species/${ID}/taxon.json`), 'taxon.json');
const middle = (r: readonly [number, number]) => (r[0] + r[1]) / 2;
const V3 = THREE.Vector3;

/** The vertices of a model with their part tag: pivot and t (see TAXON_LOOKS.md section 4). */
function vertices(g: THREE.BufferGeometry): { p: THREE.Vector3; pivot: THREE.Vector3; t: number; v: number }[] {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  return Array.from({ length: pos.count }, (_, i) => ({ p: new V3().fromBufferAttribute(pos, i), pivot: new V3(part.getX(i), part.getY(i), part.getZ(i)), t: part.getW(i), v: uv ? uv.getY(i) : 0 }));
}

/** Length of a stalk laid down by Merge.tube from the origin: its rings are tagged -1 at the foot to -2 at the far end, each pivoting on its own centre. */
function stalkLength(g: THREE.BufferGeometry): number {
  const rings = new Map<number, THREE.Vector3>();
  for (const x of vertices(g)) if (x.t < -1 || (x.t === -1 && x.pivot.length() < 1e-9)) rings.set(x.t, x.pivot);
  const along = [...rings].sort((a, b) => b[0] - a[0]).map(([, c]) => c);
  let length = 0;
  for (let i = 1; i < along.length; i++) length += along[i]!.distanceTo(along[i - 1]!);
  return length;
}

/** The limb of a flower model: its middle, the way it faces, how far it reaches, how many lobes its edge is in, and where the lobes begin. */
function limbOf(g: THREE.BufferGeometry): { centre: THREE.Vector3; facing: THREE.Vector3; reach: number; lobes: number; inner: number; base: THREE.Vector3 } {
  const corolla = vertices(g).filter((x) => x.t >= 0);
  const base = corolla[0]!.pivot;
  // the limb is the part of the corolla farthest from where it joins: take its outer points to find its plane
  const far = Math.max(...corolla.map((x) => x.p.distanceTo(base)));
  const outer = corolla.filter((x) => x.p.distanceTo(base) > 0.8 * far).map((x) => x.p);
  const rough = outer.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / outer.length);
  const a = outer.reduce((best, p) => (p.distanceTo(rough) > best.distanceTo(rough) ? p : best), outer[0]!);
  const e1 = a.clone().sub(rough).normalize();
  const b = outer.reduce((best, p) => (new V3().crossVectors(p.clone().sub(rough), e1).length() > new V3().crossVectors(best.clone().sub(rough), e1).length() ? p : best), outer[0]!);
  const facing = new V3().crossVectors(e1, b.clone().sub(rough)).normalize();
  if (facing.dot(rough.clone().sub(base)) < 0) facing.negate();
  const e2 = new V3().crossVectors(facing, e1);
  // its middle: the lobes are alike all round it, so the middle of every point in its plane is the middle of the flower
  const inPlane = corolla.filter((x) => Math.abs(x.p.clone().sub(rough).dot(facing)) <= 0.004).map((x) => x.p);
  const centre = inPlane.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / inPlane.length);
  const flat: { r: number; at: number }[] = [];
  let inner = Infinity;
  for (const x of corolla) {
    const d = x.p.clone().sub(centre);
    // only what lies in the plane of the limb: the tube runs back from it
    if (Math.abs(d.dot(facing)) > 0.004) continue;
    const r = Math.hypot(d.dot(e1), d.dot(e2));
    if (r < 0.001) continue;
    flat.push({ r, at: ((Math.atan2(d.dot(e2), d.dot(e1)) / Math.PI) * 180 + 360) % 360 });
    if (Math.abs(d.dot(facing)) < 0.0012) inner = Math.min(inner, r);
  }
  const reach = Math.max(...flat.map((x) => x.r));
  // the tips of the lobes: the points near the full reach fall into as many groups round the flower as it has lobes,
  // with the notches between them
  const tips = flat
    .filter((x) => x.r > 0.92 * reach)
    .map((x) => x.at)
    .sort((x, y) => x - y);
  // a gap between two lobes is much wider than the step from one point of a lobe's tip to the next
  const gaps = tips.map((at, i) => (tips[(i + 1) % tips.length]! - at + 360) % 360);
  const lobes = gaps.filter((gap) => gap > 0.6 * Math.max(...gaps)).length;
  return { centre, facing, reach, lobes, inner, base };
}

// TAXON_LOOKS.md section 8: "A number that describes the real plant does not belong in drawing code. It is entered
// in species/<id>/morphology.json with its evidence status and source ... and read from there."
describe('Thunbergia alata: the look is drawn from morphology.json', () => {
  it('has every character the module reads, each with a value', () => {
    for (const key of [
      'leaf.bladeLengthM',
      'leaf.petioleLengthM',
      'leaf.widthToLength',
      'leaf.petioleWingWidthM',
      'leaf.teethPerSide',
      'leaf.basalVeins',
      'flower.pedicelLengthM',
      'flower.bracteoleCount',
      'flower.bracteoleLengthM',
      'flower.bracteoleWidthM',
      'flower.tubeLengthM',
      'flower.widthM',
      'flower.lobeCount',
      'flower.lobeLengthM',
      'flower.calyxLengthM',
      'flower.calyxLobeCount',
      'fruit.baseDiameterM',
      'fruit.beakLengthM',
    ]) {
      expect(hasCharacter(morphology, key), key).toBe(true);
    }
    // what nobody has recorded stays unknown: how long a flower lasts, how thick an old stem gets
    expect(hasCharacter(morphology, 'flower.lifeDays')).toBe(false);
    expect(hasCharacter(morphology, 'stem.oldDiameterM')).toBe(false);
    expect(look.provisional).toBe(false);
  });

  // "leaf blades about 3-8 x 3-7.5 cm", "petioles about 2.5-3.5 cm long" (Australian Tropical Rainforest Plants)
  it('gives the leaf a stalk and a blade in the proportion of the published lengths', () => {
    const stalk = middle(characterRange(morphology, 'leaf.petioleLengthM'));
    const blade = middle(characterRange(morphology, 'leaf.bladeLengthM'));
    for (let v = 0; v < look.leaves.default.variants; v++) {
      const g = look.leaves.default.make(v, 0);
      // the stalk is axis; it ends where the blade begins
      const stalkEnd = Math.max(...vertices(g).filter((x) => x.t < 0).map((x) => x.p.z));
      expect(stalkEnd, `variant ${v}`).toBeCloseTo(stalk / (stalk + blade), 1);
    }
    // and the growth model's leaf, which is stalk and blade together, is made of the same two lengths
    const [short, long] = param(model, 'organs.leafLengthM');
    const pet = characterRange(morphology, 'leaf.petioleLengthM');
    const bl = characterRange(morphology, 'leaf.bladeLengthM');
    expect(short).toBeCloseTo(pet[0] + bl[0], 6);
    expect(long).toBeLessThanOrEqual(pet[1] + bl[1] + 1e-9);
    expect(long).toBeGreaterThan(pet[1] + middle(bl));
  });

  // leaf.base: "cordate-hastate at base" (Wasshausen & Wood); "outward-pointing basal lobes" (Botany Brisbane)
  it('draws an arrow-shaped blade: widest across its basal lobes, as wide for its length as the published leaves, drawn to a point', () => {
    const ratio = characterRange(morphology, 'leaf.widthToLength');
    for (let v = 0; v < look.leaves.default.variants; v++) {
      for (let lod = 0; lod < look.leaves.default.lods; lod++) {
        // the blade is what carries the texture's veins; the wing of the stalk samples one row of it
        const blade = vertices(look.leaves.default.make(v, lod)).filter((x) => x.t >= 0 && x.v > 0.15);
        const join = blade[0]!.pivot;
        const tip = blade.reduce((best, x) => (x.p.distanceTo(join) > best.p.distanceTo(join) ? x : best), blade[0]!).p;
        const axis = tip.clone().sub(join);
        const length = axis.length();
        axis.normalize();
        const xs = blade.map((x) => x.p.x);
        const width = Math.max(...xs) - Math.min(...xs);
        expect(width / length, `variant ${v} level ${lod}`).toBeGreaterThan(ratio[0] - 0.03);
        expect(width / length, `variant ${v} level ${lod}`).toBeLessThan(ratio[1] + 0.03);
        // the widest point is at the base, level with the top of the stalk, not half way up as in an oval leaf
        const widest = blade.reduce((best, x) => (Math.abs(x.p.x) > Math.abs(best.p.x) ? x : best), blade[0]!).p;
        expect(widest.clone().sub(join).dot(axis) / length, `variant ${v} level ${lod}`).toBeLessThan(0.15);
        // and some of the blade reaches back behind the top of the stalk: the basal lobes
        expect(Math.min(...blade.map((x) => x.p.clone().sub(join).dot(axis))) / length, `variant ${v} level ${lod}`).toBeLessThan(-0.05);
        // near the tip it is narrow: a point, not a rounded end
        const nearTip = blade.filter((x) => x.p.clone().sub(join).dot(axis) / length > 0.85).map((x) => Math.abs(x.p.x));
        expect(Math.max(...nearTip) / (width / 2), `variant ${v} level ${lod}`).toBeLessThan(0.45);
      }
    }
  });

  // leaf.petioleWing: "petioles ... distinctly winged over much of their length" (Australian Tropical Rainforest Plants)
  it('wings the leaf stalk, the wing widening towards the blade and no wider than recorded', () => {
    const wing = characterRange(morphology, 'leaf.petioleWingWidthM');
    const leafM = middle(characterRange(morphology, 'leaf.petioleLengthM')) + middle(characterRange(morphology, 'leaf.bladeLengthM'));
    for (let lod = 0; lod < look.leaves.default.lods; lod++) {
      const strip = vertices(look.leaves.default.make(1, lod)).filter((x) => x.t >= 0 && x.v < 0.1);
      expect(strip.length, `level ${lod}`).toBeGreaterThan(3);
      const at = (z0: number, z1: number) => Math.max(...strip.filter((x) => x.p.z >= z0 && x.p.z <= z1).map((x) => Math.abs(x.p.x))) * 2 * leafM;
      const zs = strip.map((x) => x.p.z);
      const [from, to] = [Math.min(...zs), Math.max(...zs)];
      const narrow = at(from, from + 0.02);
      const wide = at(to - 0.02, to);
      expect(wide, `level ${lod}`).toBeGreaterThan(narrow);
      expect(narrow, `level ${lod}`).toBeGreaterThan(wing[0] * 0.8);
      expect(wide, `level ${lod}`).toBeLessThan(wing[1] * 1.1);
    }
  });

  // flower.lobeCount, flower.widthM, flower.lobeLengthM, flower.tubeLengthM (Weeds of Australia); flower.eyeShareOfWidth
  // and flower.lobeFreeShare (read from photographs)
  it('draws a flower of five lobes round a small eye, as wide, as long in the lobe and as long in the tube as the published flower', () => {
    const lobes = characterNumber(morphology, 'flower.lobeCount');
    const width = characterRange(morphology, 'flower.widthM');
    const lobe = characterRange(morphology, 'flower.lobeLengthM');
    const tube = characterRange(morphology, 'flower.tubeLengthM');
    const eye = characterRange(morphology, 'flower.eyeShareOfWidth');
    const flower = look.flowers!.default;
    for (let v = 0; v < flower.variants; v++) {
      for (let lod = 0; lod < flower.lods; lod++) {
        const limb = limbOf(flower.make(v, lod));
        // five lobes with a notch between each and the next, at every level of detail
        expect(limb.lobes, `variant ${v} level ${lod}`).toBe(lobes);
        expect(2 * limb.reach, `variant ${v} level ${lod}`).toBeGreaterThan(width[0]);
        expect(2 * limb.reach, `variant ${v} level ${lod}`).toBeLessThan(width[1]);
        // from where the corolla joins to the plane of the limb
        const depth = limb.centre.clone().sub(limb.base).dot(limb.facing);
        expect(depth, `variant ${v} level ${lod}`).toBeGreaterThan(tube[0]);
        expect(depth, `variant ${v} level ${lod}`).toBeLessThan(tube[1]);
        // the coarsest model has a disc for its eye and no mouth to measure
        if (lod === flower.lods - 1) continue;
        expect(limb.reach - limb.inner, `variant ${v} level ${lod}`).toBeGreaterThan(lobe[0]);
        expect(limb.reach - limb.inner, `variant ${v} level ${lod}`).toBeLessThan(lobe[1]);
        expect(limb.inner / limb.reach, `variant ${v} level ${lod}`).toBeGreaterThan(eye[0] * 0.85);
        expect(limb.inner / limb.reach, `variant ${v} level ${lod}`).toBeLessThan(eye[1]);
      }
    }
  });

  // the brief, "Three mistakes the kit makes easy", 2: "A flower's authoredSize must be what the growth model's
  // organs.racemeLengthM measures for your plant"
  it('authors the flower at the width of one flower, which is what the growth model gives as its size', () => {
    const flower = look.flowers!.default;
    expect(flower.authoredSize).toBeCloseTo(middle(characterRange(morphology, 'flower.widthM')), 9);
    expect(param(model, 'organs.racemeLengthM')).toEqual(characterRange(morphology, 'flower.widthM'));
    expect(flower.poise).toBe('held');
    expect(model.names.flowerHeld).toBe('facing_out');
  });

  // flower.pedicelLengthM: "on pedicels 30-95 mm long"; flower.bracteoleLengthM: "12-20 mm long" (Weeds of Australia)
  it('holds each flower and each capsule on a stalk of published length, in two bracts of published length', () => {
    const stalk = characterRange(morphology, 'flower.pedicelLengthM');
    const bract = characterRange(morphology, 'flower.bracteoleLengthM');
    expect(characterNumber(morphology, 'flower.bracteoleCount')).toBe(2);
    for (const organ of [look.flowers!.default, look.fruits!.default]) {
      for (let v = 0; v < organ.variants; v++) {
        const g = organ.make(v, 0);
        expect(stalkLength(g), `${organ.key} variant ${v}`).toBeGreaterThan(stalk[0]);
        expect(stalkLength(g), `${organ.key} variant ${v}`).toBeLessThan(stalk[1]);
        // what persists at the end of the stalk: the bracts (and in a flower the little calyx; in a fruit the capsule)
        const held = vertices(g).filter((x) => x.t === -1 && x.pivot.length() > 1e-9);
        const base = held[0]!.pivot;
        // one bract to either side of the line of the stalk
        expect(Math.min(...held.map((x) => x.p.x - base.x)), organ.key).toBeLessThan(-0.003);
        expect(Math.max(...held.map((x) => x.p.x - base.x)), organ.key).toBeGreaterThan(0.003);
        if (organ === look.flowers!.default) {
          const reach = Math.max(...held.map((x) => x.p.distanceTo(base)));
          expect(reach, `variant ${v}`).toBeGreaterThan(bract[0]);
          expect(reach, `variant ${v}`).toBeLessThan(bract[1]);
        }
      }
    }
  });

  // TAXON_LOOKS.md section 4: "whatever outlasts the petals must be axis"; SPECIES_PROFILE.md, Form: "The corolla falls
  // in one piece and leaves the bracts."
  it('lets the corolla open and drop as one piece about where it joins, and leaves stalk and bracts standing', () => {
    const flower = look.flowers!.default;
    for (let lod = 0; lod < flower.lods; lod++) {
      const all = vertices(flower.make(0, lod));
      const corolla = all.filter((x) => x.t >= 0);
      const stays = all.filter((x) => x.t < 0);
      expect(corolla.length).toBeGreaterThan(10);
      expect(stays.length).toBeGreaterThan(10);
      // one pivot for the whole corolla, so that it shrinks into the bracts and not into five places
      for (const x of corolla) expect(x.pivot.distanceTo(corolla[0]!.pivot)).toBeLessThan(1e-9);
      // its parts open nearly together
      expect(Math.max(...corolla.map((x) => x.t))).toBeLessThan(0.1);
      // the pivot is at the end of the stalk, inside the bracts
      const end = Math.max(...stays.map((x) => x.pivot.y));
      expect(corolla[0]!.pivot.y).toBeCloseTo(end, 3);
    }
  });

  // fruit.baseDiameterM, fruit.beakLengthM: "a globular base 5-10 mm across and an elongated beak 9-15 mm long";
  // fruit.baseHeightToWidth (read from a photograph)
  it('authors the capsule at the height of its low round base and its beak together, as the growth model measures it', () => {
    const across = characterRange(morphology, 'fruit.baseDiameterM');
    const beak = characterRange(morphology, 'fruit.beakLengthM');
    const low = characterNumber(morphology, 'fruit.baseHeightToWidth');
    const capsule = look.fruits!.default;
    expect(capsule.authoredSize).toBeCloseTo(low * middle(across) + middle(beak), 9);
    const length = known(model, 'fruit.lengthM')!;
    expect(length[0]).toBeCloseTo(low * across[0] + beak[0], 9);
    expect(length[1]).toBeCloseTo(low * across[1] + beak[1], 9);
    expect(model.names.fruitHeld).toBe('facing_out');
    for (let v = 0; v < capsule.variants; v++) {
      const held = vertices(capsule.make(v, 0)).filter((x) => x.t === -1 && x.pivot.length() > 1e-9);
      const foot = held[0]!.pivot;
      // the way the capsule runs: the bracts stand evenly to either side of it, so the middle of everything lies on its line
      const on = held
        .reduce((sum, x) => sum.add(x.p), new V3())
        .multiplyScalar(1 / held.length)
        .sub(foot)
        .normalize();
      // the end of the beak is the farthest point on that line, a capsule's length from the foot
      const onLine = held.map((x) => x.p.clone().sub(foot)).filter((d) => d.clone().addScaledVector(on, -d.dot(on)).length() < 0.003);
      const reach = Math.max(...onLine.map((d) => d.dot(on)));
      expect(reach, `variant ${v}`).toBeGreaterThan(capsule.authoredSize * 0.9);
      expect(reach, `variant ${v}`).toBeLessThan(capsule.authoredSize * 1.05);
      // and it shows beyond the bracts, which stand apart from it
      const bractTips = held.map((x) => x.p.clone().sub(foot)).filter((d) => d.clone().addScaledVector(on, -d.dot(on)).length() > 0.006);
      expect(Math.max(...bractTips.map((d) => d.dot(on))), `variant ${v}`).toBeLessThan(reach);
    }
  });

  // TAXON_LOOKS.md section 6: "Every asset states a budget: the most triangles it has at each level."
  it('builds every model at every level of detail, finite, within its budget, each level lighter than the one before', () => {
    const kinds = assetsOf(look).map((a) => `${a.kind}:${a.form}`);
    expect(kinds).toEqual(['leaf:default', 'flower:default', 'fruit:default']);
    for (const { kind, asset } of assetsOf(look)) {
      expect(asset.key.startsWith(`${ID}/`)).toBe(true);
      expect(asset.lods).toBe(3);
      for (let v = 0; v < asset.variants; v++) {
        let finer = Infinity;
        for (let lod = 0; lod < asset.lods; lod++) {
          const g = asset.make(v, lod);
          const n = triangles(g);
          expect(n, `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          expect(asset.budget[lod]!, asset.key).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
          expect(n, `${asset.key} variant ${v} level ${lod}`).toBeLessThan(finer);
          finer = n;
          const position = g.getAttribute('position').array;
          for (let i = 0; i < position.length; i++) if (!Number.isFinite(position[i])) throw new Error(`${asset.key} ${v}/${lod}: position ${i} is not finite`);
        }
      }
    }
    // a stem twiner: nothing to hold on with but its stems
    expect(look.appendages).toEqual({});
  });
});

// SPECIES_PROFILE.md, "Form: what the model draws", and the months its sources give. Every answer is the core's
// (render/presence.ts): nothing here works a season out for itself.
describe('Thunbergia alata on the specimen frame, as the engine grows it', () => {
  const years = 3;
  const frame = readBower(read('examples/specimen-frame.bower.json'), 'examples/specimen-frame.bower.json');
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, new Map([[ID, { profile, model }]]), 'trained', years);
  const data = toRenderData(sim);
  const cal = new Calendar(data.start);
  const year = cal.dateOf(data.lastDay).year;
  const day = (monthDay: string, y = year) => cal.dayOf(`${y}-${monthDay}`);
  const leavesOn = (d: number) => data.leaves.filter((l) => leafState(l, seasonsOf(data, cal.dateOf(d).year).get(l.plantId), d).present).length;
  const flowers = (d: number, phase: 'open' | 'in_bud') => data.flowers.filter((f) => flowerState(f, d).phase === phase).length;
  const fruit = (d: number) => data.fruits.map((f) => fruitState(f, d)).filter((s) => s.phase !== 'absent');
  const stemsOn = (d: number) => data.stems.filter((s) => s.bornDay.some((_, i) => stemPointAlive(s, i, d)));

  // taxon.json: "It offers nothing in winter." HORTICULTURAL_INTERVENTIONS.md, annual replant: set out each May.
  it('is not there from the first frosts until it is set out again in May: no stem, leaf, flower or fruit', () => {
    for (const y of [year - 1, year]) {
      for (const md of ['01-15', '02-15', '03-15', '04-15', '05-15', '11-15', '12-15']) {
        const d = day(md, y);
        expect(stemsOn(d), `${y}-${md}`).toHaveLength(0);
        expect(leavesOn(d), `${y}-${md}`).toBe(0);
        expect(data.flowers.filter((f) => flowerState(f, d).phase !== 'absent'), `${y}-${md}`).toHaveLength(0);
        expect(fruit(d), `${y}-${md}`).toHaveLength(0);
      }
    }
  });

  // leaf.arrangement: "opposite" (Weeds of Australia)
  it('is in leaf from June to October, the leaves in opposite pairs', () => {
    expect(leavesOn(day('06-15'))).toBeGreaterThan(20);
    for (const md of ['07-15', '08-15', '09-15', '10-15']) expect(leavesOn(day(md)), md).toBeGreaterThan(100);
    expect(leavesOn(day('09-15'))).toBeGreaterThan(leavesOn(day('07-15')));
    // two leaves at every node of every stem, facing opposite ways across it
    const nodes = new Map<string, (typeof data.leaves)[number][]>();
    for (const l of data.leaves) nodes.set(`${l.stemId}|${l.position.join(',')}`, [...(nodes.get(`${l.stemId}|${l.position.join(',')}`) ?? []), l]);
    for (const [where, pair] of nodes) expect(pair.length, where).toBe(2);
  });

  // RHS: flowers "from summer to early autumn"; seed houses July to October. CLAUDE.md: "A flowering month is an
  // envelope, not a trigger."
  it('flowers from July into October, not before and not after, with buds ahead of the first flowers', () => {
    expect(flowers(day('06-15'), 'open')).toBe(0);
    expect(flowers(day('06-30'), 'in_bud')).toBeGreaterThan(0);
    for (const md of ['07-20', '08-15', '09-15', '10-05']) expect(flowers(day(md), 'open'), md).toBeGreaterThan(0);
    expect(flowers(day('09-15'), 'open')).toBeGreaterThan(flowers(day('07-20'), 'open'));
    expect(flowers(day('10-25'), 'open')).toBe(0);
    for (const f of data.flowers) {
      const opened = cal.dateOf(f.openDay);
      expect(opened.month >= 7 || (opened.month === 6 && opened.dayOfMonth >= 29), opened.iso).toBe(true);
      expect(opened.month, opened.iso).toBeLessThanOrEqual(10);
      // each flower is one flower: as wide as the published flower, and held facing out
      expect(f.lengthM).toBeGreaterThanOrEqual(characterRange(morphology, 'flower.widthM')[0] - 1e-6);
      expect(f.lengthM).toBeLessThanOrEqual(characterRange(morphology, 'flower.widthM')[1] + 1e-6);
      expect(f.direction).toBeDefined();
    }
  });

  // fruit.colour: "ripens and dries to tan", seed "often produced late in the season" (Wisconsin Extension)
  it('carries capsules from late summer, ripe ones from August on, and none that outlives the plant', () => {
    expect(data.fruits.length).toBeGreaterThan(10);
    expect(fruit(day('07-01'))).toHaveLength(0);
    expect(fruit(day('09-15')).length).toBeGreaterThan(3);
    expect(fruit(day('10-15')).length).toBeGreaterThan(3);
    expect(fruit(day('07-31')).filter((s) => s.ripeness > 0)).toHaveLength(0);
    expect(fruit(day('10-25')).filter((s) => s.phase === 'ripe').length).toBeGreaterThan(0);
    for (const f of data.fruits) expect(f.removedDay).toBeGreaterThan(0);
    // fewer capsules than flowers: most flowers set nothing
    expect(data.fruits.length).toBeLessThan(data.flowers.length / 2);
  });

  // RHS: 1.5 to 2.5 m high. CLAUDE.md: "Height is not route length."
  it('makes a plant between 1.5 and 2.5 m high by September, of stems no longer than 2.5 m and a millimetre or two thick', () => {
    const d = day('09-30');
    const on = stemsOn(d);
    expect(on.length).toBe(param(model, 'architecture.trunkStemStartYears').length);
    const top = Math.max(...on.flatMap((s) => s.bornDay.map((_, i) => (stemPointAlive(s, i, d) ? s.contact[3 * i + 2]! : 0))));
    const [low, high] = characterRange(morphology, 'stem.diameterM');
    expect(top).toBeGreaterThan(1.5);
    expect(top).toBeLessThan(2.5);
    for (const s of on) {
      let length = 0;
      for (let i = 1; i < s.bornDay.length; i++) length += Math.hypot(s.contact[3 * i]! - s.contact[3 * i - 3]!, s.contact[3 * i + 1]! - s.contact[3 * i - 2]!, s.contact[3 * i + 2]! - s.contact[3 * i - 1]!);
      expect(length, s.id).toBeLessThanOrEqual(2.5 + 0.05);
      for (const r of s.radiusMm) {
        expect((2 * r) / 1000).toBeGreaterThanOrEqual(low);
        expect((2 * r) / 1000).toBeLessThanOrEqual(high);
      }
    }
  });

  // Wisconsin Extension: "It does not cling or use tendrils." CLAUDE.md: "Mechanism traits do not transfer."
  it('holds on with its stems alone: the cable it twines by itself, the timber only where it is tied', () => {
    expect(data.appendages.filter((a) => appendagePresent(a, day('08-15')))).toHaveLength(0);
    expect(data.appendages).toHaveLength(0);
    expect(profile.attachment.mechanism).toBe('stem_twining');
    const runs = [...sim.axes.values()].filter((a) => a.bornYear === year).flatMap((a) => a.runs);
    const { graph } = sim.scenario.bower;
    const onCable = runs.filter((r) => graph.edges.get(r.edgeId)!.kind === 'cable');
    const onTimber = runs.filter((r) => graph.edges.get(r.edgeId)!.kind === 'timber');
    expect(onCable.length).toBeGreaterThan(0);
    expect(onTimber.length).toBeGreaterThan(0);
    for (const r of onCable) expect(r).toMatchObject({ by: 'plant', mode: 'twine' });
    for (const r of onTimber) expect(r.by).not.toBe('plant');
  });
});
