import { describe, expect, it } from 'vitest';
import { EVIDENCE_STATUS, RENDER_CONTRACT, type RenderData, type RenderFlower, type RenderLeaf, makeHemisphereBower, makeVaultBower } from '@horti/core';
import { NEVER, RenderTimeline } from '../src/plant/adapter.ts';
import { makeTestPlant } from '../src/plant/fixture.ts';
import { growWisteriaOnVault } from '../src/plant/scenario.ts';
import { buildWoodGeometry } from '../src/plant/wood.ts';

/** A one-plant, two-year run with nothing in it but dates. Start 1 January, so day = day of year - 1 in the first year. */
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
const leaf = (over: Partial<RenderLeaf> = {}): RenderLeaf => ({ plantId: 'p', stemId: 'x', position: [0, 0, 1], direction: [1, 0, 0], lengthM: 0.2, firstYear: 2030, lastYear: null, bornDay: 20, removedDay: -1, ...over });
const flower = (over: Partial<RenderFlower> = {}): RenderFlower => ({ plantId: 'p', stemId: 'x', position: [0, 0, 2], lengthM: 0.25, year: 2031, developDay: 455, openDay: 480, spentDay: 505, ...over });

// render/contract.ts: "A viewer must not add phenology of its own. Leaf and flower
// timing is in `seasons` and in each flower's own days."
describe('leaf states come from the seasons in the data', () => {
  const t = new RenderTimeline(bare());
  const jitters = [0, 0.25, 0.5, 0.75, 0.999];

  it('shows no leaf before the flush begins or after leaf fall ends, whatever its stagger', () => {
    for (const j of jitters) {
      expect(t.leafState(leaf(), 99, j).visible).toBe(false);
      expect(t.leafState(leaf(), 340, j).visible).toBe(false);
      expect(t.leafState(leaf(), 400, j).visible).toBe(false); // winter
    }
  });

  it('has every leaf fully out by the end of the flush and green until colour begins', () => {
    for (const j of jitters) {
      const s = t.leafState(leaf(), 140, j);
      expect(s).toMatchObject({ visible: true, expansion: 1, colour: 0, fall: 0 });
      expect(t.leafState(leaf(), 279, j).colour).toBe(0);
    }
  });

  it('unfolds, colours and drops monotonically through each window', () => {
    let last = { expansion: 0, colour: 0, fall: 0 };
    for (let day = 100; day <= 339; day++) {
      const s = t.leafState(leaf(), day, 0.4);
      if (!s.visible) continue;
      expect(s.expansion).toBeGreaterThanOrEqual(last.expansion);
      expect(s.colour).toBeGreaterThanOrEqual(last.colour);
      expect(s.fall).toBeGreaterThanOrEqual(last.fall);
      last = s;
    }
    expect(last.colour).toBe(1);
    expect(last.fall).toBeGreaterThan(0);
  });

  it('brings a perennial leaf site back in the next flush, and a one-year leaf not at all', () => {
    expect(t.leafState(leaf(), 520, 0.5).visible).toBe(true);
    expect(t.leafState(leaf({ lastYear: 2030 }), 520, 0.5).visible).toBe(false);
  });

  it('does not show a leaf before it is born, and unfolds a late leaf from its own birth', () => {
    const late = leaf({ bornDay: 200 });
    expect(t.leafState(late, 199, 0.5).visible).toBe(false);
    expect(t.leafState(late, 205, 0.5).expansion).toBeLessThan(0.2);
    expect(t.leafState(late, 240, 0.5).expansion).toBe(1);
  });

  // CLAUDE.md: pruning removes lineage: a removed organ is gone from that day.
  it('drops a leaf on the day it was removed', () => {
    const cut = leaf({ removedDay: 200 });
    expect(t.leafState(cut, 199, 0.5).visible).toBe(true);
    expect(t.leafState(cut, 200, 0.5).visible).toBe(false);
  });

  it('keeps the leaves of a plant that is not deciduous through autumn', () => {
    const data = bare();
    data.plants[0]!.leafHabit = 'evergreen';
    const evergreen = new RenderTimeline(data);
    expect(evergreen.leafState(leaf(), 335, 0.5)).toMatchObject({ visible: true, colour: 0, fall: 0 });
  });
});

// CLAUDE.md: "A flowering month is an envelope, not a trigger. Never show flowers
// because the calendar says so." Flowers are drawn only from their own days.
describe('flower states come from each flower\'s own days', () => {
  const t = new RenderTimeline(bare());

  it('shows nothing before the bud begins to lengthen', () => {
    expect(t.flowerState(flower(), 454).visible).toBe(false);
  });

  it('is a lengthening bud until the day it opens', () => {
    const s = t.flowerState(flower(), 470);
    expect(s.visible).toBe(true);
    expect(s.bloom).toBe(0);
    expect(s.shed).toBe(0);
    expect(s.elongation).toBeGreaterThan(0);
    expect(s.elongation).toBeLessThan(1);
  });

  it('is fully open before any petals fall, and has shed them all on the day it is spent', () => {
    expect(t.flowerState(flower(), 492)).toMatchObject({ visible: true, elongation: 1, bloom: 1, shed: 0 });
    expect(t.flowerState(flower(), 505)).toMatchObject({ visible: true, bloom: 1, shed: 1 });
  });

  it('is gone soon after', () => {
    expect(t.flowerState(flower(), 520).visible).toBe(false);
  });

  it('never sheds a flower the run ended on', () => {
    const open = flower({ spentDay: -1 });
    expect(t.flowerState(open, 729)).toMatchObject({ visible: true, bloom: 1, shed: 0, stalk: 1 });
  });
});

// render/contract.ts: radius(t) = tip + (final - tip) * ((t - born) / (lastDay - born)) ^ exponent
describe('stem thickness follows the rule in the contract', () => {
  const t = new RenderTimeline(bare());
  it('is nothing before birth, the tip radius just after, and the recorded radius on the last day', () => {
    expect(t.stemRadiusM(49, 50, 30)).toBe(0);
    expect(t.stemRadiusM(51, 50, 30)).toBeCloseTo(0.002, 3);
    expect(t.stemRadiusM(729, 50, 30)).toBeCloseTo(0.03, 9);
    const half = t.stemRadiusM(50 + (729 - 50) / 2, 50, 30);
    expect(half).toBeCloseTo((2 + 28 * 0.5 ** 1.35) / 1000, 9);
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
    it(`${name}: lays its leader along the Bower's own routes, base on the ground`, () => {
      const { data } = makeTestPlant(bower);
      const leader = data.stems[0]!;
      expect(leader.contact[2]).toBeLessThan(0.1);
      const n = leader.bornDay.length;
      const top = Math.max(...[...bower.graph.nodes.values()].map((p) => p.position.z));
      expect(leader.contact[3 * (n - 1) + 2]).toBeCloseTo(top, 1);
    });
  }
});

describe('stems of the growth engine as geometry', () => {
  it('builds finite tubes from the reference scenario, with each ring carrying its days and radius', () => {
    const { data } = growWisteriaOnVault('trained', 3);
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
