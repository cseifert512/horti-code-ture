// The render test plant: hand-made render data that exercises every part of
// the plant renderer (stems that lengthen and thicken, leaves through a year,
// inflorescences from bud to petal fall, fruit) on any Bower. Beside it stand
// four more hand-made plants, one for each kind of hold the contract has
// (tendril, coiled leaf stalk, clinging rootlets, prickle), each drawn with
// the models of a taxon that has that kind, and two of them with flowers that
// are held in a direction the data gives.
//
// IT IS NOT A SIMULATION. Every size and date below was typed in to give the
// renderer something to draw. None of it describes how any plant grows, and
// none of it may be read as a growth rate, a flowering date or a dimension of
// a taxon. The geometry it lies on is real: the stems follow the Bower's own
// plant routes, placed with the core's liePath.
import { type AppendageKind, type Bower, Calendar, EVIDENCE_STATUS, type EvidenceStatus, RENDER_CONTRACT, type RenderData, type RenderStem, type SupportEdge, type Vec3, liePath, shortestRoute, vec } from '@horti/core';
import { hash2 } from '../util.ts';

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
  /**
   * One more plant for each kind of hold: whose models it is drawn with (registry.ts reads the name after
   * "render-test:"), how far apart the holds are along the stem and how long, and how wide its held flowers are
   * (0: none).
   */
  holds: [
    { kind: 'tendril', borrows: 'vitis-coignetiae', everyM: 0.2, lengthM: 0.09, flowerM: 0 },
    { kind: 'leaf_stalk_coil', borrows: 'clematis-viticella-etoile-violette', everyM: 0.13, lengthM: 0.035, flowerM: 0.08 },
    { kind: 'aerial_roots', borrows: 'hedera-helix', everyM: 0.05, lengthM: 0.006, flowerM: 0 },
    { kind: 'prickle', borrows: 'rosa-the-generous-gardener', everyM: 0.035, lengthM: 0.008, flowerM: 0.09 },
  ] as readonly { kind: AppendageKind; borrows: string; everyM: number; lengthM: number; flowerM: number }[],
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
  if (!station) return { data };

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
  if (!route || route.edges.length === 0) return { data };

  const leaderDays = [cal.dayOf(FIXTURE.leaderGrows[0]), cal.dayOf(FIXTURE.leaderGrows[1])] as const;
  const sideDays = [cal.dayOf(FIXTURE.sideGrows[0]), cal.dayOf(FIXTURE.sideGrows[1])] as const;
  data.plants.push({ id: plantId, taxonId: 'render-test', label: 'Render test plant', stationId: station.id, plantedDay: leaderDays[0], leafHabit: 'deciduous', flowerDisplay: 'the raceme asset of the prototype' });
  for (const year of FIXTURE.years) {
    const doy = (d: number) => cal.dayOfYearDay(year, d);
    const s = FIXTURE.season;
    data.seasons.push({ plantId, year, budburstDay: doy(s.budburst), growthEndDay: doy(s.growthEnd), leafFlush: [doy(s.leafFlush[0]), doy(s.leafFlush[1])], autumnColour: [doy(s.autumnColour[0]), doy(s.autumnColour[1])], leafFall: [doy(s.leafFall[0]), doy(s.leafFall[1])] });
  }

  let serial = 0;
  /** `flowering`: inflorescences that hang, with fruit after some. `hold`: this stem is another plant's, with its kind of hold along it. */
  const addStem = (id: string, role: RenderStem['role'], order: number, parentId: string | null, path: PathPoint[], days: readonly [number, number], radiusMm: readonly [number, number], flowering: boolean, hold?: { plantId: string; kind: AppendageKind; everyM: number; lengthM: number; flowerM: number }) => {
    const length = path[path.length - 1]?.s ?? 0;
    if (path.length < 2 || length <= 0) return;
    const plantId = hold?.plantId ?? 'test.0';
    const stem: RenderStem = { id, plantId, parentId, role, order, contact: [], away: [], bornDay: [], removedDay: [], radiusMm: [] };
    let nextLeaf = 0.05;
    let nextFlower = 0.2;
    let nextHold = 0.04;
    let holds = 0;
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
          data.fruits.push({
            plantId,
            stemId: id,
            position: [hang.x, hang.y, hang.z],
            lengthM: FIXTURE.fruitLengthM,
            year: FIXTURE.years[1],
            swell: [cal.dayOf(FIXTURE.fruit.swell[0]), cal.dayOf(FIXTURE.fruit.swell[1])],
            ripen: [cal.dayOf(FIXTURE.fruit.ripen[0]), cal.dayOf(FIXTURE.fruit.ripen[1])],
            removedDay: -1,
          });
        }
        serial++;
      }

      if (hold && pt.s >= nextHold && i < path.length - 1) {
        nextHold = pt.s + hold.everyM;
        const turn = holds % 2 === 0 ? 1 : -1;
        // rootlets spread on what the stem lies on, to either side of it; a prickle stands out from it; a tendril or a coiling stalk reaches sideways
        const direction =
          hold.kind === 'aerial_roots'
            ? vec.normalize(vec.add(vec.scale(across, turn), vec.scale(pt.away, -0.25)))
            : hold.kind === 'prickle'
              ? vec.normalize(vec.add(pt.away, vec.scale(across, 0.9 * turn)))
              : vec.normalize(vec.add(vec.scale(across, turn), vec.scale(pt.away, 0.35)));
        data.appendages.push({ plantId, stemId: id, kind: hold.kind, position: [pt.contact.x, pt.contact.y, pt.contact.z], direction: [direction.x, direction.y, direction.z], lengthM: hold.lengthM, holding: holds % 3 !== 2, bornDay: born + 4, removedDay: -1 });
        holds++;
      }

      // flowers held out from the stem, in a direction the data gives
      if (hold && hold.flowerM > 0 && pt.s >= nextFlower && i < path.length - 2) {
        nextFlower = pt.s + FIXTURE.flowerEveryM;
        const out = vec.normalize(vec.add(vec.scale(pt.away, 0.8), vec.scale(across, 0.6 * (data.flowers.length % 2 === 0 ? 1 : -1))));
        data.flowers.push({
          plantId,
          stemId: id,
          position: [pt.contact.x, pt.contact.y, pt.contact.z],
          lengthM: hold.flowerM,
          year: FIXTURE.years[1],
          // the side stems are still lengthening when the hanging flowers are over: these open once their stem is there
          developDay: born + 20,
          openDay: born + 40,
          spentDay: born + 75,
          direction: [out.x, out.y, out.z],
        });
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

  // one more plant for each kind of hold, on a timber route nothing above has taken
  const season = data.seasons.filter((s) => s.plantId === plantId);
  FIXTURE.holds.forEach((hold, n) => {
    // from the node of the leader nearest its place along it that still has a timber route free
    const wanted = (0.3 + 0.2 * n) * (route.nodes.length - 1);
    const free = (nodeId: string) => bower.graph.edgesAt(nodeId).find((e) => !used.has(e.id) && e.kind === 'timber');
    const nodeId = route.nodes
      .slice(1)
      .map((id, i) => ({ id, off: Math.abs(i + 1 - wanted) }))
      .sort((a, b) => a.off - b.off)
      .find((node) => free(node.id))?.id;
    const first = nodeId ? free(nodeId) : undefined;
    if (!nodeId || !first) return;
    used.add(first.id);
    const id = `test.${n + 1}`;
    const words = hold.kind.replaceAll('_', ' ');
    data.plants.push({ id, taxonId: `render-test:${hold.borrows}`, label: `Render test: ${words} (the models of ${hold.borrows})`, stationId: station.id, plantedDay: sideDays[0], leafHabit: 'deciduous', flowerDisplay: `the models of ${hold.borrows}` });
    for (const s of season) data.seasons.push({ ...s, plantId: id });
    addStem(`${id}/stem`, 'lateral', 0, null, layAlong(bower, [first.id], nodeId), sideDays, FIXTURE.sideRadiusMm, false, { plantId: id, ...hold });
  });
  return { data };
}
