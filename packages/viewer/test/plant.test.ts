import { describe, expect, it } from 'vitest';
import { EVIDENCE_STATUS, RENDER_CONTRACT, type RenderData, type RenderFlower, type RenderLeaf, type RenderStem, flowerState, leafState, makeHemisphereBower, makeVaultBower, seasonsOf, stemRadiusM } from '@horti/core';
import { NEVER, RenderTimeline } from '../src/plant/adapter.ts';
import { makeTestPlant } from '../src/plant/fixture.ts';
import { growScenario } from '../src/plant/scenario.ts';
import { buildWoodGeometry } from '../src/plant/wood.ts';

/** A one-plant, two-year run with nothing in it but dates. It starts on 1 January, so in the first year day = day of year - 1. */
function bare(): RenderData {
  return {
    contract: RENDER_CONTRACT,
    scenario: 'adapter test',
    start: '2030-01-01',
    lastDay: 729,
    frame: 'right-handed, metres, x east, y north, z up',
    plants: [{ id: 'p', taxonId: 't', label: 'T', stationId: 's', plantedDay: 10, leafHabit: 'deciduous', flowerDisplay: '' }],
    stems: [],
    leaves: [],
    flowers: [],
    seasons: [
      { plantId: 'p', year: 2030, budburstDay: 90, growthEndDay: 270, leafFlush: [100, 140], autumnColour: [280, 310], leafFall: [310, 340] },
      { plantId: 'p', year: 2031, budburstDay: 455, growthEndDay: 635, leafFlush: [465, 505], autumnColour: [645, 675], leafFall: [675, 705] },
    ],
    events: [],
    thickening: { tipRadiusMm: 2, exponent: 1.35 },
    statement: 'test',
    assumptions: Object.fromEntries(EVIDENCE_STATUS.map((status) => [status, 0])) as RenderData['assumptions'],
  };
}
const leaf = (over: Partial<RenderLeaf> = {}): RenderLeaf => ({ plantId: 'p', stemId: 'x', position: [0, 0, 1], direction: [1, 0, 0], lengthM: 0.2, firstYear: 2030, lastYear: null, evergreen: false, bornDay: 20, removedDay: -1, ...over });
const flower = (over: Partial<RenderFlower> = {}): RenderFlower => ({ plantId: 'p', stemId: 'x', position: [0, 0, 2], lengthM: 0.25, year: 2031, developDay: 455, openDay: 480, spentDay: 505, ...over });

// CLAUDE.md: `src/render/presence.ts` says what is on the plant on a given day
// (use it; do not re-derive seasons). render/contract.ts: "A viewer must not add
// phenology of its own."
describe('what is drawn agrees with the core, day for day', () => {
  const data = bare();
  const t = new RenderTimeline(data);
  const leaves = [leaf(), leaf({ bornDay: 200 }), leaf({ lastYear: 2030 }), leaf({ removedDay: 300 }), leaf({ evergreen: true, position: [1, 2, 3] })];

  it('shows a leaf exactly when the core says it is present, as far open and as far turned', () => {
    for (let day = 0; day <= data.lastDay; day++) {
      const year = t.yearOf(day);
      for (const l of leaves) {
        const core = leafState(l, seasonsOf(data, year).get('p'), day);
        const drawn = t.leafDraw(l, day);
        expect(drawn.visible).toBe(core.present);
        if (core.present) {
          expect(drawn.expansion).toBe(core.expansion);
          expect(drawn.colour).toBe(core.autumn);
        }
      }
    }
  });

  it('shows an inflorescence exactly when the core says it is in bud or open', () => {
    const flowers = [flower(), flower({ spentDay: -1 }), flower({ developDay: 100, openDay: 120, spentDay: 150, year: 2030 })];
    for (let day = 0; day <= data.lastDay; day++) {
      for (const f of flowers) expect(t.flowerDraw(f, day).visible).toBe(flowerState(f, day).phase !== 'absent');
    }
  });

  it('gives a stem point the radius the core gives it, and none before it exists', () => {
    const stem: RenderStem = { id: 's', plantId: 'p', parentId: null, role: 'leader', order: 0, contact: [0, 0, 0, 0, 0, 1], away: [0, 0, 0, 0, 0, 0], bornDay: [50, 60], removedDay: [-1, 400], radiusMm: [30, 12] };
    expect(t.stemRadiusM(stem, 0, 49)).toBe(0);
    expect(t.stemRadiusM(stem, 1, 400)).toBe(0); // cut away that day
    for (const day of [50, 51, 200, 399, 729]) expect(t.stemRadiusM(stem, 0, day)).toBe(stemRadiusM(data, stem, 0, day));
    expect(t.stemRadiusM(stem, 0, 729)).toBeCloseTo(0.03, 9);
  });
});

describe('leaves through a year', () => {
  const t = new RenderTimeline(bare());

  it('are not shown before the flush, after leaf fall, or in winter', () => {
    expect(t.leafDraw(leaf(), 99).visible).toBe(false);
    expect(t.leafDraw(leaf(), 340).visible).toBe(false);
    expect(t.leafDraw(leaf(), 400).visible).toBe(false);
  });

  it('are fully out by the end of the flush and green until colour begins', () => {
    expect(t.leafDraw(leaf(), 140)).toEqual({ visible: true, expansion: 1, colour: 0 });
    expect(t.leafDraw(leaf(), 279).colour).toBe(0);
  });

  it('unfold and colour without ever going backwards, and are fully turned when they drop', () => {
    let last = { expansion: 0, colour: 0 };
    for (let day = 100; day <= 339; day++) {
      const s = t.leafDraw(leaf(), day);
      if (!s.visible) continue;
      expect(s.expansion).toBeGreaterThanOrEqual(last.expansion);
      expect(s.colour).toBeGreaterThanOrEqual(last.colour);
      last = s;
    }
    expect(last.colour).toBe(1);
  });

  it('come back at the next flush where the site is perennial, and do not where it lasted a year', () => {
    expect(t.leafDraw(leaf(), 520).visible).toBe(true);
    expect(t.leafDraw(leaf({ lastYear: 2030 }), 520).visible).toBe(false);
  });

  // CLAUDE.md: pruning removes lineage: a removed organ is gone from that day.
  it('are gone on the day they were removed', () => {
    const cut = leaf({ removedDay: 200 });
    expect(t.leafDraw(cut, 199).visible).toBe(true);
    expect(t.leafDraw(cut, 200).visible).toBe(false);
  });

  it('stay through winter where the data says the leaf is evergreen', () => {
    const kept = leaf({ evergreen: true });
    expect(t.leafDraw(kept, 335)).toEqual({ visible: true, expansion: 1, colour: 0 });
    expect(t.leafDraw(kept, 400).visible).toBe(true);
  });
});

// CLAUDE.md: "A flowering month is an envelope, not a trigger. Never show flowers
// because the calendar says so." Flowers are drawn only from their own days.
describe('an inflorescence through its days', () => {
  const t = new RenderTimeline(bare());

  it('is nothing before its bud begins to lengthen', () => {
    expect(t.flowerDraw(flower(), 454).visible).toBe(false);
  });

  it('is a lengthening bud, with no flower open, until the day it opens', () => {
    const s = t.flowerDraw(flower(), 470);
    expect(s.visible).toBe(true);
    expect(s.open).toBe(false);
    expect(s.bloom).toBe(0);
    expect(s.shed).toBe(0);
    expect(s.elongation).toBeGreaterThan(0);
    expect(s.elongation).toBeLessThan(1);
  });

  it('opens from the base before any petals fall, and has shed nearly all of them on its last day', () => {
    expect(t.flowerDraw(flower(), 483).bloom).toBeLessThan(1);
    expect(t.flowerDraw(flower(), 492)).toEqual({ visible: true, open: true, elongation: 1, bloom: 1, shed: 0 });
    expect(t.flowerDraw(flower(), 504).shed).toBeGreaterThan(0.9);
  });

  it('is gone on the day the data calls it spent', () => {
    expect(t.flowerDraw(flower(), 505).visible).toBe(false);
  });

  it('sheds nothing if the run ended while it was open', () => {
    expect(t.flowerDraw(flower({ spentDay: -1 }), 729)).toEqual({ visible: true, open: true, elongation: 1, bloom: 1, shed: 0 });
  });
});

describe('render test plant', () => {
  for (const [name, bower] of [
    ['vault', makeVaultBower()],
    ['hemisphere', makeHemisphereBower()],
  ] as const) {
    it(`${name}: is well-formed render data that says it is not a simulation`, () => {
      const { data, fruit } = makeTestPlant(bower);
      expect(data.contract).toBe(RENDER_CONTRACT);
      expect(data.statement).toMatch(/not a simulation/);
      expect(data.stems.length).toBeGreaterThan(0);
      expect(data.leaves.length).toBeGreaterThan(20);
      expect(data.flowers.length).toBeGreaterThan(3);
      expect(fruit.length).toBeGreaterThan(0);
      const ids = new Set(data.stems.map((s) => s.id));
      for (const s of data.stems) {
        const n = s.bornDay.length;
        expect(s.contact).toHaveLength(3 * n);
        expect(s.away).toHaveLength(3 * n);
        expect(s.removedDay).toHaveLength(n);
        expect(s.radiusMm).toHaveLength(n);
        // a stem is laid down from its base to its tip
        for (let i = 1; i < n; i++) expect(s.bornDay[i]!).toBeGreaterThanOrEqual(s.bornDay[i - 1]!);
      }
      for (const l of data.leaves) expect(ids.has(l.stemId)).toBe(true);
      for (const f of data.flowers) {
        expect(f.developDay).toBeLessThan(f.openDay);
        expect(f.openDay).toBeLessThan(f.spentDay);
      }
    });

    // KEY.md section 5: the timber is the growing surface: the test stems lie on the Bower's routes.
    it(`${name}: lays its leader along the Bower's own routes, from the ground to the highest node`, () => {
      const { data } = makeTestPlant(bower);
      const leader = data.stems[0]!;
      expect(leader.contact[2]).toBeLessThan(0.1);
      const n = leader.bornDay.length;
      const top = Math.max(...[...bower.graph.nodes.values()].map((p) => p.position.z));
      expect(leader.contact[3 * (n - 1) + 2]).toBeCloseTo(top, 1);
    });

    it(`${name}: has leaves in summer, flowers in its second spring and bare wood in winter`, () => {
      const { data } = makeTestPlant(bower);
      const t = new RenderTimeline(data);
      const on = (iso: string) => {
        const day = t.calendar.dayOf(iso);
        return { leaves: data.leaves.filter((l) => t.leafDraw(l, day).visible).length, flowers: data.flowers.filter((f) => t.flowerDraw(f, day).visible).length };
      };
      expect(on('2031-07-15')).toEqual({ leaves: data.leaves.length, flowers: 0 });
      expect(on('2031-05-08').flowers).toBe(data.flowers.length);
      expect(on('2031-01-15')).toEqual({ leaves: 0, flowers: 0 });
    });
  }
});

describe('stems of the growth engine as geometry', () => {
  it('grows a wisteria at every root station of either reference Bower', () => {
    expect(growScenario('wisteria', 'vault', 'untended', 2).data.plants.map((p) => p.stationId)).toEqual(makeVaultBower().rootStations.map((s) => s.id));
    expect(growScenario('wisteria', 'hemisphere', 'untended', 2).data.plants.map((p) => p.stationId)).toEqual(makeHemisphereBower().rootStations.map((s) => s.id));
  });

  it('builds finite tubes from the reference scenario, each ring carrying its days and radius', () => {
    const { data } = growScenario('wisteria', 'vault', 'trained', 3);
    expect(data.stems.length).toBeGreaterThan(10);
    const { geometry, points } = buildWoodGeometry(data.stems);
    expect(points).toBe(data.stems.filter((s) => s.bornDay.length >= 2).reduce((n, s) => n + s.bornDay.length, 0));
    for (const name of ['position', 'normal', 'aLife', 'aSup', 'aAnchor']) {
      const a = geometry.getAttribute(name).array;
      for (let i = 0; i < a.length; i += 97) expect(Number.isFinite(a[i])).toBe(true);
    }
    const life = geometry.getAttribute('aLife');
    for (let i = 0; i < life.count; i += 53) {
      expect(life.getX(i)).toBeGreaterThanOrEqual(0); // born on or after day 0
      expect(life.getY(i) === NEVER || life.getY(i) > life.getX(i)).toBe(true); // removed after it was born, or never
      expect(life.getZ(i)).toBeGreaterThan(0); // radius in metres
      expect(life.getZ(i)).toBeLessThan(0.2);
    }
    geometry.dispose();
  });
});
