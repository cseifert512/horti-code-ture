import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGrowable, loadTaxa } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { GROWTH_PARAMS_OPTIONAL } from '../src/sim/model.ts';
import { type DesignReport, designReport, formatDesignReport } from '../src/sim/report.ts';
import { REFERENCE_PALETTE, plantsOnHemisphere, referencePalette } from '../src/sim/scenarios.ts';
import type { GardenerEvent } from '../src/sim/types.ts';
import { viewCoverage } from '../src/sim/view.ts';
import { toRenderData } from '../src/sim/render-data.ts';
import { WINTER_EVERGREEN_COVER } from '../src/targets.ts';
import { RESOLVED_WOOD, withFloweringWood } from './helpers.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const library = loadGrowable(speciesDir);
// which wood flowers is an inference for most of these taxa, so it is fixed here and checked against the library below
const taxa = withFloweringWood(library, RESOLVED_WOOD);
const END = '2038-12-31';

const paletteSim = new Simulation(referencePalette({ taxa })).runUntil(END);
const palette = designReport(paletteSim);
const open = (r: DesignReport, plantId: string) => r.months.filter((m) => (m.flowers[plantId] ?? 0) > 0).map((m) => m.month);

describe('growth models for the climbing palette', () => {
  it('exist for every climber, and not for the shrub', () => {
    const all = loadTaxa(speciesDir);
    const without = [...all.keys()].filter((id) => !library.has(id)).sort();
    expect(without).toEqual(['sarcococca-confusa']);
    expect(all.get('sarcococca-confusa')!.attachment.mechanism).toBe('none');
    expect(library.size).toBe(16);
  });

  it('grow from a library that records which wood flowers for every taxon, as these tests assume it', () => {
    const all = loadTaxa(speciesDir);
    for (const [id, t] of all) expect(t.flowering.wood.value, id).not.toBeNull();
    for (const [id, wood] of Object.entries(RESOLVED_WOOD)) {
      expect(all.get(id)!.flowering.wood.value, id).toBe(wood);
      // none of these is a measurement: each is a published statement or an inference labelled as one
      expect(['published_plant_profile', 'peer_reviewed', 'provisional_design_assumption'], id).toContain(all.get(id)!.flowering.wood.status);
    }
    // a run on the library as it stands therefore leaves no plant without a flowering rule
    expect(designReport(new Simulation(referencePalette({ taxa: library, years: 3 })).runUntil('2029-12-31')).alerts.filter((a) => a.kind === 'not_modelled')).toEqual([]);
  });

  it('say of themselves that they are borrowed, for as long as they hold a number copied from the wisteria', () => {
    for (const [id, { model }] of library) {
      if (id === 'wisteria-sinensis') continue;
      const copied = Object.values(model.params).filter((p) => (p.basis ?? '').startsWith('Copied from the Wisteria sinensis model'));
      if (copied.length) expect(model.statement, id).toContain('thinner than the wisteria model');
    }
  });

  it('hold no number that is not labelled as an assumption or tied to a source', () => {
    for (const [id, { model }] of library) {
      for (const [key, p] of Object.entries(model.params)) {
        // a part the plant may or may not have (fruit, appendages, side shoots) stays unknown until it is researched:
        // an unknown holds no number, so there is nothing to label
        if (p.status === 'unknown' && (GROWTH_PARAMS_OPTIONAL as readonly string[]).includes(key)) {
          expect(p.value, `${id} ${key}`).toBeNull();
          continue;
        }
        // a number is tied to a source, or it is labelled as an assumption with its basis: nothing in between
        expect(['measured', 'peer_reviewed', 'published_plant_profile', 'calibrated', 'provisional_design_assumption'], `${id} ${key}`).toContain(p.status);
        if (p.status === 'provisional_design_assumption') expect((p.basis ?? '').length, `${id} ${key}`).toBeGreaterThan(10);
        else expect(p.source, `${id} ${key}`).toMatch(/^https:\/\//);
      }
    }
  });
});

// KEY.md section 6, "Single UK reference palette / yearly spectacle"; section 7 step 7: "Render monthly
// time slices, check winter appearance and repeat with the gardener model active."
describe('the reference palette on the 15 m hemisphere, twelve years on', () => {
  it('puts one plant at the foot of each of the twelve ribs', () => {
    expect(REFERENCE_PALETTE.map((p) => p.meridian)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(REFERENCE_PALETTE.map((p) => p.plantId)).size).toBe(12);
    expect(palette.plants).toHaveLength(12);
    for (const p of palette.plants) expect(p.frameworkM, p.plantId).toBeGreaterThan(8);
  });

  it('faces the warmth-loving evergreens south and the shade-tolerant hydrangea north', () => {
    const y = (plantId: string) => paletteSim.scenario.bower.rootStations.find((s) => s.id === paletteSim.plants.get(plantId)!.stationId)!.position.y;
    expect(y('star-jasmine')).toBeLessThan(-7);
    expect(y('winter-clematis')).toBeLessThan(-5);
    expect(y('spring-clematis')).toBeLessThan(-5);
    expect(y('hydrangea')).toBeGreaterThan(7);
  });

  it('carries the year round in the order the planting key gives', () => {
    // Dec-Feb: C. cirrhosa
    expect(open(palette, 'winter-clematis')).toEqual(expect.arrayContaining([12, 1, 2]));
    // Mar-Apr: C. armandi
    expect(open(palette, 'spring-clematis')).toEqual([3, 4]);
    // May: the wisterias, which are most of what is open then. Counts are not compared between months: a
    // count of open inflorescences sets a 6 cm honeysuckle cluster beside a 25 cm raceme.
    for (const w of ['wisteria.0', 'wisteria.1']) expect(open(palette, w)).toEqual([5]);
    const may = palette.months[4]!;
    const inMay = Object.values(may.flowers).reduce((s, n) => s + n, 0);
    expect(may.flowers['wisteria.0']! + may.flowers['wisteria.1']!).toBeGreaterThan(inMay / 2);
    // Jun-Aug: hydrangea, honeysuckles, summer clematis, star jasmine and rose, each within its own months
    expect(open(palette, 'hydrangea')).toEqual(expect.arrayContaining([6]));
    for (const id of ['evergreen-honeysuckle', 'honeysuckle', 'summer-clematis', 'star-jasmine', 'rose']) {
      expect(open(palette, id).every((m) => m >= 6 && m <= 10), id).toBe(true);
      // every one of them is in flower in July
      expect(open(palette, id), id).toEqual(expect.arrayContaining([7]));
    }
    // between them they carry June, July and August
    for (const month of [6, 7, 8]) expect(Object.values(palette.months[month - 1]!.flowers).some((n) => n > 0), `month ${month}`).toBe(true);
    // Sep-Oct: the repeat-flowering rose is what is left
    expect(open(palette, 'rose')).toEqual(expect.arrayContaining([9, 10]));
  });

  // Until 13 November 2026 this was "leaves a gap in mid November, which ivy would fill": the stand-in for the winter
  // clematis opened nothing before late November. The plant's own model opens 'Freckles' from 25 October
  // (`phenology.flowerOpenDoy`: a nursery's November to February, first flowers in late October some years), and on
  // 15 November 2038 it has 83 flowers open, the only plant in the palette that has. So the palette has no month without
  // a flower even without ivy, and it is the winter clematis that carries November. Ivy still adds its autumn flowers.
  it('has something in flower in the middle of every month, November carried by the winter clematis; ivy adds its autumn flowers', () => {
    expect(palette.flowerlessMonths).toEqual([]);
    expect(Object.keys(palette.months[10]!.flowers)).toEqual(['winter-clematis']);
    expect(palette.months[10]!.flowers['winter-clematis']!).toBeGreaterThan(20);
    const withIvy = designReport(new Simulation(referencePalette({ taxa, ivy: true })).runUntil(END));
    expect(withIvy.scenario).toContain('with ivy');
    expect(withIvy.plants.find((p) => p.plantId === 'north-evergreen')!.taxonId).toBe('hedera-helix');
    expect(open(withIvy, 'north-evergreen')).toEqual(expect.arrayContaining([9, 10]));
    expect(withIvy.flowerlessMonths).toEqual([]);
    expect(formatDesignReport(withIvy)).toContain('something in flower in the middle of every month');
    // and it is the one evergreen that holds the glulam without being tied
    const ivy = withIvy.plants.find((p) => p.plantId === 'north-evergreen')!;
    const honeysuckle = palette.plants.find((p) => p.plantId === 'north-evergreen')!;
    expect(ivy.heldUnaided).toBeGreaterThan(ivy.tiedIn);
    expect(honeysuckle.heldUnaided).toBeLessThan(honeysuckle.tiedIn);
    // and it is in leaf in January, as the honeysuckle it replaces is
    expect(withIvy.months[0]!.leaves['north-evergreen']!).toBeGreaterThan(500);
    expect(palette.months[0]!.leaves['north-evergreen']!).toBeGreaterThan(500);
  });

  it('keeps five plants in leaf through January and has the rest bare', () => {
    const jan = palette.months[0]!;
    expect(Object.keys(jan.leaves).sort()).toEqual(['evergreen-honeysuckle', 'north-evergreen', 'spring-clematis', 'star-jasmine', 'winter-clematis']);
    expect(Object.keys(palette.months[6]!.leaves)).toHaveLength(12);
  });

  // KEY.md section 6: "test 25-40% of selected visually prominent areas with retained winter evergreen coverage".
  // The key does not say what the share is of, so the report reads it as laid out and as seen, and gives both.
  it('lays its evergreens out to the winter target, and falls far short of it as seen from every viewpoint', () => {
    expect(WINTER_EVERGREEN_COVER.status).toBe('design_target');
    expect(WINTER_EVERGREEN_COVER.value).toEqual([0.25, 0.4]);
    const w = palette.winter!;
    expect(w.date).toBe('2038-01-15');
    expect(w.target).toBe(WINTER_EVERGREEN_COVER);
    // as laid out: the five plants that keep their leaves hold at least the quarter of the route the target asks for
    const [lo] = WINTER_EVERGREEN_COVER.value!;
    expect(w.layoutAgainst).not.toBe('below');
    expect(w.routeHeldByEvergreens).toBeGreaterThan(lo);
    // as seen: their leaf is under a quarter of the view from anywhere, and hides less of the timber than that. Until
    // 13 November 2026 it was under half of that (12.5%) from every viewpoint. With the evergreens modelled as
    // themselves, the approach from the south looks at the star jasmine and the two evergreen clematis, and their leaf
    // is 19.6% of that view on 15 January 2038 (22.4% before their routines of care): short of the target, no longer far
    // short. From inside and from the rim it is still well under half the target.
    expect(w.views).toHaveLength(3);
    for (const v of w.views) {
      expect(v.against, v.viewpointId).toBe('below');
      expect(v.evergreen, v.viewpointId).toBeLessThan(lo);
      expect(v.timberHidden, v.viewpointId).toBeLessThan(lo);
      if (v.viewpointId !== 'approach') expect(v.evergreen, v.viewpointId).toBeLessThan(lo / 2);
    }
    expect(w.views.find((v) => v.viewpointId === 'approach')!.evergreen).toBeGreaterThan(lo / 2);
    const text = formatDesignReport(palette);
    expect(text).toContain('WINTER EVERGREEN COVER on 2038-01-15, against the design target of 25% to 40%');
    expect(text).toMatch(/as laid out: plants that keep their leaves hold \d+% of the route {2}(within|above) the target/);
    expect(text).toContain('below the target');
    expect(text).toContain('do not yet read as cover');
  });

  // PROJECT_CONTEXT.md section 2: "Will the timber remain legible as designed, or become completely obscured?"
  it('hides none of the timber from a visitor inside, because the plants are on the outer face', () => {
    const inside = palette.viewpoints[1]!;
    expect(inside.label).toContain('inside');
    for (const m of palette.months) {
      const v = m.views.find((x) => x.viewpointId === inside.id)!;
      expect(v.timberBehindLeaf, m.date).toBeLessThan(0.02);
      expect(v.timberBehindEvergreen, m.date).toBeLessThanOrEqual(v.timberBehindLeaf);
    }
    // from the approach the same plants do hide some in July, and what is hidden is not seen
    const approach = palette.months[6]!.views[0]!;
    expect(approach.timberBehindLeaf).toBeGreaterThan(0.03);
    expect(approach.timberBehindLeaf).toBeLessThanOrEqual(1 - approach.timberVisible + 1e-9);
  });

  it('leaves the timber legible: most of it is still seen in high summer', () => {
    // PROJECT_CONTEXT.md section 2: "Will the timber remain legible as designed, or become completely obscured?"
    // Until 13 November 2026 more than 70% of the timber was seen from every viewpoint on 15 July. From the approach it is
    // now 68.6%: the plants on the south side are fuller as themselves (57.9% before the honeysuckle, the two evergreen
    // clematis and the star jasmine had their routines of care). Still most of it; from inside 99.0%, from the rim 96.6%.
    for (const v of palette.months[6]!.views) {
      expect(v.timberVisible, v.viewpointId).toBeGreaterThan(v.viewpointId === 'approach' ? 0.6 : 0.9);
      expect(v.timberVisible, v.viewpointId).toBeLessThanOrEqual(1);
    }
  });

  it('flags what it had to assume about the star jasmine, whose twining direction nobody has recorded', () => {
    const a = palette.alerts.filter((x) => x.kind === 'assumed');
    expect(a.map((x) => x.plantId)).toEqual(['star-jasmine']);
    expect(a[0]!.text).toContain('drawn right-handed');
    expect(a[0]!.text).toContain('not a finding');
    expect(palette.alerts.filter((x) => x.kind === 'caveat').map((x) => x.plantId)).toEqual(['star-jasmine']);
  });

  it('counts the framework and not the shoots of the year when it says how high a plant has got', () => {
    // the vine throws long canes that stand above the crown; the structure's routes end at 7.5 m
    for (const p of palette.plants) expect(p.highestM, p.plantId).toBeLessThanOrEqual(7.5 + 0.2);
    for (const s of paletteSim.summaries) expect(s.highestM, `${s.plantId} ${s.year}`).toBeLessThanOrEqual(7.5 + 0.2);
  });

  it('reports which timber joints a clinging plant has reached unaided, and nothing of the kind for the rest', () => {
    // DEVELOPMENT_GUIDE.md stage 5 exit check: "ivy reaches timber joints unaided and the run reports where"
    expect(palette.jointsReached.map((j) => j.plantId)).toEqual(['hydrangea']);
    const withIvy = designReport(new Simulation(referencePalette({ taxa, ivy: true })).runUntil(END));
    expect(withIvy.jointsReached.map((j) => j.plantId).sort()).toEqual(['hydrangea', 'north-evergreen']);
    const { graph } = paletteSim.scenario.bower;
    // the clause is about the ivy: it reaches more than four. The hydrangea beside it reaches some, fewer than it did
    // (three, where it reached six) now that the ivy and the vine beyond it hold more of the routes it would have taken
    expect(withIvy.jointsReached.find((j) => j.plantId === 'north-evergreen')!.nodeIds.length).toBeGreaterThan(4);
    for (const j of withIvy.jointsReached) {
      expect(j.nodeIds.length, j.plantId).toBeGreaterThan(0);
      for (const id of j.nodeIds) {
        const members = new Set([...graph.edges.values()].filter((e) => (e.from === id || e.to === id) && e.kind === 'timber' && e.host.type === 'member').map((e) => e.host.id));
        expect(members.size, id).toBeGreaterThanOrEqual(2);
      }
      expect(Math.max(...j.nodeIds.map((id) => graph.nodes.get(id)!.position.z))).toBeCloseTo(j.highestM, 9);
      const alert = withIvy.alerts.find((a) => a.kind === 'joints_reached' && a.plantId === j.plantId)!;
      expect(alert.count).toBe(j.nodeIds.length);
      expect(alert.text).toContain('the joints to inspect');
    }
    // a second palette is grown here: given longer than the default, as the ivy test above is
  }, 120_000);

  it('prints plant ids of any length in aligned columns', () => {
    const lines = formatDesignReport(palette).split('\n');
    const head = lines.findIndex((l) => l.includes('flowers open, by plant'));
    const months = lines[head + 1]!;
    const row = lines.slice(head + 2).find((l) => l.includes('evergreen-honeysuckle'))!;
    expect(row.length).toBe(months.length);
    expect(months.trimStart().startsWith('Jan')).toBe(true);
  });
});

// CONSTRAINTS_AND_PHENOLOGY.md: flowering on both old and new wood is its own class, not a mixture of
// settings; HORTICULTURAL_INTERVENTIONS.md: what a hard prune costs depends on which wood flowers.
describe('a honeysuckle that flowers on both last year\'s stems and this year\'s growth', () => {
  const gt = [{ plantId: 'honeysuckle', taxonId: 'lonicera-periclymenum-graham-thomas' }];
  const grow = (events: GardenerEvent[]) => {
    const s = plantsOnHemisphere({ taxa, care: 'trained' }, gt, 'One honeysuckle');
    return new Simulation({ ...s, events }).runUntil('2034-12-31');
  };
  const [o0, o1] = taxa.get('lonicera-periclymenum-graham-thomas')!.model.params['phenology.flowerOpenDoy'].value as [number, number];
  const split = o0 + Math.round((o1 - o0) / 3);
  const flush = (sim: Simulation, year: number) => {
    const days = sim.buds.filter((b) => b.openDay !== null && b.floweringYear === year).map((b) => sim.calendar.dateOf(b.openDay!).dayOfYear);
    return { early: days.filter((d) => d <= split).length, late: days.filter((d) => d > split).length };
  };
  const left = grow([]);
  const cut = grow([2033, 2034].map((y) => ({ id: `cut-${y}`, date: `${y}-02-20`, type: 'hard_prune', plantId: 'honeysuckle', target: { allStems: true }, keepM: 0.5, author: 'gardener', reason: 'cut down in late winter' })));

  it('gives a first flush from the old stems and goes on flowering on the new', () => {
    const f = flush(left, 2034);
    expect(f.early).toBeGreaterThan(10);
    expect(f.late).toBeGreaterThan(5);
    // the note of the flowers along the stems; since 13 November 2026 the plant's own model also has flowering side
    // shoots, whose note of the buds at their ends ("... at the ends of 479 flowering side shoots") is written after it
    const note = left.decisions.filter((d) => d.kind === 'floral_initiated' && !d.text.includes('at the ends of')).at(-1)!.text;
    expect(note).toMatch(/\d+ on last year's stems for the first flush and \d+ on this year's growth/);
  });

  it('loses the first flush to a late-winter cut-down and keeps the later flowers', () => {
    expect(flush(cut, 2032)).toEqual(flush(left, 2032));
    for (const y of [2033, 2034]) {
      const f = flush(cut, y);
      expect(f.early, String(y)).toBeLessThan(3);
      expect(f.late, String(y)).toBeGreaterThan(2);
    }
    expect(flush(cut, 2034).early).toBeLessThan(flush(left, 2034).early / 5);
  });

  it('shows no flowers at all, and says why, while its flowering wood is unknown', () => {
    const unknown = withFloweringWood(taxa, { 'lonicera-periclymenum-graham-thomas': null });
    const sim = new Simulation(plantsOnHemisphere({ taxa: unknown, care: 'trained' }, gt, 'One honeysuckle')).runUntil('2031-12-31');
    expect(sim.buds).toHaveLength(0);
    expect(sim.decisions.find((d) => d.kind === 'not_modelled')!.text).toContain('which of its wood flowers is not established');
  });
});

// CLAUDE.md, "Mechanism traits do not transfer"; DEVELOPMENT_GUIDE.md stage 3 exit check.
describe('the alternates, each grown alone at the foot of a rib', () => {
  const plants = [
    { plantId: 'campsis', taxonId: 'campsis-x-tagliabueana-madame-galen' },
    { plantId: 'akebia', taxonId: 'akebia-quinata' },
    { plantId: 'diana', taxonId: 'clematis-princess-diana' },
    { plantId: 'hydrangea', taxonId: 'hydrangea-anomala-subsp-petiolaris' },
  ];
  const sims = {
    trained: new Simulation(plantsOnHemisphere({ taxa, care: 'trained' }, plants, 'Four alternates')).runUntil('2034-12-31'),
    untended: new Simulation(plantsOnHemisphere({ taxa, care: 'untended' }, plants, 'Four alternates')).runUntil('2034-12-31'),
  };
  const reports = { trained: designReport(sims.trained), untended: designReport(sims.untended) };
  const plant = (r: DesignReport, id: string) => r.plants.find((p) => p.plantId === id)!;

  it('lets the two that cling climb bare glulam with nobody gardening', () => {
    for (const id of ['campsis', 'hydrangea']) {
      const p = plant(reports.untended, id);
      expect(p.frameworkM, id).toBeGreaterThan(20);
      expect(p.heldUnaided, id).toBeGreaterThan(15);
      expect(p.tiedIn, id).toBe(0);
    }
  });

  it('leaves the twiner and the leaf-stalk climber on the ground without a gardener', () => {
    for (const id of ['akebia', 'diana']) {
      expect(plant(reports.untended, id).frameworkM, id).toBeLessThan(0.5);
      expect(reports.untended.alerts.some((a) => a.kind === 'no_hold' && a.plantId === id), id).toBe(true);
      expect(plant(reports.trained, id).frameworkM, id).toBeGreaterThan(10);
      expect(plant(reports.trained, id).tiedIn, id).toBeGreaterThan(plant(reports.trained, id).heldUnaided);
    }
  });

  it('passes on what the profile says of campsis, that it clings too weakly to be left to itself', () => {
    const c = reports.untended.alerts.find((a) => a.kind === 'caveat' && a.plantId === 'campsis')!;
    expect(c.text).toContain('weak self-clinger');
    expect(c.text).toContain('the model does not act on it');
  });

  it('makes the hydrangea slow to start and late to flower', () => {
    const at = (id: string, year: number) => sims.trained.summaries.find((s) => s.plantId === id && s.year === year)!;
    expect(at('hydrangea', 2029).frameworkM).toBeLessThan(at('campsis', 2029).frameworkM / 2);
    expect(at('hydrangea', 2029).frameworkM).toBeLessThan(at('akebia', 2029).frameworkM / 2);
    for (let y = 2027; y <= 2030; y++) expect(at('hydrangea', y).flowersOpened, String(y)).toBe(0);
    expect(at('hydrangea', 2034).flowersOpened).toBeGreaterThan(5);
  });

  it('flowers each in its own season: akebia in spring, hydrangea in early summer, the clematis and campsis late', () => {
    const r = reports.trained;
    expect(open(r, 'akebia')).toEqual([4]);
    expect(open(r, 'hydrangea')).toEqual(expect.arrayContaining([6]));
    expect(open(r, 'hydrangea').every((m) => m === 6 || m === 7)).toBe(true);
    // July to October (Clematis on the Web: "Jul, Aug, Sep, Oct"): flowers that open late in September last into October
    expect(open(r, 'diana').every((m) => m >= 7 && m <= 10)).toBe(true);
    expect(open(r, 'diana')).toEqual(expect.arrayContaining([8, 9]));
    expect(open(r, 'campsis').every((m) => m >= 8 && m <= 10)).toBe(true);
    expect(open(r, 'campsis')).toEqual(expect.arrayContaining([9]));
  });

  it('twines the akebia right-handed, as its profile records', () => {
    expect(library.get('akebia-quinata')!.profile.attachment.handedness!.value).toBe('right_handed');
    expect(reports.trained.alerts.some((a) => a.kind === 'assumed')).toBe(false);
  });
});

// SIMULATION_KEY.md section 8, output 2. A thin stem seen from a distance must count for its own width.
describe('coverage seen from a viewpoint', () => {
  it('does not let stems thinner than a pixel hide the timber they lie on', () => {
    const sim = paletteSim;
    const data = toRenderData(sim);
    const vp = sim.scenario.viewpoints![0]!;
    const day = sim.calendar.dayOf('2038-01-15');
    const yearOf = (d: number) => sim.calendar.dateOf(d).year;
    const coarse = viewCoverage(sim.scenario.bower, data, vp, [day], yearOf)[0]!;
    const fine = viewCoverage(sim.scenario.bower, data, vp, [day], yearOf, { width: 960, height: 720 })[0]!;
    // Until 13 November 2026 this said that twelve plants in winter, as good as bare-stemmed, left more than 85% of the
    // glulam seen. With the five evergreens modelled as themselves their winter leaf hides 21% of it from the approach
    // (73.2% seen), so the stems are now asked about on their own: with every leaf taken out of the picture, stems
    // thinner than a pixel still hide little of the glulam, at either resolution (91.3% and 90.5% seen).
    const stemsOnly = { ...data, leaves: [] };
    const bareCoarse = viewCoverage(sim.scenario.bower, stemsOnly, vp, [day], yearOf)[0]!;
    const bareFine = viewCoverage(sim.scenario.bower, stemsOnly, vp, [day], yearOf, { width: 960, height: 720 })[0]!;
    expect(bareCoarse.timberVisible).toBeGreaterThan(0.85);
    expect(bareFine.timberVisible).toBeGreaterThan(0.85);
    expect(Math.abs(bareCoarse.timberVisible - bareFine.timberVisible)).toBeLessThan(0.03);
    // and with the leaf in, what hides the timber is the evergreen leaf, and the two resolutions agree
    expect(coarse.timberBehindEvergreen).toBeCloseTo(coarse.timberBehindLeaf, 9);
    expect(Math.abs(coarse.timberVisible - fine.timberVisible)).toBeLessThan(0.06);
    // the leaf seen (19.6% coarse, 18.5% fine) agrees within a fifteenth of itself. The old bound, one point of the view,
    // was set when this leaf was under 12.5% of the view; a point is now a twentieth of it
    expect(Math.abs(coarse.evergreenFoliage - fine.evergreenFoliage)).toBeLessThan(coarse.evergreenFoliage / 15);
  });
});
