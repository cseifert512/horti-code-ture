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
    status: 'provisional_design_assumption',
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
    value: 1.5,
    unit: 'rad/m',
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. Chosen, not measured: a shoot lying across the direction it seeks turns through about a right angle in a metre of growth. A weak pull on purpose: the searching shoots of climbers lean out and sweep round (Darwin 1875 saw a hop shoot bend to nearly level as it lengthened) and do not stand plumb as the leader of a tree does. A stiffly upright cane needs several times this.',
    range: [0.5, 20],
  },
  /** How far the direction a shoot seeks leans from plumb towards the light: 0 is straight up, 1 is straight at the light. */
  'tropism.lightShare': {
    value: 0.5,
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. Chosen, not measured: a shoot is taken to seek the direction half way between up and the light.',
    range: [0, 1],
  },
  /** The least a free shoot leans from plumb where it sets out. */
  'mechanics.leanDeg': {
    value: 4,
    unit: 'degrees',
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. No stem is exactly upright or exactly straight. A rod set out exactly plumb carries no bending load in the mechanics, and so would stand straight to any length, past the height at which its own weight must bring it over (Greenhill 1881); with a small lean it arches when its stiffness and weight say it must and stands when it can. Four degrees is a choice: an imperfection of the size engineers give a column to make its buckling computable, not a measurement of any shoot. Where a shoot already leans more, as most do, it changes nothing.',
    range: [0.5, 15],
  },
  /** Where along a leaf its weight hangs, as a share of the leaf\'s length from the node: what makes a leafy shoot heavier on one side. */
  'mechanics.leafWeightOffsetShare': {
    value: 0.5,
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. A leaf\'s weight hangs off the stem at the middle of the leaf, not on the stem\'s axis, so leaves turned one way weigh on that side of the shoot. Half the leaf\'s length (stalk and blade, as the engine measures it) from the node is a choice: the blade is heavier than the stalk, which would put it further out, and a leaf hangs nearer the stem than its full reach. Not measured on any plant here.',
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

/**
 * The generic flowering side shoot: how a side shoot leaves its bearing stem,
 * where a taxon's model does not say. Used only by a plant that makes side
 * shoots at all (`sideShoots.*`), and said once for each such plant (a
 * `generic_shoot` decision, which the report lists among its alerts).
 *
 * No source was read for any of them: they are choices, labelled as such, so
 * that side shoots along one stem do not all set out the same way. Each says
 * what it rests on.
 */
export const GENERIC_SIDE_SHOOT = {
  /** Angle between the bearing stem, as it runs from its base towards its tip, and a side shoot as it sets out. */
  'sideShoots.branchAngleDeg': {
    value: [35, 70] as [number, number],
    unit: 'degrees',
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. A shoot from an axillary bud sets out leaning forward along the stem that bears it; no angle was found measured for any climber in the library. 35 to 70 degrees is a round range between a shoot that hugs its parent and one at right angles to it, chosen so that the shoots along one stem do not stand parallel.',
  },
  /** Days after bud burst over which the side shoots of a season break, each on its own day. */
  'sideShoots.breakSpreadDays': {
    value: [0, 28] as [number, number],
    unit: 'days',
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. Buds along a stem do not all break on one day; how long the breaking of one year\'s side shoots takes was not found measured for any plant in the library. Four weeks is a round figure.',
  },
  /** Share, 0 to 1, by which a side shoot\'s first heading is turned from its place round the stem towards the way it seeks (up and the light). */
  'sideShoots.startTowardsLight': {
    value: 0.25,
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. Chosen, not measured: a bud on the shaded or lower side of a stem breaks into a shoot that soon turns up and out, which the tropism of a growing shoot then carries on (tropism.turnPerM). A quarter of the way at the start keeps the place round the stem visible in the shoot.',
  },
  /** Angle round the stem from one leaf node to the next, where leaves stand singly (organs.leavesPerNode 1). */
  'organs.alternateDivergenceDeg': {
    value: 137.5,
    unit: 'degrees',
    status: 'provisional_design_assumption',
    basis: 'Generic, not this taxon\'s. The golden angle, the divergence usually given for spiral phyllotaxis, taken from general botanical knowledge and not checked against a source here; a plant whose leaves stand in two ranks has 180 degrees, and one with a 2/5 spiral 144. No taxon in the library has had its own measured. Where leaves stand in opposite pairs the engine turns each pair a right angle from the last (decussate), which needs no number.',
  },
} satisfies Record<string, Sourced<number | [number, number]>>;

export type SideShootParamKey = keyof typeof GENERIC_SIDE_SHOOT;
export const SIDE_SHOOT_PARAM_KEYS = Object.keys(GENERIC_SIDE_SHOOT) as SideShootParamKey[];
