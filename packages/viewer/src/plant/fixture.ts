// The render test plant: hand-made render data that exercises every part of
// the plant renderer (stems that lengthen and thicken, leaves through a year,
// inflorescences from bud to petal fall, fruit) on any Bower.
//
// IT IS NOT A SIMULATION. Every size and date below was typed in to give the
// renderer something to draw. None of it describes how any plant grows, and
// none of it may be read as a growth rate, a flowering date or a dimension of
// a taxon. The geometry it lies on is real: the stems follow the Bower's own
// plant routes, placed with the core's liePath.
import { type Bower, Calendar, EVIDENCE_STATUS, type EvidenceStatus, RENDER_CONTRACT, type RenderData, type RenderStem, type SupportEdge, type Vec3, liePath, shortestRoute, vec } from '@horti/core';
import { hash2 } from '../util.ts';
import type { FruitSite } from './adapter.ts';

/** Arbitrary values for the test picture. */
const FIXTURE = {
  start: '2030-03-01',
  years: [2030, 2031] as const,
  // the leader lengthens over the first year, the side stems early in the second
  leaderGrows: ['2030-03-20', '2030-09-30'] as const,
  sideGrows: ['2031-04-10', '2031-07-15'] as const,
  leaderRadiusMm: [14, 2] as const,
  sideRadiusMm: [6, 2] as const,
  leafEveryM: 0.11,
  leafLengthM: [0.16, 0.28] as const,
  flowerEveryM: 0.34,
  flowerLengthM: [0.22, 0.34] as const,
  flower: { develop: '2031-04-05', open: '2031-04-27', spent: '2031-05-24', spreadDays: 6 },
  fruitLengthM: 0.12,
  fruit: { swell: ['2031-06-10', '2031-08-10'] as const, ripen: ['2031-09-10', '2031-10-25'] as const },
  /** Day of year. */
  season: { budburst: 91, growthEnd: 273, leafFlush: [95, 135] as const, autumnColour: [285, 315] as const, leafFall: [315, 345] as const },
  thickening: { tipRadiusMm: 2, exponent: 1 },
} as const;

interface PathPoint {
  contact: Vec3;
  away: Vec3;
  /** The route this point lies on. */
  edge: SupportEdge;
  /** Stem length from the base, m. */
  s: number;
}

/** Lay a stem along a chain of routes, starting at `fromNode`. */
function layAlong(bower: Bower, edgeIds: readonly string[], fromNode: string): PathPoint[] {
  const out: PathPoint[] = [];
  let at = fromNode;
  let s = 0;
  for (const id of edgeIds) {
    const edge = bower.graph.edges.get(id);
    if (!edge) continue;
    const path = liePath(edge, { reverse: edge.from !== at });
    path.points.forEach((p, i) => {
      if (i === 0 && out.length) return; // the joint is shared with the stretch before
      const prev = out[out.length - 1];
      if (prev) s += vec.distance(prev.contact, p);
      out.push({ contact: p, away: path.away[i]!, edge, s });
    });
    at = bower.graph.otherEnd(edge, at);
  }
  return out;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export interface TestPlant {
  data: RenderData;
  fruit: FruitSite[];
}

export function makeTestPlant(bower: Bower): TestPlant {
  const cal = new Calendar(FIXTURE.start);
  const lastDay = cal.dayOf(`${FIXTURE.years[1]}-12-31`);
  const plantId = 'test.0';
  const station = bower.rootStations[0];
  const data: RenderData = {
    contract: RENDER_CONTRACT,
    scenario: 'hand-made fixture',
    start: FIXTURE.start,
    lastDay,
    frame: 'right-handed, metres, x east, y north, z up',
    plants: [],
    stems: [],
    leaves: [],
    flowers: [],
    fruits: [],
    appendages: [],
    seasons: [],
    events: [],
    thickening: { ...FIXTURE.thickening },
    statement: 'A render test, not a simulation: hand-made data that exercises the plant renderer. It says nothing about how any plant grows.',
    assumptions: Object.fromEntries(EVIDENCE_STATUS.map((s) => [s, 0])) as Record<EvidenceStatus, number>,
  };
  const fruit: FruitSite[] = [];
  if (!station) return { data, fruit };

  // the leader follows the shortest route from the first station to the highest node
  let top = '';
  let topZ = -Infinity;
  for (const n of bower.graph.nodes.values()) {
    if (n.position.z > topZ) {
      topZ = n.position.z;
      top = n.id;
    }
  }
  const route = shortestRoute(bower, station.id, top);
  if (!route || route.edges.length === 0) return { data, fruit };

  const leaderDays = [cal.dayOf(FIXTURE.leaderGrows[0]), cal.dayOf(FIXTURE.leaderGrows[1])] as const;
  const sideDays = [cal.dayOf(FIXTURE.sideGrows[0]), cal.dayOf(FIXTURE.sideGrows[1])] as const;
  data.plants.push({ id: plantId, taxonId: 'render-test', label: 'Render test plant', stationId: station.id, plantedDay: leaderDays[0], leafHabit: 'deciduous', flowerDisplay: 'the raceme asset of the prototype' });
  for (const year of FIXTURE.years) {
    const doy = (d: number) => cal.dayOfYearDay(year, d);
    const s = FIXTURE.season;
    data.seasons.push({ plantId, year, budburstDay: doy(s.budburst), growthEndDay: doy(s.growthEnd), leafFlush: [doy(s.leafFlush[0]), doy(s.leafFlush[1])], autumnColour: [doy(s.autumnColour[0]), doy(s.autumnColour[1])], leafFall: [doy(s.leafFall[0]), doy(s.leafFall[1])] });
  }

  let serial = 0;
  const addStem = (id: string, role: RenderStem['role'], order: number, parentId: string | null, path: PathPoint[], days: readonly [number, number], radiusMm: readonly [number, number], flowering: boolean) => {
    const length = path[path.length - 1]?.s ?? 0;
    if (path.length < 2 || length <= 0) return;
    const stem: RenderStem = { id, plantId, parentId, role, order, contact: [], away: [], bornDay: [], removedDay: [], radiusMm: [] };
    let nextLeaf = 0.05;
    let nextFlower = 0.2;
    let side = 1;
    path.forEach((pt, i) => {
      const t = pt.s / length;
      const born = Math.round(mix(days[0], days[1], t));
      stem.contact.push(pt.contact.x, pt.contact.y, pt.contact.z);
      stem.away.push(pt.away.x, pt.away.y, pt.away.z);
      stem.bornDay.push(born);
      stem.removedDay.push(-1);
      stem.radiusMm.push(mix(radiusMm[0], radiusMm[1], t));

      const before = path[Math.max(0, i - 1)]!.contact;
      const after = path[Math.min(path.length - 1, i + 1)]!.contact;
      const tangent = vec.normalize(vec.sub(after, before));
      const across = vec.normalize(vec.cross(tangent, pt.away));

      if (pt.s >= nextLeaf && i < path.length - 2) {
        nextLeaf = pt.s + FIXTURE.leafEveryM * (0.8 + 0.4 * hash2(serial, 1));
        side = -side;
        // out to one side, up off the support, and a little forward along the stem
        const direction = vec.normalize(vec.add(vec.add(vec.scale(across, 0.75 * side), vec.scale(pt.away, 0.6)), vec.scale(tangent, 0.3)));
        data.leaves.push({
          plantId,
          stemId: id,
          position: [pt.contact.x, pt.contact.y, pt.contact.z],
          direction: [direction.x, direction.y, direction.z],
          lengthM: mix(FIXTURE.leafLengthM[0], FIXTURE.leafLengthM[1], hash2(serial, 2)),
          firstYear: cal.dateOf(born).year,
          lastYear: null,
          evergreen: false,
          bornDay: born + 2,
          removedDay: -1,
        });
        serial++;
      }

      // inflorescences hang below the member, where the stem runs overhead and is not too steep
      if (flowering && pt.s >= nextFlower && pt.away.z > 0.35 && pt.contact.z > 2.2) {
        nextFlower = pt.s + FIXTURE.flowerEveryM * (0.8 + 0.4 * hash2(serial, 3));
        const section = pt.edge.section;
        const halfWidth = (section.shape === 'rect' ? section.widthMm : section.diameterMm) / 2000;
        const depth = (section.shape === 'rect' ? section.depthMm : section.diameterMm) / 1000;
        const hang = vec.add(vec.add(pt.contact, vec.scale(across, (halfWidth + 0.05) * (hash2(serial, 4) < 0.5 ? -1 : 1))), vec.scale(pt.away, -(depth + 0.02)));
        const shift = Math.round((hash2(serial, 5) - 0.5) * 2 * FIXTURE.flower.spreadDays);
        data.flowers.push({
          plantId,
          stemId: id,
          position: [hang.x, hang.y, hang.z],
          lengthM: mix(FIXTURE.flowerLengthM[0], FIXTURE.flowerLengthM[1], hash2(serial, 6)),
          year: FIXTURE.years[1],
          developDay: cal.dayOf(FIXTURE.flower.develop) + shift,
          openDay: cal.dayOf(FIXTURE.flower.open) + shift,
          spentDay: cal.dayOf(FIXTURE.flower.spent) + shift,
        });
        if (data.flowers.length % 4 === 0) {
          fruit.push({
            plantId,
            position: [hang.x, hang.y, hang.z],
            lengthM: FIXTURE.fruitLengthM,
            swell: [cal.dayOf(FIXTURE.fruit.swell[0]), cal.dayOf(FIXTURE.fruit.swell[1])],
            ripen: [cal.dayOf(FIXTURE.fruit.ripen[0]), cal.dayOf(FIXTURE.fruit.ripen[1])],
            removedDay: -1,
          });
        }
        serial++;
      }
    });
    data.stems.push(stem);
  };

  const leader = layAlong(bower, route.edges, route.nodes[0]!);
  addStem(`${plantId}/leader`, 'leader', 0, null, leader, leaderDays, FIXTURE.leaderRadiusMm, true);

  // side stems: from three nodes along the leader, along a timber route the leader did not take
  const used = new Set(route.edges);
  for (const share of [0.4, 0.6, 0.8]) {
    const nodeId = route.nodes[Math.min(route.nodes.length - 2, Math.max(1, Math.round(share * (route.nodes.length - 1))))];
    if (!nodeId) continue;
    const first = bower.graph.edgesAt(nodeId).find((e) => !used.has(e.id) && e.kind === 'timber');
    if (!first) continue;
    used.add(first.id);
    const chain = [first.id];
    const far = bower.graph.otherEnd(first, nodeId);
    const second = bower.graph.edgesAt(far).find((e) => !used.has(e.id) && e.kind === 'timber');
    if (second) {
      used.add(second.id);
      chain.push(second.id);
    }
    addStem(`${plantId}/side${data.stems.length}`, 'lateral', 1, `${plantId}/leader`, layAlong(bower, chain, nodeId), sideDays, FIXTURE.sideRadiusMm, true);
  }
  return { data, fruit };
}
