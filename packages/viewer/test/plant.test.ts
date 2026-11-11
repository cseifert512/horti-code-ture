import { describe, expect, it } from 'vitest';
import {
  APPENDAGE_KIND,
  EVIDENCE_STATUS,
  RENDER_CONTRACT,
  type RenderAppendage,
  type RenderData,
  type RenderFlower,
  type RenderFruit,
  type RenderLeaf,
  type RenderStem,
  appendagePresent,
  flowerState,
  fruitState,
  leafState,
  makeHemisphereBower,
  makeVaultBower,
  seasonsOf,
  stemRadiusM,
} from '@horti/core';
import { NEVER, RenderTimeline, agedShare } from '../src/plant/adapter.ts';
import { loadLooks, lookFor } from '../src/plant/registry.ts';
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
    fruits: [],
    appendages: [],
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
const fruit = (over: Partial<RenderFruit> = {}): RenderFruit => ({ plantId: 'p', stemId: 'x', position: [0, 0, 2], lengthM: 0.12, year: 2031, swell: [510, 560], ripen: [600, 640], removedDay: 700, ...over });
const hold = (over: Partial<RenderAppendage> = {}): RenderAppendage => ({ plantId: 'p', stemId: 'x', kind: 'tendril', position: [0, 0, 1], direction: [1, 0, 0], lengthM: 0.08, holding: true, bornDay: 120, removedDay: 400, ...over });

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

  it('shows a fruit exactly when the core says it is on the plant, as large and as ripe', () => {
    const fruits = [fruit(), fruit({ removedDay: -1 }), fruit({ swell: [100, 130], ripen: [200, 230], removedDay: 260, year: 2030 })];
    for (let day = 0; day <= data.lastDay; day++) {
      for (const f of fruits) {
        const core = fruitState(f, day);
        const drawn = t.fruitDraw(f, day);
        expect(drawn.visible).toBe(core.phase !== 'absent');
        if (drawn.visible) {
          expect(drawn.size).toBe(core.size);
          expect(drawn.ripeness).toBe(core.ripeness);
        }
      }
    }
  });

  // render/contract.ts, RenderAppendage: "a viewer draws them and adds none of its own".
  it('shows a tendril or a prickle exactly from the day it formed to the day it went, and knows its age', () => {
    const holds = [hold(), hold({ removedDay: -1 }), hold({ kind: 'prickle', holding: false, bornDay: 0 })];
    for (let day = 0; day <= data.lastDay; day++) {
      for (const a of holds) {
        const drawn = t.appendageDraw(a, day);
        expect(drawn.visible).toBe(appendagePresent(a, day));
        if (drawn.visible) expect(drawn.ageDays).toBe(day - a.bornDay);
      }
    }
    expect(t.appendageDraw(hold(), 119).visible).toBe(false);
    expect(t.appendageDraw(hold(), 400).visible).toBe(false);
  });

  it('turns an age into how far through a look\'s range of ages it is, never backwards', () => {
    expect(agedShare(0, [110, 440])).toBe(0);
    expect(agedShare(110, [110, 440])).toBe(0);
    expect(agedShare(275, [110, 440])).toBeCloseTo(0.5, 9);
    expect(agedShare(440, [110, 440])).toBe(1);
    expect(agedShare(9000, [110, 440])).toBe(1);
    let last = 0;
    for (let age = 0; age < 600; age++) {
      expect(agedShare(age, [110, 440])).toBeGreaterThanOrEqual(last);
      last = agedShare(age, [110, 440]);
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
      const { data } = makeTestPlant(bower);
      expect(data.contract).toBe(RENDER_CONTRACT);
      expect(data.statement).toMatch(/not a simulation/);
      expect(data.stems.length).toBeGreaterThan(0);
      expect(data.leaves.length).toBeGreaterThan(20);
      expect(data.flowers.length).toBeGreaterThan(3);
      expect(data.fruits.length).toBeGreaterThan(0);
      for (const f of data.fruits) {
        expect(f.swell[0]).toBeLessThan(f.swell[1]);
        expect(f.ripen[0]).toBeLessThan(f.ripen[1]);
      }
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
        // the hanging inflorescences of the first plant: the other plants' flowers are held, and open as their stems grow
        const hanging = data.flowers.filter((f) => f.plantId === 'test.0');
        return { leaves: data.leaves.filter((l) => t.leafDraw(l, day).visible).length, flowers: hanging.filter((f) => t.flowerDraw(f, day).visible).length, all: hanging.length };
      };
      expect(on('2031-07-15')).toMatchObject({ leaves: data.leaves.length, flowers: 0 });
      expect(on('2031-05-08').flowers).toBe(on('2031-05-08').all);
      expect(on('2031-01-15')).toMatchObject({ leaves: 0, flowers: 0 });
    });

    // render/contract.ts, contract 2: appendages of four kinds, and a direction on a flower that does not hang.
    it(`${name}: carries every kind of hold on a plant that borrows a taxon with a model of it, and flowers held in a direction`, async () => {
      await loadLooks();
      const { data } = makeTestPlant(bower);
      for (const kind of APPENDAGE_KIND) {
        const of = data.appendages.filter((a) => a.kind === kind);
        expect(of.length, kind).toBeGreaterThan(2);
        expect(of.some((a) => a.holding) || kind === 'prickle', kind).toBe(true);
        const plant = data.plants.find((p) => p.id === of[0]!.plantId)!;
        expect(plant.taxonId.startsWith('render-test:')).toBe(true);
        expect(lookFor(plant.taxonId).appendages[kind], `${plant.taxonId} has a model of a ${kind}`).toBeDefined();
        for (const a of of) expect(Math.hypot(...a.direction)).toBeCloseTo(1, 6);
      }
      const held = data.flowers.filter((f) => f.direction);
      expect(held.length).toBeGreaterThan(1);
      for (const f of held) {
        expect(Math.hypot(...f.direction!)).toBeCloseTo(1, 6);
        expect(lookFor(data.plants.find((p) => p.id === f.plantId)!.taxonId).flowers?.default.poise).toBe('held');
      }
      // every plant has its seasons, or its leaves could not be drawn
      for (const p of data.plants) expect(data.seasons.filter((s) => s.plantId === p.id)).toHaveLength(2);
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
