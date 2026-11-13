/**
 * Reference scenarios.
 *
 * DEVELOPMENT_GUIDE.md, "smallest valuable first deliverable": trained
 * Wisteria sinensis on a curved Bower segment, over years, with flower buds
 * that survive or are removed by gardening, and a readable action log. "Then
 * add one evergreen honeysuckle and one Group 3 clematis on separate routes."
 */
import { makeHemisphereBower } from '../bower/hemisphere.ts';
import { makeVaultBower } from '../bower/vault.ts';
import type { Site } from '../light/site.ts';
import { v3 } from '../math/vec3.ts';
import type { TaxonProfile } from '../taxon.ts';
import { type GrowthModel, param } from './model.ts';
import type { GardenerEvent, Planting, Scenario } from './types.ts';
import type { Viewpoint } from './view.ts';

export type Growable = ReadonlyMap<string, { profile: TaxonProfile; model: GrowthModel }>;

export interface VaultScenarioOptions {
  taxa: Growable;
  /** Calendar year of planting; planting day is 12 March. */
  plantingYear?: number;
  /** Number of years of gardening to script. */
  years?: number;
  seed?: number;
  /**
   * 'trained'    a gardener ties growth in and prunes each plant by its own RHS routine
   * 'untended'   nobody touches the plants after planting
   */
  care?: 'trained' | 'untended';
  /** Which wisteria to plant where a scenario plants wisteria: Chinese by default, or the long-racemed Japanese. */
  wisteria?: 'wisteria-sinensis' | 'wisteria-floribunda-macrobotrys';
  /** Where the Bower stands. Left out, southern England and an open site are assumed. */
  site?: Site;
  /** False: light is reported but changes nothing in the run. */
  lightResponse?: boolean;
}

/** The parts of a scenario that say where it stands and whether light acts, from its options. */
const placed = (o: VaultScenarioOptions): { site?: Site; lightResponse?: boolean } => ({ ...(o.site ? { site: o.site } : {}), ...(o.lightResponse === undefined ? {} : { lightResponse: o.lightResponse }) });
/** Kept for callers written against the first scenario. */
export type WisteriaVaultOptions = VaultScenarioOptions;

/** Three places a visitor to the vault segment stands. Eye height 1.6 m; the vault runs north to south. */
export const VAULT_VIEWPOINTS: readonly Viewpoint[] = [
  { id: 'approach', label: 'Walking in from the south end', eye: v3(0, -7, 1.6), target: v3(0, 0, 2.4), fovDeg: 50 },
  { id: 'inside', label: 'Standing inside, looking up and along', eye: v3(0, -1.2, 1.6), target: v3(0, 1.5, 3.1), fovDeg: 70 },
  { id: 'lawn', label: 'From the lawn to the west', eye: v3(-9, -2, 1.6), target: v3(0, 0, 2), fovDeg: 40 },
];

function need(taxa: Growable, ...ids: string[]): void {
  for (const id of ids) if (!taxa.has(id)) throw new Error(`this scenario needs the profile and growth model of ${id}`);
}

/** RHS routine for wisteria: winter prune in January or February, summer prune in July or August. */
export function wisteriaRoutine(plantId: string, plantingYear: number, years: number): GardenerEvent[] {
  const events: GardenerEvent[] = [];
  for (let y = 0; y < years; y++) {
    const year = plantingYear + y;
    if (y > 0) events.push({ id: `winter-${year}-${plantId}`, date: `${year}-01-20`, type: 'spur_prune', plantId, season: 'winter', author: 'gardener', reason: 'RHS routine: cut back to two or three buds' });
    events.push({ id: `monitor-${year}-${plantId}`, date: `${year}-05-15`, type: 'monitor', plantId, author: 'gardener', reason: 'check flowering and ties' });
    events.push({ id: `summer-${year}-${plantId}`, date: `${year}-08-01`, type: 'spur_prune', plantId, season: 'summer', author: 'gardener', reason: 'RHS routine: cut whippy growth back to five or six leaves' });
  }
  return events;
}

/** RHS routine for a Group 3 clematis: every stem cut to 15-30 cm in February or March. */
export function groupThreeRoutine(plantId: string, plantingYear: number, years: number): GardenerEvent[] {
  const events: GardenerEvent[] = [];
  for (let y = 1; y < years; y++) {
    const year = plantingYear + y;
    events.push({ id: `cutdown-${year}-${plantId}`, date: `${year}-02-20`, type: 'hard_prune', plantId, target: { allStems: true }, keepM: 0.25, author: 'gardener', reason: 'RHS group 3: cut all stems to 15-30 cm' });
  }
  return events;
}

/**
 * A climbing rose's routine (RHS pruning group 17, and the breeder's advice), from the second year on:
 *   winter, 8 January   every flowered side shoot shortened, keeping a third (RHS: "Prune any flowered side shoots
 *                       back by two thirds of their length") to a half (David Austin: "reduced by around half their
 *                       length"); where more than six canes rise from the base, the oldest beyond six cut out low
 *                       (RHS: "if heavily congested, cut out any really old branches from the base", and in renovation
 *                       "a maximum of six young, vigorous stems"). The RHS prunes between December and February, the
 *                       breeder in January and February; early January is inside both.
 *   summer, fortnightly from late June to late August: deadheading (RHS: "deadhead during the flowering season to
 *                       encourage further flowering"). It stops there, so that the last flush sets hips (David Austin:
 *                       "Do not deadhead roses renowned for their autumn fruit after the second flush"; the RHS stops in
 *                       midsummer where hips are wanted).
 * Sources: https://www.rhs.org.uk/plants/roses/climbing/pruning-guide ,
 * https://www.davidaustinroses.co.uk/blogs/news/pruning-english-climbing-roses ,
 * https://davidaustinroses.co.uk/blogs/rose-care/how-to-deadhead-a-rose
 */
export function climbingRoseRoutine(plantId: string, plantingYear: number, years: number): GardenerEvent[] {
  const events: GardenerEvent[] = [];
  for (let y = 1; y < years; y++) {
    const year = plantingYear + y;
    events.push({ id: `rose-winter-${year}-${plantId}`, date: `${year}-01-08`, type: 'shorten_side_shoots', plantId, keepShare: [0.33, 0.5], renewCanes: { keep: 6, stubM: 0.3 }, author: 'gardener', reason: 'RHS pruning group 17: flowered side shoots back by two thirds (the breeder: by about half); old canes out at the base where congested, keeping six' });
    for (const d of ['06-28', '07-12', '07-26', '08-09', '08-23']) events.push({ id: `rose-deadhead-${year}-${d}-${plantId}`, date: `${year}-${d}`, type: 'deadhead_or_select_flowers', plantId, author: 'gardener', reason: 'RHS: deadhead during the flowering season; stopped after August so that the last flush sets hips' });
  }
  return events;
}

/**
 * A vine's routine (Vitis coignetiae; RHS pruning group 11, and Bean's account of the genus), every year:
 *   summer, 7 July and 15 August   the young shoots shortened to five or six leaves (Bean: "The young shoots are
 *                       shortened back once or twice during the summer"; RHS plant record: pruning group 11, "in
 *                       midwinter, and in midsummer, if restricted growth is required"). Five or six leaves is the
 *                       growth model's `pruning.summerLeavesKept`: the RHS, of grapevines grown as rod and spur
 *                       "outdoors against a wall or fence, or over an arch or pergola", has "Shorten non-flowering
 *                       side-branches to five leaves" and a flowering one pruned "to two leaves past the developing
 *                       flower cluster". Every side shoot and every free cane of the year. A shoot that carries a
 *                       panicle or bunch is shortened like the rest and keeps it (`keepEndFlower`): on the plant the
 *                       bunch stands at the third to sixth node, inside what is kept; the model draws it at the shoot's
 *                       end, so it is carried to the cut end. Two visits, Bean's "once or twice".
 *   winter, 15 December  every shoot of the year that is not framework cut "hard back in December or January to one or
 *                       two buds (later pruning causes bleeding)" (Bean), `pruning.winterBudsKept` [1, 2]: side shoots,
 *                       flowered or not, and free canes. A side shoot's stub bears next year's shoot from its top; where
 *                       a shoot stands on last winter's stub it is cut back to that stub, so the spur stays short.
 *                       Mid-December is inside Bean's December or January, after the leaves are down
 *                       (`phenology.leafFallDoy` ends on day 328) and well before the sap rises.
 * The framework, tied in, is not cut: "pruned back annually as much as is necessary" (Bean) and "removing as much from
 * the longer shoots as necessary" (RHS pruning group 11) need a bound for the plant that a design has not declared.
 * Sources: https://www.treesandshrubsonline.org/articles/vitis/ ,
 * https://www.rhs.org.uk/plants/19030/vitis-coignetiae/details ,
 * https://www.rhs.org.uk/plants/types/climbers/established-pruning-guide ,
 * https://www.rhs.org.uk/fruit/grapes/rod-and-spur-pruning-system (all read 12 November 2026).
 */
export function vineRoutine(plantId: string, plantingYear: number, years: number, model?: GrowthModel): GardenerEvent[] {
  // the counts are the growth model's, each with its basis there; left out, the vine's own model's values as of this writing
  const summerLeavesKept: [number, number] = model ? param(model, 'pruning.summerLeavesKept') : [5, 6];
  const winterBudsKept: [number, number] = model ? param(model, 'pruning.winterBudsKept') : [1, 2];
  const events: GardenerEvent[] = [];
  for (let y = 0; y < years; y++) {
    const year = plantingYear + y;
    for (const d of ['07-07', '08-15']) events.push({ id: `vine-summer-${year}-${d}-${plantId}`, date: `${year}-${d}`, type: 'shorten_side_shoots', plantId, keepNodes: summerLeavesKept, which: 'all', freeShoots: true, remains: 'shoot', keepEndFlower: true, author: 'gardener', reason: 'Bean, of Vitis: young shoots shortened once or twice during the summer; RHS pruning group 11, in midsummer where restricted growth is required; RHS, of grapevines: non-flowering side shoots to five leaves, flowering ones to two leaves past the cluster' });
    events.push({ id: `vine-winter-${year}-${plantId}`, date: `${year}-12-15`, type: 'shorten_side_shoots', plantId, keepNodes: winterBudsKept, which: 'all', freeShoots: true, remains: 'stub', author: 'gardener', reason: 'Bean, of Vitis: cut hard back in December or January to one or two buds (later pruning causes bleeding); RHS pruning group 11, in midwinter' });
  }
  return events;
}

/**
 * Ivy's routine (Hedera helix; RHS pruning group 11, at any time), as taken for a Bower in its profile:
 *   late winter, 25 February, every year from the second   free juvenile shoots that stand out more than 0.5 m from
 *                       the timber and hold nothing are cut off where they leave it (`trim_to_bounds`). RHS: "it is easy
 *                       to keep ivy from straying out-of-bounds by annual pruning", once a year "is often enough", and
 *                       "Nesting season generally lasts from March to August": the visit is before March. The RHS ivy
 *                       guide trims "in mid-spring", which is inside the nesting season the RHS's other page warns of;
 *                       the profile's routine keeps to the nesting rule. 0.5 m is the profile's example of the line a
 *                       design allows, a choice: the model has no declared envelope.
 *   early autumn, 5 September, every second year   adult growth (the flowering side shoots) cut back to within 0.5 m of
 *                       where it leaves its stem (`shorten_side_shoots`, `withinM`). After nesting ("March to August")
 *                       and as the flowers begin to open, so that it takes some of that autumn's flowers, which the
 *                       profile accepts as the price of keeping the head in bounds. "Every second or third year" is the
 *                       profile's; every second is taken. The engine cannot cut back to a fork: the shoot is cut where it
 *                       crosses the line, and grows on from there.
 * Nothing is cut from March to August.
 * Sources: https://www.rhs.org.uk/prevention-protection/ivy-on-buildings , https://www.rhs.org.uk/plants/ivy/growing-guide
 * (both read 12 November 2026); species/hedera-helix/SPECIES_PROFILE.md, "Care: what the gardener does".
 */
export function ivyRoutine(plantId: string, plantingYear: number, years: number): GardenerEvent[] {
  const events: GardenerEvent[] = [];
  for (let y = 1; y < years; y++) {
    const year = plantingYear + y;
    events.push({ id: `ivy-bounds-${year}-${plantId}`, date: `${year}-02-25`, type: 'trim_to_bounds', plantId, freeBeyondM: 0.5, author: 'gardener', reason: 'RHS: keep ivy in bounds by annual pruning, outside the nesting season (March to August); free juvenile shoots more than 0.5 m out cut back to the timber' });
    if (y % 2 === 0) events.push({ id: `ivy-adult-${year}-${plantId}`, date: `${year}-09-05`, type: 'shorten_side_shoots', plantId, withinM: 0.5, which: 'all', remains: 'shoot', author: 'gardener', reason: 'adult growth standing out more than 0.5 m from its stem cut back within the line, every second year, after nesting' });
  }
  return events;
}

/** An annual is set out again each year in late spring (RHS: once the risk of frost has passed). */
export function annualRoutine(plantId: string, plantingYear: number, years: number): GardenerEvent[] {
  const events: GardenerEvent[] = [];
  for (let y = 1; y < years; y++) events.push({ id: `replant-${plantingYear + y}-${plantId}`, date: `${plantingYear + y}-05-20`, type: 'annual_replant', plantId, author: 'gardener', reason: 'set out this year\'s plant once frost is past' });
  return events;
}

/** Two Wisteria sinensis on the barrel-vault segment, one at each planted rib foot. */
export function wisteriaOnVault(options: VaultScenarioOptions): Scenario {
  const { taxa, plantingYear = 2027, years = 12, seed = 7, care = 'trained', wisteria = 'wisteria-sinensis' } = options;
  need(taxa, wisteria);
  const bower = makeVaultBower();
  const plantings: Planting[] = bower.rootStations.map((s, i) => ({ plantId: `wisteria.${i}`, taxonId: wisteria, stationId: s.id, date: `${plantingYear}-03-12`, tieToTimber: care === 'trained' }));
  const events = care === 'trained' ? plantings.flatMap((p) => wisteriaRoutine(p.plantId, plantingYear, years)) : [];
  return { name: `${taxa.get(wisteria)!.profile.names.label} on the vault segment, ${care}`, start: `${plantingYear}-03-01`, seed, bower, taxa, plantings, events, viewpoints: VAULT_VIEWPOINTS, ...placed(options) };
}

/**
 * The first mixed planting: the two wisterias as before, an evergreen
 * honeysuckle (Lonicera henryi) at the west foot of rib 3, a Group 3 clematis
 * ('Étoile Violette') at the east foot of rib 1, and a winter-flowering
 * Group 1 clematis ('Freckles') at the west foot of rib 2. Three ways of
 * holding the structure and four flowering habits, with something in flower
 * in spring, summer and winter.
 */
export function mixedOnVault(options: VaultScenarioOptions): Scenario {
  const { taxa, plantingYear = 2027, years = 12, seed = 7, care = 'trained' } = options;
  need(taxa, 'wisteria-sinensis', 'lonicera-henryi', 'clematis-viticella-etoile-violette', 'clematis-cirrhosa-freckles');
  const bower = makeVaultBower({
    stations: [
      { side: 0, rib: 1 },
      { side: 1, rib: 3 },
      { side: 0, rib: 3 },
      { side: 1, rib: 1 },
      { side: 0, rib: 2 },
    ],
  });
  const date = `${plantingYear}-03-12`;
  const tieToTimber = care === 'trained';
  const plantings: Planting[] = [
    { plantId: 'wisteria.0', taxonId: 'wisteria-sinensis', stationId: 'station.0', date, tieToTimber },
    { plantId: 'wisteria.1', taxonId: 'wisteria-sinensis', stationId: 'station.1', date, tieToTimber },
    { plantId: 'honeysuckle', taxonId: 'lonicera-henryi', stationId: 'station.2', date, tieToTimber },
    { plantId: 'clematis', taxonId: 'clematis-viticella-etoile-violette', stationId: 'station.3', date, tieToTimber },
    // Group 1: pruned lightly after flowering if at all, which the model does not act on yet, so it has no routine here
    { plantId: 'winter-clematis', taxonId: 'clematis-cirrhosa-freckles', stationId: 'station.4', date, tieToTimber },
  ];
  const events = care === 'trained' ? [...wisteriaRoutine('wisteria.0', plantingYear, years), ...wisteriaRoutine('wisteria.1', plantingYear, years), ...groupThreeRoutine('clematis', plantingYear, years)] : [];
  return { name: `Wisteria, evergreen honeysuckle, summer clematis and winter clematis on the vault segment, ${care}`, start: `${plantingYear}-03-01`, seed, bower, taxa, plantings, events, viewpoints: VAULT_VIEWPOINTS, ...placed(options) };
}

/** Three places a visitor to the 15 m hemisphere stands. Eye height 1.6 m. */
export const HEMISPHERE_VIEWPOINTS: readonly Viewpoint[] = [
  { id: 'approach', label: 'Approaching from the south', eye: v3(0, -17, 1.6), target: v3(0, 0, 4), fovDeg: 50 },
  { id: 'inside', label: 'Standing inside, looking up to the crown', eye: v3(0, -2.5, 1.6), target: v3(0, 1.5, 7.2), fovDeg: 80 },
  { id: 'rim', label: 'Standing at the rim, looking across', eye: v3(-6.6, 0, 1.6), target: v3(3, 0, 5), fovDeg: 75 },
];

/**
 * The specification's reference shell at building scale: a 15 m hemisphere
 * with a Wisteria sinensis at each of three root stations. The crown is 7.5 m
 * up and 11.78 m away by the shortest route, which is the point of running it:
 * to see how far a plant gets, and when.
 */
export function wisteriaOnHemisphere(options: VaultScenarioOptions): Scenario {
  const { taxa, plantingYear = 2027, years = 12, seed = 7, care = 'trained' } = options;
  need(taxa, 'wisteria-sinensis');
  const bower = makeHemisphereBower({ diameterM: 15 });
  const plantings: Planting[] = bower.rootStations.map((s, i) => ({ plantId: `wisteria.${i}`, taxonId: 'wisteria-sinensis', stationId: s.id, date: `${plantingYear}-03-12`, tieToTimber: care === 'trained' }));
  const events = care === 'trained' ? plantings.flatMap((p) => wisteriaRoutine(p.plantId, plantingYear, years)) : [];
  return { name: `Wisteria sinensis on the 15 m hemisphere, ${care}`, start: `${plantingYear}-03-01`, seed, bower, taxa, plantings, events, viewpoints: HEMISPHERE_VIEWPOINTS, ...placed(options) };
}

/** The six climbers of the attachment trial, in station order, with the mechanism each holds on by. */
export const ATTACHMENT_TRIAL = [
  { plantId: 'wisteria', taxonId: 'wisteria-sinensis' },
  { plantId: 'honeysuckle', taxonId: 'lonicera-henryi' },
  { plantId: 'clematis', taxonId: 'clematis-viticella-etoile-violette' },
  { plantId: 'vine', taxonId: 'vitis-coignetiae' },
  { plantId: 'ivy', taxonId: 'hedera-helix' },
  { plantId: 'rose', taxonId: 'rosa-the-generous-gardener' },
] as const;

/**
 * One plant of each way of climbing, each at the foot of its own glulam rib
 * on the 15 m hemisphere, with no pruning. It is a trial, not a planting
 * scheme (KEY.md: do not plant every listed taxon in one Bower): it shows
 * which plants can get off the ground on bare glulam, which need a gardener,
 * and which need something finer than a rib to hold.
 * DEVELOPMENT_GUIDE.md stage 3 exit check.
 */
export function attachmentTrial(options: VaultScenarioOptions): Scenario {
  return plantsOnHemisphere(options, ATTACHMENT_TRIAL, 'Six ways of climbing');
}

/**
 * Any list of plants, each at the foot of its own rib, evenly spaced round the
 * 15 m hemisphere, with no pruning: for trying a taxon, or a few side by side.
 * An annual goes in on 20 May, and under `trained` care is set out again each
 * year; untended, it is planted once and never again.
 */
export function plantsOnHemisphere(options: VaultScenarioOptions, plants: readonly { plantId: string; taxonId: string }[], title: string): Scenario {
  const { taxa, plantingYear = 2027, years = 12, seed = 7, care = 'trained' } = options;
  need(taxa, ...plants.map((p) => p.taxonId));
  const bower = makeHemisphereBower({ diameterM: 15, stations: plants.length });
  const annual = (taxonId: string) => taxa.get(taxonId)!.profile.ukCultivation === 'annual_replant';
  const plantings: Planting[] = plants.map((p, i) => ({ plantId: p.plantId, taxonId: p.taxonId, stationId: bower.rootStations[i]!.id, date: `${plantingYear}-${annual(p.taxonId) ? '05-20' : '03-12'}`, tieToTimber: care === 'trained' }));
  const events = care === 'trained' ? plants.filter((p) => annual(p.taxonId)).flatMap((p) => annualRoutine(p.plantId, plantingYear, years)) : [];
  return { name: `${title} on the 15 m hemisphere, ${care}`, start: `${plantingYear}-03-01`, seed, bower, taxa, plantings, events, viewpoints: HEMISPHERE_VIEWPOINTS, ...placed(options) };
}

/**
 * KEY.md section 6, the single UK reference palette, set out round the 15 m
 * hemisphere: one plant at the foot of each of its twelve glulam ribs.
 * Meridian 0 faces east, 3 north, 6 west and 9 south.
 *
 * The aspects follow KEY.md section 7 (warmth and shelter for the tender
 * evergreens, shade for the hydrangea, long routes for the wisterias). Light
 * now answers to the placing (`sim/light.ts`): how much, and for which plants,
 * is in the light section of the design report. Wind and temperature are not
 * modelled, so the warmth and shelter the placing is after change nothing yet.
 */
export const REFERENCE_PALETTE = [
  { meridian: 0, aspect: 'east', plantId: 'rose', taxonId: 'rosa-the-generous-gardener', why: 'human-scale module by the morning side, tied in low' },
  { meridian: 1, aspect: 'east-north-east', plantId: 'summer-clematis', taxonId: 'clematis-viticella-etoile-violette', why: 'summer module, where the yearly cut-down can be reached' },
  { meridian: 2, aspect: 'north-north-east', plantId: 'evergreen-honeysuckle', taxonId: 'lonicera-henryi', why: 'core evergreen, tolerant of part shade' },
  { meridian: 3, aspect: 'north', plantId: 'hydrangea', taxonId: 'hydrangea-anomala-subsp-petiolaris', why: 'the shade-tolerant climber, on the cool side' },
  { meridian: 4, aspect: 'north-north-west', plantId: 'north-evergreen', taxonId: 'lonicera-henryi', why: 'a second evergreen on the shaded side; ivy is the alternative' },
  { meridian: 5, aspect: 'west-north-west', plantId: 'vine', taxonId: 'vitis-coignetiae', why: 'autumn accent with a lane of its own' },
  { meridian: 6, aspect: 'west', plantId: 'honeysuckle', taxonId: 'lonicera-periclymenum-graham-thomas', why: 'evening scent on the west side' },
  { meridian: 7, aspect: 'west-south-west', plantId: 'wisteria.1', taxonId: 'wisteria-sinensis', why: 'primary canopy plant, in sun, with a long route to the crown' },
  { meridian: 8, aspect: 'south-south-west', plantId: 'spring-clematis', taxonId: 'clematis-armandi', why: 'optional mild-site evergreen, in sun and shelter' },
  { meridian: 9, aspect: 'south', plantId: 'star-jasmine', taxonId: 'trachelospermum-jasminoides', why: 'conditional evergreen, in the warmest place there is' },
  { meridian: 10, aspect: 'south-south-east', plantId: 'winter-clematis', taxonId: 'clematis-cirrhosa-freckles', why: 'winter flowers on the sheltered sunny side, beside the approach' },
  { meridian: 11, aspect: 'east-south-east', plantId: 'wisteria.0', taxonId: 'wisteria-sinensis', why: 'primary canopy plant, in sun, with a long route to the crown' },
] as const;

export interface PaletteOptions extends VaultScenarioOptions {
  /** Plant ivy on the shaded side in place of the second evergreen honeysuckle. KEY.md: "controlled option, often excluded". */
  ivy?: boolean;
}

/**
 * The whole reference palette on the building-scale shell, which is what
 * KEY.md section 7 step 7 asks for: "Render monthly time slices, check winter
 * appearance and repeat with the gardener model active." Its report answers
 * what is in flower in each month, and how much evergreen a winter visitor sees.
 */
export function referencePalette(options: PaletteOptions): Scenario {
  const { taxa, plantingYear = 2027, years = 12, seed = 7, care = 'trained', ivy = false } = options;
  const plan = REFERENCE_PALETTE.map((p) => (p.plantId === 'north-evergreen' && ivy ? { ...p, taxonId: 'hedera-helix' } : p));
  need(taxa, ...plan.map((p) => p.taxonId));
  const bower = makeHemisphereBower({ diameterM: 15, stations: plan.length });
  const plantings: Planting[] = plan.map((p) => ({ plantId: p.plantId, taxonId: p.taxonId, stationId: bower.rootStations[p.meridian]!.id, date: `${plantingYear}-03-12`, tieToTimber: care === 'trained' }));
  // only the routines the model acts on: the wisterias' two prunes a year, the summer clematis's cut-down, the rose's, the vine's and the ivy's
  const events =
    care === 'trained'
      ? [
          ...wisteriaRoutine('wisteria.0', plantingYear, years),
          ...wisteriaRoutine('wisteria.1', plantingYear, years),
          ...groupThreeRoutine('summer-clematis', plantingYear, years),
          ...climbingRoseRoutine('rose', plantingYear, years),
          ...vineRoutine('vine', plantingYear, years, taxa.get('vitis-coignetiae')!.model),
          ...(ivy ? ivyRoutine('north-evergreen', plantingYear, years) : []),
        ]
      : [];
  return { name: `The reference palette on the 15 m hemisphere${ivy ? ', with ivy' : ''}, ${care}`, start: `${plantingYear}-03-01`, seed, bower, taxa, plantings, events, viewpoints: HEMISPHERE_VIEWPOINTS, ...placed(options) };
}
