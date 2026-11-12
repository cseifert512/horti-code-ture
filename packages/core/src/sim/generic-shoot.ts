/**
 * The generic shoot: what the engine takes for the mechanics of a woody
 * climber's unsupported shoot where a taxon's growth model gives no number of
 * its own.
 *
 * An unsupported shoot has to be bounded whether or not anybody has measured
 * the plant, so these are not left unknown as fruit or tendrils may be. They
 * are one set for every taxon, which is exactly what they are worth: none is
 * a measurement of any plant in the library. Each carries its status and
 * basis, a run says once for each plant which of them it drew that plant
 * with, and the assumptions count of a run counts them as what they are.
 *
 * A taxon replaces any of them by giving the parameter of the same name in
 * its `species/<id>/model.json`.
 *
 * Sources read for them:
 *   Hattermann, Petit-Bagnard, Heinz, Heuret and Rowe 2022, "Mind the gap:
 *     reach and mechanical diversity of searcher shoots in climbing plants",
 *     Frontiers in Forests and Global Change 5:836247,
 *     https://doi.org/10.3389/ffgc.2022.836247 : 29 species; reach as the
 *     straight line from base to apex of the longest searcher that still held
 *     itself between upright and level, 0.105 to 2.68 m; stiffness in bending
 *     at the searcher's base, 213 to 15 479 MN/m2.
 *   Vecchiato, Hattermann, Rowe and others 2023, PLoS Computational Biology
 *     19:e1011538,
 *     https://doi.org/10.1371/journal.pcbi.1011538 : searchers of
 *     Trachelospermum jasminoides reach about 1.1 m.
 *   Isnard, Rowe and Speck 2003, Annals of Botany 91:407-417,
 *     https://doi.org/10.1093/aob/mcg044 : Clematis flammula var. maritima,
 *     1619 MN/m2 in its aerial shoots.
 *   Chelakkot and Mahadevan 2017, "On the growth and form of shoots",
 *     Journal of the Royal Society Interface 14:20170001,
 *     https://doi.org/10.1098/rsif.2017.0001 : a growing shoot as an elastic
 *     rod that sags under its weight and stiffens as it ages.
 *   Darwin 1875, The Movements and Habits of Climbing Plants,
 *     https://www.gutenberg.org/ebooks/2485 : the sweep of revolving shoots.
 */
import type { Sourced } from '../provenance.ts';

const SEARCHERS = 'https://doi.org/10.3389/ffgc.2022.836247';

export const GENERIC_SHOOT = {
  /** Structural Young's modulus in bending of a stretch of shoot whose wood has set. */
  'mechanics.woodModulusMPa': {
    value: 3000,
    unit: 'MPa',
    status: 'peer_reviewed',
    source: SEARCHERS,
    basis: 'Generic, not this taxon\'s. Hattermann et al. 2022 measured stiffness in bending at the base of the searcher shoots of 29 climbing species, 213 to 15 479 MN/m2, and found that about 3000 MN/m2 was needed to span more than about 0.8 m; Vecchiato et al. 2023 give about the same at the base of Trachelospermum jasminoides searchers. Taken for any woody climber: a reading across species, which the papers do not claim.',
    range: [213, 15479],
  },
  /** The same of the soft growing end, on the day it is laid down. */
  'mechanics.greenShootModulusMPa': {
    value: 300,
    unit: 'MPa',
    status: 'provisional_design_assumption',
    source: SEARCHERS,
    basis: 'Generic, not this taxon\'s. No measurement of the growing end of a searcher shoot was found. It is softer than the base; 300 is near the least stiff searcher base Hattermann et al. 2022 measured (213 MN/m2), and a tenth of the generic set wood.',
    range: [10, 3000],
  },
  /** Days over which a new stretch of stem stiffens from green to set. */
  'mechanics.woodSetDays': {
    value: 30,
    unit: 'days',
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. How fast a shoot lignifies behind its tip was not found measured for any climber here. A month is a round figure; Chelakkot and Mahadevan 2017 model the same stiffening with age without giving a time for it.',
    range: [10, 90],
  },
  /** Fresh density of the stem. */
  'mechanics.stemFreshDensityKgM3': {
    value: 1000,
    unit: 'kg/m3',
    status: 'provisional_design_assumption',
    source: 'https://doi.org/10.1098/rsif.2017.0001',
    basis: 'Generic, not this taxon\'s. A fresh shoot is mostly water; 1000 kg/m3 is the figure Chelakkot and Mahadevan 2017 take for a young shoot. Not weighed.',
    range: [800, 1200],
  },
  /** Fresh mass of leaf for each square metre of its outline. */
  'mechanics.leafFreshMassPerAreaKgM2': {
    value: 0.2,
    unit: 'kg/m2',
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. No leaf here has been weighed. 0.2 kg/m2 is a sheet of water a fifth of a millimetre thick, about a thin broad leaf with its stalk; a leathery evergreen leaf is heavier.',
    range: [0.1, 0.5],
  },
  /** Fresh mass of one inflorescence (or one flower where flowers are single), fully open. */
  'mechanics.inflorescenceFreshMassKg': {
    value: 0.01,
    unit: 'kg',
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. No flower here has been weighed; ten grams is a placeholder between a single small flower and a long raceme.',
    range: [0.001, 0.06],
  },
  /** Fresh mass of one fruit, or of one cluster where fruits are borne together, full grown. */
  'mechanics.fruitFreshMassKg': {
    value: 0.01,
    unit: 'kg',
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. No fruit here has been weighed; ten grams is a placeholder.',
    range: [0.001, 0.1],
  },
  /** The farthest a shoot holds itself out: straight line from where it leaves its support to its tip. */
  'mechanics.searcherReachM': {
    value: 1,
    unit: 'm',
    status: 'provisional_design_assumption',
    source: SEARCHERS,
    basis: 'Generic, not this taxon\'s. Hattermann et al. 2022 measured the reach of the longest self-supporting searcher shoots of 29 climbers: 0.105 to 2.68 m, about half of the species up to 1 m; stem twiners 0.10 to 2.25 m, tendril climbers and the one root climber 0.14 to 0.91 m, hook and scrambling climbers 0.72 to 2.68 m. One metre is taken for any woody climber not measured.',
    range: [0.105, 2.68],
  },
  /** How sharply the growing end turns towards the direction it seeks, in radians for each metre grown, when it is at right angles to it. */
  'tropism.turnPerM': {
    value: 4,
    unit: 'rad/m',
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. Chosen, not measured: a shoot lying across the direction it seeks turns through about a right angle in 0.4 m of growth.',
    range: [1, 20],
  },
  /** How far the direction a shoot seeks leans from plumb towards the light: 0 is straight up, 1 is straight at the light. */
  'tropism.lightShare': {
    value: 0.5,
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. Chosen, not measured: a shoot is taken to seek the direction half way between up and the light.',
    range: [0, 1],
  },
  /** How near the tip of a searching shoot must come to a support to take hold of it. */
  'attachment.graspReachM': {
    value: 0.12,
    unit: 'm',
    status: 'provisional_design_assumption',
    source: 'https://www.gutenberg.org/ebooks/2485',
    basis: 'Generic, not this taxon\'s. The sweep of a revolving tip, or the length of a tendril or leaf stalk. Darwin 1875 saw the revolving shoot of a hop sweep a circle 19 inches (0.48 m) across and that of Ceropegia one of more than 5 feet; half the radius of the hop\'s sweep is taken as a cautious figure for a plant not measured.',
    range: [0.03, 0.75],
  },
} satisfies Record<string, Sourced<number>>;

export type ShootParamKey = keyof typeof GENERIC_SHOOT;
export const SHOOT_PARAM_KEYS = Object.keys(GENERIC_SHOOT) as ShootParamKey[];
