import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeBower, readBower } from '../src/bower/description.ts';
import { makeHemisphereBower } from '../src/bower/hemisphere.ts';
import { dayLengthHours } from '../src/calendar.ts';
import { LightGeometry, clumpLeaves, exposureField, foliageOf } from '../src/light/exposure.ts';
import { LIGHT_MODEL } from '../src/light/model.ts';
import { DEFAULT_SITE, type Site, TREE_CROWN_TRANSMISSION, TREE_IN_LEAF_MONTHS } from '../src/light/site.ts';
import { MID_MONTH_DOY, equationOfTimeMinutes, sunAt, sunAtSolarHour, sunPath } from '../src/light/sun.ts';
import { lightFactor, readLight, sunClassOf } from '../src/light/tolerance.ts';
import { loadGrowable, loadTaxa } from '../src/node/load-taxa.ts';
import { collectProvenance } from '../src/provenance.ts';
import { Simulation } from '../src/sim/engine.ts';
import { designReport, formatDesignReport } from '../src/sim/report.ts';
import { referencePalette } from '../src/sim/scenarios.ts';
import type { Scenario } from '../src/sim/types.ts';
import { EVIDENCE_NEEDS_BASIS, EVIDENCE_NEEDS_SOURCE, SUN_CLASS, SUN_DOC_TERMS } from '../src/vocab.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const profiles = loadTaxa(speciesDir);
const taxa = loadGrowable(speciesDir);
const JUN = 5;
const DEC = 11;

// DEVELOPMENT_GUIDE.md stage 5: "Input Bower shell, cardinal orientation, light/shade map".
describe('where the sun is', () => {
  it('stands due south at solar noon in southern England, 62 degrees up at midsummer and 15 at midwinter', () => {
    const summer = sunAtSolarHour(DEFAULT_SITE, 172, 12);
    expect(summer.elevationDeg).toBeCloseTo(90 - 51.5 + 23.44, 1);
    expect(summer.azimuthDeg).toBeCloseTo(180, 5);
    expect(summer.direction.y).toBeLessThan(0);
    expect(Math.abs(summer.direction.x)).toBeLessThan(1e-9);
    expect(Math.hypot(summer.direction.x, summer.direction.y, summer.direction.z)).toBeCloseTo(1, 9);
    expect(sunAtSolarHour(DEFAULT_SITE, 355, 12).elevationDeg).toBeCloseTo(90 - 51.5 - 23.44, 1);
  });

  it('rises north of east in June and south of east in December, and is in the west after noon', () => {
    const juneDawn = sunPath(DEFAULT_SITE, 172)[0]!;
    expect(juneDawn.direction.x).toBeGreaterThan(0);
    expect(juneDawn.direction.y).toBeGreaterThan(0);
    const decDawn = sunPath(DEFAULT_SITE, 355)[0]!;
    expect(decDawn.direction.x).toBeGreaterThan(0);
    expect(decDawn.direction.y).toBeLessThan(0);
    expect(sunAtSolarHour(DEFAULT_SITE, 172, 16).direction.x).toBeLessThan(0);
  });

  it('is up for exactly the day length the calendar gives, every month', () => {
    for (const lat of [0, 35, 51.5, 60]) {
      for (const doy of MID_MONTH_DOY) {
        const hours = sunPath({ latitudeDeg: lat, bearingDeg: 0 }, doy).reduce((s, x) => s + x.hours, 0);
        expect(hours, `${lat} N, day ${doy}`).toBeCloseTo(dayLengthHours(lat, doy), 6);
      }
    }
  });

  it('keeps clock time apart from sun time: a site to the west has its noon later, and the sundial runs fast and slow through the year', () => {
    // 3 degrees west is 12 minutes of sun time
    const greenwich = sunAt({ ...DEFAULT_SITE, longitudeDeg: 0 }, 105, 12);
    const bristol = sunAt({ ...DEFAULT_SITE, longitudeDeg: -3 }, 105, 12);
    const bristolLater = sunAt({ ...DEFAULT_SITE, longitudeDeg: -3 }, 105, 12.2);
    expect(bristol.azimuthDeg).toBeLessThan(greenwich.azimuthDeg);
    expect(bristolLater.azimuthDeg).toBeCloseTo(greenwich.azimuthDeg, 6);
    // about 14 minutes slow in mid February, 16 fast in early November, near nothing in mid April
    expect(equationOfTimeMinutes(45)).toBeLessThan(-13);
    expect(equationOfTimeMinutes(307)).toBeGreaterThan(15);
    expect(Math.abs(equationOfTimeMinutes(105))).toBeLessThan(1.5);
  });

  it('turns with the structure: drawn with its y axis to the east, the noon sun is on the +x side', () => {
    const turned = sunAtSolarHour({ latitudeDeg: 51.5, bearingDeg: 90 }, 172, 12);
    // the drawing's y points east and its x points south, where the sun is
    expect(turned.direction.x).toBeGreaterThan(0.4);
    expect(Math.abs(turned.direction.y)).toBeLessThan(1e-9);
    expect(turned.azimuthDeg).toBeCloseTo(180, 5);
  });
});

// "Do not invent a preference a profile does not support": the reading adds nothing to the profile's own sentence.
describe('what a profile says about light', () => {
  const read = (id: string) => readLight(profiles.get(id)!);

  it('can be read for every taxon in the library, and says that the reading is an interpretation', () => {
    expect(profiles.size).toBe(17);
    for (const [id, p] of profiles) {
      const r = readLight(p);
      expect(r.accepts.length, id).toBeGreaterThan(0);
      expect(r.status, id).toBe('provisional_design_assumption');
      expect(r.basis, id).toContain(p.site.aspect);
    }
  });

  it('accepts the classes the sentence names and no others', () => {
    expect(read('clematis-armandi').accepts).toEqual(['full_sun']);
    expect(read('thunbergia-alata').accepts).toEqual(['full_sun']);
    expect(read('wisteria-sinensis').accepts).toEqual(['full_sun', 'partial_shade']);
    expect(read('vitis-coignetiae').accepts).toEqual(['full_sun', 'partial_shade']);
    expect(read('hedera-helix').accepts).toEqual([...SUN_CLASS]);
    expect(read('sarcococca-confusa').accepts).toEqual(['partial_shade', 'moderate_shade', 'deep_shade']);
    // "a cooler shaded base helps" is about the roots: it is not shade the plant accepts
    expect(read('clematis-cirrhosa-freckles').accepts).toEqual(['full_sun']);
    // "full sun only where the soil stays moist" is a condition the model cannot check, so it is not an acceptance
    const hydrangea = read('hydrangea-anomala-subsp-petiolaris');
    expect(hydrangea.accepts).toEqual(['partial_shade']);
    expect(hydrangea.fullSunOnlyIf).toBe('full sun only where the soil stays moist');
  });

  it('reads the aspects a sentence names, and leaves aspect open where it names none', () => {
    expect(read('clematis-armandi').aspects).toEqual(['south', 'west']);
    expect(read('lonicera-henryi').aspects).toEqual(['north', 'east', 'west']);
    expect(read('hydrangea-anomala-subsp-petiolaris').aspects).toEqual(['north', 'east']);
    expect(read('lonicera-periclymenum-graham-thomas').aspects).toEqual([]);
    expect(read('akebia-quinata').aspects).toEqual([]);
  });

  it('ties flowering to sun only where the sentence does, and notes shelter and warmth without acting on them', () => {
    const tied = [...profiles.keys()].filter((id) => read(id).floweringNeedsSun).sort();
    expect(tied).toEqual(['rosa-the-generous-gardener', 'wisteria-sinensis']);
    // heat is not light: the campsis sentence ties flowering to summer heat, which the model does not have
    expect(read('campsis-x-tagliabueana-madame-galen').floweringNeedsSun).toBe(false);
    expect(read('campsis-x-tagliabueana-madame-galen').warmth).toBe(true);
    expect(read('trachelospermum-jasminoides').shelter).toBe(true);
    // "exposed or sheltered" asks for nothing
    expect(read('hedera-helix').shelter).toBe(false);
    expect(read('lonicera-henryi').shelter).toBe(false);
  });

  it('maps every phrase to classes that exist', () => {
    for (const [term, classes] of Object.entries(SUN_DOC_TERMS)) {
      expect(classes.length, term).toBeGreaterThan(0);
      for (const c of classes) expect(SUN_CLASS, term).toContain(c);
    }
  });

  it('classes a place by its midsummer hours as the RHS does', () => {
    expect(sunClassOf(6.1)).toBe('full_sun');
    expect(sunClassOf(6)).toBe('partial_shade');
    expect(sunClassOf(3)).toBe('partial_shade');
    expect(sunClassOf(2.5)).toBe('moderate_shade');
    expect(sunClassOf(1.9)).toBe('deep_shade');
    expect(lightFactor(0.5, 1)).toBe(0.5);
    expect(lightFactor(0.5, 0.4)).toBe(1);
    expect(lightFactor(0.5, null)).toBe(1);
  });
});

// CLAUDE.md: "No bare numbers about plants."
describe('the numbers the light model assumes', () => {
  it('are all labelled: evidence names its source, a choice gives its reason', () => {
    const entries = collectProvenance('light model', { LIGHT_MODEL, TREE_CROWN_TRANSMISSION, TREE_IN_LEAF_MONTHS });
    expect(entries.length).toBeGreaterThanOrEqual(12);
    for (const e of entries) {
      expect(e.value, e.path).not.toBeNull();
      if (EVIDENCE_NEEDS_SOURCE.includes(e.status)) expect(e.source, e.path).toMatch(/^https:\/\//);
      if (EVIDENCE_NEEDS_BASIS.includes(e.status)) expect(e.basis, e.path).toBeTruthy();
    }
    // the only published values are the RHS's hours and the measured crown transmission; everything the response rests on is a choice
    expect(LIGHT_MODEL.fullSunHours.status).toBe('published_plant_profile');
    for (const c of SUN_CLASS) expect(LIGHT_MODEL.lightNeeded[c].status, c).toBe('provisional_design_assumption');
    expect(LIGHT_MODEL.floweringLightNeeded.status).toBe('provisional_design_assumption');
    expect(LIGHT_MODEL.diffuseShare.status).toBe('provisional_design_assumption');
  });
});

const dome = () => makeHemisphereBower({ diameterM: 15, stations: 12 });
const station = (f: ReturnType<typeof exposureField>, id: string) => f.points.find((p) => p.kind === 'station' && p.id === id)!;

// DEVELOPMENT_GUIDE.md stage 5: "light/shade map"; KEY.md section 7: place by aspect.
describe('light on the 15 m hemisphere', () => {
  const open = exposureField(dome(), DEFAULT_SITE);

  it('reads every stretch of route and every root station, each on its side of the structure', () => {
    const bower = dome();
    const routes = new Set(open.points.filter((p) => p.kind === 'route').map((p) => p.id));
    expect(routes.size).toBe(bower.graph.edges.size);
    expect(open.points.filter((p) => p.kind === 'station')).toHaveLength(12);
    expect(open.points.filter((p) => p.kind === 'route').reduce((s, p) => s + p.routeM, 0)).toBeCloseTo(bower.graph.totalLength, 6);
    // meridian 0 faces east, 3 north, 6 west, 9 south
    expect(station(open, 'station.0').facing).toBe('east');
    expect(station(open, 'station.3').facing).toBe('north');
    expect(station(open, 'station.6').facing).toBe('west');
    expect(station(open, 'station.9').facing).toBe('south');
  });

  it('never gives more sun than there is day, nor a share outside nought to one', () => {
    for (const p of open.points) {
      for (let m = 0; m < 12; m++) {
        expect(p.hours[m]!, `${p.id} month ${m + 1}`).toBeLessThanOrEqual(open.possibleHours[m]! + 1e-6);
        expect(p.hours[m]!).toBeGreaterThanOrEqual(0);
        expect(p.share[m]!).toBeGreaterThan(0);
        expect(p.share[m]!).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('has the top nearly as bright as an open site, and the north side dimmer than the south, most of all in winter', () => {
    const side = (facing: string, m: number) => {
      const pts = open.points.filter((p) => p.kind === 'route' && p.facing === facing);
      return pts.reduce((s, p) => s + p.routeM * p.share[m]!, 0) / pts.reduce((s, p) => s + p.routeM, 0);
    };
    expect(side('up', JUN)).toBeGreaterThan(0.97);
    expect(side('south', JUN)).toBeGreaterThan(side('north', JUN));
    expect(side('south', DEC) - side('north', DEC)).toBeGreaterThan(2 * (side('south', JUN) - side('north', JUN)));
    // an open lattice shades little: even its dimmest side keeps three quarters of an open site's light
    for (const f of ['north', 'east', 'south', 'west']) expect(side(f, DEC), f).toBeGreaterThan(0.75);
  });

  it('is in full sun, as the RHS defines it, at every station: an open lattice does not make shade', () => {
    for (const p of open.points.filter((q) => q.kind === 'station')) expect(sunClassOf(p.hours[JUN]!), p.id).toBe('full_sun');
  });

  it('is the same on the east side as on the west, the sun\'s day being symmetrical', () => {
    expect(station(open, 'station.0').hours[JUN]!).toBeCloseTo(station(open, 'station.6').hours[JUN]!, 0);
    expect(station(open, 'station.0').share[DEC]!).toBeCloseTo(station(open, 'station.6').share[DEC]!, 1);
  });
});

describe('shade a site declares', () => {
  const walled: Site = { ...DEFAULT_SITE, name: 'a walled yard', assumed: false, basis: 'made for this test', obstructions: [{ id: 'south-wall', kind: 'wall', from: [-12, -11], to: [12, -11], heightM: 6 }] };

  it('lets a 6 m wall three metres to the south take the winter sun from the south stations and leave them the summer', () => {
    const open = exposureField(dome(), DEFAULT_SITE);
    const f = exposureField(dome(), walled);
    expect(station(f, 'station.9').hours[DEC]!).toBe(0);
    expect(station(open, 'station.9').hours[DEC]!).toBeGreaterThan(7);
    // at midsummer the sun clears the wall for most of the day, but the wall still takes sky
    expect(station(f, 'station.9').hours[JUN]!).toBeGreaterThan(12);
    expect(station(f, 'station.9').share[JUN]!).toBeLessThan(station(open, 'station.9').share[JUN]! - 0.1);
    // the far side of the dome is less affected than the near
    expect(station(f, 'station.3').share[DEC]!).toBeGreaterThan(station(f, 'station.9').share[DEC]!);
  });

  it('lets a building do the same, and a deciduous tree shade more in leaf than bare', () => {
    const block: Site = { ...walled, obstructions: [{ id: 'barn', kind: 'building', footprint: [[-6, -22], [6, -22], [6, -12], [-6, -12]], heightM: 9 }] };
    expect(station(exposureField(dome(), block), 'station.9').hours[DEC]!).toBeLessThan(2);
    const tree = (leafHabit: 'deciduous' | 'evergreen'): Site => ({ ...walled, obstructions: [{ id: 'oak', kind: 'tree', at: [0, -13], heightM: 14, crownRadiusM: 6, leafHabit }] });
    const under = station(exposureField(dome(), tree('deciduous')), 'station.9');
    const open = station(exposureField(dome(), DEFAULT_SITE), 'station.9');
    const evergreen = station(exposureField(dome(), tree('evergreen')), 'station.9');
    expect(TREE_IN_LEAF_MONTHS.value).toContain(6);
    expect(TREE_IN_LEAF_MONTHS.value).not.toContain(12);
    // in leaf it lets a few per cent through; bare, nearly half
    expect(under.share[JUN]!).toBeLessThan(open.share[JUN]! - 0.15);
    expect(evergreen.share[DEC]!).toBeLessThan(under.share[DEC]!);
    expect(under.share[DEC]!).toBeLessThan(open.share[DEC]!);
  });

  it('is read from the site section of a Bower description, and refused where it cannot be a site', () => {
    const base = describeBower(dome());
    const read = readBower({ ...base, site: { name: 'Hollow Farm', latitudeDeg: 52.2, longitudeDeg: -2.1, bearingDeg: 20, obstructions: [{ id: 'barn', kind: 'wall', from: [-12, -11], to: [12, -11], heightM: 6 }] } }, 'hollow.bower.json');
    expect(read.site.assumed).toBe(false);
    expect(read.site.latitudeDeg).toBe(52.2);
    expect(read.bower.site).toBe(read.site);
    expect(read.site.obstructions).toHaveLength(1);
    // and is written out again with the structure
    expect(describeBower(read.bower).site).toEqual({ name: 'Hollow Farm', latitudeDeg: 52.2, longitudeDeg: -2.1, bearingDeg: 20, obstructions: [{ id: 'barn', kind: 'wall', from: [-12, -11], to: [12, -11], heightM: 6 }] });
    // a description with no site section is on the assumed site, and says so nowhere in the file
    const plain = readBower(base, 'plain.bower.json');
    expect(plain.site).toBe(DEFAULT_SITE);
    expect(plain.bower.site).toBeUndefined();
    expect(describeBower(plain.bower).site).toBeUndefined();
    // obstructions alone: the place is assumed, and the designer is told
    const half = readBower({ ...base, site: { obstructions: [{ id: 'oak', kind: 'tree', at: [0, -13], heightM: 14, crownRadiusM: 6, leafHabit: 'deciduous' }] } }, 'half.bower.json');
    expect(half.site.assumed).toBe(true);
    expect(half.warnings.join(' ')).toContain('southern England is assumed');
    expect(() => readBower({ ...base, site: { obstructions: [{ id: 'oak', kind: 'tree', at: [0, -13], heightM: 5, crownRadiusM: 6, clearStemM: 5, leafHabit: 'deciduous' }] } }, 'bad.bower.json')).toThrow(/clear stem/);
    expect(() => readBower({ ...base, site: { obstructions: [{ id: 'rod', kind: 'steel frame', heightM: 3 }] } }, 'bad.bower.json')).toThrow(/not a valid Bower description/);
    expect(() => readBower({ ...base, site: { latitude: 52 } }, 'bad.bower.json')).toThrow(/not a valid Bower description/);
  });
});

describe('leaf as shade', () => {
  it('thins the light behind it, and is not counted against the plant that carries it', () => {
    const g = new LightGeometry(dome(), DEFAULT_SITE);
    const i = g.byStation.get('station.3')!;
    const p = g.points[i]!.position;
    const bare = g.light(i);
    // a square metre of leaf in each half-metre of a wall of foliage two metres to the south, from knee height to four metres
    const leaves = [];
    for (let x = -3; x <= 3; x += 0.5) for (let z = 0.25; z <= 4; z += 0.5) leaves.push({ x: p.x + x, y: p.y - 2, z, areaM2: 1, evergreen: false, plant: 7 });
    const foliage = foliageOf(clumpLeaves(leaves), [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0]);
    const shaded = g.light(i, foliage);
    expect(shaded.share[JUN]!).toBeLessThan(bare.share[JUN]! - 0.05);
    // deciduous leaf is down in December
    expect(shaded.share[DEC]!).toBeCloseTo(bare.share[DEC]!, 9);
    expect(g.light(i, foliage, 7).share[JUN]!).toBeCloseTo(bare.share[JUN]!, 9);
    // the same leaf kept all year shades in winter too
    const evergreen = foliageOf(clumpLeaves(leaves.map((l) => ({ ...l, evergreen: true }))), foliage.deciduousOut);
    expect(g.light(i, evergreen).share[DEC]!).toBeLessThan(bare.share[DEC]! - 0.05);
  });
});

/** One plant alone on the twelve-station hemisphere: the same plant, the same seed, a different side. */
function alone(taxonId: string, stationId: string, extra: Partial<Scenario> = {}): Simulation {
  const scenario: Scenario = { name: `${taxonId} alone at ${stationId}`, start: '2027-03-01', seed: 7, bower: dome(), taxa, plantings: [{ plantId: 'plant', taxonId, stationId, date: '2027-03-12', tieToTimber: true }], events: [], ...extra };
  return new Simulation(scenario).runUntil('2032-12-31');
}
const framework = (sim: Simulation) => sim.summaries.filter((s) => s.plantId === 'plant').map((s) => s.frameworkM);
const NORTH = 'station.3';
const SOUTH = 'station.9';

// The owner's brief for stage 5: "Today a plant grows the same on the north side of a Bower as on the south."
describe('the same plant on the north side and on the south', () => {
  it('grew identically while light did not act', () => {
    const n = framework(alone('clematis-armandi', NORTH, { lightResponse: false }));
    const s = framework(alone('clematis-armandi', SOUTH, { lightResponse: false }));
    expect(n).toHaveLength(6);
    for (let y = 0; y < n.length; y++) expect(n[y]!).toBeCloseTo(s[y]!, 6);
  });

  it('no longer does, where its profile asks for sun: Clematis armandi makes less framework on the north side', () => {
    const north = alone('clematis-armandi', NORTH);
    const south = alone('clematis-armandi', SOUTH);
    const n = framework(north);
    const s = framework(south);
    for (let y = 0; y < n.length; y++) expect(n[y]!, `year ${y + 1}`).toBeLessThan(s[y]!);
    // in its first years by about as much as the light it loses: a tenth or so, not a collapse
    expect(n[1]! / s[1]!).toBeGreaterThan(0.8);
    expect(n[1]! / s[1]!).toBeLessThan(0.97);
    // and the gap closes as both near the length the model plans for them: light sets how fast, not how far. Asked of
    // the two stems both plants start with, whose planned lengths are drawn on planting day and so are the same on both
    // sides. Until 13 November 2026 it was asked of the whole framework, which the stand-in let close; with the plant's
    // own model the north plant ends two laterals short (53.8 m against 62.4 m from the ninth year), because each lateral
    // is drawn from the plant's `arch` stream in the order its growth reaches the node, and a slower plant reaches them
    // in another order. The whole-framework ratio was 0.914 in the second year and 0.913 in the sixth; these two stems' is
    // 0.916 and then 1.000 from the fifth year.
    const firstTwo = (stationId: string, lightResponse = true) => {
      const sim = new Simulation({ name: `clematis-armandi alone at ${stationId}`, start: '2027-03-01', seed: 7, bower: dome(), taxa, plantings: [{ plantId: 'plant', taxonId: 'clematis-armandi', stationId, date: '2027-03-12', tieToTimber: true }], events: [], lightResponse });
      const two = () => [...sim.axes.values()].filter((a) => a.role === 'leader' && a.parent === null).sort((a, b) => a.bornDay - b.bornDay || (a.id < b.id ? -1 : 1)).slice(0, 2).reduce((m, a) => m + (a.alive ? a.lengthAt[a.alive - 1]! : 0), 0);
      sim.runUntil('2028-12-31');
      const second = two();
      sim.runUntil('2032-12-31');
      return [second, two()] as const;
    };
    const [n2, n6] = firstTwo(NORTH);
    const [s2, s6] = firstTwo(SOUTH);
    expect(n2 / s2).toBeLessThan(0.97);
    expect(n6 / s6).toBeGreaterThan(n2 / s2);
    expect(n6 / s6).toBeGreaterThan(0.99);
    const light = (sim: Simulation) => sim.light.of(sim.plants.get('plant')!, 2032);
    expect(light(north).seasonShare).toBeLessThan(light(south).seasonShare);
    expect(light(north).seasonGrowth).toBeCloseTo(light(north).seasonShare, 1);
    // and both grow less than the model gives with light left out, because any structure takes some light. Asked of the
    // same two stems in the second year, for the reason above: with light left out the whole framework is 43.7 m in the
    // sixth year against the south plant's 53.8 m, from laterals drawn in another order (13 November 2026).
    expect(s2).toBeLessThan(firstTwo(SOUTH, false)[0]);
  });

  it('still does where its profile leaves aspect open: the woodbine accepts partial shade, and has far more light than that on either side', () => {
    const n = framework(alone('lonicera-periclymenum-graham-thomas', NORTH));
    const s = framework(alone('lonicera-periclymenum-graham-thomas', SOUTH));
    for (let y = 0; y < n.length; y++) expect(n[y]!).toBeCloseTo(s[y]!, 6);
  });

  it('flowers less on the north side where the profile ties flowers to sun, with the same framework: Wisteria sinensis', () => {
    const north = alone('wisteria-sinensis', NORTH);
    const south = alone('wisteria-sinensis', SOUTH);
    const light = (sim: Simulation, year: number) => sim.light.of(sim.plants.get('plant')!, year);
    for (const year of [2030, 2031, 2032]) {
      expect(light(north, year).flowering).toBeLessThan(light(south, year).flowering);
      expect(light(north, year).growth.every((g) => g === 1)).toBe(true);
    }
    const n = framework(north);
    const s = framework(south);
    for (let y = 0; y < n.length; y++) expect(n[y]!).toBeCloseTo(s[y]!, 6);
    const budsFormed = (sim: Simulation) => sim.summaries.reduce((sum, x) => sum + x.floralBudsInitiated, 0);
    expect(budsFormed(north)).toBeLessThan(budsFormed(south));
  });

  it('is held back hard by a wall that takes its sun, which an open site would not do', () => {
    const wall: Site = { ...DEFAULT_SITE, name: 'a walled yard', assumed: false, basis: 'made for this test', obstructions: [{ id: 'south-wall', kind: 'wall', from: [-12, -9.5], to: [12, -9.5], heightM: 9 }] };
    const open = alone('clematis-armandi', SOUTH);
    const walled = alone('clematis-armandi', SOUTH, { site: wall });
    expect(framework(walled)[5]!).toBeLessThan(0.9 * framework(open)[5]!);
    const report = designReport(walled);
    expect(report.light.site.name).toBe('a walled yard');
    expect(report.light.site.obstructions).toEqual([{ id: 'south-wall', kind: 'wall' }]);
  });
});

// SIMULATION_KEY.md section 8: outputs a designer can act on. KEY.md section 7: place by aspect.
describe('the light section of the design report', () => {
  const sim = new Simulation(referencePalette({ taxa })).runUntil('2038-12-31');
  const report = designReport(sim);
  const plant = (id: string) => report.light.plants.find((p) => p.plantId === id)!;

  it('says where the site is and that it was assumed', () => {
    expect(report.light.site.assumed).toBe(true);
    expect(report.light.site.latitudeDeg).toBe(51.5);
    expect(report.light.acts).toBe(true);
    expect(report.light.possibleHours[JUN]!).toBeCloseTo(dayLengthHours(51.5, MID_MONTH_DOY[JUN]!), 6);
    const text = formatDesignReport(report);
    expect(text).toContain('LIGHT in 2038');
    expect(text).toContain('southern England (assumed)');
    expect(text).toContain('not sunshine records');
  });

  it('gives every side of the structure, the north dimmer than the south', () => {
    expect(report.light.sides.map((s) => s.facing)).toEqual(['north', 'east', 'south', 'west', 'up']);
    const side = (f: string) => report.light.sides.find((s) => s.facing === f)!;
    expect(side('north').midwinterShare).toBeLessThan(side('south').midwinterShare);
    expect(side('north').summerShare).toBeLessThan(side('south').summerShare);
    expect(report.light.sides.reduce((s, x) => s + x.routeM, 0)).toBeCloseTo(report.structure.routeM, 6);
    expect(report.light.stations).toHaveLength(12);
  });

  it('reads each plant against its own profile', () => {
    expect(report.light.plants).toHaveLength(12);
    // every plant has more than half the light of open ground. The dimmest is no longer above 0.6: the evergreen on
    // the north-north-west stands next to the vine, whose leaves (10 to 22 cm, Bean) now clothe its lane and shade it
    // on summer afternoons
    for (const p of report.light.plants) {
      expect(p.seasonShare, p.plantId).toBeGreaterThan(0.5);
      expect(p.seasonShare, p.plantId).toBeLessThanOrEqual(1);
    }
    expect(plant('north-evergreen').seasonShare).toBeLessThan(plant('vine').seasonShare);
    // the two clematis whose profiles ask for sun are held back by what the structure takes; the rest are not
    expect(plant('spring-clematis').growthFactor).toBeLessThan(0.97);
    expect(plant('winter-clematis').growthFactor).toBeLessThan(0.97);
    for (const id of ['rose', 'hydrangea', 'vine', 'star-jasmine', 'wisteria.0', 'evergreen-honeysuckle']) expect(plant(id).growthFactor, id).toBe(1);
    expect(plant('wisteria.0').floweringFactor).toBeLessThan(1);
    expect(plant('vine').floweringFactor).toBe(1);
  });

  it('flags the hydrangea: put on the north side for shade, on an open lattice it is in full sun', () => {
    const h = plant('hydrangea');
    expect(h.side).toBe('north');
    expect(h.sunClass).toBe('full_sun');
    expect(h.light).toBe('more_sun');
    const alert = report.alerts.find((a) => a.kind === 'more_sun_than_profile' && a.plantId === 'hydrangea')!;
    expect(alert.text).toContain('full sun only where the soil stays moist');
    expect(alert.text).toContain('open lattice');
    // nothing in the palette is in less sun than its profile accepts
    expect(report.alerts.filter((a) => a.kind === 'less_sun_than_profile')).toEqual([]);
  });

  it('flags a plant on a side its profile does not name, and says what is not modelled about that', () => {
    // KEY.md puts the first wisteria east-south-east; its profile says "preferably south or west facing"
    const a = report.alerts.find((x) => x.kind === 'aspect_against_profile' && x.plantId === 'wisteria.0')!;
    expect(a.text).toContain('east-south-east');
    expect(a.text).toContain('not modelled');
    expect(plant('star-jasmine').aspect).toBe('as_asked');
    expect(plant('honeysuckle').aspect).toBe('not_asked');
    const shelter = report.alerts.find((x) => x.kind === 'shelter_not_modelled')!;
    expect(shelter.plantId).toBeNull();
    expect(shelter.text).toContain('star-jasmine');
  });

  it('counts the light model\'s own assumptions beside the growth models\'', () => {
    const c = report.assumptions['light model']!;
    expect(c.provisional_design_assumption).toBeGreaterThanOrEqual(9);
    expect(c.measured + c.calibrated).toBe(0);
    expect(formatDesignReport(report)).toContain('light model:');
  });

  it('reports light without acting on it when a scenario asks for that', () => {
    const still = new Simulation(referencePalette({ taxa, years: 4, lightResponse: false })).runUntil('2030-12-31');
    const acting = new Simulation(referencePalette({ taxa, years: 4 })).runUntil('2030-12-31');
    const r = designReport(still);
    expect(r.light.acts).toBe(false);
    expect(r.light.plants.find((p) => p.plantId === 'spring-clematis')!.seasonShare).toBeLessThan(1);
    const fw = (s: Simulation, id: string) => s.summaries.find((x) => x.plantId === id && x.year === 2030)!.frameworkM;
    expect(fw(acting, 'spring-clematis')).toBeLessThan(fw(still, 'spring-clematis'));
    // The vine, which has as much light as its profile asks for, is not slowed by it: its stems from the base are
    // exactly as they are with light left out. Until 13 November 2026 this asked the same of its whole framework. With
    // the woodbine beside it now modelled, light read through its leaf turns one of the vine's side shoots on to the
    // lattice ring in 2028, so that in 2030 a lateral finds the member it would have taken full: 41.42 m of framework
    // against 42.02 m. Light steers free shoots by design (docs/ASSUMPTIONS_AUDIT.md section 10); it does not slow this plant.
    for (let y = 2027; y <= 2030; y++) expect(acting.light.of(acting.plants.get('vine')!, y).seasonGrowth, String(y)).toBe(1);
    const leaders = (s: Simulation) => [...s.axes.values()].filter((a) => a.plantId === 'vine' && a.role === 'leader' && a.removedDay === null).reduce((m, a) => m + (a.alive ? a.lengthAt[a.alive - 1]! : 0), 0);
    expect(leaders(acting)).toBe(leaders(still));
    expect(Math.abs(fw(acting, 'vine') - fw(still, 'vine'))).toBeLessThan(0.02 * fw(still, 'vine'));
    expect(formatDesignReport(r)).toContain('was told not to act');
  });
});

// A viewer has a run's render data and not the simulation: the same leaf has to shade the same way from either.
describe('the leaf of a season, read from render data', () => {
  it('shades the structure as the run itself was shaded, and is absent before anything has grown', async () => {
    const { foliageFromRenderData } = await import('../src/light/canopy.ts');
    const { toRenderData } = await import('../src/sim/render-data.ts');
    const sim = new Simulation(referencePalette({ taxa, years: 6 })).runUntil('2032-12-31');
    const data = toRenderData(sim);
    expect(foliageFromRenderData(data, 2026)).toBeUndefined();
    const leaf = foliageFromRenderData(data, 2032)!;
    expect(leaf.clumps.length).toBeGreaterThan(50);
    // deciduous leaf is out in June and down in January
    expect(leaf.deciduousOut[JUN]!).toBe(1);
    expect(leaf.deciduousOut[0]!).toBe(0);
    const bare = exposureField(sim.scenario.bower, DEFAULT_SITE);
    const clothed = exposureField(sim.scenario.bower, DEFAULT_SITE, leaf);
    const mean = (f: typeof bare, m: number) => f.points.reduce((s, p) => s + p.share[m]!, 0) / f.points.length;
    expect(mean(clothed, JUN)).toBeLessThan(mean(bare, JUN));
    for (let i = 0; i < bare.points.length; i++) expect(clothed.points[i]!.share[JUN]!).toBeLessThanOrEqual(bare.points[i]!.share[JUN]! + 1e-9);
    // and it is the same leaf the run's own canopy holds
    const own = sim.light.canopy(2032)!;
    const area = (f: { clumps: readonly { evergreenM2: number; deciduousM2: number }[] }) => f.clumps.reduce((s, c) => s + c.evergreenM2 + c.deciduousM2, 0);
    expect(area(leaf)).toBeCloseTo(area(own), 1);
  });
});
