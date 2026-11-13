import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readBower } from '../src/bower/description.ts';
import { type Vec3, cross, dot, length, normalize, sub, v3 } from '../src/math/vec3.ts';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { type Rod, secondMomentM4, solveRod, startFreeShoot } from '../src/sim/free-shoot.ts';
import { GENERIC_SHOOT } from '../src/sim/generic-shoot.ts';
import { type GrowthModel, withParam } from '../src/sim/model.ts';
import { type PlantingPlan, plantingOn } from '../src/sim/planting.ts';
import type { Growable } from '../src/sim/scenarios.ts';
import type { Axis } from '../src/sim/types.ts';

// A shoot in the air that sets out upright: no stem is exactly plumb, a leaf's weight hangs off the stem on the side
// it is turned to, a long shoot sets out from its stem as a side shoot does, not straight up off a level member, and
// the whole of a shoot bends under its weight, foot as well as tip.
// SIMULATION_KEY.md section 4.3, "Unsupported shoots", (a), (b) and (c) as replaced on 12 November 2026;
// docs/ASSUMPTIONS_AUDIT.md section 12.

const deg = Math.PI / 180;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const species = loadGrowable(here('../../../species'));
const frame = readBower(JSON.parse(readFileSync(here('../../../examples/specimen-frame.bower.json'), 'utf8')), 'specimen-frame.bower.json');

describe('the lean a free shoot sets out at', () => {
  it('leans a shoot that would set out plumb by the least lean, towards the side given', () => {
    const s = startFreeShoot(0, v3(0, 0, 1), 4 * deg, v3(0, 1, 0));
    expect(s.baseIncline).toBeCloseTo(4 * deg, 12);
    expect(s.plane.y).toBeCloseTo(1, 12);
  });
  it('leaves alone a shoot that already leans more, and keeps the side it leans to', () => {
    const d = normalize(v3(1, 0, 1));
    const s = startFreeShoot(0, d, 4 * deg, v3(0, 1, 0));
    expect(s.baseIncline).toBeCloseTo(45 * deg, 12);
    expect(s.plane.x).toBeCloseTo(1, 12);
  });
  it('has a generic value, small and labelled as a choice', () => {
    expect(GENERIC_SHOOT['mechanics.leanDeg'].value).toBeGreaterThan(0);
    expect(GENERIC_SHOOT['mechanics.leanDeg'].value).toBeLessThan(10);
    expect(GENERIC_SHOOT['mechanics.leanDeg'].status).toBe('provisional_design_assumption');
  });
});

describe('a weight hung off the stem', () => {
  // a plumb rod of 0.5 m, 1 mm thick at 3000 MPa, weighing 0.03 N a metre: well short of Greenhill's height
  const rod = (couple?: number[]): Rod => {
    const n = 25;
    const ds = 0.02;
    const EI = 3000e6 * ((Math.PI * 0.001 ** 4) / 4);
    return { baseIncline: 0, lengthM: new Array(n).fill(ds), turn: new Array(n).fill(0), compliance: new Array(n).fill(ds / EI), load: new Array(n).fill(0.03 * ds), ...(couple ? { couple } : {}) };
  };
  it('leaves a plumb rod with nothing off its axis standing plumb', () => {
    expect(solveRod(rod()).tipIncline).toBe(0);
  });
  it('bends a plumb rod towards the side the weight hangs on, and the other way for the other side', () => {
    const c = new Array(25).fill(0);
    c[24] = 2e-4;
    expect(solveRod(rod(c)).tipIncline).toBeGreaterThan(1 * deg);
    expect(solveRod(rod(c.map((x) => -x))).tipIncline).toBeLessThan(-1 * deg);
  });
  it('bends a rod more for a weight further out along it', () => {
    const near = new Array(25).fill(0);
    near[4] = 2e-4;
    const far = new Array(25).fill(0);
    far[24] = 2e-4;
    expect(solveRod(rod(far)).tipIncline).toBeGreaterThan(solveRod(rod(near)).tipIncline);
  });
});

// SIMULATION_KEY.md section 4.4 (leaves), as added on 12 November 2026
describe('a leaf turns its blade to the open and the light', () => {
  const VINE = 'vitis-coignetiae';
  const plan: PlantingPlan = { schemaVersion: 1, name: 'One vine', plants: [{ plantId: 'vine', taxonId: VINE, stationId: frame.bower.rootStations[0]!.id }] };
  const grow = (share: number | null) => {
    const t = species.get(VINE)!;
    const model = share === null ? t.model : withParam(t.model, 'organs.leafTurnToOpenShare', share, 'a test');
    return new Simulation(plantingOn(frame.bower, plan, { taxa: new Map([[VINE, { profile: t.profile, model }]]) as Growable, years: 3, care: 'trained', viewpoints: frame.viewpoints })).runUntil('2029-12-31');
  };
  /** Leaves of the framework where it lies on a support, with the stem's tangent and the support's outward direction there. */
  const onSupport = (sim: Simulation) =>
    sim.leaves
      .map((l) => ({ l, a: sim.axes.get(l.axisId)! }))
      .filter(({ a, l }) => (a.role === 'leader' || a.role === 'lateral') && length(a.away[l.pointIndex]!) > 0.5 && l.pointIndex > 0 && l.pointIndex < a.contact.length - 1)
      .map(({ a, l }) => ({ l, a, away: a.away[l.pointIndex]!, t: normalize(sub(a.contact[l.pointIndex + 1]!, a.contact[l.pointIndex - 1]!)) }));
  const meanOut = (sim: Simulation) => {
    const xs = onSupport(sim).map(({ l, away }) => dot(l.direction, away));
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  };
  const turned = grow(null);
  const fixed = grow(0);

  it('faces further out of the support than the fixed recipe did', () => {
    expect(onSupport(turned).length).toBeGreaterThan(100);
    expect(meanOut(turned)).toBeGreaterThan(meanOut(fixed) + 0.1);
    expect(meanOut(turned)).toBeGreaterThan(0.4);
  });
  it('keeps its two ranks: successive leaves of a stem stand on alternate sides of it, as before', () => {
    let checked = 0;
    let kept = 0;
    for (const a of [...turned.axes.values()].filter((x) => x.role === 'leader' || x.role === 'lateral')) {
      const mine = onSupport(turned).filter((x) => x.a === a).sort((p, q) => p.l.pointIndex - q.l.pointIndex);
      for (let k = 1; k < mine.length; k++) {
        const side = (x: (typeof mine)[number]) => Math.sign(dot(x.l.direction, cross(x.t, x.away)));
        checked++;
        if (side(mine[k]!) !== side(mine[k - 1]!)) kept++;
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(kept / checked).toBeGreaterThan(0.95);
  });
});

describe('a long shoot off a level member', () => {
  // ivy throws many long free shoots from its stems, a great many of them from stems tied along level laths
  const IVY = 'hedera-helix';
  const plan: PlantingPlan = { schemaVersion: 1, name: 'One ivy', plants: [{ plantId: 'ivy', taxonId: IVY, stationId: frame.bower.rootStations[0]!.id }] };
  const sim = new Simulation(plantingOn(frame.bower, plan, { taxa: new Map([[IVY, species.get(IVY)!]]) as Growable, years: 12, care: 'trained', viewpoints: frame.viewpoints })).runUntil('2038-12-31');
  const setOut = (p: Vec3[]): Vec3 => normalize(sub(p[1]!, p[0]!));
  const fromLevel = [...sim.axes.values()].filter((a) => {
    if (a.role !== 'whip' || a.contact.length < 3) return false;
    const host = sim.axes.get(a.parent!.axisId)!;
    const i = a.parent!.pointIndex;
    if (length(host.away[i]!) < 0.5 || host.away[i]!.z < 0.9) return false;
    const t = normalize(sub(host.contact[Math.min(host.alive - 1, i + 1)]!, host.contact[Math.max(0, i - 1)]!));
    return Math.abs(t.z) < 0.25;
  });
  it('does not set out straight up from the top of the member', () => {
    expect(fromLevel.length).toBeGreaterThan(15);
    // until 12 November 2026 a long shoot was headed out from the support with an extra pull upwards, which off the top of
    // a level member put it near plumb; now it leaves from the axil of its leaf, and fewer than a third set out within 20 degrees of plumb
    const nearPlumb = fromLevel.filter((a) => setOut(a.contact).z > Math.cos(20 * deg)).length;
    expect(nearPlumb / fromLevel.length).toBeLessThan(1 / 3);
  });
});

// SIMULATION_KEY.md section 4.3 (a) as replaced on 12 November 2026: the whole free length lies along the shape the rod
// balances in, not along the path its tip took
describe('the shape of the whole rod', () => {
  it('is given segment by segment, and for a level rod sags by w L^4 / 8 EI at its end while that is small', () => {
    const r = 0.002;
    const EI = 3000e6 * secondMomentM4(r);
    const w = 1000 * 9.80665 * Math.PI * r * r;
    for (const L of [0.1, 0.2]) {
      const n = 200;
      const ds = L / n;
      const rod: Rod = { baseIncline: Math.PI / 2, lengthM: new Array(n).fill(ds), turn: new Array(n).fill(0), compliance: new Array(n).fill(ds / EI), load: Array.from({ length: n }, (_, k) => (k === n - 1 ? (w * ds) / 2 : w * ds)) };
      const shape: number[] = [];
      const solved = solveRod(rod, 0, shape);
      expect(shape).toHaveLength(n);
      expect(shape[n - 1]).toBe(solved.tipIncline);
      // every segment lies lower than the one before it
      for (let k = 1; k < n; k++) expect(shape[k]!).toBeGreaterThanOrEqual(shape[k - 1]!);
      let drop = 0;
      for (const psi of shape) drop -= ds * Math.cos(psi);
      expect(drop / ((w * L ** 4) / (8 * EI)), `${L} m`).toBeGreaterThan(0.97);
      expect(drop / ((w * L ** 4) / (8 * EI)), `${L} m`).toBeLessThan(1.03);
    }
  });
});

describe('the free shoots of a vine, before the gardener shortens them', () => {
  const VINE = 'vitis-coignetiae';
  const plan: PlantingPlan = { schemaVersion: 1, name: 'One vine', plants: [{ plantId: 'vine', taxonId: VINE, stationId: frame.bower.rootStations[0]!.id }] };
  const grow = (change?: (m: GrowthModel) => GrowthModel) => {
    const t = species.get(VINE)!;
    return new Simulation(plantingOn(frame.bower, plan, { taxa: new Map([[VINE, { profile: t.profile, model: change ? change(t.model) : t.model }]]) as Growable, years: 6, care: 'trained', viewpoints: frame.viewpoints })).runUntil('2032-07-06');
  };
  let topZ = 0;
  for (const n of frame.bower.graph.nodes.values()) topZ = Math.max(topZ, n.position.z);
  const elevation = (a: Vec3, b: Vec3) => Math.asin((b.z - a.z) / length(sub(b, a))) / deg;
  /** Shoots of the year, whole, of 0.8 m or more: how each sets out, how it ends, where it bends most and how high it stands. */
  const shapes = (sim: Simulation) => {
    const out: { a: Axis; basal: number; distal: number; bendAt: number; top: number }[] = [];
    for (const a of sim.axes.values()) {
      if (a.role !== 'side_shoot' || a.removedDay !== null || a.shortenedYear !== undefined || a.alive < 12) continue;
      const L = a.lengthAt[a.alive - 1]!;
      if (L < 0.8) continue;
      const P = a.contact;
      const n = a.alive;
      let bendAt = 0;
      let most = 0;
      for (let i = 4; i + 4 < n; i++) {
        const bend = Math.abs(elevation(P[i - 4]!, P[i]!) - elevation(P[i]!, P[i + 4]!));
        if (bend > most) {
          most = bend;
          bendAt = a.lengthAt[i]! / L;
        }
      }
      out.push({ a, basal: elevation(P[0]!, P[3]!), distal: elevation(P[n - 4]!, P[n - 1]!), bendAt, top: Math.max(...P.slice(0, n).map((q) => q.z)) });
    }
    return out;
  };
  const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)]!;
  const sim = grow();
  const long = shapes(sim);

  // Louarn, Lecoeur and Lebon 2008, Annals of Botany 101: 1167-1184, table 2: shoots of the common vine trained with no
  // wires have a mean basal elevation of 23 to 46 degrees, a far end 11 to 44 degrees lower and their greatest curvature
  // 0.41 to 0.45 of the way along. Another species with smaller leaves and hedged shoots: the bands here are wide.
  it('arch as the free shoots of the common vine were measured to: out at a slope, lower at the far end, bent most before the middle', () => {
    expect(long.length).toBeGreaterThan(100);
    const basal = median(long.map((x) => x.basal));
    expect(basal).toBeGreaterThan(15);
    expect(basal).toBeLessThan(55);
    expect(median(long.map((x) => x.distal))).toBeLessThan(basal - 11);
    const bendAt = median(long.map((x) => x.bendAt));
    expect(bendAt).toBeGreaterThan(0.15);
    expect(bendAt).toBeLessThan(0.6);
  });
  it('do not stand as rods above the frame: none rises a metre above its top, and few as much as half a metre', () => {
    expect(Math.max(...long.map((x) => x.top)) - topZ).toBeLessThan(1);
    expect(long.filter((x) => x.top > topZ + 0.5).length).toBeLessThan(long.length / 10);
  });
  it('bend at the foot as well as at the tip: the same shoots, too stiff to bend, set out more steeply', () => {
    const stiff = shapes(grow((m) => withParam(withParam(m, 'mechanics.woodModulusMPa', 300_000, 'a test: too stiff to bend'), 'mechanics.greenShootModulusMPa', 300_000, 'a test: too stiff to bend')));
    const steepOf = (xs: typeof long) => xs.filter((x) => x.basal > 60).length / xs.length;
    expect(stiff.length).toBeGreaterThan(100);
    // the headings are the same in both runs (they are drawn from the place); only the weight differs in what it can do
    expect(steepOf(long)).toBeLessThan(steepOf(stiff));
    expect(median(long.map((x) => x.distal))).toBeLessThan(median(stiff.map((x) => x.distal)) - 30);
  });
  it('carry their leaves, tendrils, flowers and fruit with them: each stands at its point of the stem as that now lies', () => {
    let leaves = 0;
    for (const l of sim.leaves) {
      const a = sim.axes.get(l.axisId)!;
      if (a.role !== 'side_shoot' && a.role !== 'whip') continue;
      expect(l.position, `${a.id} leaf at ${l.pointIndex}`).toBe(a.contact[l.pointIndex]);
      expect(Math.abs(length(l.direction) - 1)).toBeLessThan(1e-6);
      leaves++;
    }
    expect(leaves).toBeGreaterThan(1000);
    for (const f of sim.fruits) expect(f.position, f.id).toBe(sim.axes.get(f.axisId)!.contact[f.pointIndex]);
    for (const x of sim.appendages) {
      const a = sim.axes.get(x.axisId)!;
      if (a.role === 'side_shoot' && x.kind === 'tendril') expect(x.position).toBe(a.contact[x.pointIndex]);
    }
    for (const b of sim.buds) {
      const a = sim.axes.get(b.axisId)!;
      if (a.role !== 'side_shoot' || !b.position || b.end !== null || b.stage === 'spent' || a.removedDay !== null) continue;
      expect(b.position, b.id).toBe(a.contact[b.pointIndex === null ? a.alive - 1 : b.pointIndex]);
    }
  });
  it('are no longer or shorter for it: the points of a shoot stay as far apart along it as they were laid', () => {
    for (const { a } of long) for (let i = 1; i < a.alive; i++) expect(Math.abs(length(sub(a.contact[i]!, a.contact[i - 1]!)) - (a.lengthAt[i]! - a.lengthAt[i - 1]!)), `${a.id} point ${i}`).toBeLessThan(0.006);
  });
  // organs.alternateDivergenceDeg 180 (Gerrath and others 2001: two ranks): the ranks are the flanks of the cane
  it('leave the cane from its two flanks in turn, not all in one plane', () => {
    let left = 0;
    let right = 0;
    for (const a of sim.axes.values()) {
      if (a.role !== 'side_shoot' || a.contact.length < 3) continue;
      const host = sim.axes.get(a.parent!.axisId)!;
      const i = a.parent!.pointIndex;
      if (host.role === 'side_shoot' || length(host.away[i]!) < 0.5 || i < 1 || i + 1 >= host.contact.length) continue;
      const t = normalize(sub(host.contact[i + 1]!, host.contact[i - 1]!));
      const across = normalize(cross(t, host.away[i]!));
      const out = dot(normalize(sub(a.contact[1]!, a.contact[0]!)), across);
      if (out > 0.1) left++;
      else if (out < -0.1) right++;
    }
    expect(left + right).toBeGreaterThan(100);
    expect(left / (left + right)).toBeGreaterThan(0.3);
    expect(left / (left + right)).toBeLessThan(0.7);
  });
});
