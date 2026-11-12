// Clematis 'Etoile Violette' (Viticella Group): what is drawn agrees with what is recorded of the plant, every model
// builds within its budget, and a plant grown by the engine on the specimen frame has its leaves, flowers and seed in
// the months its sources give. The numbers of the plant are read from its own files; none is typed in here.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  Calendar,
  type Growable,
  type RenderData,
  type RenderStem,
  appendagePresent,
  characterNumber,
  characterOf,
  characterRange,
  flowerState,
  fruitState,
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
import { growPlanting, lastDateOf } from '../../src/plant/grow.ts';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { loadLooks } from '../../src/plant/registry.ts';
import { look } from '../../src/plant/taxa/clematis-viticella-etoile-violette.ts';
import { PlantView } from '../../src/plant/view.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';
import { camera, materials } from '../helpers.ts';

const ID = 'clematis-viticella-etoile-violette';
const file = (path: string): string => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));
const json = (path: string): unknown => JSON.parse(readFileSync(file(path), 'utf8'));
const morphology = parseMorphology(json(`species/${ID}/morphology.json`), `species/${ID}/morphology.json`);
const model = parseGrowthModel(json(`species/${ID}/model.json`), `species/${ID}/model.json`);
const profile = parseTaxon(json(`species/${ID}/taxon.json`), `species/${ID}/taxon.json`);
const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;

// ---- reading a model back ---------------------------------------------------------------------------
interface Vertex {
  p: THREE.Vector3;
  pivot: THREE.Vector3;
  t: number;
  colour: THREE.Vector3;
}
function vertices(g: THREE.BufferGeometry): Vertex[] {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const col = g.getAttribute('color');
  return Array.from({ length: pos.count }, (_, i) => ({
    p: new THREE.Vector3().fromBufferAttribute(pos, i),
    pivot: new THREE.Vector3(part.getX(i), part.getY(i), part.getZ(i)),
    t: part.getW(i),
    colour: col ? new THREE.Vector3().fromBufferAttribute(col, i) : new THREE.Vector3(),
  }));
}
const key = (v: THREE.Vector3): string => `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;
function groupBy<T>(items: readonly T[], of: (item: T) => string | number): T[][] {
  const groups = new Map<string | number, T[]>();
  for (const item of items) {
    const k = of(item);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return [...groups.values()];
}
/** The widest a set of points reaches, tip to opposite tip. */
function span(points: readonly THREE.Vector3[]): number {
  let widest = 0;
  const step = Math.max(1, Math.floor(points.length / 300));
  for (let i = 0; i < points.length; i += step) for (let j = i + 1; j < points.length; j += step) widest = Math.max(widest, points[i]!.distanceTo(points[j]!));
  return widest;
}
const centroid = (points: readonly THREE.Vector3[]): THREE.Vector3 => points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);

/** The leaflets of a leaf model: the parts that are blades, each with the point where it joins. */
const leafletsOf = (g: THREE.BufferGeometry): Vertex[][] => groupBy(vertices(g).filter((v) => v.t >= 0), (v) => key(v.pivot));
/** The length of a leaflet, and its width for its length. */
function leafletShape(blade: readonly Vertex[]): { length: number; widthToLength: number } {
  const base = blade[0]!.pivot;
  let tip = base;
  for (const v of blade) if (v.p.distanceTo(base) > tip.distanceTo(base)) tip = v.p;
  const along = tip.clone().sub(base);
  const length = along.length();
  along.normalize();
  let half = 0;
  for (const v of blade) {
    const off = v.p.clone().sub(base);
    half = Math.max(half, off.addScaledVector(along, -off.dot(along)).length());
  }
  return { length, widthToLength: (2 * half) / length };
}

/** A tepal is the only part of a cyme that is violet: more blue than anything else. */
const isTepal = (v: Vertex): boolean => v.t >= 0 && v.colour.z > 1.6 * v.colour.y && v.colour.z > v.colour.x;
/** The flowers of a cyme model, each as its tepals, in the order they open. */
function flowersOf(g: THREE.BufferGeometry): Vertex[][][] {
  const tepals = groupBy(vertices(g).filter(isTepal), (v) => v.t).sort((a, b) => a[0]!.t - b[0]!.t);
  const flowers: Vertex[][][] = [];
  for (const tepal of tepals) {
    const last = flowers[flowers.length - 1];
    // the tepals of one flower open within a tenth of each other; the next flower a good deal later
    if (last && tepal[0]!.t - last[last.length - 1]![0]!.t < 0.2) last.push(tepal);
    else flowers.push([tepal]);
  }
  return flowers;
}

const leaf = look.leaves.default;
const cyme = look.flowers!.default;
const seedHeads = look.fruits!.default;
const clasp = look.appendages.leaf_stalk_coil!;

// =====================================================================================================
// TAXON_LOOKS.md section 8: "A number that describes the real plant does not belong in drawing code. It is entered in
// species/<id>/morphology.json with its evidence status and source ... counts and measured sizes (leaflets, tepals,
// the length of a leaflet for its width) come from the file."
// =====================================================================================================
describe('the leaf agrees with what is recorded of it', () => {
  const usual = characterNumber(morphology, 'leaf.leafletCount');
  const mostPairs = characterNumber(morphology, 'leaf.leafletPairsMost');
  const inThree = characterNumber(morphology, 'leaf.basalDivisionLeaflets');

  it('has five leaflets as a rule (RHS), and in its other forms three pairs (Darwin), a lowest pair divided in three (Bean), or three', () => {
    const counts = Array.from({ length: leaf.variants }, (_, v) => leafletsOf(leaf.make(v, 0)).length);
    expect(usual).toBe(5);
    expect(counts[0]).toBe(usual);
    // lobing does not change the count
    expect(counts[1]).toBe(usual);
    expect(counts[2]).toBe(2 * mostPairs + 1);
    expect(counts[3]).toBe(usual - 2 + 2 * inThree);
    expect(counts[4]).toBe(3);
    // an odd number always: pairs and an end leaflet
    for (const n of counts) expect(n % 2).toBe(1);
    // and the same leaf at every level of detail
    for (let v = 0; v < leaf.variants; v++) for (let lod = 1; lod < leaf.lods; lod++) expect(leafletsOf(leaf.make(v, lod)).length, `variant ${v} level ${lod}`).toBe(counts[v]);
  });

  it('is the plain leaf of five four times in ten, and every form is drawn', () => {
    const picked = Array.from({ length: 1000 }, (_, i) => leaf.pick(0.115, (i + 0.5) / 1000));
    expect(picked.filter((v) => v === 0).length).toBe(400);
    expect(new Set(picked).size).toBe(leaf.variants);
  });

  it('is one unit long from the stem to the tip of its end leaflet, and its stalk is the share recorded', () => {
    for (let v = 0; v < leaf.variants; v++) {
      const g = leaf.make(v, 0);
      g.computeBoundingBox();
      expect(g.boundingBox!.max.z, `variant ${v}`).toBeCloseTo(1, 3);
      expect(g.boundingBox!.min.z, `variant ${v}`).toBeGreaterThan(-0.02);
    }
    // the lowest pair of the usual leaf joins the axis where the stalk ends
    const joins = leafletsOf(leaf.make(0, 0)).map((b) => b[0]!.pivot.z);
    expect(Math.min(...joins)).toBeGreaterThan(characterNumber(morphology, 'leaf.stalkShare') * 0.85);
    expect(Math.min(...joins)).toBeLessThan(characterNumber(morphology, 'leaf.stalkShare') * 1.6);
  });

  it('has leaflets no longer and no shorter than Bean gives for a leaf of the length he gives', () => {
    const [leafShort, leafLong] = characterRange(morphology, 'leaf.lengthM');
    const [short, long] = characterRange(morphology, 'leaf.leafletLengthM');
    for (let v = 0; v < leaf.variants; v++) {
      for (const blade of leafletsOf(leaf.make(v, 0))) {
        const { length } = leafletShape(blade);
        // on the shortest leaf it is not under his shortest leaflet, on the longest not over his longest
        expect(length * leafLong, `variant ${v}`).toBeLessThanOrEqual(long * 1.02);
        expect(length * leafShort, `variant ${v}`).toBeGreaterThanOrEqual(short);
      }
    }
  });

  it('has leaflets from lance-shaped to broadly ovate: as wide for their length as is recorded', () => {
    const [narrow, broad] = characterRange(morphology, 'leaf.leafletWidthToLength');
    // the plain leaves: a lobe widens a leaflet beyond its outline
    for (const v of [0, 2, 4]) {
      for (const blade of leafletsOf(leaf.make(v, 0))) {
        const { widthToLength } = leafletShape(blade);
        expect(widthToLength, `variant ${v}`).toBeGreaterThan(narrow * 0.9);
        expect(widthToLength, `variant ${v}`).toBeLessThan(broad * 1.1);
      }
    }
    // and a lobed leaflet is wider than a plain one of the same make
    const widest = (v: number) => Math.max(...leafletsOf(leaf.make(v, 0)).map((b) => leafletShape(b).widthToLength));
    expect(widest(1)).toBeGreaterThan(widest(0));
  });

  it('bends its axis downwards at each pair of leaflets, the end leaflet lowest (Darwin)', () => {
    for (let v = 0; v < leaf.variants; v++) {
      const joins = leafletsOf(leaf.make(v, 0))
        .map((b) => b[0]!.pivot)
        .sort((a, b) => a.z - b.z);
      // the end leaflet joins farthest out and lowest
      expect(joins[joins.length - 1]!.y, `variant ${v}`).toBeLessThan(joins[0]!.y);
      expect(joins[joins.length - 1]!.y, `variant ${v}`).toBeLessThan(-0.03);
    }
  });
});

describe('the cyme agrees with what is recorded of it', () => {
  const [fewest, most] = characterRange(morphology, 'flower.tepalCount');
  const three = characterNumber(morphology, 'inflorescence.flowerCount');
  const cymeLength = characterRange(morphology, 'inflorescence.lengthM');
  const flowerWidth = characterRange(morphology, 'flower.widthM');

  it('is three flowers on one stalk, or two where a side flower failed, each of four to six tepals (RHS)', () => {
    const drawn = Array.from({ length: cyme.variants }, (_, v) => flowersOf(cyme.make(v, 0)));
    expect(drawn.map((f) => f.length)).toEqual([three, three, three, three - 1]);
    const counts = new Set<number>();
    for (const flowers of drawn) {
      for (const flower of flowers) {
        expect(flower.length).toBeGreaterThanOrEqual(fewest);
        expect(flower.length).toBeLessThanOrEqual(most);
        counts.add(flower.length);
      }
    }
    // four, five and six are all drawn
    expect([...counts].sort()).toEqual([fewest, fewest + 1, most]);
    // the same flowers at every level of detail
    for (let v = 0; v < cyme.variants; v++) for (let lod = 1; lod < cyme.lods; lod++) expect(flowersOf(cyme.make(v, lod)).map((f) => f.length), `variant ${v} level ${lod}`).toEqual(drawn[v]!.map((f) => f.length));
  });

  // TAXON_LOOKS.md section 2: "authoredSize in the units of RenderFlower.lengthM ... What lengthM measures is the taxon's".
  it('is authored at the measure the growth model gives: the length of the cyme from the leaf axil to the face of its end flower', () => {
    expect(characterOf(morphology, 'inflorescence.lengthM').basis).toContain('authoredSize');
    expect(param(model, 'organs.racemeLengthM')).toEqual(cymeLength);
    expect(model.params['organs.racemeLengthM'].basis).toContain('from the leaf axil to the face of its end flower');
    expect(cyme.poise).toBe('held');
    for (let v = 0; v < cyme.variants; v++) {
      const end = flowersOf(cyme.make(v, 0))[0]!;
      const face = centroid(end.flat().map((t) => t.p));
      expect(face.length() / cyme.authoredSize, `variant ${v}`).toBeGreaterThan(0.9);
      expect(face.length() / cyme.authoredSize, `variant ${v}`).toBeLessThan(1.1);
      // it stands along +Y, the sky side +Z
      expect(face.y).toBeGreaterThan(0.85 * face.length());
    }
  });

  it('has flowers as wide, at the lengths the growth model gives a cyme, as the cultivar is recorded (5 to 10 cm)', () => {
    const forLength = mid(flowerWidth) / mid(cymeLength);
    for (let v = 0; v < cyme.variants; v++) {
      for (const flower of flowersOf(cyme.make(v, 0))) {
        const width = span(flower.flat().map((t) => t.p)) / cyme.authoredSize;
        expect(width / forLength, `variant ${v}`).toBeGreaterThan(0.85);
        expect(width / forLength, `variant ${v}`).toBeLessThan(1.12);
        for (const length of cymeLength) {
          expect(width * length).toBeGreaterThanOrEqual(flowerWidth[0]);
          expect(width * length).toBeLessThanOrEqual(flowerWidth[1]);
        }
      }
    }
  });

  it('has broad tepals, the broadest where a flower has four', () => {
    const [narrow, broad] = characterRange(morphology, 'flower.tepalWidthToLength');
    const byCount = new Map<number, number[]>();
    for (let v = 0; v < cyme.variants; v++) {
      for (const flower of flowersOf(cyme.make(v, 0))) {
        const centre = centroid(flower.flat().map((t) => t.p));
        for (const tepal of flower) {
          let tip = centre;
          for (const p of tepal) if (p.p.distanceTo(centre) > tip.distanceTo(centre)) tip = p.p;
          const along = tip.clone().sub(centre);
          const length = along.length();
          along.normalize();
          let half = 0;
          for (const p of tepal) {
            const off = p.p.clone().sub(centre);
            half = Math.max(half, off.addScaledVector(along, -off.dot(along)).length());
          }
          const list = byCount.get(flower.length) ?? [];
          list.push((2 * half) / length);
          byCount.set(flower.length, list);
        }
      }
    }
    const mean = (n: number) => byCount.get(n)!.reduce((a, b) => a + b, 0) / byCount.get(n)!.length;
    // measured from the middle of the flower, turned-back margins and all: within a seventh of what is recorded
    expect(mean(fewest)).toBeGreaterThan(narrow * 0.9);
    expect(mean(fewest)).toBeLessThan(broad * 1.15);
    expect(mean(most)).toBeGreaterThan(narrow * 0.85);
    expect(mean(fewest)).toBeGreaterThan(mean(most));
  });

  it('has a small boss of stamens: about a quarter as wide as the flower (RHS: "a small boss")', () => {
    const share = characterNumber(morphology, 'flower.bossWidthToFlower');
    const all = vertices(cyme.make(0, 0));
    const flowers = flowersOf(cyme.make(0, 0));
    // the stamens of a flower: the cream parts that open just after its tepals
    const cream = all.filter((v) => v.t >= 0 && v.t < 1 && !isTepal(v));
    const bosses = groupBy(cream, (v) => v.t).sort((a, b) => a[0]!.t - b[0]!.t);
    expect(bosses).toHaveLength(flowers.length);
    bosses.forEach((boss, i) => {
      const width = span(boss.map((v) => v.p)) / span(flowers[i]!.flat().map((t) => t.p));
      expect(width).toBeGreaterThan(share * 0.75);
      expect(width).toBeLessThan(share * 1.4);
      // they open after the tepals of their own flower and before the next flower
      expect(boss[0]!.t).toBeGreaterThan(Math.max(...flowers[i]!.map((t) => t[0]!.t)));
      if (flowers[i + 1]) expect(boss[0]!.t).toBeLessThan(flowers[i + 1]![0]![0]!.t);
    });
  });

  // TAXON_LOOKS.md section 4: "Before it opens a part is drawn at 30% of its size ... A part that has dropped is
  // gone, so whatever outlasts the petals must be axis." Here the 30% state of a tepal is the wall of a closed bud.
  it('is a closed, pointed, nodding bud before it opens, and nothing is left of a tepal that has dropped', () => {
    for (let v = 0; v < cyme.variants; v++) {
      for (const flower of flowersOf(cyme.make(v, 0))) {
        const open = flower.flat().map((t) => t.p);
        const width = span(open);
        const seat = centroid(open);
        // where the organ program draws an unopened part: three tenths of the way from its pivot
        const shut = flower.map((tepal) => tepal.map((p) => p.pivot.clone().lerp(p.p, 0.3)));
        const bud = shut.flat();
        const length = Math.max(...bud.map((p) => p.distanceTo(seat)));
        // a bud nearly as long as a tepal, and slender
        expect(length / (width / 2), `variant ${v}`).toBeGreaterThan(0.7);
        expect(length / (width / 2), `variant ${v}`).toBeLessThan(1.1);
        const axis = centroid(bud).sub(seat).normalize();
        const girth = Math.max(...bud.map((p) => p.clone().sub(seat).addScaledVector(axis, -p.clone().sub(seat).dot(axis)).length()));
        expect((2 * girth) / length, `variant ${v}`).toBeLessThan(0.5);
        // shut at its tip: the ends of all its tepals come together
        const tips = shut.map((tepal) => tepal.reduce((far, p) => (p.distanceTo(seat) > far.distanceTo(seat) ? p : far), seat));
        expect(span(tips) / width, `variant ${v}`).toBeLessThan(0.07);
        // it nods: it points below the way the open flower faces (the sky side of a cyme is +Z)
        expect(axis.z, `variant ${v}`).toBeLessThan(-0.7);
        // dropped: every row of the sheet has shrunk to a point, so the sheet has no area left
        for (const tepal of flower) {
          const rows = groupBy(tepal, (p) => key(p.pivot));
          expect(rows.length).toBeGreaterThan(2);
          expect(rows.length).toBeLessThan(tepal.length / 2);
        }
      }
    }
  });

  it('opens its end flower first and its side flowers after, and keeps its stalks and bracts when the flowers have gone', () => {
    const flowers = flowersOf(cyme.make(0, 0));
    const opens = flowers.map((f) => Math.min(...f.map((t) => t[0]!.t)));
    expect(opens[0]).toBeLessThan(0.1);
    expect(opens[1]! - opens[0]!).toBeGreaterThan(0.3);
    expect(opens[2]! - opens[1]!).toBeGreaterThan(0.2);
    // the end flower is the one farthest out along the cyme
    const out = flowers.map((f) => centroid(f.flat().map((t) => t.p)).y);
    expect(out[0]).toBeGreaterThan(Math.max(out[1]!, out[2]!));
    // axis: stalks and the pair of bracts
    const axis = vertices(cyme.make(0, 0)).filter((v) => v.t < 0);
    expect(axis.length).toBeGreaterThan(200);
    expect(Math.max(...axis.map((v) => v.p.y))).toBeGreaterThan(0.85);
    // no part opens later than the organ program can open it
    for (const v of vertices(cyme.make(0, 0))) expect(v.t).toBeLessThanOrEqual(1);
  });
});

describe('the seed heads and the clasp agree with what is recorded of them', () => {
  it('carries a small round head of achenes on each stalk that set, on the stalks of the cyme', () => {
    const three = characterNumber(morphology, 'inflorescence.flowerCount');
    const headWidth = mid(characterRange(morphology, 'fruit.headWidthM')) / mid(characterRange(morphology, 'inflorescence.lengthM'));
    const heads = (v: number) => {
      // an achene is a part with its own join; the heads are the places they gather
      const achenes = groupBy(vertices(seedHeads.make(v, 0)).filter((p) => p.t >= 0), (p) => key(p.pivot));
      const clusters: Vertex[][][] = [];
      for (const achene of achenes) {
        const near = clusters.find((c) => c[0]![0]!.pivot.distanceTo(achene[0]!.pivot) < 0.15);
        if (near) near.push(achene);
        else clusters.push([achene]);
      }
      return clusters;
    };
    expect([0, 1, 2].map((v) => heads(v).length)).toEqual([three, three - 1, 1]);
    for (const head of heads(0)) {
      expect(head.length).toBeGreaterThan(8);
      // the bodies alone, without their tails: most of the recorded width
      const width = span(head.flat().map((p) => p.p)) / seedHeads.authoredSize;
      expect(width / headWidth).toBeGreaterThan(0.6);
      expect(width / headWidth).toBeLessThan(1.1);
    }
    // the cluster is as long as the cyme was, and is held as the cyme was
    expect(known(model, 'fruit.lengthM')).toEqual(param(model, 'organs.racemeLengthM'));
    expect(seedHeads.authoredSize).toBe(cyme.authoredSize);
    expect(seedHeads.poise).toBe(cyme.poise);
    expect(model.names.fruitHeld).toBe(model.names.flowerHeld);
  });

  // contract.ts, RenderAppendage: "Where it has hold: the thickness of the member or cable it holds ... so that a
  // coil can be drawn to fit."
  it('winds a leaf stalk more than once round the cable it holds, clear of the cable, at the reach the growth model gives', () => {
    const reach = characterRange(morphology, 'hold.claspReachM');
    expect(known(model, 'appendages.leafStalkLengthM')).toEqual(reach);
    const cable = characterNumber(morphology, 'hold.heldDiameterMm');
    // what it is drawn round is something this plant can hold by itself
    expect(cable).toBeLessThanOrEqual(param(model, 'attachment.maxGraspDiameterMm'));
    const held = cable / 1000 / 2 / mid(reach);
    const stalk = characterNumber(morphology, 'hold.stalkThicknessMm') / 1000 / 2 / mid(reach);
    // the reach is the cable and a stalk on either side of it
    expect(mid(reach) * 1000).toBeGreaterThan(cable + characterNumber(morphology, 'hold.stalkThicknessMm'));
    expect(mid(reach) * 1000).toBeLessThan(cable + 3 * characterNumber(morphology, 'hold.stalkThicknessMm'));
    const g = clasp.make(clasp.pick(0.5, true, cable), 0);
    const pos = g.getAttribute('position');
    // the cable stands along +Y just in front of the origin, where the engine puts the stem against it
    const centre = new THREE.Vector2(0, held * 0.94);
    let turned = 0;
    let before: number | null = null;
    let inside = 0;
    const part = g.getAttribute('aPart');
    for (let i = 0; i < pos.count; i++) {
      // the centre line of the stalk is the pivot of each of its rings
      const at = new THREE.Vector2(part.getX(i), part.getZ(i)).sub(centre);
      if (at.length() < held + stalk * 0.9) inside++;
      const angle = Math.atan2(at.x, -at.y);
      if (before !== null && at.length() < held + 4 * stalk) {
        let step = angle - before;
        if (step > Math.PI) step -= 2 * Math.PI;
        if (step < -Math.PI) step += 2 * Math.PI;
        turned += step;
      }
      before = angle;
    }
    expect(Math.abs(turned) / (2 * Math.PI)).toBeGreaterThan(1.1);
    expect(Math.abs(turned) / (2 * Math.PI)).toBeLessThan(2);
    // only where it leaves the stem, which lies against the cable, is it within the cable's own thickness
    expect(inside / pos.count).toBeLessThan(0.08);
    // a stalk that found nothing is not wound at all
    expect(clasp.pick(0.5, false)).not.toBe(clasp.pick(0.5, true, cable));
  });
});

// =====================================================================================================
// TAXON_LOOKS.md section 6, "Levels of detail and triangle budgets": "Every asset states a budget: the most
// triangles it has at each level. The test builds every variant and fails if one is over, or if a budget is over
// the ceiling for its kind."
// =====================================================================================================
describe('every organ model of this clematis', () => {
  const assets = assetsOf(look);

  it('is the plant’s own: a leaf, a cyme, seed heads, a clasping leaf stalk and its wood, none of them a stand-in', () => {
    expect(look.taxonId).toBe(ID);
    expect(look.provisional).toBe(false);
    expect(assets.map((a) => `${a.kind} ${a.form}`).sort()).toEqual(['appendage leaf_stalk_coil', 'flower default', 'fruit default', 'leaf default']);
    for (const { asset } of assets) expect(asset.key.startsWith(`${ID}/`), asset.key).toBe(true);
    // a leaf-stalk climber has no tendrils, rootlets or prickles
    expect(Object.keys(look.appendages)).toEqual(['leaf_stalk_coil']);
    expect(profile.attachment.mechanism).toBe('petiole_twining');
  });

  it('builds at every level of detail: finite, and within the budget it states and the ceiling for its kind', () => {
    let built = 0;
    for (const { kind, asset } of assets) {
      expect(asset.budget).toHaveLength(asset.lods);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        if (lod > 0) expect(asset.budget[lod]!, asset.key).toBeLessThanOrEqual(asset.budget[lod - 1]!);
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          for (const name of ['position', 'normal', kind === 'leaf' ? 'uv' : 'color']) {
            const a = g.getAttribute(name);
            expect(a, `${asset.key} ${v}/${lod} ${name}`).toBeDefined();
            for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) throw new Error(`${asset.key} ${v}/${lod}: ${name} is not finite`);
          }
          expect(g.index, asset.key).not.toBeNull();
          expect(triangles(g), `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          built++;
        }
      }
      // each coarser level is lighter than the one before, for every variant
      for (let v = 0; v < asset.variants; v++) for (let lod = 1; lod < asset.lods; lod++) expect(triangles(asset.make(v, lod)), asset.key).toBeLessThan(triangles(asset.make(v, lod - 1)));
    }
    expect(built).toBe(leaf.variants * 3 + cyme.variants * 3 + seedHeads.variants * 3 + clasp.variants * 2);
  });

  it('keeps the far level cheap: what a whole Bower is drawn with', () => {
    const far = (asset: { make(v: number, lod: number): THREE.BufferGeometry; variants: number; lods: number }) => Math.max(...Array.from({ length: asset.variants }, (_, v) => triangles(asset.make(v, asset.lods - 1))));
    expect(far(leaf)).toBeLessThan(100);
    expect(far(cyme)).toBeLessThan(260);
    expect(far(seedHeads)).toBeLessThan(200);
    expect(far(clasp)).toBeLessThanOrEqual(64);
  });

  it('gives the same geometry each time it is asked', () => {
    for (const { asset } of assets) {
      const a = asset.make(asset.variants - 1, 0).getAttribute('position').array;
      const b = asset.make(asset.variants - 1, 0).getAttribute('position').array;
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i += 7) if (a[i] !== b[i]) throw new Error(`${asset.key} differs between builds`);
    }
  });
});

// =====================================================================================================
// CLAUDE.md: "No bare numbers about plants. Any growth rate, grasp diameter, threshold or probability enters as a
// Sourced value with an evidence status ... Do not relabel a guess as published."
// =====================================================================================================
describe('the growth model and the shape numbers', () => {
  it('say what they rest on: nothing is copied from the wisteria any more, and the statement says so truthfully', () => {
    for (const [name, p] of Object.entries(model.params)) expect((p.basis ?? '').startsWith('Copied from the Wisteria'), name).toBe(false);
    expect(model.statement).not.toContain('thinner than the wisteria model');
    expect(model.statement).toContain('not a calibrated one');
    expect(model.statement).toContain('none has been measured on a plant');
    // no parameter this plant needs is left unknown: fruit, clasp and side shoots are all switched on or off
    for (const [name, p] of Object.entries(model.params)) expect(p.status, name).not.toBe('unknown');
  });

  it('claim a source only where one was read, and leave unknown what none gives', () => {
    const published = Object.entries(morphology.characters).filter(([, c]) => c.status === 'published_plant_profile');
    expect(published.length).toBeGreaterThanOrEqual(20);
    for (const [name, c] of published) {
      expect(c.source, name).toMatch(/^https:\/\//);
      expect((c.basis ?? '').length, name).toBeGreaterThan(30);
    }
    for (const name of ['stem.internodeLengthM', 'stem.diameterMm', 'stem.oldBark', 'leaf.autumnColour', 'flower.reverseColour', 'flower.stamenCount', 'fruit.acheneCount', 'fruit.colourRipe', 'hold.stalkLengthM']) {
      expect(characterOf(morphology, name), name).toMatchObject({ value: null, status: 'unknown' });
    }
    // what the drawing needed and no source gave is marked as chosen
    for (const name of ['inflorescence.flowerCount', 'inflorescence.lengthM', 'leaf.leafletWidthToLength', 'leaf.stalkShare', 'flower.tepalWidthToLength', 'flower.bossWidthToFlower', 'fruit.headWidthM', 'hold.claspReachM']) {
      expect(characterOf(morphology, name).status, name).toBe('provisional_design_assumption');
    }
    // nothing here was measured on a plant
    for (const c of Object.values(morphology.characters)) expect(['measured', 'calibrated']).not.toContain(c.status);
    for (const p of Object.values(model.params)) expect(['measured', 'calibrated']).not.toContain(p.status);
  });

  it('agree with each other and with the taxon profile', () => {
    // the leaf the engine grows is the leaf Bean measures, to the centimetre
    const grown = param(model, 'organs.leafLengthM');
    const recorded = characterRange(morphology, 'leaf.lengthM');
    expect(Math.abs(grown[0] - recorded[0])).toBeLessThan(0.005);
    expect(Math.abs(grown[1] - recorded[1])).toBeLessThan(0.005);
    expect(param(model, 'organs.leavesPerNode')).toBe(2);
    expect(String(characterOf(morphology, 'leaf.arrangement').value)).toContain('pairs');
    // deciduous, flowering on the growth of the year, holding on by its leaf stalks
    expect(profile.leafHabit.value).toBe('deciduous');
    expect(param(model, 'organs.leafLifespanYears')).toBe(1);
    expect(profile.flowering.wood.value).toBe('current_season');
    expect(param(model, 'organs.spurChance')).toBe(0);
    // the height a stem can reach is the height the RHS gives
    const height = characterRange(morphology, 'habit.heightM');
    expect(height).toEqual(profile.size.rhsUltimateHeightM.value);
    expect(param(model, 'architecture.leaderLengthM')[1]).toBeLessThanOrEqual(height[1]);
    expect(param(model, 'extension.leaderMPerSeason')).toBeGreaterThanOrEqual(height[0]);
    expect(param(model, 'extension.leaderMPerSeason')).toBeLessThanOrEqual(height[1]);
    expect(model.names.flowerHeld).toBe('facing_out');
  });
});

// =====================================================================================================
// The brief, step 6: "from an engine run on the specimen frame, the plant has leaves, flowers and fruit in the
// months your sources give and not in the others (ask the core's render/presence.ts; never re-derive seasons)."
// CLAUDE.md: "A flowering month is an envelope, not a trigger."
// =====================================================================================================
describe('a specimen grown by the engine, cut down each February', () => {
  const YEARS = 6;
  const frame = readBower(json('examples/specimen-frame.bower.json'), 'examples/specimen-frame.bower.json');
  const taxa: Growable = new Map([[ID, { profile, model }]]);
  const grow = (care: 'trained' | 'untended'): RenderData => toRenderData(growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, taxa, care, YEARS).sim);
  const data = grow('trained');
  const cal = new Calendar(data.start);
  const last = Number(lastDateOf(YEARS).slice(0, 4));
  const dayOf = (monthDay: string, year = last): number => cal.dayOf(`${year}-${monthDay}`);
  const leavesOn = (day: number): number => {
    const seasons = seasonsOf(data, cal.dateOf(day).year);
    return data.leaves.filter((l) => leafState(l, seasons.get(l.plantId), day).present).length;
  };
  const openOn = (day: number): number => data.flowers.filter((f) => flowerState(f, day).phase === 'open').length;
  const budsOn = (day: number): number => data.flowers.filter((f) => flowerState(f, day).phase === 'in_bud').length;
  const seedOn = (day: number): number => data.fruits.filter((f) => fruitState(f, day).phase !== 'absent').length;
  /** Stem length alive on a day, and the highest point of it. */
  const stemsOn = (day: number): { lengthM: number; highestM: number; stems: number } => {
    let lengthM = 0;
    let highestM = 0;
    let stems = 0;
    for (const s of data.stems) {
      let any = false;
      for (let i = 0; i < s.bornDay.length; i++) {
        if (!stemPointAlive(s, i, day)) continue;
        highestM = Math.max(highestM, s.contact[3 * i + 2]!);
        if (i > 0 && stemPointAlive(s, i - 1, day)) {
          lengthM += Math.hypot(s.contact[3 * i]! - s.contact[3 * i - 3]!, s.contact[3 * i + 1]! - s.contact[3 * i - 2]!, s.contact[3 * i + 2]! - s.contact[3 * i - 1]!);
          any = true;
        }
      }
      if (any) stems++;
    }
    return { lengthM, highestM, stems };
  };

  it('is deciduous: in leaf from April to October, bare in January, February and at Christmas (RHS: foliage deciduous)', () => {
    for (const month of ['05', '06', '07', '08', '09', '10']) expect(leavesOn(dayOf(`${month}-15`)), month).toBeGreaterThan(200);
    expect(leavesOn(dayOf('04-15'))).toBeGreaterThan(40);
    for (const date of ['01-15', '02-15', '12-20']) expect(leavesOn(dayOf(date)), date).toBe(0);
    for (const l of data.leaves) expect(l.evergreen).toBe(false);
    // every leaf is on the growth of the year: none carries over
    for (const l of data.leaves) expect(l.lastYear).toBe(l.firstYear);
  });

  it('flowers in July, August and into September, and in no other season (RHS mid to late summer; Clematis on the Web July to September)', () => {
    for (const date of ['07-20', '08-01', '08-15', '09-01']) expect(openOn(dayOf(date)), date).toBeGreaterThan(10);
    expect(openOn(dayOf('07-10'))).toBeGreaterThan(0);
    // the height of the display is in August
    expect(openOn(dayOf('08-10'))).toBeGreaterThan(openOn(dayOf('07-10')));
    expect(openOn(dayOf('08-10'))).toBeGreaterThan(openOn(dayOf('09-10')));
    expect(openOn(dayOf('08-15'))).toBeGreaterThan(80);
    for (const date of ['01-15', '02-15', '03-15', '04-15', '05-15', '06-15', '10-15', '11-15', '12-15']) expect(openOn(dayOf(date)), date).toBe(0);
    // buds show before the flowers do, in June, and none after the display
    expect(budsOn(dayOf('06-20'))).toBeGreaterThan(5);
    expect(budsOn(dayOf('10-01'))).toBe(0);
    // July and August are the months the RHS gives: hardly any cyme opens in June
    expect(data.flowers.filter((f) => cal.dateOf(f.openDay).month === 6).length / data.flowers.length).toBeLessThan(0.03);
    // every flower of the run opened inside the season its sources give, in every year
    for (const f of data.flowers) {
      const opened = cal.dateOf(f.openDay);
      // by midsummer at the earliest (International Clematis Society), which is the first day the growth model allows
      expect(opened.dayOfYear, opened.iso).toBeGreaterThanOrEqual(param(model, 'phenology.flowerOpenDoy')[0]);
      expect(opened.month, opened.iso).toBeLessThanOrEqual(8);
      if (f.spentDay >= 0) expect(cal.dateOf(f.spentDay).month, opened.iso).toBeLessThanOrEqual(9);
    }
  });

  it('carries seed heads from August to November, and none in June or in winter', () => {
    expect(data.fruits.length).toBeGreaterThan(100);
    for (const date of ['09-01', '09-15', '10-15', '11-10']) expect(seedOn(dayOf(date)), date).toBeGreaterThan(20);
    for (const date of ['01-15', '02-15', '03-15', '04-15', '05-15', '06-15']) expect(seedOn(dayOf(date)), date).toBe(0);
    // green first, brown by the end of October
    const ripeOn = (day: number) => data.fruits.filter((f) => fruitState(f, day).phase === 'ripe').length;
    expect(ripeOn(dayOf('09-01'))).toBe(0);
    expect(ripeOn(dayOf('11-05'))).toBeGreaterThan(20);
    // a seed head follows a cyme that went over on the plant: about half of them set
    const cymes = data.flowers.filter((f) => f.year === last).length;
    const set = data.fruits.filter((f) => f.year === last).length;
    expect(set / cymes).toBeGreaterThan(0.35);
    expect(set / cymes).toBeLessThan(0.65);
    for (const f of data.fruits) expect(data.flowers.some((fl) => fl.spentDay === f.swell[0] && fl.stemId === f.stemId && fl.stemPoint === f.stemPoint)).toBe(true);
  });

  it('is cut to its stubs on 20 February and makes the whole plant again by July (RHS group 3)', () => {
    const before = stemsOn(dayOf('02-19'));
    const after = stemsOn(dayOf('02-21'));
    expect(before.lengthM).toBeGreaterThan(25);
    expect(after.lengthM).toBeLessThan(1);
    expect(after.highestM).toBeLessThan(0.45);
    const july = stemsOn(dayOf('07-31'));
    expect(july.lengthM).toBeGreaterThan(25);
    // RHS and Clematis on the Web: 2.5 to 4 m. The frame is 2.9 m high and the plant reaches its top
    expect(july.highestM).toBeGreaterThan(characterRange(morphology, 'habit.heightM')[0]);
    expect(july.highestM).toBeLessThan(characterRange(morphology, 'habit.heightM')[1]);
    // twelve to twenty-one stems from three stubs
    const [fewest, most] = param(model, 'regrowth.shootsPerCut');
    const stubs = param(model, 'architecture.trunkStemStartYears').length;
    expect(july.stems - stubs).toBeGreaterThanOrEqual(fewest * stubs);
    expect(july.stems - stubs).toBeLessThanOrEqual(most * stubs);
  });

  it('builds up over its first three years (RHS: two to five years to full size)', () => {
    const cymesIn = (year: number) => data.flowers.filter((f) => f.year === year).length;
    const first = last - YEARS + 1;
    expect(cymesIn(first)).toBeLessThan(10);
    expect(cymesIn(first + 1)).toBeGreaterThan(cymesIn(first));
    expect(cymesIn(first + 2)).toBeGreaterThan(cymesIn(first + 1));
    expect(stemsOn(dayOf('07-31', first)).highestM).toBeLessThan(stemsOn(dayOf('07-31', first + 2)).highestM);
    for (let year = first + 2; year <= last; year++) expect(cymesIn(year), String(year)).toBeGreaterThan(100);
  });

  // International Clematis Society: it flowers "mostly on the upper half of the new wood".
  it('flowers on the upper part of each stem and leaves the lower part in leaf only', () => {
    const stems = new Map<string, RenderStem>(data.stems.map((s) => [s.id, s]));
    const least = param(model, 'flowering.currentSeasonMinShootM');
    const along = (s: RenderStem, to: number): number => {
      let m = 0;
      for (let i = 1; i <= to; i++) m += Math.hypot(s.contact[3 * i]! - s.contact[3 * i - 3]!, s.contact[3 * i + 1]! - s.contact[3 * i - 2]!, s.contact[3 * i + 2]! - s.contact[3 * i - 1]!);
      return m;
    };
    const established = data.flowers.filter((f) => f.year >= last - 2);
    expect(established.length).toBeGreaterThan(300);
    for (const f of established) {
      const s = stems.get(f.stemId)!;
      expect(along(s, f.stemPoint!), `${f.stemId} point ${f.stemPoint}`).toBeGreaterThan(least - 0.1);
    }
    // and the leaves run the whole length of the stems, from the stubs up
    const leafHeights = data.leaves.filter((l) => l.firstYear === last).map((l) => l.position[2]);
    expect(Math.min(...leafHeights)).toBeLessThan(0.5);
  });

  it('faces every cyme out from its support at the length the growth model gives, and the seed heads the same way', () => {
    const [short, long] = param(model, 'organs.racemeLengthM');
    for (const f of data.flowers) {
      expect(f.lengthM).toBeGreaterThanOrEqual(short - 1e-6);
      expect(f.lengthM).toBeLessThanOrEqual(long + 1e-6);
      expect(Math.hypot(...f.direction!)).toBeCloseTo(1, 3);
      // out, and never hanging: level at the lowest, on the side of a cable
      expect(f.direction![2]).toBeGreaterThan(0);
      expect(f.form).toBeUndefined();
    }
    for (const f of data.fruits) expect(Math.hypot(...f.direction!)).toBeCloseTo(1, 3);
    for (const l of data.leaves) expect(l.form).toBeUndefined();
  });

  it('clasps only the cable, which it holds by itself, and is tied to the timber', () => {
    expect(data.appendages.length).toBeGreaterThan(100);
    const [short, long] = known(model, 'appendages.leafStalkLengthM')!;
    for (const a of data.appendages) {
      expect(a.kind).toBe('leaf_stalk_coil');
      expect(a.holding).toBe(true);
      expect(a.heldDiameterMm).toBe(characterNumber(morphology, 'hold.heldDiameterMm'));
      expect(a.lengthM).toBeGreaterThanOrEqual(short - 1e-4);
      expect(a.lengthM).toBeLessThanOrEqual(long + 1e-4);
    }
    // a hardened stalk outlasts its leaf: it is still there in January, on the bare stems, and goes with them at the cut
    expect(data.appendages.filter((a) => appendagePresent(a, dayOf('01-15'))).length).toBeGreaterThan(30);
    expect(data.appendages.filter((a) => appendagePresent(a, dayOf('02-21'))).length).toBeLessThan(6);
    // nothing but leaf-stalk clasps: no tendrils, rootlets or prickles, and no stiff side shoots on a plant cut down each year
    expect(data.stems.filter((s) => s.role === 'side_shoot' || s.role === 'whip' || s.role === 'spur')).toHaveLength(0);
  });

  it('is drawn in full by its own look: nothing is missing, provisional or of a form the look does not have', async () => {
    await loadLooks([ID]);
    const view = new PlantView(data, materials());
    expect(view.provisionalLooks).toEqual([]);
    expect(view.withoutFlowers).toEqual([]);
    expect(view.withoutFruit).toEqual([]);
    expect(view.withoutAppendages).toEqual([]);
    expect(view.unknownForms).toEqual([]);
    // on a day in August it shows exactly the leaves and the open cymes the core says are there
    const day = dayOf('08-12');
    view.update(camera(), day, 1);
    expect(view.stats().leaves).toBe(leavesOn(day));
    expect(view.stats().flowers).toBe(openOn(day));
    expect(view.stats().fruit).toBe(seedOn(day));
    view.dispose();
  });

  // RHS group 3 guide: left unpruned these clematis go on "from where it ended the previous season", top heavy,
  // "flowering well above eye level", with "a bare base".
  describe('and one left unpruned', () => {
    const wild = grow('untended');
    const wildCal = new Calendar(wild.start);
    const day = wildCal.dayOf(`${last}-08-10`);

    it('keeps its old stems, bare below a metre, and flowers on short shoots above that', () => {
      // nobody ties it in: it has only what it can hold by itself, the cable
      const old = wild.stems.filter((s) => (s.role === 'leader' || s.role === 'lateral') && s.bornDay[0]! < wildCal.dayOf(`${last}-01-01`) && stemPointAlive(s, 0, day));
      expect(old.length).toBeGreaterThan(0);
      const shoots = wild.stems.filter((s) => s.role === 'side_shoot' && stemPointAlive(s, 0, day));
      expect(shoots.length).toBeGreaterThan(5);
      const clear = param(model, 'organs.clearStemHeightM');
      for (const s of shoots) expect(s.contact[2]).toBeGreaterThanOrEqual(clear - 0.05);
      const open = wild.flowers.filter((f) => flowerState(f, day).phase === 'open');
      expect(open.length).toBeGreaterThan(3);
      for (const f of open) expect(f.position[2]).toBeGreaterThan(clear - 0.05);
      // fewer than the plant that is cut down each year
      expect(open.length).toBeLessThan(openOn(dayOf('08-10')));
    });

    it('flowers and is in leaf in the same months as the pruned plant', () => {
      const open = (date: string) => wild.flowers.filter((f) => flowerState(f, wildCal.dayOf(`${last}-${date}`)).phase === 'open').length;
      for (const date of ['01-15', '03-15', '05-15', '06-15', '10-20', '12-15']) expect(open(date), date).toBe(0);
      const seasons = seasonsOf(wild, last);
      const inLeaf = (date: string) => wild.leaves.filter((l) => leafState(l, seasons.get(l.plantId), wildCal.dayOf(`${last}-${date}`)).present).length;
      expect(inLeaf('01-15')).toBe(0);
      expect(inLeaf('07-15')).toBeGreaterThan(20);
    });
  });
});
