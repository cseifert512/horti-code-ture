import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOWER_FRAME, type BowerDescription, describeBower, readBower } from '../src/bower/description.ts';
import { makeHemisphereBower } from '../src/bower/hemisphere.ts';
import type { Bower } from '../src/bower/types.ts';
import { makeVaultBower } from '../src/bower/vault.ts';
import type { Polyline } from '../src/math/polyline.ts';
import { type Vec3, distance } from '../src/math/vec3.ts';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { MODELLED_ROUTINE, type PlantingPlan, parsePlantingPlan, plantingOn } from '../src/sim/planting.ts';
import { designReport } from '../src/sim/report.ts';
import { HEMISPHERE_VIEWPOINTS } from '../src/sim/scenarios.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const json = (p: string): unknown => JSON.parse(readFileSync(here(p), 'utf8'));
const taxa = loadGrowable(here('../../../species'));
const arbourFile = () => json('../../../examples/arbour.bower.json') as BowerDescription;
const arbour = readBower(arbourFile(), 'arbour.bower.json');
const degrees = (b: Bower) => [...b.graph.nodes.keys()].map((id) => b.graph.edgesAt(id).length).sort((x, y) => x - y);

/** Distance from a point to a polyline. */
function off(curve: Polyline, p: Vec3): number {
  let best = Infinity;
  for (let i = 0; i + 1 < curve.points.length; i++) {
    const a = curve.points[i]!;
    const b = curve.points[i + 1]!;
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / (ab.x * ab.x + ab.y * ab.y + ab.z * ab.z || 1)));
    best = Math.min(best, distance(p, { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t }));
  }
  return best;
}

// DEVELOPMENT_GUIDE.md stage 5, "Input Bower shell". SIMULATION_KEY.md section 2: the manufactured graph.
describe('a Bower read from a description of what is built', () => {
  it('joins elements where they touch and cuts each into the stretches between its joints', () => {
    const { bower, warnings } = arbour;
    expect(warnings).toEqual([]);
    expect(bower.members).toHaveLength(11);
    expect(bower.supports).toHaveLength(3);
    // 4 post feet, 2 cable feet, 6 joints along each beam, 5 where the middle cable crosses the rafters
    expect(bower.graph.nodes.size).toBe(23);
    const stretches = (id: string) => [...bower.graph.edges.values()].filter((e) => e.host.id === id);
    expect(stretches('beam.s')).toHaveLength(5);
    expect(stretches('beam.n')).toHaveLength(5);
    expect(stretches('post.sw')).toHaveLength(1);
    expect(stretches('rafter.2')).toHaveLength(2);
    expect(stretches('cable.tie.mid')).toHaveLength(4);
    expect(stretches('cable.riser.s')).toHaveLength(1);
    // posts 10.4 m, beams 8 m, rafters 15 m, cables 9 m
    expect(bower.graph.totalLength).toBeCloseTo(42.4, 1);
    expect(bower.facts).toMatchObject({ members: 11, cables: 3, joints: 23, steelCableM: 9, thickestCableMm: 4, routeOutOfReachM: 0 });
  });

  it('keeps every stretch on the element it was cut from', () => {
    for (const e of arbour.bower.graph.edges.values()) {
      const host = e.host.type === 'member' ? arbour.bower.members.find((m) => m.id === e.host.id)!.curve : arbour.bower.supports.find((s) => s.id === e.host.id)!.curve;
      for (const p of e.curve.points) expect(off(host, p), e.id).toBeLessThan(0.12);
      expect(e.kind).toBe(e.host.type === 'member' ? 'timber' : 'cable');
      expect(e.axis).toBe(e.curve);
    }
  });

  it('records what each cable is fixed to', () => {
    const on = (id: string) => [...arbour.bower.supports.find((s) => s.id === id)!.mountedOn].sort();
    expect(on('cable.riser.s')).toEqual(['beam.s']);
    expect(on('cable.tie.mid')).toEqual(['rafter.0', 'rafter.1', 'rafter.2', 'rafter.3', 'rafter.4']);
  });

  it('leads each root station to the nearest thing a plant can climb', () => {
    const entry = (id: string) => arbour.bower.graph.nodes.get(arbour.bower.rootStations.find((s) => s.id === id)!.entryNodeIds[0]!)!.position;
    expect(entry('bed.sw')).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(entry('bed.s')).toMatchObject({ x: 0.5, y: 0, z: 0.1 });
    expect(entry('bed.ne')).toMatchObject({ x: 4, y: 3, z: 0 });
  });

  it('marks the stretches that pass through a declared zone, and carries the viewpoints', () => {
    const inWalk = [...arbour.bower.graph.edges.values()].filter((e) => e.zones.includes('walk'));
    expect(inWalk).toHaveLength(0); // everything built stands at the edges or above 2.1 m
    expect(arbour.bower.zones).toHaveLength(1);
    expect(arbour.viewpoints.map((v) => v.id)).toEqual(['lawn', 'under']);
  });
});

describe('a description that cannot be a Bower', () => {
  const broken = (change: (d: BowerDescription) => void) => {
    const d = arbourFile();
    change(d);
    return () => readBower(d, 'test.json');
  };

  it('is refused with the reason, and the file named', () => {
    expect(broken((d) => ((d as { frame: string }).frame = 'y up, millimetres'))).toThrow(/test\.json is not a valid Bower description[\s\S]*frame/);
    expect(broken((d) => ((d as Record<string, unknown>).rods = []))).toThrow(/not a valid Bower description/);
    expect(broken((d) => (d.members[1]!.id = 'post.sw'))).toThrow('the id "post.sw" is used twice');
    expect(broken((d) => (d.members[0]!.points = [[0, 0, 0], [0, 0, 0]]))).toThrow('"post.sw" has no length');
    expect(broken((d) => (d.stations[0]!.position = [-6, -6, 0]))).toThrow(/station "bed\.sw" has nothing to climb within 1\.5 m: the nearest joint or member end is 8\.\d+ m away/);
  });

  it('is refused when it has plainly been drawn in millimetres', () => {
    const mm = broken((d) => {
      for (const m of d.members) m.points = m.points.map(([x, y, z]) => [x * 1000, y * 1000, z * 1000]);
    });
    expect(mm).toThrow('lengths must be in metres (this looks like millimetres)');
  });
});

describe('a description with something for the designer to look at', () => {
  it('is read, with a warning for a cable fixed to nothing', () => {
    const d = arbourFile();
    d.cables!.push({ id: 'stray', diameterMm: 4, points: [[2, 1, 0.5], [2, 2, 0.5]] });
    const { warnings, bower } = readBower(d);
    expect(warnings.some((w) => w.includes('cable "stray" touches no timber member'))).toBe(true);
    expect(warnings.some((w) => w.includes('1.0 m of route cannot be reached from any root station'))).toBe(true);
    expect(bower.facts.routeOutOfReachM).toBe(1);
  });

  it('is read, with the route a plant cannot arrive at counted', () => {
    const d = arbourFile();
    d.members.push({ id: 'bench', tier: 'sub_lattice', role: 'bench', section: { shape: 'rect', widthMm: 45, depthMm: 300 }, points: [[1, 1, 0.45], [3, 1, 0.45]] });
    const { warnings } = readBower(d);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2.0 m of route cannot be reached from any root station, on 1 element (bench)');
  });
});

describe('the reference shells, written out and read back', () => {
  const made = makeHemisphereBower({ diameterM: 15, stations: 12 });
  const back = readBower(JSON.parse(JSON.stringify(describeBower(made, HEMISPHERE_VIEWPOINTS))), 'hemisphere');

  it('give the hemisphere the same joints and the same routes', () => {
    expect(back.warnings).toEqual([]);
    expect(back.bower.graph.nodes.size).toBe(made.graph.nodes.size);
    expect(back.bower.graph.edges.size).toBe(made.graph.edges.size);
    expect(degrees(back.bower)).toEqual(degrees(made));
    expect(back.bower.members).toHaveLength(made.members.length);
    expect(back.bower.supports).toHaveLength(made.supports.length);
    // routes follow centre lines where the generator follows the outer face: within one per cent
    expect(Math.abs(back.bower.graph.totalLength - made.graph.totalLength) / made.graph.totalLength).toBeLessThan(0.01);
    expect(back.viewpoints).toHaveLength(3);
  });

  it('still make the crown nearly twelve metres away by the shortest route', () => {
    // KEY.md section 4: 7.5 m up, pi * R / 2 = 11.78 m along the surface
    const { graph, rootStations } = back.bower;
    // the crown is the one joint where all twelve ribs meet
    const crowns = [...graph.nodes.values()].filter((n) => graph.edgesAt(n.id).length === 12);
    expect(crowns).toHaveLength(1);
    const crown = crowns[0]!;
    expect(crown.position.z).toBeGreaterThan(7.3);
    for (const s of rootStations) {
      const foot = graph.nodes.get(s.entryNodeIds[0]!)!.position;
      expect(foot.z).toBeLessThan(0.01);
      expect(distance(foot, s.position)).toBeLessThan(0.5);
      const d = graph.reach(s.entryNodeIds).get(crown.id)!.distance;
      expect(d).toBeGreaterThan(11.5);
      expect(d).toBeLessThan(12);
    }
  });

  it('describe the same thing a second time round', () => {
    const once = describeBower(made);
    const twice = describeBower(readBower(JSON.parse(JSON.stringify(once))).bower);
    expect(twice.members).toEqual(once.members);
    expect(twice.cables).toEqual(once.cables);
    expect(twice.stations).toEqual(once.stations);
  });

  it('read the vault with every member a route, its ribs included', () => {
    const vault = makeVaultBower();
    const { bower, warnings } = readBower(JSON.parse(JSON.stringify(describeBower(vault))), 'vault');
    expect(warnings).toEqual([]);
    expect(bower.members).toHaveLength(vault.members.length);
    expect(new Set([...bower.graph.edges.values()].filter((e) => e.kind === 'timber').map((e) => e.host.id)).size).toBe(vault.members.length);
    // the hand-built graph leaves the ribs above the eaves out, so the read one has more route
    expect(bower.graph.totalLength).toBeGreaterThan(vault.graph.totalLength);
    expect(bower.facts.routeOutOfReachM).toBe(0);
  });
});

describe('the example files', () => {
  it('are all read without anything to look at', () => {
    for (const f of ['arbour', 'hemisphere-15m']) {
      const { warnings, bower } = readBower(json(`../../../examples/${f}.bower.json`), f);
      expect(warnings, f).toEqual([]);
      expect((json(`../../../examples/${f}.bower.json`) as BowerDescription).frame).toBe(BOWER_FRAME);
      const plan = parsePlantingPlan(json(`../../../examples/${f}.planting.json`), f);
      const scenario = plantingOn(bower, plan, { taxa, years: 2 });
      expect(scenario.plantings).toHaveLength(plan.plants.length);
    }
  });

  it('give the reference palette the same twelve plants as the built-in scenario', () => {
    const plan = parsePlantingPlan(json('../../../examples/hemisphere-15m.planting.json'));
    expect(plan.plants).toHaveLength(12);
    const { bower, viewpoints } = readBower(json('../../../examples/hemisphere-15m.bower.json'));
    const sim = new Simulation(plantingOn(bower, plan, { taxa, years: 4, viewpoints })).runUntil('2030-12-31');
    const report = designReport(sim);
    for (const p of report.plants) expect(p.frameworkM, p.plantId).toBeGreaterThan(3);
    expect(report.months.find((m) => m.month === 7)!.views).toHaveLength(3);
  });
});

describe('a planting plan', () => {
  const plan = parsePlantingPlan(json('../../../examples/arbour.planting.json'));

  it('gives each plant the routine the model can act on, and no other', () => {
    const s = plantingOn(arbour.bower, plan, { taxa, years: 3 });
    const kinds = (id: string) => [...new Set(s.events.filter((e) => e.plantId === id).map((e) => e.type))].sort();
    expect(kinds('wisteria')).toEqual(['monitor', 'spur_prune']);
    expect(kinds('clematis')).toEqual(['hard_prune']);
    expect(kinds('rose')).toEqual([]);
    expect(kinds('honeysuckle')).toEqual([]);
    expect(Object.keys(MODELLED_ROUTINE).every((id) => taxa.has(id))).toBe(true);
    expect(plantingOn(arbour.bower, plan, { taxa, years: 3, care: 'untended' }).events).toEqual([]);
    expect(s.name).toBe('Wisteria, a summer clematis, a rose and an evergreen honeysuckle on a small timber arbour, trained');
  });

  it('sets an annual out in May and again each year', () => {
    const annual: PlantingPlan = { schemaVersion: 1, name: 'One annual', plants: [{ plantId: 'susan', taxonId: 'thunbergia-alata', stationId: 'bed.s' }] };
    const s = plantingOn(arbour.bower, annual, { taxa, years: 3 });
    expect(s.plantings[0]!.date).toBe('2027-05-20');
    expect(s.events.map((e) => `${e.type} ${e.date}`)).toEqual(['annual_replant 2028-05-20', 'annual_replant 2029-05-20']);
  });

  it('is refused where it names a plant that cannot be grown, a station that is not there, or one name twice', () => {
    const one = (p: PlantingPlan['plants'][number]): PlantingPlan => ({ schemaVersion: 1, name: 'Test', plants: [p] });
    expect(() => plantingOn(arbour.bower, one({ plantId: 'box', taxonId: 'sarcococca-confusa', stationId: 'bed.s' }), { taxa })).toThrow(/"sarcococca-confusa" cannot be grown\. Taxa with a growth model: akebia-quinata, /);
    expect(() => plantingOn(arbour.bower, one({ plantId: 'w', taxonId: 'wisteria-sinensis', stationId: 'bed.x' }), { taxa })).toThrow('has no root station "bed.x". It has: bed.sw, bed.s, bed.ne, bed.n');
    expect(() => plantingOn(arbour.bower, { ...plan, plants: [plan.plants[0]!, plan.plants[0]!] }, { taxa })).toThrow('the plant id "wisteria" is used twice');
    expect(() => parsePlantingPlan({ schemaVersion: 1, name: 'x', plants: [] }, 'p.json')).toThrow(/p\.json is not a valid planting plan/);
  });
});

// CONSTRAINTS_AND_PHENOLOGY.md section 2: each plant holds what its own mechanism can hold.
describe('four climbers on the arbour, eight years on', () => {
  const sim = new Simulation(plantingOn(arbour.bower, parsePlantingPlan(json('../../../examples/arbour.planting.json')), { taxa, years: 8, viewpoints: arbour.viewpoints })).runUntil('2034-12-31');
  const report = designReport(sim);
  const { graph } = arbour.bower;
  const runs = (id: string) =>
    sim.plants
      .get(id)!
      .axisIds.flatMap((a) => sim.axes.get(a)!.runs)
      .filter((r) => r.status !== 'detached')
      .map((r) => ({ r, edge: graph.edges.get(r.edgeId)! }));

  it('has the wisteria twine the post by itself and the clematis the cable', () => {
    const post = runs('wisteria').filter((x) => x.edge.host.id === 'post.sw');
    expect(post.length).toBeGreaterThan(0);
    for (const { r } of post) expect(r).toMatchObject({ mode: 'twine', by: 'plant' });
    const riser = runs('clematis').filter((x) => x.edge.host.id === 'cable.riser.s');
    expect(riser.length).toBeGreaterThan(0);
    for (const { r } of riser) expect(r.by).toBe('plant');
    for (const { r, edge } of runs('clematis')) if (edge.kind === 'timber') expect(r.by).not.toBe('plant');
    for (const { r } of runs('rose')) expect(r.by).not.toBe('plant');
  });

  it('keeps every supported stem on the surface of what carries it', () => {
    let checked = 0;
    for (const a of sim.axes.values()) {
      for (const r of a.runs) {
        if (r.status === 'detached') continue;
        const e = graph.edges.get(r.edgeId)!;
        const reach = (e.section.shape === 'round' ? e.section.diameterMm : Math.hypot(e.section.widthMm, e.section.depthMm)) / 2000;
        for (let i = r.firstPoint; i <= Math.min(r.lastPoint, a.alive - 1); i++) {
          const p = a.contact[i]!;
          expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
          // on the surface: no farther out than a corner of the section, allowing for the step on at a joint
          expect(off(e.curve, p), `${a.id} on ${e.id}`).toBeLessThan(reach + 0.15);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(2000);
  });

  it('leaves the cut-down clematis its three stubs each February, however many years it is done', () => {
    // one of its three stems finds the cable full and stalls at the foot: it must not stand as a stub of
    // no length whose regrowth becomes more stubs every year (the log once read "2264 stubs left")
    const cuts = sim.events.filter((e) => e.plantId === 'clematis' && e.type === 'hard_prune');
    expect(cuts).toHaveLength(7);
    for (const c of cuts) expect(c.outcome, c.date).toContain('3 stubs left to shoot again');
    const standing = sim.plants
      .get('clematis')!
      .axisIds.map((id) => sim.axes.get(id)!)
      .filter((a) => a.role === 'leader' && a.removedDay === null);
    expect(standing.length).toBeLessThanOrEqual(9);
  });

  it('hangs the wisteria from the rafters in May and reports what the arbour is made of', () => {
    expect(report.months.find((m) => m.month === 5)!.flowers.wisteria).toBeGreaterThan(50);
    expect(report.flowersByHeight.find((f) => f.plantId === 'wisteria' && f.zone === '2 to 3 m')!.count).toBeGreaterThan(50);
    expect(report.structure.steelCableM).toBeCloseTo(9, 6);
    expect(report.structure.steelShareOfRoute).toBeCloseTo(9 / 42.4, 2);
    expect(report.winter!.views.map((v) => v.viewpointId)).toEqual(['lawn', 'under']);
  });
});
