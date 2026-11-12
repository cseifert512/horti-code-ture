import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Calendar, appendagePresent, characterNumber, characterRange, flowerState, fruitState, known, leafState, param, parseMorphology, readBower, seasonsOf, toRenderData } from '@horti/core';
import morphologyJson from '../../../../species/campsis-x-tagliabueana-madame-galen/morphology.json';
import { growPlanting } from '../../src/plant/grow.ts';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { growable } from '../../src/plant/scenario.ts';
import { look } from '../../src/plant/taxa/campsis-x-tagliabueana-madame-galen.ts';
import { specimenPlan } from '../../src/specimen/specimen.ts';

const ID = 'campsis-x-tagliabueana-madame-galen';
const morphology = parseMorphology(morphologyJson, `species/${ID}/morphology.json`);
const num = (key: string) => characterNumber(morphology, key);
const range = (key: string) => characterRange(morphology, key);

const leaf = look.leaves.default;
const truss = look.flowers!.default;
const pod = look.fruits!.default;
const roots = look.appendages.aerial_roots!;

/** The vertices of a model, each with the part it is tagged as belonging to. */
function vertices(g: THREE.BufferGeometry): { p: THREE.Vector3; pivot: THREE.Vector3; t: number; uv: THREE.Vector2 | null }[] {
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  return Array.from({ length: pos.count }, (_, i) => ({
    p: new THREE.Vector3().fromBufferAttribute(pos, i),
    pivot: new THREE.Vector3(part.getX(i), part.getY(i), part.getZ(i)),
    t: part.getW(i),
    uv: uv ? new THREE.Vector2().fromBufferAttribute(uv, i) : null,
  }));
}

/** The parts of a model that come and go (leaflets, flowers), by the order number each is tagged with. */
function parts(g: THREE.BufferGeometry): Map<number, ReturnType<typeof vertices>> {
  const out = new Map<number, ReturnType<typeof vertices>>();
  for (const v of vertices(g)) {
    if (v.t < 0) continue;
    const list = out.get(v.t);
    if (list) list.push(v);
    else out.set(v.t, [v]);
  }
  return out;
}

// species/campsis-x-tagliabueana-madame-galen/morphology.json: leaf.*. TAXON_LOOKS.md section 8: "counts and
// measured sizes (leaflets, tepals, the length of a leaflet for its width) come from the file."
describe('the leaf of Campsis x tagliabuana Madame Galen', () => {
  it('has the fewest, the usual and the most leaflets that morphology.json gives: 7, 9 and 11', () => {
    const [fewest, most] = range('leaf.leafletCount');
    const counts = Array.from({ length: leaf.variants }, (_, v) => parts(leaf.make(v, 0)).size);
    expect(counts).toEqual([fewest, num('leaf.leafletCountUsual'), most]);
    // the same leaf at every level of detail
    for (let v = 0; v < leaf.variants; v++) for (let lod = 1; lod < leaf.lods; lod++) expect(parts(leaf.make(v, lod)).size, `variant ${v} level ${lod}`).toBe(counts[v]);
  });

  it('is odd-pinnate with its side leaflets in opposite pairs: one leaflet ends the axis and the rest stand two by two', () => {
    for (let v = 0; v < leaf.variants; v++) {
      const joins = [...parts(leaf.make(v, 0)).values()].map((list) => ({ z: list[0]!.pivot.z, side: Math.sign(list.reduce((s, x) => s + x.p.x, 0) / list.length) })).sort((a, b) => a.z - b.z);
      const end = joins.pop()!;
      expect(joins.length % 2).toBe(0);
      for (let i = 0; i < joins.length; i += 2) {
        // a pair joins the axis at one place, one leaflet to each side
        expect(Math.abs(joins[i]!.z - joins[i + 1]!.z)).toBeLessThan(0.03);
        expect(joins[i]!.side).toBe(-joins[i + 1]!.side);
      }
      // the lowest pair stands above a bare stalk
      expect(joins[0]!.z).toBeGreaterThan(num('leaf.stalkShareOfLength') - 0.02);
      expect(end.z).toBeGreaterThan(joins[joins.length - 1]!.z);
    }
  });

  it('is as wide for its length as morphology.json records, with the usual number of leaflets', () => {
    const g = leaf.make(1, 0);
    g.computeBoundingBox();
    const width = g.boundingBox!.max.x - g.boundingBox!.min.x;
    const length = g.boundingBox!.max.z - g.boundingBox!.min.z;
    expect(width / length).toBeGreaterThan(num('leaf.widthShareOfLength') * 0.85);
    expect(width / length).toBeLessThan(num('leaf.widthShareOfLength') * 1.15);
  });

  it('gives each leaflet the published width for its length, and the recorded number of teeth on each side', () => {
    const list = [...parts(leaf.make(1, 0)).values()];
    // the end leaflet: the one that joins the axis farthest out
    const end = list.reduce((a, b) => (b[0]!.pivot.z > a[0]!.pivot.z ? b : a));
    const base = end.reduce((a, b) => (b.uv!.y < a.uv!.y || (b.uv!.y === a.uv!.y && Math.abs(b.uv!.x - 0.5) < Math.abs(a.uv!.x - 0.5)) ? b : a)).p;
    const tip = end.reduce((a, b) => (b.uv!.y > a.uv!.y ? b : a)).p;
    const along = tip.clone().sub(base);
    const length = along.length();
    along.normalize();
    const off = (p: THREE.Vector3) => p.clone().sub(base).addScaledVector(along, -p.clone().sub(base).dot(along)).length();
    const margin = end.filter((v) => v.uv!.x === 1).sort((a, b) => a.uv!.y - b.uv!.y).map((v) => off(v.p));
    // the smooth outline, without the teeth: the width between the notches and the points
    const widest = 2 * Math.max(...margin);
    const shape = num('leaf.leafletWidthMaxM') / num('leaf.leafletLengthMaxM');
    expect(widest / length).toBeGreaterThan(shape * 0.85);
    expect(widest / length).toBeLessThan(shape * 1.25);
    let teeth = 0;
    for (let i = 1; i < margin.length - 1; i++) if (margin[i]! > margin[i - 1]! && margin[i]! > margin[i + 1]!) teeth++;
    expect(teeth).toBe(num('leaf.leafletTeethPerSide'));
  });

  // TAXON_LOOKS.md section 2: a leaf is one unit long along +Z, its upper side +Y
  it('is one unit long from where it joins the stem, and arches down towards its tip', () => {
    for (let v = 0; v < leaf.variants; v++) {
      const g = leaf.make(v, 0);
      g.computeBoundingBox();
      expect(g.boundingBox!.max.z).toBeGreaterThan(0.93);
      expect(g.boundingBox!.max.z).toBeLessThan(1.05);
      expect(g.boundingBox!.min.z).toBeGreaterThan(-0.02);
      expect(g.boundingBox!.min.y).toBeLessThan(-0.15);
    }
  });

  it('is drawn shorter-leaved with fewer leaflets, and never with more leaflets than it has models for', () => {
    expect(leaf.pick(0.2, 0.5)).toBe(0);
    expect(leaf.pick(0.3, 0.1)).toBe(1);
    expect(leaf.pick(0.3, 0.9)).toBe(2);
  });
});

// morphology.json: inflorescence.* and flower.*
describe('the truss', () => {
  const flowersOf = (variant: number, lod = 0) => [...parts(truss.make(variant, lod)).entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list);

  it('has between the fewest and the most flowers that morphology.json gives, at every level of detail', () => {
    const [fewest, most] = range('inflorescence.flowerCount');
    const counts = Array.from({ length: truss.variants }, (_, v) => flowersOf(v).length);
    expect(counts).toEqual([fewest + 1, Math.round((fewest + most) / 2), most]);
    for (let v = 0; v < truss.variants; v++) for (let lod = 1; lod < truss.lods; lod++) expect(flowersOf(v, lod).length, `variant ${v} level ${lod}`).toBe(counts[v]);
  });

  /** One flower in its own frame: how far each point is along the way it faces, how far out from that line, and at what angle round it. */
  const measure = (flower: ReturnType<typeof vertices>) => {
    const pivot = flower[0]!.pivot;
    const axis = flower.reduce((s, v) => s.add(v.p.clone().sub(pivot)), new THREE.Vector3()).normalize();
    const side = new THREE.Vector3(1, 0, 0);
    if (Math.abs(axis.x) > 0.9) side.set(0, 1, 0);
    side.addScaledVector(axis, -side.dot(axis)).normalize();
    const other = new THREE.Vector3().crossVectors(axis, side);
    return flower.map((v) => {
      const d = v.p.clone().sub(pivot);
      const along = d.dot(axis);
      const out = d.clone().addScaledVector(axis, -along);
      return { along, out: out.length(), angle: Math.atan2(out.dot(other), out.dot(side)) };
    });
  };

  it('opens each flower to a trumpet of five lobes, as wide and as long as the published flower', () => {
    const [narrowest, widest] = range('flower.limbWidthM');
    for (let v = 0; v < truss.variants; v++) {
      // the first flower to open is a trumpet in every truss
      const m = measure(flowersOf(v)[0]!);
      const reach = Math.max(...m.map((x) => x.out));
      // each flower is drawn a few per cent larger or smaller than the next
      expect(2 * reach).toBeGreaterThan(narrowest * 0.9);
      expect(2 * reach).toBeLessThan(widest * 1.1);
      const length = Math.max(...m.map((x) => x.along));
      expect(length).toBeGreaterThan(num('flower.tubeLengthM') * 0.9);
      expect(length).toBeLessThan(num('flower.lengthM') * 1.1);
      // lobes: the stretches of the rim that stand out beyond the notches between them, each parted from the next by a gap
      const rim = m.filter((x) => x.out > 0.78 * reach).map((x) => x.angle).sort((a, b) => a - b);
      let lobes = 0;
      for (let i = 0; i < rim.length; i++) if ((i === 0 ? rim[0]! + 2 * Math.PI - rim[rim.length - 1]! : rim[i]! - rim[i - 1]!) > 0.3) lobes++;
      expect(lobes, `variant ${v}`).toBe(num('flower.lobeCount'));
    }
  });

  it('keeps the youngest flowers, at the tip, as closed buds: clubs far narrower than a trumpet', () => {
    for (let v = 0; v < truss.variants; v++) {
      const flowers = flowersOf(v);
      const last = measure(flowers[flowers.length - 1]!);
      expect(Math.max(...last.map((x) => x.out))).toBeLessThan(num('flower.throatWidthM') / 2);
      // and they are the ones farthest out along the truss
      const firstAt = flowers[0]![0]!.pivot.length();
      const lastAt = flowers[flowers.length - 1]![0]!.pivot.length();
      expect(lastAt).toBeGreaterThan(firstAt);
    }
  });

  // TAXON_LOOKS.md section 4: "whatever outlasts the petals must be axis"
  it('leaves a calyx where each corolla has dropped: the calyx is axis and the corolla a part, joined at one place', () => {
    const all = vertices(truss.make(1, 0));
    const stays = all.filter((v) => v.t === -1);
    for (const flower of flowersOf(1)) {
      const at = flower[0]!.pivot;
      const calyx = stays.filter((v) => v.pivot.distanceTo(at) < 1e-6);
      expect(calyx.length).toBeGreaterThan(20);
      // a calyx is about as long as morphology.json says, far shorter than the trumpet
      const reach = Math.max(...calyx.map((v) => v.p.distanceTo(at)));
      expect(reach).toBeGreaterThan(num('flower.calyxLengthM') * 0.5);
      expect(reach).toBeLessThan(num('flower.calyxLengthM') * 1.25);
    }
  });

  // TAXON_LOOKS.md section 2 and the brief: authoredSize is what organs.racemeLengthM measures
  it('is authored to the length morphology.json and the growth model give a truss: from the shoot to the mouths of its end flowers', () => {
    const [shortest, longest] = range('inflorescence.lengthM');
    expect(truss.authoredSize).toBeGreaterThanOrEqual(shortest);
    expect(truss.authoredSize).toBeLessThanOrEqual(longest);
    expect(param(growable().get(ID)!.model, 'organs.racemeLengthM')).toEqual([shortest, longest]);
    for (let v = 0; v < truss.variants; v++) {
      const far = Math.max(...vertices(truss.make(v, 0)).filter((x) => x.t >= 0).map((x) => x.p.length()));
      expect(far / truss.authoredSize, `variant ${v}`).toBeGreaterThan(0.85);
      expect(far / truss.authoredSize, `variant ${v}`).toBeLessThan(1.15);
    }
  });

  it('stands along +Y, the line of its shoot, and nods over towards -Z, the side away from the sky', () => {
    expect(truss.poise).toBe('held');
    for (let v = 0; v < truss.variants; v++) {
      const g = truss.make(v, 0);
      g.computeBoundingBox();
      expect(g.boundingBox!.max.y).toBeGreaterThan(0.1);
      expect(-g.boundingBox!.min.z).toBeGreaterThan(g.boundingBox!.max.z);
    }
  });
});

// morphology.json: fruit.*
describe('the pod', () => {
  it('is a spindle as long and as wide as morphology.json gives, hanging on the stalk of the old truss', () => {
    expect(pod.poise).toBe('hangs');
    expect(pod.authoredSize).toBeGreaterThanOrEqual(range('fruit.lengthM')[0]);
    expect(pod.authoredSize).toBeLessThanOrEqual(range('fruit.lengthM')[1]);
    const g = pod.make(0, 0);
    g.computeBoundingBox();
    const { min, max } = g.boundingBox!;
    // the pod, and a short stalk above it
    expect(-min.y).toBeGreaterThan(pod.authoredSize);
    expect(-min.y).toBeLessThan(pod.authoredSize * 1.45);
    expect(max.x - min.x).toBeGreaterThan(num('fruit.widthM') * 0.9);
    expect(max.x - min.x).toBeLessThan(num('fruit.widthM') * 1.6);
  });
});

// morphology.json: holdfast.*
describe('the rootlets', () => {
  it('stand in two rows, one to each side of the stem, with the recorded number in each', () => {
    const g = roots.make(0, 0);
    const pos = g.getAttribute('position');
    let left = 0;
    let right = 0;
    for (let i = 0; i < pos.count; i++) pos.getX(i) < 0 ? left++ : right++;
    expect(num('holdfast.rows')).toBe(2);
    expect(left).toBe(right);
    // each rootlet is a tube of four rings of four points
    expect(pos.count / 16).toBe(num('holdfast.rows') * num('holdfast.rootletsPerRow'));
  });

  // render/contract.ts, RenderAppendage.direction: "the patch lies on that surface, spreading to either side of the stem"
  it('lie on the surface the stem clings to: most of each rootlet is proud of it, spreading sideways', () => {
    const g = roots.make(0, 0);
    g.computeBoundingBox();
    const { min, max } = g.boundingBox!;
    expect(max.x - min.x).toBeGreaterThan(1.6);
    expect(min.z).toBeGreaterThan(-0.2);
    expect(min.z).toBeLessThan(0);
  });
});

// TAXON_LOOKS.md section 6: "Every asset states a budget: the most triangles it has at each level."
describe('every organ model of the look', () => {
  it('builds at every level of detail, within the budget it states and the ceiling for its kind', () => {
    expect(look.provisional).toBe(false);
    const assets = assetsOf(look);
    expect(assets.map((a) => a.kind).sort()).toEqual(['appendage', 'flower', 'fruit', 'leaf']);
    for (const { kind, asset } of assets) {
      expect(asset.key.startsWith(`${ID}/`)).toBe(true);
      for (let lod = 0; lod < asset.lods; lod++) {
        expect(asset.budget[lod]!, `${asset.key} level ${lod}`).toBeLessThanOrEqual(ceilingFor(kind, lod, asset.lods));
        for (let v = 0; v < asset.variants; v++) {
          const g = asset.make(v, lod);
          const n = triangles(g);
          expect(n, `${asset.key} variant ${v} level ${lod}`).toBeLessThanOrEqual(asset.budget[lod]!);
          // and not far under it: a budget that is twice what the model needs says nothing
          if (v === asset.variants - 1) expect(n, `${asset.key} variant ${v} level ${lod}`).toBeGreaterThan(asset.budget[lod]! * 0.6);
          const pos = g.getAttribute('position').array;
          for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) throw new Error(`${asset.key} ${v}/${lod}: a position is not a finite number`);
        }
      }
    }
  });
});

// species/campsis-x-tagliabueana-madame-galen/SPECIES_PROFILE.md, "Form: what the model draws", and the
// sources it cites. render/presence.ts answers what is on the plant; nothing here works out a season.
describe('a specimen grown on the frame for eight years', () => {
  const FRAME = fileURLToPath(new URL('../../../../examples/specimen-frame.bower.json', import.meta.url));
  const frame = readBower(JSON.parse(readFileSync(FRAME, 'utf8')), 'examples/specimen-frame.bower.json');
  const years = 8;
  const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(ID), viewpoints: frame.viewpoints }, growable(), 'trained', years);
  const data = toRenderData(sim);
  const cal = new Calendar(data.start);
  const model = growable().get(ID)!.model;
  const first = 2027;
  const last = first + years - 1;
  const day = (year: number, month: number, dayOfMonth: number) => cal.dayOf(`${year}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`);
  const inLeaf = (d: number) => data.leaves.filter((l) => leafState(l, seasonsOf(data, cal.dateOf(d).year).get(l.plantId), d).present).length;
  const open = (d: number) => data.flowers.filter((f) => flowerState(f, d).phase === 'open').length;
  const pods = (d: number) => data.fruits.filter((f) => fruitState(f, d).phase !== 'absent');
  const stems = new Map(data.stems.map((s) => [s.id, s]));

  // RHS: "deciduous"; University of Connecticut, of the parent: "Late to leaf out in spring"
  it('is bare from December to the middle of April, comes late into leaf and is in full leaf from June to October', () => {
    for (let y = first + 2; y <= last; y++) {
      for (const [m, d] of [[12, 15], [1, 15], [2, 15], [3, 15], [4, 15]] as const) expect(inLeaf(day(y, m, d)), `${y}-${m}-${d}`).toBe(0);
      expect(inLeaf(day(y, 6, 15))).toBeGreaterThan(50);
      for (const m of [7, 8, 9, 10]) expect(inLeaf(day(y, m, 15)), `${y}-${m}`).toBeGreaterThan(inLeaf(day(y, 6, 15)));
      // late: not half of its summer leaf is out at the end of May
      expect(inLeaf(day(y, 5, 31))).toBeLessThan(0.5 * inLeaf(day(y, 8, 15)));
    }
  });

  it('carries its leaves in opposite pairs', () => {
    const at = new Map<string, number>();
    for (const l of data.leaves) at.set(`${l.stemId}|${l.position.join(',')}`, (at.get(`${l.stemId}|${l.position.join(',')}`) ?? 0) + 1);
    expect(param(model, 'organs.leavesPerNode')).toBe(2);
    for (const n of at.values()) expect(n).toBe(2);
  });

  // RHS campsis growing guide: it flowers once a woody framework has formed, after two to three years
  it('does not flower in its first two seasons, and does by its fourth', () => {
    expect(param(model, 'flowering.competenceYears')).toBe(2);
    expect(data.flowers.length).toBeGreaterThan(100);
    const firstFlowers = Math.min(...data.flowers.map((f) => f.year));
    expect(firstFlowers).toBeGreaterThanOrEqual(first + 2);
    expect(firstFlowers).toBeLessThanOrEqual(first + 3);
  });

  // RHS: flowers "from late summer until the first frosts". CLAUDE.md: "A flowering month is an envelope, not a trigger."
  it('is in flower in August, September and October, and on no day before late July or after the first days of November', () => {
    for (let y = first + 3; y <= last; y++) for (const m of [8, 9, 10]) expect(open(day(y, m, 15)), `${y}-${m}`).toBeGreaterThan(0);
    for (const f of data.flowers) {
      const opened = cal.dateOf(f.openDay);
      expect(opened.month > 7 || (opened.month === 7 && opened.dayOfMonth >= 25), opened.iso).toBe(true);
      if (f.spentDay >= 0) {
        const over = cal.dateOf(f.spentDay);
        expect(over.month < 11 || (over.month === 11 && over.dayOfMonth <= 5), over.iso).toBe(true);
      }
    }
    for (let y = first; y <= last; y++) for (const m of [12, 1, 2, 3, 4, 5, 6]) expect(open(day(y, m, 15))).toBe(0);
  });

  // Bean, of C. radicans: "borne in a terminal cluster on the current season's growth"
  it('bears every truss at the end of a shoot of the year, facing along it, and none at a leaf node', () => {
    expect(param(model, 'flowering.currentSeasonFlowersPerM')).toBe(0);
    for (const f of data.flowers) {
      const stem = stems.get(f.stemId)!;
      expect(stem.role).toBe('side_shoot');
      // the shoot was made in the year its truss opened
      expect(cal.dateOf(stem.bornDay[0]!).year).toBe(f.year);
      const n = stem.bornDay.length;
      for (let k = 0; k < 3; k++) expect(f.position[k]).toBeCloseTo(stem.contact[3 * (n - 1) + k]!, 4);
      expect(f.direction).toBeDefined();
      const [lo, hi] = param(model, 'organs.racemeLengthM');
      expect(f.lengthM).toBeGreaterThanOrEqual(lo);
      expect(f.lengthM).toBeLessThanOrEqual(hi);
    }
  });

  // Bean, of C. radicans in Britain: pods form rarely
  it('sets few pods, which hang ripe through the winter and are gone before the plant is in leaf again', () => {
    expect(data.fruits.length).toBeGreaterThan(0);
    expect(data.fruits.length).toBeLessThan(0.1 * data.flowers.length);
    expect(known(model, 'fruit.setShare')).toBeLessThan(0.1);
    let seenInWinter = 0;
    for (let y = first + 3; y <= last; y++) {
      for (const p of pods(day(y, 1, 15))) {
        seenInWinter++;
        expect(fruitState(p, day(y, 1, 15)).phase).toBe('ripe');
      }
      for (const m of [5, 6, 7]) expect(pods(day(y, m, 15))).toHaveLength(0);
    }
    expect(seenInWinter).toBeGreaterThan(0);
    // a pod hangs: the data gives it no direction
    for (const p of data.fruits) expect(p.direction).toBeUndefined();
  });

  // Ohio State weed guide, of C. radicans: aerial roots form below the nodes "on woody stems"; RHS: self-clinging by aerial roots
  it('has rootlets only where a framework stem holds timber by itself', () => {
    expect(data.appendages.length).toBeGreaterThan(20);
    for (const a of data.appendages) {
      expect(a.kind).toBe('aerial_roots');
      expect(a.holding).toBe(true);
      expect(['leader', 'lateral']).toContain(stems.get(a.stemId)!.role);
    }
    expect(data.appendages.some((a) => appendagePresent(a, day(last, 1, 15)))).toBe(true);
  });
});
