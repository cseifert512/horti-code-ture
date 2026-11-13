import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readBower } from '../src/bower/description.ts';
import type { Bower, Section } from '../src/bower/types.ts';
import { type Vec3, distance, normalize, v3 } from '../src/math/vec3.ts';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { GRAVITY, GREENHILL, type Rod, criticalHeightM, elastoGravityLengthM, modulusPa, secondMomentM4, segmentDistance, solveRod } from '../src/sim/free-shoot.ts';
import { GENERIC_SHOOT, SHOOT_PARAM_KEYS } from '../src/sim/generic-shoot.ts';
import { openSkyLight, sunSide } from '../src/sim/light-from.ts';
import { GROWTH_PARAMS_OPTIONAL, type GrowthModel, genericShootKeys, modelProvenance, param, parseGrowthModel, shootParam, withParam, withUnknown } from '../src/sim/model.ts';
import { plantingOn } from '../src/sim/planting.ts';
import { designReport } from '../src/sim/report.ts';
import { type Growable, wisteriaOnVault } from '../src/sim/scenarios.ts';
import type { Axis, Scenario } from '../src/sim/types.ts';
import { ATTACHMENT_STATUS, SHOOT_POSTURE } from '../src/vocab.ts';

// What these tests enforce is SIMULATION_KEY.md section 4.3, "Unsupported shoots" (note of 12 November 2026),
// clauses (a) to (h), which replaced the drawn curve the prototype gave a whippy shoot; and behind it
// PROJECT_CONTEXT.md section 0, point 1: biological and mechanical plausibility come first.

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const library = loadGrowable(speciesDir);
const WISTERIA = 'wisteria-sinensis';
const STEP = 0.04;

const frameFile = fileURLToPath(new URL('../../../examples/specimen-frame.bower.json', import.meta.url));
const specimenFrame = readBower(JSON.parse(readFileSync(frameFile, 'utf8')), 'specimen-frame.bower.json').bower;

/**
 * A post, a lath running level from it 2.4 m up, and a 5 mm cable strung 0.32 m above the lath that touches no
 * timber: no route leads to the cable, so a plant can come to it only through the air.
 */
const gapFrame = readBower(
  {
    schemaVersion: 1,
    id: 'gap',
    name: 'a lath with a cable out of reach above it',
    frame: 'x east, y north, z up, metres',
    members: [
      { id: 'post', tier: 'primary', role: 'post', section: { shape: 'rect', widthMm: 100, depthMm: 100 }, material: 'glulam', points: [[0, 0, 0], [0, 0, 2.6]] },
      { id: 'lath', tier: 'sub_lattice', role: 'lath', section: { shape: 'rect', widthMm: 40, depthMm: 40 }, material: 'softwood', points: [[0, 0, 2.4], [1.8, 0, 2.4]] },
    ],
    cables: [{ id: 'wire', diameterMm: 5, points: [[0.15, 0, 2.72], [1.7, 0, 2.72]] }],
    stations: [{ id: 'foot', position: [0.05, -0.25, 0] }],
  },
  'gap frame',
).bower;

const withModel = (taxa: Growable, id: string, change: (m: GrowthModel) => GrowthModel): Growable => {
  const t = taxa.get(id)!;
  return new Map([...taxa, [id, { profile: t.profile, model: change(t.model) }]]);
};
/** The same plant throwing a shoot of the year from half of its old leaf nodes, so that a small frame has shoots to test. */
const eager = (taxa: Growable, id = WISTERIA): Growable =>
  withModel(taxa, id, (m) => withParam(withParam(m, 'organs.whipShareOfNodes', 0.5, 'a test: many shoots of the year'), 'organs.whipsPerYearMax', 30, 'a test: many shoots of the year'));
const noHold = (taxa: Growable, id = WISTERIA): Growable => withModel(taxa, id, (m) => withParam(m, 'attachment.graspReachM', 0, 'a test: nothing to take hold of'));
const one = (bower: Bower, taxa: Growable, taxonId: string, care: 'trained' | 'untended', years: number, extra: Partial<Scenario> = {}): Simulation => {
  const scenario = plantingOn(bower, { schemaVersion: 1, name: `one ${taxonId}`, plants: [{ plantId: 'plant', taxonId, stationId: 'foot' }] }, { taxa, care, years });
  return new Simulation({ ...scenario, ...extra }).runUntil(`${2027 + years - 1}-12-31`);
};

const isFree = (a: Axis, i: number): boolean => Math.hypot(a.away[i]!.x, a.away[i]!.y, a.away[i]!.z) < 0.5;
/** Every stretch of an axis that stands on nothing: the point it left its support at, and the points after it. */
function stretches(a: Axis): { base: number; points: number[] }[] {
  const out: { base: number; points: number[] }[] = [];
  let open: { base: number; points: number[] } | null = null;
  for (let i = 1; i < a.contact.length; i++) {
    if (isFree(a, i)) {
      if (!open) out.push((open = { base: i - 1, points: [] }));
      open.points.push(i);
    } else open = null;
  }
  // a side shoot stands free from its first point
  if (a.contact.length > 1 && isFree(a, 0) && out[0]) out[0].base = 0;
  return out;
}
/**
 * The axes whose unsupported lengths the mechanics laid: shoots of the year (and what a winter cut has left of them)
 * and flowering side shoots. A spur is not one: it is still the short drawn curve the prototype gave it.
 */
const laidInTheAir = (a: Axis): boolean => a.role === 'whip' || a.role === 'side_shoot' || (a.role === 'spur' && a.tip.state === 'stopped' && a.tip.reason === 'cut back to a spur');
const inTheAir = (sim: Simulation): Axis[] => [...sim.axes.values()].filter((a) => laidInTheAir(a) && stretches(a).length > 0);
const tipRadiusM = (m: GrowthModel) => Math.sqrt(param(m, 'thickening.tipRadiusSquaredMm2')) / 1000;
/** The tallest a bare shoot of a taxon could stand were it set wood from end to end: no shoot of it can stand taller. */
const tallest = (m: GrowthModel): number => {
  const r = tipRadiusM(m);
  return criticalHeightM(shootParam(m, 'mechanics.woodModulusMPa') * 1e6 * secondMomentM4(r), shootParam(m, 'mechanics.stemFreshDensityKgM3') * GRAVITY * Math.PI * r * r);
};

/** A uniform rod of `n` segments, clamped at `incline` from plumb, weighing `w` newtons a metre. */
function uniformRod(lengthM: number, n: number, incline: number, flexuralRigidity: number, w: number): Rod {
  const ds = lengthM / n;
  return { baseIncline: incline, lengthM: new Array(n).fill(ds), turn: new Array(n).fill(0), compliance: new Array(n).fill(ds / flexuralRigidity), load: Array.from({ length: n }, (_, k) => (k === n - 1 ? (w * ds) / 2 : w * ds)) };
}
/** The angle of the tip from plumb as a uniform rod grows to a length, followed a segment at a time as the engine follows a shoot. */
function grown(lengthM: number, incline: number, flexuralRigidity: number, w: number): number {
  const n = Math.round(lengthM / 0.02);
  let moment = 0;
  let tip = incline;
  for (let k = 1; k <= n; k++) {
    const s = solveRod(uniformRod((lengthM * k) / n, k, incline, flexuralRigidity, w), moment);
    if (!s.found) return Math.PI;
    moment = s.baseMoment;
    tip = s.tipIncline;
  }
  return tip;
}

// ---------------------------------------------------------------------------------------------------------------
// (a) A shoot in the air is a rod under its own weight
// ---------------------------------------------------------------------------------------------------------------
describe('the rod: a slender stem under its own weight', () => {
  const r = 0.002;
  const EI = 3000e6 * secondMomentM4(r);
  const w = 1000 * GRAVITY * Math.PI * r * r;

  it('sags as a cantilever does: a level rod turns down at its tip by w L^3 / 6 EI while that is small', () => {
    for (const L of [0.1, 0.2, 0.3]) {
      const sag = solveRod(uniformRod(L, 200, Math.PI / 2, EI, w)).tipIncline - Math.PI / 2;
      expect(sag / ((w * L ** 3) / (6 * EI)), `${L} m`).toBeGreaterThan(0.97);
      expect(sag / ((w * L ** 3) / (6 * EI)), `${L} m`).toBeLessThan(1.03);
    }
  });

  it('stands upright up to Greenhill\'s height and goes over beyond it', () => {
    const critical = criticalHeightM(EI, w);
    expect(critical).toBeCloseTo(GREENHILL * elastoGravityLengthM(EI, w), 12);
    const lean = (2 * Math.PI) / 180;
    // short of it, a rod set two degrees off plumb is still within a few degrees of where it was set
    expect(grown(0.6 * critical, lean, EI, w)).toBeLessThan((6 * Math.PI) / 180);
    // past it, the same rod has gone over: its tip points below the level
    expect(grown(1.4 * critical, lean, EI, w)).toBeGreaterThan(Math.PI / 2);
  });

  it('droops more the longer it is, the thinner it is and the more it carries', () => {
    const launch = Math.PI / 3;
    const sagOf = (L: number, radius: number, extra = 0) => grown(L, launch, 3000e6 * secondMomentM4(radius), 1000 * GRAVITY * Math.PI * radius * radius + extra) - launch;
    expect(sagOf(0.8, r)).toBeGreaterThan(sagOf(0.4, r) * 4);
    expect(sagOf(0.6, 0.0015)).toBeGreaterThan(sagOf(0.6, 0.002) * 1.5);
    expect(sagOf(0.6, 0.002)).toBeGreaterThan(sagOf(0.6, 0.003) * 1.5);
    // a quarter of a newton of leaf to the metre, on a stem that weighs half that
    expect(sagOf(0.6, r, 0.25)).toBeGreaterThan(sagOf(0.6, r) * 2);
  });

  it('never points above where it was set, and hangs when long enough', () => {
    let last = 0;
    for (const L of [0.2, 0.5, 0.8, 1.2, 1.8, 2.6]) {
      const tip = grown(L, Math.PI / 4, EI, w);
      expect(tip, `${L} m`).toBeGreaterThanOrEqual(last - 1e-9);
      expect(tip, `${L} m`).toBeLessThanOrEqual(Math.PI + 1e-9);
      last = tip;
    }
    expect(last).toBeGreaterThan((160 * Math.PI) / 180);
  });

  it('is stiffer where its wood has set than at its growing end', () => {
    expect(modulusPa(0, 300, 3000, 30)).toBe(300e6);
    expect(modulusPa(15, 300, 3000, 30)).toBe(1650e6);
    expect(modulusPa(30, 300, 3000, 30)).toBe(3000e6);
    expect(modulusPa(400, 300, 3000, 30)).toBe(3000e6);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// (b), (c), (d) What a run does with it: bounded rise and reach, and the ground
// ---------------------------------------------------------------------------------------------------------------
describe('shoots in the air, in a run', () => {
  const untended = one(specimenFrame, library, WISTERIA, 'untended', 6);
  const model = library.get(WISTERIA)!.model;
  const reach = shootParam(model, 'mechanics.searcherReachM');

  it('has shoots in the air to test', () => {
    expect(inTheAir(untended).length).toBeGreaterThan(8);
  });

  it('never rises above the point it left its support by more than it can stand, nor holds itself out past its reach', () => {
    const limit = Math.min(tallest(model), reach) + STEP;
    let highest = 0;
    let farthest = 0;
    for (const a of inTheAir(untended)) {
      for (const s of stretches(a)) {
        const base = a.contact[s.base]!;
        for (const i of s.points) {
          const p = a.contact[i]!;
          highest = Math.max(highest, p.z - base.z);
          farthest = Math.max(farthest, Math.hypot(p.x - base.x, p.y - base.y));
        }
      }
    }
    expect(highest).toBeLessThanOrEqual(limit);
    // sideways: no further than it can hold itself out, and from where it gives way no further than it could have stood
    expect(farthest).toBeLessThanOrEqual(reach + tallest(model));
    // and the bound bites: before the mechanics, a wisteria whip of 2 m stood most of 2 m above the timber
    expect(highest).toBeGreaterThan(0.3);
  });

  // (c) as replaced on 12 November 2026: a shoot that still holds itself up at its reach no longer stops there; it stops
  // turning upwards, and grows on along the line its tip has as its weight lets it (docs/ASSUMPTIONS_AUDIT.md section 12)
  it('lets a shoot that still holds itself up at its reach grow on past it, no longer turning up', () => {
    // a rod far too stiff to droop, so that only its own turning shapes it
    const stiff = withModel(library, WISTERIA, (m) => withParam(withParam(m, 'mechanics.woodModulusMPa', 300_000, 'a test: too stiff to droop'), 'mechanics.greenShootModulusMPa', 300_000, 'a test: too stiff to droop'));
    /** How much more steeply the shoots that were still rising `limit` out from their foot head at their ends than they did there, on average. */
    const turnedUpBeyond = (limit: number, reachM: number): { mean: number; n: number; stopped: boolean } => {
      const taxa = withModel(stiff, WISTERIA, (m) => withParam(m, 'mechanics.searcherReachM', reachM, 'a test of the reach'));
      const sim = one(gapFrame, noHold(eager(taxa)), WISTERIA, 'untended', 4);
      let sum = 0;
      let n = 0;
      for (const a of inTheAir(sim)) {
        for (const s of stretches(a)) {
          const base = a.contact[s.base]!;
          const at = s.points.findIndex((i) => distance(a.contact[i]!, base) >= limit);
          if (at < 1 || s.points.length - at < 12) continue;
          const dirZ = (k: number) => {
            const p = a.contact[s.points[k - 1]!]!;
            const q = a.contact[s.points[k]!]!;
            return (q.z - p.z) / distance(p, q);
          };
          // a shoot still rising when it gets there, with room left to turn further up
          if (dirZ(at) < 0.3 || dirZ(at) > 0.85) continue;
          sum += dirZ(s.points.length - 1) - dirZ(at);
          n++;
        }
      }
      return { mean: sum / Math.max(1, n), n, stopped: sim.decisions.some((d) => d.kind === 'stopped' && d.text.includes('held itself out')) };
    };
    for (const limit of [reach, 0.5]) {
      const past = turnedUpBeyond(limit, limit);
      // the same shoots with a reach they never come to: they go on turning up to the way they seek
      const within = turnedUpBeyond(limit, 50);
      expect(past.stopped).toBe(false);
      expect(past.n, `reach ${limit} m`).toBeGreaterThan(0);
      expect(within.n, `reach ${limit} m`).toBeGreaterThan(0);
      // past its reach a shoot keeps its line, give or take its small wanderings; short of it, it turns up
      expect(Math.abs(past.mean), `reach ${limit} m`).toBeLessThan(0.08);
      expect(within.mean, `reach ${limit} m`).toBeGreaterThan(past.mean + 0.08);
    }
  });

  it('droops further with a thinner stem, on the same plant', () => {
    const drop = (radiusSquaredMm2: number): number => {
      const taxa = withModel(noHold(eager(library)), WISTERIA, (m) => withParam(m, 'thickening.tipRadiusSquaredMm2', radiusSquaredMm2, 'a test of stem thickness'));
      const sim = one(gapFrame, taxa, WISTERIA, 'untended', 4);
      let sum = 0;
      let n = 0;
      for (const a of inTheAir(sim)) {
        for (const s of stretches(a)) {
          if (s.points.length < 12) continue;
          sum += a.contact[s.points[s.points.length - 1]!]!.z - a.contact[s.base]!.z;
          n++;
        }
      }
      expect(n).toBeGreaterThan(5);
      return sum / n;
    };
    // tips of shoots 3 mm thick end, on average, well below those of shoots 6 mm thick
    expect(drop(2.25)).toBeLessThan(drop(9) - 0.2);
  });

  it('puts nothing below the ground, and stops a hanging shoot where it touches down', () => {
    // shoots thrown from low on the frame, long enough to reach the ground
    // many long limp shoots thrown from low on the frame: they hang, and the lowest of them reach the ground
    const low = withModel(noHold(eager(library)), WISTERIA, (m) =>
      withParam(withParam(withParam(m, 'organs.clearStemHeightM', 0.3, 'a test: shoots from low down'), 'organs.whipLengthM', [1.6, 2.4], 'a test: long shoots'), 'mechanics.woodModulusMPa', 300, 'a test: limp shoots'),
    );
    const sim = one(specimenFrame, low, WISTERIA, 'untended', 4);
    const landed = sim.decisions.filter((d) => d.kind === 'stopped' && d.text.includes('reached the ground'));
    expect(landed.length).toBeGreaterThan(0);
    for (const run of [sim, untended]) {
      for (const a of run.axes.values()) for (const p of a.contact) expect(p.z, a.id).toBeGreaterThanOrEqual(0);
    }
    for (const d of landed) {
      const a = sim.axes.get(d.axisId!)!;
      expect(a.tip.state).toBe('stopped');
      expect(a.contact[a.contact.length - 1]!.z).toBeLessThan(0.01);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// (e) Not through the timber
// ---------------------------------------------------------------------------------------------------------------
describe('the timber and the cables', () => {
  /** Half the least thickness of a section: nearer to its centre line than this is inside it, whichever way it is turned. */
  const inside = (s: Section): number => (s.shape === 'round' ? s.diameterMm : Math.min(s.widthMm, s.depthMm)) / 2000;
  const elements = (bower: Bower): { id: string; points: readonly Vec3[]; r: number }[] => [
    ...bower.members.map((m) => ({ id: m.id, points: m.curve.points, r: inside(m.section) })),
    ...bower.supports.map((s) => ({ id: s.id, points: s.curve.points, r: s.diameterMm / 2000 })),
  ];
  const toElement = (p: Vec3, q: Vec3, e: { points: readonly Vec3[] }): number => {
    let least = Infinity;
    for (let i = 0; i + 1 < e.points.length; i++) least = Math.min(least, segmentDistance(p, q, e.points[i]!, e.points[i + 1]!));
    return least;
  };

  it('is never entered by a length of stem laid in the air', () => {
    const vault = new Simulation(wisteriaOnVault({ taxa: library, care: 'untended', years: 5 })).runUntil('2031-12-31');
    for (const sim of [vault, one(specimenFrame, library, WISTERIA, 'untended', 6)]) {
      const all = elements(sim.scenario.bower);
      let checked = 0;
      for (const a of inTheAir(sim)) {
        for (const s of stretches(a)) {
          for (const i of s.points) {
            const from = a.contact[i - 1]!;
            const to = a.contact[i]!;
            for (const e of all) {
              // a shoot starts on a member, and at a joint inside the ones that cross there: it may come out, never go further in
              const end = toElement(to, to, e);
              if (end >= e.r - 0.002 || end >= toElement(from, from, e) - 1e-6) continue;
              throw new Error(`${a.id} goes ${((e.r - end) * 1000).toFixed(1)} mm into ${e.id} at point ${i}`);
            }
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(200);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// (f) Taking hold again: how a climber crosses a gap
// ---------------------------------------------------------------------------------------------------------------
describe('a searching shoot that comes within reach of a support it can grasp', () => {
  const sim = one(gapFrame, eager(library), WISTERIA, 'untended', 5);
  const wire = [...gapFrame.graph.edges.values()].filter((e) => e.kind === 'cable');
  const holders = [...sim.axes.values()].filter((a) => a.runs.some((r) => wire.some((e) => e.id === r.edgeId)));

  it('has a cable in front of it that no route leads to', () => {
    expect(wire.length).toBe(1);
    const station = gapFrame.rootStations[0]!;
    const reached = gapFrame.graph.reach(station.entryNodeIds);
    expect(reached.has(wire[0]!.from)).toBe(false);
    expect(reached.has(wire[0]!.to)).toBe(false);
  });

  it('takes hold of it from the air, and carries on along it as supported growth', () => {
    expect(holders.length).toBeGreaterThan(0);
    for (const a of holders) {
      const run = a.runs[0]!;
      expect(run.by).toBe('plant');
      expect(run.mode).toBe('twine');
      expect(['contacted', 'grasped']).toContain(run.status);
      expect(ATTACHMENT_STATUS).toContain(run.status);
      // it came through the air: the point before the hold stands on nothing, and the first point of the hold is on the cable
      expect(isFree(a, run.firstPoint - 1), a.id).toBe(true);
      expect(isFree(a, run.firstPoint), a.id).toBe(false);
      // and it left its support more than a grasp away from the cable: the gap was a gap
      expect(distance(a.contact[0]!, a.contact[run.firstPoint]!)).toBeGreaterThan(shootParam(library.get(WISTERIA)!.model, 'attachment.graspReachM'));
      // supported growth: stem laid along the cable after the hold
      expect(run.lastPoint, a.id).toBeGreaterThanOrEqual(run.firstPoint);
    }
    expect(holders.some((a) => a.runs[0]!.lastPoint - a.runs[0]!.firstPoint > 5)).toBe(true);
    const said = sim.decisions.filter((d) => d.kind === 'attached');
    expect(said.length).toBeGreaterThanOrEqual(holders.length);
    expect(said[0]!.text).toContain('took hold');
  });

  it('calls a hold a grasp once a coil of stem lies along the support', () => {
    const coil = param(library.get(WISTERIA)!.model, 'attachment.minPitchM');
    for (const a of holders) {
      const run = a.runs[0]!;
      const laid = a.lengthAt[run.lastPoint]! - a.lengthAt[run.firstPoint]!;
      if (run.status === 'grasped') expect(laid, a.id).toBeGreaterThanOrEqual(coil - 1e-9);
      else expect(laid, a.id).toBeLessThan(coil + STEP);
    }
  });

  it('leaves alone a member that is already carrying all the stems it can', () => {
    const capacity = param(library.get(WISTERIA)!.model, 'architecture.maxStemsPerRoute');
    const holding = holders.filter((a) => a.runs.some((r) => r.edgeId === wire[0]!.id && r.status !== 'detached'));
    expect(holding.length).toBeLessThanOrEqual(capacity);
    // on a vault left untended for years, no stretch of route carries more shoots from the air than it has room for
    const vault = new Simulation(wisteriaOnVault({ taxa: library, care: 'untended', years: 6 })).runUntil('2032-12-31');
    const fromAir = new Map<string, number>();
    for (const a of vault.axes.values()) {
      if (a.role === 'leader' || a.role === 'lateral') continue;
      for (const r of a.runs) if (r.status !== 'detached') fromAir.set(r.edgeId, (fromAir.get(r.edgeId) ?? 0) + 1);
    }
    expect(fromAir.size).toBeGreaterThan(5);
    const primary = param(library.get(WISTERIA)!.model, 'architecture.maxStemsPerPrimaryMember');
    for (const [, n] of fromAir) expect(n).toBeLessThanOrEqual(Math.max(capacity, primary));
  });

  it('takes hold of nothing when its growth model gives it no reach, or when it cannot grasp what it meets', () => {
    const none = one(gapFrame, noHold(eager(library)), WISTERIA, 'untended', 5);
    expect(none.decisions.some((d) => d.kind === 'attached')).toBe(false);
    for (const a of none.axes.values()) if (a.role !== 'leader' && a.role !== 'lateral') expect(a.runs.length, a.id).toBe(0);
    // a twiner that can pass round nothing thicker than 3 mm cannot take a 5 mm cable, however near it comes
    const weak = one(gapFrame, withModel(eager(library), WISTERIA, (m) => withParam(m, 'attachment.maxGraspDiameterMm', 3, 'a test: a feeble grasp')), WISTERIA, 'trained', 5);
    expect(weak.decisions.some((d) => d.kind === 'attached')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The framework is the framework's: what shoots in the air do does not reroute it
// ---------------------------------------------------------------------------------------------------------------
describe('the wisteria reference scenario', () => {
  const END = '2035-12-31';
  const run = (taxa: Growable, care: 'trained' | 'untended', extra: Partial<Scenario> = {}) => new Simulation({ ...wisteriaOnVault({ taxa, care, years: 9 }), ...extra }).runUntil(END);
  const without_ = noHold(library);
  const framework = (sim: Simulation) => sim.summaries.map((s) => `${s.plantId} ${s.year} ${s.frameworkM.toFixed(6)} ${s.highestM.toFixed(6)}`);
  // an axis's id carries a serial number that counts every shoot and bud made before it, so the stems are told by
  // what they are and when they began: plant, role, order, day, and the members they went along, in order
  const frameworkRuns = (sim: Simulation) =>
    [...sim.axes.values()].filter((a) => a.role === 'leader' || a.role === 'lateral').map((a) => `${a.plantId} ${a.role} ${a.order} ${a.bornDay} ${a.lengthAt[a.contact.length - 1]!.toFixed(6)}:${a.runs.map((r) => `${r.edgeId}/${r.mode}/${r.by}`).join('>')}`);

  for (const care of ['trained', 'untended'] as const) {
    it(`builds the same framework, member for member, whether or not shoots in the air take hold (${care})`, () => {
      const holding = run(library, care);
      const without = run(without_, care);
      expect(holding.decisions.filter((d) => d.kind === 'attached').length).toBeGreaterThan(care === 'trained' ? 3 : 20);
      expect(without.decisions.filter((d) => d.kind === 'attached').length).toBe(0);
      expect(framework(holding)).toEqual(framework(without));
      expect(frameworkRuns(holding)).toEqual(frameworkRuns(without));
      // what the holds add is route held: a few stretches more, and none taken from the framework
      for (const s of holding.summaries.filter((x) => x.year === 2035)) {
        const w = without.summaries.find((x) => x.year === 2035 && x.plantId === s.plantId)!;
        expect(s.routeShare, s.plantId).toBeGreaterThanOrEqual(w.routeShare);
        expect(s.routeShare - w.routeShare, s.plantId).toBeLessThan(care === 'trained' ? 0.02 : 0.06);
        expect(s.runsSelf + s.runsTied, s.plantId).toBeGreaterThanOrEqual(w.runsSelf + w.runsTied);
      }
    });
  }

  it('builds the same framework however stiff or heavy its shoots are: their mechanics draw on none of its random numbers', () => {
    // light not acting, so that the only way a shoot could reach the framework is through a shared random stream
    const still = { lightResponse: false };
    const plain = run(library, 'untended', still);
    const limp = withModel(library, WISTERIA, (m) => withParam(withParam(m, 'mechanics.woodModulusMPa', 400, 'a comparison: limp shoots'), 'mechanics.leafFreshMassPerAreaKgM2', 0.5, 'a comparison: heavy leaves'));
    const other = run(limp, 'untended', still);
    expect(framework(other)).toEqual(framework(plain));
    expect(frameworkRuns(other)).toEqual(frameworkRuns(plain));
    // though the shoots themselves hang quite differently
    const meanDrop = (sim: Simulation) => {
      const drops = inTheAir(sim).flatMap((a) => stretches(a).filter((s) => s.points.length > 10).map((s) => a.contact[s.base]!.z - a.contact[s.points[s.points.length - 1]!]!.z));
      return drops.reduce((x, y) => x + y, 0) / drops.length;
    };
    expect(meanDrop(other)).toBeGreaterThan(meanDrop(plain) + 0.2);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// (g) Light
// ---------------------------------------------------------------------------------------------------------------
describe('which way the light is', () => {
  it('is nearly straight up in the open in southern England, leaning to the south', () => {
    const light = openSkyLight();
    for (const doy of [105, 172, 258]) {
      const v = light(v3(0, 0, 2), doy);
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 9);
      expect(v.z, String(doy)).toBeGreaterThan(0.8);
      expect(v.y, String(doy)).toBeLessThan(-0.05);
      expect(Math.abs(v.x), String(doy)).toBeLessThan(0.02);
    }
    // the sun's side at midsummer: south and well up; in the southern hemisphere, north
    expect(sunSide({ latitudeDeg: 51.5, bearingDeg: 0 }, 172).y).toBeLessThan(-0.1);
    expect(sunSide({ latitudeDeg: -51.5, bearingDeg: 0 }, 80).y).toBeGreaterThan(0.1);
  });

  it('turns the same shoot the other way when the light is on the other side', () => {
    const from = (x: number): Partial<Scenario> => ({ lightFrom: () => normalize(v3(x, 0, 0.35)) });
    const noHoldNoReach = noHold(eager(library));
    const east = one(gapFrame, noHoldNoReach, WISTERIA, 'untended', 3, from(1));
    const west = one(gapFrame, noHoldNoReach, WISTERIA, 'untended', 3, from(-1));
    expect(east.lightAsked.scenario).toBeGreaterThan(0);
    expect(east.lightAsked.lightModel + east.lightAsked.openSky).toBe(0);
    // the first shoot each plant throws is the same shoot: same day, same place, same first heading
    const first = (sim: Simulation) => inTheAir(sim).sort((a, b) => a.bornDay - b.bornDay || (a.id < b.id ? -1 : 1))[0]!;
    const e = first(east);
    const w = first(west);
    expect(e.id).toBe(w.id);
    expect(e.bornDay).toBe(w.bornDay);
    expect(e.contact[0]).toEqual(w.contact[0]);
    const n = Math.min(e.contact.length, w.contact.length) - 1;
    expect(n).toBeGreaterThan(10);
    expect(e.contact[n]!.x - w.contact[n]!.x).toBeGreaterThan(0.15);
    // and every shoot of the plant, taken together, leans to its light
    const lean = (sim: Simulation) => {
      const xs = inTheAir(sim).flatMap((a) => stretches(a).map((s) => a.contact[s.points[s.points.length - 1]!]!.x - a.contact[s.base]!.x));
      return xs.reduce((x, y) => x + y, 0) / xs.length;
    };
    expect(lean(east)).toBeGreaterThan(lean(west) + 0.15);
  });

  it('is asked of the light model, and of the open sky only where the model is told not to act', () => {
    const acting = one(specimenFrame, library, WISTERIA, 'untended', 4);
    // (a shoot asks every 0.2 m while it steers, which since 12 November 2026 it stops doing once past its reach)
    expect(acting.lightAsked.lightModel).toBeGreaterThan(5);
    expect(acting.lightAsked.scenario).toBe(0);
    const still = one(specimenFrame, library, WISTERIA, 'untended', 4, { lightResponse: false });
    expect(still.lightAsked.lightModel).toBe(0);
    expect(still.lightAsked.openSky).toBeGreaterThan(5);
    // near a member the model's answer is still a direction, upward on an open frame
    const plant = acting.plants.get('plant')!;
    const here = acting.light.from(plant, v3(0.9, -0.1, 2.7), acting.calendar.dateOf(acting.calendar.dayOf('2030-06-15')))!;
    expect(Math.hypot(here.x, here.y, here.z)).toBeCloseTo(1, 9);
    expect(here.z).toBeGreaterThan(0.6);
    // and far from anything it reads light at, it has none to give
    expect(acting.light.from(plant, v3(40, 40, 2), acting.calendar.dateOf(acting.calendar.dayOf('2030-06-15')))).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// (h) The numbers, and the generic shoot
// ---------------------------------------------------------------------------------------------------------------
describe('the numbers behind a shoot in the air', () => {
  it('has a generic value, labelled as such, for every one of them', () => {
    // eleven, and since 12 November 2026 the lean a shoot sets out at and where a leaf's weight hangs off its stem
    expect(SHOOT_PARAM_KEYS.length).toBe(13);
    for (const key of SHOOT_PARAM_KEYS) {
      const g = GENERIC_SHOOT[key];
      expect(GROWTH_PARAMS_OPTIONAL as readonly string[], key).toContain(key);
      expect(g.value, key).toBeGreaterThan(0);
      // none is a measurement of a plant in the library, and none says it is
      expect(g.status, key).toBe('provisional_design_assumption');
      expect(g.basis, key).toContain('Generic, not this taxon\'s');
      expect(g.range![0], key).toBeLessThanOrEqual(g.value);
      expect(g.range![1], key).toBeGreaterThanOrEqual(g.value);
    }
  });

  it('uses a taxon\'s own value where its model gives one, and the generic one where it gives none', () => {
    const own = library.get(WISTERIA)!.model;
    // the wisteria's model gives every one but the two added on 12 November 2026, which no model gives yet
    expect(genericShootKeys(own)).toEqual(['mechanics.leanDeg', 'mechanics.leafWeightOffsetShare']);
    const stripped = SHOOT_PARAM_KEYS.reduce((m, key) => withUnknown(m, key), own);
    expect(genericShootKeys(stripped)).toEqual(SHOOT_PARAM_KEYS);
    for (const key of SHOOT_PARAM_KEYS) expect(shootParam(stripped, key), key).toBe(GENERIC_SHOOT[key].value);
    expect(shootParam(withParam(own, 'mechanics.searcherReachM', 0.6, 'a test'), 'mechanics.searcherReachM')).toBe(0.6);
    // a model file may leave every one of them out, and is then read as leaving them unknown
    const json = JSON.parse(readFileSync(`${speciesDir}/${WISTERIA}/model.json`, 'utf8'));
    for (const key of SHOOT_PARAM_KEYS) delete json.params[key];
    expect(genericShootKeys(parseGrowthModel(json))).toEqual(SHOOT_PARAM_KEYS);
    // and may not give nonsense
    json.params['mechanics.woodModulusMPa'] = { value: 0, status: 'provisional_design_assumption', basis: 'nothing' };
    expect(() => parseGrowthModel(json)).toThrow(/mechanics.woodModulusMPa/);
  });

  it('says once for each plant that it is drawn with the generic shoot, and counts those numbers as the assumptions they are', () => {
    const generic = withModel(library, WISTERIA, (m) => SHOOT_PARAM_KEYS.reduce((x, key) => withUnknown(x, key), m));
    const sim = new Simulation(wisteriaOnVault({ taxa: generic, care: 'untended', years: 3 })).runUntil('2029-12-31');
    // (a plant whose long shoots leave their stems at the generic side shoot's angles says that in a line of its own)
    const said = sim.decisions.filter((d) => d.kind === 'generic_shoot' && d.text.includes('generic shoot of a woody climber'));
    expect(said.map((d) => d.plantId)).toEqual(['wisteria.0', 'wisteria.1']);
    expect(said[0]!.text).toContain('generic shoot of a woody climber');
    for (const key of SHOOT_PARAM_KEYS) expect(said[0]!.text).toContain(key);
    const alerts = designReport(sim).alerts.filter((a) => a.kind === 'generic_shoot');
    expect([...new Set(alerts.map((a) => a.plantId))]).toEqual(['wisteria.0', 'wisteria.1']);
    // with its own numbers the plant is not said to be generic
    const own = new Simulation(wisteriaOnVault({ taxa: library, care: 'untended', years: 1 })).runUntil('2027-12-31');
    // (but for the two numbers no model gives yet: nothing else of the generic shoot is named)
    for (const d of own.decisions.filter((x) => x.kind === 'generic_shoot' && x.text.includes('generic shoot of a woody climber'))) expect(d.text).toContain('no value for mechanics.leanDeg, mechanics.leafWeightOffsetShare.');
    // the provenance of a run lists the generic value used, not a gap
    const entries = modelProvenance(generic.get(WISTERIA)!.model).filter((e) => (SHOOT_PARAM_KEYS as string[]).includes(e.path));
    expect(entries.length).toBe(SHOOT_PARAM_KEYS.length);
    for (const e of entries) {
      expect(e.status, e.path).toBe('provisional_design_assumption');
      expect(e.value, e.path).not.toBeNull();
      expect(e.owner).toContain('generic shoot');
    }
  });

  it('names the three ways a shoot in the air can stand', () => {
    expect(SHOOT_POSTURE).toEqual(['self_supporting', 'pendulous', 'plumb']);
  });
});
