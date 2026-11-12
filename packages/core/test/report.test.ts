import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { flowerState, leafState, seasonsOf, stemRadiusM } from '../src/render/presence.ts';
import { Simulation } from '../src/sim/engine.ts';
import { toRenderData } from '../src/sim/render-data.ts';
import { type DesignReport, designReport, formatDesignReport } from '../src/sim/report.ts';
import { type Growable, VAULT_VIEWPOINTS, mixedOnVault, wisteriaOnVault } from '../src/sim/scenarios.ts';
import type { Scenario } from '../src/sim/types.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const library = loadGrowable(speciesDir);
/** As in mixed.test.ts: fix the honeysuckle's unsettled flowering wood so the tests do not depend on the file. */
function withHoneysuckleWood(wood: 'current_season' | null): Growable {
  const h = library.get('lonicera-henryi')!;
  const profile = structuredClone(h.profile);
  profile.flowering.wood = wood ? { value: wood, status: 'provisional_design_assumption', basis: 'fixed for this test' } : { value: null, status: 'unknown' };
  return new Map([...library, ['lonicera-henryi', { profile, model: h.model }]]);
}
const taxa = withHoneysuckleWood('current_season');
const run = (s: Scenario, until = '2034-12-31') => new Simulation(s).runUntil(until);

const mixedSim = run(mixedOnVault({ taxa, care: 'trained', years: 8 }));
const mixed = designReport(mixedSim);
const wisteria = designReport(run(wisteriaOnVault({ taxa, care: 'trained', years: 8 })));
const neglected = designReport(run(mixedOnVault({ taxa, care: 'untended', years: 8 })));
const month = (r: DesignReport, m: number) => r.months.find((x) => x.month === m)!;
const view = (r: DesignReport, m: number, id: string) => month(r, m).views.find((v) => v.viewpointId === id)!;

// SIMULATION_KEY.md section 8, output 2; section 9 "Winter realism".
describe('what is seen through the year', () => {
  it('describes the last full year, month by month, from each viewpoint', () => {
    expect(mixed.year).toBe(2034);
    expect(mixed.months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(mixed.viewpoints.map((v) => v.id)).toEqual(VAULT_VIEWPOINTS.map((v) => v.id));
    for (const m of mixed.months) {
      expect(m.views.length).toBe(3);
      for (const v of m.views) for (const x of [v.timberVisible, v.foliage, v.evergreenFoliage, v.flowers]) expect(x >= 0 && x <= 1).toBe(true);
    }
  });

  it('shows a deciduous planting bare in January and in leaf in July', () => {
    for (const vp of VAULT_VIEWPOINTS) {
      expect(view(wisteria, 1, vp.id).foliage, vp.id).toBe(0);
      expect(view(wisteria, 7, vp.id).foliage, vp.id).toBeGreaterThan(0.03);
      expect(view(wisteria, 1, vp.id).timberVisible, vp.id).toBeGreaterThanOrEqual(view(wisteria, 7, vp.id).timberVisible);
    }
    expect(month(wisteria, 1).leaves).toEqual({});
  });

  it('shows winter green only from the evergreen, and counts it separately', () => {
    const jan = month(mixed, 1);
    expect(Object.keys(jan.leaves).sort()).toEqual(['honeysuckle', 'winter-clematis']);
    for (const v of jan.views) expect(v.foliage).toBe(v.evergreenFoliage);
    expect(view(mixed, 1, 'lawn').evergreenFoliage).toBeGreaterThan(0);
    for (const v of month(mixed, 7).views) expect(v.evergreenFoliage).toBeLessThan(v.foliage);
  });

  it('finds one honeysuckle short of the 25 to 40 per cent winter-evergreen design target', () => {
    // KEY.md section 6 sets the target; this planting does not meet it as seen, and the report can now say by how much
    // short of the target's lower end from every viewpoint. The honeysuckle's leaf is a fifth of the view from the
    // nearest of them: a little under until its shoots in the air were laid by their mechanics, a little over since
    for (const v of month(mixed, 1).views) expect(v.evergreenFoliage).toBeLessThan(0.25);
  });

  it('has something in flower in winter, spring and summer, each from a different plant', () => {
    expect(Object.keys(month(mixed, 1).flowers)).toEqual(['winter-clematis']);
    expect(month(mixed, 1).flowers['winter-clematis']).toBeGreaterThan(5);
    expect(month(mixed, 12).flowers['winter-clematis']).toBeGreaterThan(5);
    expect(month(mixed, 5).flowers['winter-clematis']).toBeUndefined();
  });

  it('puts the wisteria in flower in May and the summer clematis in July and August, and neither in winter', () => {
    expect(month(mixed, 5).flowers['wisteria.0']).toBeGreaterThan(100);
    expect(month(mixed, 5).flowers['clematis']).toBeUndefined();
    expect(month(mixed, 8).flowers['clematis']).toBeGreaterThan(5);
    expect(month(mixed, 8).flowers['wisteria.0']).toBeUndefined();
    expect(view(mixed, 5, 'inside').flowers).toBeGreaterThan(0.05);
    expect(month(wisteria, 1).flowers).toEqual({});
    expect(view(wisteria, 1, 'inside').flowers).toBe(0);
  });

  it('sees all of the timber on a structure with nothing planted', () => {
    const empty = designReport(run({ ...wisteriaOnVault({ taxa, care: 'untended', years: 2 }), plantings: [] }, '2028-12-31'));
    for (const m of empty.months) {
      for (const v of m.views) {
        expect(v.timberVisible).toBe(1);
        expect(v.foliage).toBe(0);
      }
    }
    expect(empty.plants).toEqual([]);
    expect(empty.routes.heldShare).toBe(0);
  });
});

// SIMULATION_KEY.md section 8, outputs 3 and 4.
describe('flowers and routes', () => {
  it('sorts the year’s flowers by height, and accounts for every one', () => {
    for (const p of mixed.plants) {
      const total = mixed.flowersByHeight.filter((f) => f.plantId === p.plantId).reduce((s, f) => s + f.count, 0);
      expect(total, p.plantId).toBe(mixedSim.summaries.find((s) => s.plantId === p.plantId && s.year === 2034)!.flowersOpened);
    }
    // the clematis flowers where people can reach; the wisteria mostly overhead
    const count = (plantId: string, zone: string) => mixed.flowersByHeight.find((f) => f.plantId === plantId && f.zone === zone)?.count ?? 0;
    expect(count('clematis', 'within reach, under 2 m')).toBeGreaterThan(count('clematis', 'above 3 m'));
    expect(count('wisteria.0', 'above 3 m') + count('wisteria.0', '2 to 3 m')).toBeGreaterThan(count('wisteria.0', 'within reach, under 2 m') * 5);
  });

  it('balances route held against route left free', () => {
    for (const r of [mixed, wisteria, neglected]) {
      expect(r.routes.heldM + r.routes.freeM).toBeCloseTo(r.structure.routeM, 6);
      expect(r.routes.heldShare).toBeLessThanOrEqual(1);
      for (const p of r.plants) expect(p.routeHeldM).toBeLessThanOrEqual(r.routes.heldM + 1e-9);
    }
  });

  it('reports the steel in the structure', () => {
    expect(mixed.structure.steelCableM).toBeGreaterThan(40);
    expect(mixed.structure.steelShareOfRoute).toBeGreaterThan(0.2);
    expect(mixed.structure.primaryTimberM).toBeGreaterThan(30);
  });
});

// SIMULATION_KEY.md section 8, outputs 5 and 6; HORTICULTURAL_INTERVENTIONS.md.
describe('the gardener’s year, and what to keep in view', () => {
  it('counts the actions, the tie-ins and the stem cut, and does not invent hours', () => {
    expect(mixed.gardeningHours).toBeNull();
    for (const g of mixed.gardening) {
      if (g.year === 2027) continue;
      expect(g.actions.spur_prune, String(g.year)).toBe(4);
      expect(g.actions.hard_prune, String(g.year)).toBe(1);
      expect(g.tieIns, String(g.year)).toBeGreaterThan(0);
    }
    expect(mixed.gardening.reduce((s, g) => s + g.stemRemovedM, 0)).toBeCloseTo(
      mixedSim.events.reduce((s, e) => s + e.effects.stemRemovedM, 0),
      6,
    );
    expect(neglected.gardening.map((g) => g.year)).toEqual([2027]);
    expect(neglected.gardening[0]!.actions).toEqual({ plant: 5 });
    expect(neglected.gardening[0]!.tieIns).toBe(0);
  });

  it('flags thick stems wound round timber', () => {
    const a = mixed.alerts.find((x) => x.kind === 'thickening_watch' && x.plantId === 'wisteria.0')!;
    expect(a.count).toBeGreaterThan(0);
    expect(a.text).toContain('go on thickening');
    expect(mixed.alerts.some((x) => x.kind === 'thickening_watch' && x.plantId === 'clematis')).toBe(false);
  });

  it('flags plants that ran out of route before they ran out of structure', () => {
    expect(mixed.alerts.some((x) => x.kind === 'crown_not_reached' && x.plantId === 'clematis')).toBe(true);
  });

  it('flags shoots left without a hold when nobody gardens', () => {
    for (const id of ['honeysuckle', 'clematis', 'winter-clematis']) {
      const a = neglected.alerts.find((x) => x.kind === 'no_hold' && x.plantId === id)!;
      expect(a.count, id).toBeGreaterThan(0);
      expect(a.text, id).toContain('nobody tied the shoot in');
    }
    expect(mixed.alerts.some((x) => x.kind === 'no_hold' && x.plantId === 'clematis')).toBe(false);
  });

  it('says what the run could not model', () => {
    const r = designReport(run(mixedOnVault({ taxa: withHoneysuckleWood(null), care: 'trained', years: 3 }), '2029-12-31'));
    expect(r.alerts.some((x) => x.kind === 'not_modelled' && x.plantId === 'honeysuckle')).toBe(true);
    expect(mixed.alerts.some((x) => x.kind === 'not_modelled')).toBe(false);
  });
});

describe('the report as a whole', () => {
  it('states what it rests on and what it must not be used for', () => {
    expect(mixed.statement).toContain('not a forecast');
    expect(mixed.proxyNote).toContain('must not be used to size anything');
    for (const taxonId of ['wisteria-sinensis', 'lonicera-henryi', 'clematis-viticella-etoile-violette', 'clematis-cirrhosa-freckles']) {
      expect(mixed.assumptions[taxonId]!.measured, taxonId).toBe(0);
      expect(mixed.assumptions[taxonId]!.provisional_design_assumption, taxonId).toBeGreaterThan(50);
    }
  });

  it('is plain data, and reads as text', () => {
    expect(JSON.parse(JSON.stringify(mixed))).toEqual(mixed);
    const text = formatDesignReport(mixed);
    for (const heading of ['STRUCTURE', 'PLANTS at the end of the run', 'THROUGH 2034', 'GARDENING, by year', 'TO KEEP IN VIEW', 'WHAT THIS RESTS ON']) expect(text).toContain(heading);
    expect(text).toContain('A scenario, not a forecast');
    expect(text).toContain('hours are not estimated');
    expect(text).toContain('Walking in from the south end');
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('undefined');
  });
});

// The helpers a viewer and the report share, so that pictures and numbers agree.
describe('what is on the plant on a given day', () => {
  const data = toRenderData(mixedSim);
  const cal = mixedSim.calendar;
  const seasons = seasonsOf(data, 2034);

  it('has deciduous leaves absent in winter, opening in spring, turning in autumn and gone by year end', () => {
    const leaf = data.leaves.find((l) => l.plantId === 'wisteria.0' && l.lastYear === null && l.firstYear < 2034 && l.removedDay < 0)!;
    const s = seasons.get('wisteria.0')!;
    expect(leafState(leaf, s, cal.dayOf('2034-01-20')).present).toBe(false);
    const opening = leafState(leaf, s, s.leafFlush[0] + 10);
    expect(opening.present).toBe(true);
    expect(opening.expansion).toBeGreaterThan(0);
    expect(opening.expansion).toBeLessThan(1);
    const summer = leafState(leaf, s, cal.dayOf('2034-07-15'));
    expect(summer).toEqual({ present: true, expansion: 1, autumn: 0 });
    expect(leafState(leaf, s, s.leafFall[1] + 1).present).toBe(false);
    expect(leafState(leaf, undefined, cal.dayOf('2034-07-15')).present).toBe(false);
  });

  it('keeps an evergreen leaf through winter, without autumn colour', () => {
    const leaf = data.leaves.find((l) => l.plantId === 'honeysuckle' && l.evergreen && l.firstYear === 2033 && l.lastYear === 2034)!;
    const state = leafState(leaf, seasons.get('honeysuckle'), cal.dayOf('2034-01-20'));
    expect(state).toEqual({ present: true, expansion: 1, autumn: 0 });
    expect(leafState(leaf, seasonsOf(data, 2035).get('honeysuckle'), cal.dayOf('2034-12-31') + 20).present).toBe(false);
  });

  it('takes a flower from bud to open to over', () => {
    const f = data.flowers.find((x) => x.plantId === 'wisteria.0' && x.year === 2034 && x.spentDay > 0)!;
    expect(flowerState(f, f.developDay - 1).phase).toBe('absent');
    expect(flowerState(f, f.developDay + 3).phase).toBe('in_bud');
    expect(flowerState(f, f.openDay).phase).toBe('open');
    expect(flowerState(f, f.spentDay).phase).toBe('absent');
  });

  it('thickens a stem from its tip radius at birth to its recorded radius at the end', () => {
    const stem = data.stems.find((s) => s.role === 'leader')!;
    const born = stem.bornDay[0]!;
    expect(stemRadiusM(data, stem, 0, born) * 1000).toBeCloseTo(data.thickening.tipRadiusMm, 6);
    expect(stemRadiusM(data, stem, 0, data.lastDay) * 1000).toBeCloseTo(stem.radiusMm[0]!, 6);
    let last = 0;
    for (let d = born; d <= data.lastDay; d += 200) {
      const r = stemRadiusM(data, stem, 0, d);
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });
});
