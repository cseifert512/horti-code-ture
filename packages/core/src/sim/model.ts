/**
 * GrowthModel: the numbers the engine needs to make a taxon grow.
 *
 * These are kept apart from `taxon.json` on purpose. A taxon profile says
 * what is known or published about a plant; a growth model says what this
 * simulator currently ASSUMES so that it can run. Almost every value here is
 * a `provisional_design_assumption`, most of them carried over from the
 * Wisteria prototype, and each says so. A model cannot run on an unknown, so
 * every parameter the plant needs in order to grow must have a value; what
 * the schema forbids is a value with no stated status and basis.
 *
 * The parts a plant may or may not have (fruit, tendrils, coiled leaf stalks,
 * clinging rootlets, prickles, flowering side shoots) are different: a model
 * runs without them. Their parameters, listed in `GROWTH_PARAMS_OPTIONAL`,
 * may be `unknown`; the part is then left out of the run, and the run says
 * so. Zero, with its basis, says the plant does not have the part.
 *
 * So are the things a plant may or may not do (keep part of its foliage
 * through winter, flower again after a flower has gone over, grow its
 * flowering side shoots on from year to year) and the numbers that set one
 * leaf form apart from another. Unknown, each leaves the plant as it was
 * before the engine could do it.
 *
 * One file per taxon: `species/<id>/model.json`.
 */
import { z } from 'zod';
import { type ProvenanceEntry, type Sourced, sourced } from '../provenance.ts';
import { ORGAN_HELD } from '../vocab.ts';
import { GENERIC_SHOOT, GENERIC_SIDE_SHOOT, type ShootParamKey, type SideShootParamKey } from './generic-shoot.ts';

/**
 * Every parameter, with the shape of its value. `range` is [low, high]; `list` is indexed as its name says.
 * `window` is [first day, last day] of the year, both included; where the first is later than the last the
 * window runs through the new year, so [320, 45] is 16 November to 14 February (`windows.ts`).
 */
export const GROWTH_PARAMS = {
  // ---- phenology: day of year (1 = 1 January). Provisional fixed dates until a weather-driven model replaces them.
  // The growing season, bud burst to growth end, is the one pair of dates that cannot cross the new year: growth is
  // counted by calendar year throughout the engine.
  'phenology.budburstDoy': 'number',
  'phenology.growthEndDoy': 'number',
  /** Through the new year: the flush of a year began late in the year before. */
  'phenology.leafFlushDoy': 'window',
  /** Through the new year, as `leafFallDoy`: the leaves of a year go on colouring into the next. */
  'phenology.autumnColourDoy': 'window',
  /** Through the new year: the leaves of a year go on falling into the next, and the last is down on its last day. */
  'phenology.leafFallDoy': 'window',
  /** Only the last day is read: the day the year's flower buds form. */
  'phenology.floralInitiationDoy': 'window',
  /**
   * Through the new year: a display that opens from late in one year into the next. Its flowers belong to the
   * year it began in.
   */
  'phenology.flowerOpenDoy': 'window',
  /**
   * Read after the opening: where its first day is earlier in the year than the opening's first day it is the
   * next year's, and a window that crosses the new year is not needed to say that petals fall after the winter.
   */
  'phenology.petalFallDoy': 'window',
  /**
   * How long one flower lasts, for plants whose flowers come and go in
   * succession through a long season. [0, 0] where the whole display falls
   * together, within `petalFallDoy`.
   */
  'phenology.flowerLastsDays': 'range',
  // ---- extension: metres of stem per growing season
  'extension.leaderMPerSeason': 'number',
  'extension.lateralMPerSeasonByOrder': 'list',
  'extension.whipMPerSeason': 'number',
  /** Multiplier in the first seasons after planting; later seasons are 1. */
  'extension.establishmentFactorByYear': 'list',
  // ---- architecture
  /** Growing season (0 = the planting year) in which each trunk stem starts. */
  'architecture.trunkStemStartYears': 'list',
  /** Length of the cane the plant arrives with. */
  'architecture.nurseryCaneM': 'number',
  'architecture.maxBranchOrder': 'number',
  'architecture.leaderLengthM': 'range',
  'architecture.lateralLengthMByOrder': 'list',
  'architecture.lateralLengthSpread': 'number',
  /** Chance that a lattice node passed by a shoot bears a lateral, by the order of the bearing shoot. */
  'architecture.lateralChanceByParentOrder': 'list',
  'architecture.budExtraDormancyChance': 'number',
  'architecture.budExtraDormancyYears': 'range',
  /** How many stems share one member or cable before the next looks elsewhere. */
  'architecture.maxStemsPerRoute': 'number',
  /** The same limit on a primary glulam member, which is stout enough to carry more. */
  'architecture.maxStemsPerPrimaryMember': 'number',
  // ---- choosing the next member at a node (lower cost wins)
  'routing.occupancyCost': 'number',
  'routing.downhillCostPerM': 'number',
  'routing.uphillBonusPerM': 'number',
  'routing.straightOnBonus': 'number',
  /** A shoot set on making height favours a rising member by this much. */
  'routing.riserBonus': 'number',
  /** A shoot set on running level favours a level member by this much. */
  'routing.tierBonus': 'number',
  /** Chance at each node that a shoot drops its preference. */
  'routing.roleDropChance': 'number',
  'routing.noise': 'number',
  'routing.giveUpCost': 'number',
  // ---- attachment
  /** Stands in for the unmeasured `attachment.maxGraspDiameterMm` of the taxon profile. */
  'attachment.maxGraspDiameterMm': 'number',
  'attachment.minPitchM': 'number',
  'attachment.pitchPerCircumference': 'number',
  // ---- organs
  'organs.leafSpacingM': 'range',
  'organs.leafLengthM': 'range',
  /** 1 where leaves stand singly at a node, 2 where they stand in opposite pairs. */
  'organs.leavesPerNode': 'number',
  /** Chance that a leaf node on last year's wood forms a spur. */
  'organs.spurChance': 'number',
  'organs.spurLengthM': 'range',
  'organs.spurLeafCount': 'range',
  'organs.racemeLengthM': 'range',
  'organs.whipShareOfNodes': 'number',
  'organs.whipsPerYearMax': 'number',
  'organs.whipLengthM': 'range',
  /** Growing seasons a leaf stays on the stem: 1 for a deciduous plant. */
  'organs.leafLifespanYears': 'number',
  /** Height below which the stem is kept clean: no spurs, whips or flowers. */
  'organs.clearStemHeightM': 'number',
  // ---- leaves by form. `leafLengthM`, `leafSpacingM`, `leavesPerNode` and `leafLifespanYears` above describe the
  // leaf of climbing and extension shoots. A spur's leaf and a flowering side shoot's leaf may differ from it, as
  // they may be named apart (`names.spurLeafForm`, `names.sideShootLeafForm`). Unknown: as before these existed.
  /**
   * Length of a leaf on a spur. Unknown: nine tenths of `organs.leafLengthM`, which is what the Wisteria prototype
   * drew and is not a measurement of any plant. (How many leaves a spur carries is `organs.spurLeafCount`; they
   * are renewed every year, so a spur's leaf has no lifespan to give.)
   */
  'organs.spurLeafLengthM': 'range',
  /** Length of a leaf on a flowering side shoot. Unknown: `organs.leafLengthM`. */
  'organs.sideShootLeafLengthM': 'range',
  /** Stem length between leaf nodes on a flowering side shoot. Unknown: `organs.leafSpacingM`. */
  'organs.sideShootLeafSpacingM': 'range',
  /** 1 or 2, as `organs.leavesPerNode`, for a flowering side shoot. Unknown: `organs.leavesPerNode`. */
  'organs.sideShootLeavesPerNode': 'number',
  /**
   * Growing seasons a leaf stays on a flowering side shoot, counted from the year that stretch of the shoot was
   * made. Unknown: the shoot is in leaf along its whole length every year it lives.
   */
  'organs.sideShootLeafLifespanYears': 'number',
  /**
   * Share, 0 to 1, of the plant's leaves that stay on through winter: a semi-evergreen plant, or an evergreen
   * one where it stands exposed. Each leaf is kept or not, decided where it stands.
   * Unknown: the leaf habit of the taxon's profile decides, every leaf for an evergreen and none for any other.
   * On a plant whose profile says evergreen, a leaf that is kept lives out `organs.leafLifespanYears` and one
   * that is not falls in the leaf fall of its first year. On any other plant, a leaf that is kept stays on,
   * green, through the winter after its last season and is shed as the next spring's leaves open
   * (`phenology.leafFlushDoy`); one that is not falls as a deciduous leaf does.
   */
  'organs.winterLeafShare': 'number',
  // ---- flowering
  /** Full growing seasons after planting before any flower bud can form. */
  'flowering.competenceYears': 'number',
  /** Share of spurs able to initiate a flower bud in successive years once competent. */
  'flowering.maturityRamp': 'list',
  'flowering.spurFloralChance': 'number',
  /** Multiplier on flower-bud initiation in a year with no summer pruning. */
  'flowering.unprunedFactor': 'number',
  /**
   * For plants whose flowers form along the year's growth, whether they open
   * that same season (current-season flowering) or after the wood has ripened
   * (old-wood flowering without spurs): flowers per metre of that growth, and
   * the shortest shoot that flowers.
   */
  'flowering.currentSeasonFlowersPerM': 'number',
  'flowering.currentSeasonMinShootM': 'number',
  // ---- repeat flowering: a flower that has gone over may be followed by another at the same place, in flushes,
  // while the taxon's flowering window (`phenology.flowerOpenDoy`) lasts. For flowers at the nodes of shoots and at
  // the ends of flowering side shoots; a spur's flower is never followed. Unknown, or a count or share of 0: each
  // place flowers once a year. The first three are needed together.
  /** The most times one place flowers again in a season, after its first flower. */
  'flowering.repeatMaxPerSeason': 'number',
  /** Days from a flower going over to the next one at the same place opening. */
  'flowering.repeatIntervalDays': 'range',
  /** Share, 0 to 1, of the flowers that go over which are followed by another, while the count and the season allow. */
  'flowering.repeatShare': 'number',
  /**
   * The same wait where a gardener deadheads (`deadhead_or_select_flowers`), counted from the day of the
   * deadheading: the next flower opens that many days after it, or when it would have anyway if that is sooner.
   * Unknown: deadheading is recorded and changes nothing, as for a plant that does not flower again.
   */
  'flowering.repeatIntervalDeadheadedDays': 'range',
  // ---- pruning
  'pruning.summerLeavesKept': 'range',
  'pruning.winterBudsKept': 'range',
  // ---- regrowth
  /** New shoots from the stub a hard prune leaves. */
  'regrowth.shootsPerCut': 'range',
  // ---- thickening: radius squared, in mm2, grows with the stem length a point carries
  'thickening.tipRadiusSquaredMm2': 'number',
  'thickening.radiusSquaredPerMetreMm2': 'number',
  'thickening.branchShare': 'number',
  // ---- an unsupported shoot: a slender rod that bends under its own weight, turns towards the light and can take hold
  // of a support it comes near (sim/free-shoot.ts). Unknown: the generic value of the same name is used
  // (sim/generic-shoot.ts), and the run says so once for the plant.
  /** Structural Young's modulus in bending of the soft growing end of a shoot, on the day it is laid down. */
  'mechanics.greenShootModulusMPa': 'number',
  /** The same once the wood of that stretch has set. */
  'mechanics.woodModulusMPa': 'number',
  /** Days over which a new stretch of stem stiffens from the one to the other. */
  'mechanics.woodSetDays': 'number',
  'mechanics.stemFreshDensityKgM3': 'number',
  /** Fresh mass of leaf for each square metre of its outline. */
  'mechanics.leafFreshMassPerAreaKgM2': 'number',
  /** Fresh mass of one inflorescence fully open, and of one fruit (or one cluster) full grown. */
  'mechanics.inflorescenceFreshMassKg': 'number',
  'mechanics.fruitFreshMassKg': 'number',
  /**
   * The farthest an unsupported shoot holds itself out, as the straight line from where it leaves its support to its
   * tip: what has been measured of searcher shoots. A shoot that still holds itself up at that distance grows no further.
   */
  'mechanics.searcherReachM': 'number',
  /** Radians the growing end turns towards the direction it seeks for each metre grown, when at right angles to it. */
  'tropism.turnPerM': 'number',
  /** How far the direction a shoot seeks leans from plumb towards the light: 0 straight up, 1 straight at the light. */
  'tropism.lightShare': 'number',
  /**
   * How near the tip of a searching shoot must come to a support it can grasp to take hold of it: the sweep of a
   * revolving tip, the length of a tendril or leaf stalk. 0: a shoot in the air never takes hold again.
   */
  'attachment.graspReachM': 'number',
  // ---- fruit: what follows a flower that set. Unknown: no fruit is modelled. A set share of 0: the plant sets none.
  /** Share, 0 to 1, of the inflorescences that open and go over on the plant that set fruit. */
  'fruit.setShare': 'number',
  /** Length of the fruit, or of the cluster where fruits are borne together, when full grown. */
  'fruit.lengthM': 'range',
  /** Days from petal fall to full size. */
  'fruit.swellDays': 'range',
  /**
   * Days of the year between which fruit ripens (colours, dries). Each fruit
   * starts on a day in the window and is ripe by a later day in it: the first
   * such window to end after the fruit is full grown, which may be next year's.
   * The window may run through the new year.
   */
  'fruit.ripenDoy': 'window',
  /**
   * Days of the year between which ripe fruit falls, splits or is eaten: each
   * goes on a day in the first such window after it is ripe. A window early in
   * the year therefore means the fruit hangs on through the winter; one that
   * runs through the new year, that it goes during it.
   */
  'fruit.fallDoy': 'window',
  // ---- appendages: the small parts a plant holds on or defends itself with. Unknown: none are drawn.
  /**
   * Which leaf nodes along a shoot bear a tendril, as a pattern that repeats
   * from the shoot's first leaf node: 1 bears one, 0 does not. [1, 1, 0] is two
   * nodes with a tendril and then one without; [0] is no tendrils at all.
   */
  'appendages.tendrilNodePattern': 'list',
  'appendages.tendrilLengthM': 'range',
  /** Share, 0 to 1, of the leaf nodes on stretches the plant holds by itself whose leaf stalk has coiled round the support. */
  'appendages.leafStalkCoilShare': 'number',
  'appendages.leafStalkLengthM': 'range',
  /** Stem length from one patch of clinging rootlets to the next, on stretches the plant holds by itself. [0, 0]: none. */
  'appendages.aerialRootPatchSpacingM': 'range',
  /** Length of the rootlets in a patch. */
  'appendages.aerialRootLengthM': 'range',
  /** Stem length from one prickle to the next, on every stem. [0, 0]: the plant is unarmed. */
  'appendages.prickleSpacingM': 'range',
  'appendages.prickleLengthM': 'range',
  // ---- flowering side shoots: short free-standing shoots that an established stem throws, leafy and ending in the
  // inflorescence (ivy's adult shoots, climbing hydrangea's flowering laterals, a climbing rose's side shoots).
  // Unknown, or a rate of 0: the plant makes none.
  /** Years since a stretch of stem was laid down before it throws side shoots. */
  'sideShoots.bearingWoodAgeYears': 'number',
  /** New side shoots a year for each metre of bearing stem that is old enough. */
  'sideShoots.perMetrePerYear': 'number',
  'sideShoots.lengthM': 'range',
  /**
   * Growing seasons a side shoot stays on the plant. 1: it is shed before the
   * next spring. More: it stays as wood, in leaf each year, and can flower
   * again in each year it lives.
   */
  'sideShoots.lifespanYears': 'number',
  /**
   * Share, 0 to 1, of side shoots that end in an inflorescence in a year, once
   * the plant is old enough to flower and scaled by `flowering.maturityRamp`.
   * 0: the shoots are leafy only.
   */
  'sideShoots.terminalFlowerShare': 'number',
  // A side shoot that lives more than one season may grow on: the two below are needed together.
  // Unknown, or an extension of [0, 0]: it stays the length it made in its first season.
  /** Length a living side shoot adds in each season after its first. */
  'sideShoots.extensionMPerYear': 'range',
  /** The length beyond which a side shoot adds no more. */
  'sideShoots.maxLengthM': 'number',
  // How a side shoot leaves its bearing stem. Unknown: the generic side shoot (sim/generic-shoot.ts), said once for the plant.
  /** Angle between the bearing stem, base to tip, and a side shoot as it sets out. */
  'sideShoots.branchAngleDeg': 'range',
  /** Days after bud burst over which a season's side shoots break, each on a day of its own. */
  'sideShoots.breakSpreadDays': 'range',
  /** Share, 0 to 1, by which a side shoot's first heading is turned from its place round the stem towards up and the light. */
  'sideShoots.startTowardsLight': 'number',
  /** Angle round the stem from one leaf node to the next where leaves stand singly. */
  'organs.alternateDivergenceDeg': 'number',
  /**
   * Diameter at its base of a side shoot of the longest length `sideShoots.lengthM` gives, as it grows; it tapers to the
   * tip the plant's other shoots have (`thickening.tipRadiusSquaredMm2`), and a shorter shoot is as thick, at each
   * distance from its tip, as a longer one. Unknown: the plant's own pipe model (`thickening.radiusSquaredPerMetreMm2`)
   * on the length the shoot is to make.
   */
  'sideShoots.baseDiameterMm': 'number',
  /**
   * For a plant that flowers again in flushes: the days, counted from the first day of `phenology.flowerOpenDoy`, in
   * which the first flowers at the ends of side shoots open, the first flush. Unknown: they open on days spread over
   * the whole window.
   */
  'flowering.firstFlushDays': 'range',
} as const;

export type GrowthParamKey = keyof typeof GROWTH_PARAMS;
type Shape<K extends GrowthParamKey> = (typeof GROWTH_PARAMS)[K] extends 'number' ? number : (typeof GROWTH_PARAMS)[K] extends 'range' | 'window' ? [number, number] : number[];

/**
 * Parameters a model may leave `unknown`. They describe parts of the plant
 * the engine can leave out, so a run does not depend on them; every other
 * parameter must have a value. Read them with `known`, not `param`.
 */
export const GROWTH_PARAMS_OPTIONAL = [
  'mechanics.greenShootModulusMPa',
  'mechanics.woodModulusMPa',
  'mechanics.woodSetDays',
  'mechanics.stemFreshDensityKgM3',
  'mechanics.leafFreshMassPerAreaKgM2',
  'mechanics.inflorescenceFreshMassKg',
  'mechanics.fruitFreshMassKg',
  'mechanics.searcherReachM',
  'tropism.turnPerM',
  'tropism.lightShare',
  'attachment.graspReachM',
  'fruit.setShare',
  'fruit.lengthM',
  'fruit.swellDays',
  'fruit.ripenDoy',
  'fruit.fallDoy',
  'appendages.tendrilNodePattern',
  'appendages.tendrilLengthM',
  'appendages.leafStalkCoilShare',
  'appendages.leafStalkLengthM',
  'appendages.aerialRootPatchSpacingM',
  'appendages.aerialRootLengthM',
  'appendages.prickleSpacingM',
  'appendages.prickleLengthM',
  'sideShoots.bearingWoodAgeYears',
  'sideShoots.perMetrePerYear',
  'sideShoots.lengthM',
  'sideShoots.lifespanYears',
  'sideShoots.terminalFlowerShare',
  'organs.spurLeafLengthM',
  'organs.sideShootLeafLengthM',
  'organs.sideShootLeafSpacingM',
  'organs.sideShootLeavesPerNode',
  'organs.sideShootLeafLifespanYears',
  'organs.winterLeafShare',
  'flowering.repeatMaxPerSeason',
  'flowering.repeatIntervalDays',
  'flowering.repeatShare',
  'flowering.repeatIntervalDeadheadedDays',
  'sideShoots.extensionMPerYear',
  'sideShoots.maxLengthM',
  'sideShoots.branchAngleDeg',
  'sideShoots.breakSpreadDays',
  'sideShoots.startTowardsLight',
  'organs.alternateDivergenceDeg',
  'sideShoots.baseDiameterMm',
  'flowering.firstFlushDays',
] as const satisfies readonly GrowthParamKey[];
export type OptionalParamKey = (typeof GROWTH_PARAMS_OPTIONAL)[number];
export type RequiredParamKey = Exclude<GrowthParamKey, OptionalParamKey>;
const optional: ReadonlySet<string> = new Set(GROWTH_PARAMS_OPTIONAL);

const shapes = {
  number: z.number(),
  range: z.tuple([z.number(), z.number()]).refine(([a, b]) => a <= b, 'a range is [low, high]'),
  // no order is asked of a window: first later than last is a window that runs through the new year
  window: z.tuple([z.number(), z.number()]),
  list: z.array(z.number()).min(1),
};

/** What the values of the optional parameters must look like where they are given. */
const share = z.number().min(0, 'a share is between 0 and 1').max(1, 'a share is between 0 and 1');
const doy = z.number().int().min(1).max(366);
const window = z.tuple([doy, doy]);
const lengths = z.tuple([z.number().nonnegative(), z.number().nonnegative()]).refine(([a, b]) => a <= b, 'a range is [low, high]');
/** A length that something must have to be there at all. */
const sizes = z.tuple([z.number().positive(), z.number().positive()]).refine(([a, b]) => a <= b, 'a range is [low, high]');
/** A wait in whole days, of at least one. */
const waits = z.tuple([z.number().int().min(1), z.number().int().min(1)]).refine(([a, b]) => a <= b, 'a range is [low, high]');
const positive = z.number().positive('a stiffness, a density or a time is more than nothing');
const optionalShapes: { [K in OptionalParamKey]: z.ZodType } = {
  'mechanics.greenShootModulusMPa': positive,
  'mechanics.woodModulusMPa': positive,
  'mechanics.woodSetDays': positive,
  'mechanics.stemFreshDensityKgM3': positive,
  'mechanics.leafFreshMassPerAreaKgM2': z.number().nonnegative(),
  'mechanics.inflorescenceFreshMassKg': z.number().nonnegative(),
  'mechanics.fruitFreshMassKg': z.number().nonnegative(),
  'mechanics.searcherReachM': z.number().nonnegative(),
  'tropism.turnPerM': z.number().nonnegative(),
  'tropism.lightShare': share,
  'attachment.graspReachM': z.number().nonnegative(),
  'fruit.setShare': share,
  'fruit.lengthM': lengths,
  'fruit.swellDays': lengths,
  'fruit.ripenDoy': window,
  'fruit.fallDoy': window,
  'appendages.tendrilNodePattern': z.array(z.union([z.literal(0), z.literal(1)])).min(1),
  'appendages.tendrilLengthM': lengths,
  'appendages.leafStalkCoilShare': share,
  'appendages.leafStalkLengthM': lengths,
  'appendages.aerialRootPatchSpacingM': lengths,
  'appendages.aerialRootLengthM': lengths,
  'appendages.prickleSpacingM': lengths,
  'appendages.prickleLengthM': lengths,
  'sideShoots.bearingWoodAgeYears': z.number().nonnegative(),
  'sideShoots.perMetrePerYear': z.number().nonnegative(),
  'sideShoots.lengthM': lengths,
  'sideShoots.lifespanYears': z.number().int('a side shoot lives a whole number of growing seasons').nonnegative(),
  'sideShoots.terminalFlowerShare': share,
  'organs.spurLeafLengthM': sizes,
  'organs.sideShootLeafLengthM': sizes,
  'organs.sideShootLeafSpacingM': sizes,
  'organs.sideShootLeavesPerNode': z.union([z.literal(1), z.literal(2)], 'leaves stand singly (1) or in opposite pairs (2)'),
  'organs.sideShootLeafLifespanYears': z.number().int('a leaf lasts a whole number of growing seasons').min(1),
  'organs.winterLeafShare': share,
  'flowering.repeatMaxPerSeason': z.number().int('a place flowers again a whole number of times').nonnegative(),
  'flowering.repeatIntervalDays': waits,
  'flowering.repeatShare': share,
  'flowering.repeatIntervalDeadheadedDays': waits,
  'sideShoots.extensionMPerYear': lengths,
  'sideShoots.maxLengthM': z.number().nonnegative(),
  'sideShoots.branchAngleDeg': z.tuple([z.number().min(0).max(180), z.number().min(0).max(180)]).refine(([a, b]) => a <= b, 'a range is [low, high]'),
  'sideShoots.breakSpreadDays': lengths,
  'sideShoots.startTowardsLight': share,
  'organs.alternateDivergenceDeg': z.number().min(0).max(360),
  'sideShoots.baseDiameterMm': positive,
  'flowering.firstFlushDays': lengths,
};

const paramShape = Object.fromEntries(
  (Object.keys(GROWTH_PARAMS) as GrowthParamKey[]).map((k) => [
    k,
    optional.has(k)
      ? sourced(optionalShapes[k as OptionalParamKey])
      : sourced(shapes[GROWTH_PARAMS[k]]).refine((v) => (v as { value: unknown }).value !== null, 'a growth model cannot run on an unknown: give a value and say where it came from'),
  ]),
);

/** A name a taxon gives one of its forms: lower-case words joined by underscores, for a viewer to switch on. */
const formName = z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/, 'a form name is lower-case ASCII words joined by underscores');

/**
 * The names section of a growth model: the words, as opposed to the numbers,
 * that the engine passes on to a viewer. Every entry is optional. A form left
 * out means the taxon's ordinary one; an organ whose hold is left out is given
 * no direction, which the render contract reads as hanging.
 */
export const growthNamesSchema = z.strictObject({
  /** The leaf of climbing and extension shoots, where the taxon has more than one leaf form. */
  leafForm: formName.optional(),
  /** The leaf of spurs; the same as `leafForm` where left out. */
  spurLeafForm: formName.optional(),
  /** The leaf of flowering side shoots (ivy's unlobed adult leaf); the same as `leafForm` where left out. */
  sideShootLeafForm: formName.optional(),
  /** The inflorescence of spurs and of the year's growth. */
  flowerForm: formName.optional(),
  /** The first flush on last year's stems, for a taxon that flowers on both; the same as `flowerForm` where left out. */
  firstFlushFlowerForm: formName.optional(),
  /** The inflorescence at the end of a flowering side shoot; the same as `flowerForm` where left out. */
  sideShootFlowerForm: formName.optional(),
  fruitForm: formName.optional(),
  /** How an inflorescence is held from where it is attached. */
  flowerHeld: z.enum(ORGAN_HELD).optional(),
  /** How a fruit is held. */
  fruitHeld: z.enum(ORGAN_HELD).optional(),
  /** Where the names and the two holds come from: a source, or the reason for the choice. */
  basis: z.string().min(1).optional(),
});
export type GrowthNames = z.infer<typeof growthNamesSchema>;

export const growthModelSchema = z.strictObject({
  schemaVersion: z.literal(1),
  taxonId: z.string().min(1),
  /** What this model is and is not. Shown with every run. */
  statement: z.string().min(1),
  names: growthNamesSchema,
  params: z.strictObject(paramShape),
});

export interface GrowthModel {
  schemaVersion: 1;
  taxonId: string;
  statement: string;
  names: GrowthNames;
  params: { [K in GrowthParamKey]: Sourced<Shape<K>> };
}

export function parseGrowthModel(json: unknown, origin = 'growth model'): GrowthModel {
  // An optional parameter that a file leaves out is unknown, and the part it describes is left out of a run. A new
  // optional parameter can therefore be added to the engine without touching every taxon's file.
  if (typeof json === 'object' && json !== null && 'params' in json && typeof json.params === 'object' && json.params !== null) {
    const params: Record<string, unknown> = { ...json.params };
    for (const key of GROWTH_PARAMS_OPTIONAL) if (!(key in params)) params[key] = { value: null, status: 'unknown' };
    json = { ...json, params };
  }
  const result = growthModelSchema.safeParse(json);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`${origin} is not a valid growth model:\n${lines.join('\n')}`);
  }
  return result.data as unknown as GrowthModel;
}

/** The value of a parameter every model must have. */
export function param<K extends RequiredParamKey>(model: GrowthModel, key: K): Shape<K> {
  return model.params[key].value as Shape<K>;
}

/** The value of a parameter a model may leave unknown, or null where it has. */
export function known<K extends OptionalParamKey>(model: GrowthModel, key: K): Shape<K> | null {
  return model.params[key].value as Shape<K> | null;
}

/**
 * The value of a parameter of the unsupported shoot: the taxon's own where its
 * model gives one, and otherwise the generic one, since a shoot in the air has
 * to be bounded whether or not the plant has been measured.
 */
export function shootParam(model: GrowthModel, key: ShootParamKey): number {
  return model.params[key].value ?? GENERIC_SHOOT[key].value;
}

/** The value of a parameter of how a side shoot sets out: the taxon's own, or the generic side shoot's. */
export function sideShootParam<K extends SideShootParamKey>(model: GrowthModel, key: K): (typeof GENERIC_SIDE_SHOOT)[K]['value'] {
  return (model.params[key].value ?? GENERIC_SIDE_SHOOT[key].value) as (typeof GENERIC_SIDE_SHOOT)[K]['value'];
}

/** The side-shoot parameters a model leaves to the generic side shoot. */
export function genericSideShootKeys(model: GrowthModel): SideShootParamKey[] {
  return (Object.keys(GENERIC_SIDE_SHOOT) as SideShootParamKey[]).filter((k) => model.params[k].value === null);
}

/** The shoot parameters a model leaves to the generic set. */
export function genericShootKeys(model: GrowthModel): ShootParamKey[] {
  return (Object.keys(GENERIC_SHOOT) as ShootParamKey[]).filter((k) => model.params[k].value === null);
}

/** Entry `i` of a list parameter, or its last entry when the list is shorter. */
export function listAt(model: GrowthModel, key: RequiredParamKey, i: number): number {
  const v = model.params[key].value as number[];
  return v[Math.min(Math.max(0, i), v.length - 1)]!;
}

/**
 * A copy of a model with one parameter changed, for asking "what if". The
 * change is itself an assumption and is labelled as one: `why` says what
 * question the variation is exploring.
 */
export function withParam<K extends GrowthParamKey>(model: GrowthModel, key: K, value: Shape<K>, why: string): GrowthModel {
  const was = model.params[key];
  const varied: Sourced<Shape<K>> = { value, status: 'provisional_design_assumption', basis: `Varied for this scenario (was ${JSON.stringify(was.value)}): ${why}` };
  if (was.unit !== undefined) varied.unit = was.unit;
  return { ...model, params: { ...model.params, [key]: varied } };
}

/** A copy of a model with one optional parameter made unknown: the part it describes is then left out of a run. */
export function withUnknown(model: GrowthModel, key: OptionalParamKey): GrowthModel {
  const was = model.params[key];
  const empty: Sourced<never> = was.unit !== undefined ? { value: null, status: 'unknown', unit: was.unit } : { value: null, status: 'unknown' };
  return { ...model, params: { ...model.params, [key]: empty } };
}

/** Every parameter with its status: the model's part of a run's assumptions report. */
export function modelProvenance(model: GrowthModel): ProvenanceEntry[] {
  return (Object.keys(GROWTH_PARAMS) as GrowthParamKey[]).map((k) => {
    const p = model.params[k];
    // a shoot parameter the model leaves out is not left out of the run: the generic value is used, and is what is counted
    if (p.value === null && k in GENERIC_SHOOT) {
      const g: Sourced<number> = GENERIC_SHOOT[k as ShootParamKey];
      return { owner: `${model.taxonId} growth model (generic shoot)`, path: k, value: g.value, unit: g.unit, status: g.status, source: g.source, basis: g.basis };
    }
    // the same for how a side shoot sets out, on a plant that makes side shoots
    if (p.value === null && k in GENERIC_SIDE_SHOOT && model.params['sideShoots.perMetrePerYear'].value) {
      const g: Sourced<number | [number, number]> = GENERIC_SIDE_SHOOT[k as SideShootParamKey];
      return { owner: `${model.taxonId} growth model (generic side shoot)`, path: k, value: g.value, unit: g.unit, status: g.status, source: g.source, basis: g.basis };
    }
    return { owner: `${model.taxonId} growth model`, path: k, value: p.value, unit: p.unit, status: p.status, source: p.source, basis: p.basis };
  });
}
