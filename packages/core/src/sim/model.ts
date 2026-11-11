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
 * One file per taxon: `species/<id>/model.json`.
 */
import { z } from 'zod';
import { type ProvenanceEntry, type Sourced, sourced } from '../provenance.ts';
import { ORGAN_HELD } from '../vocab.ts';

/** Every parameter, with the shape of its value. `range` is [low, high]; `list` is indexed as its name says. */
export const GROWTH_PARAMS = {
  // ---- phenology: day of year (1 = 1 January). Provisional fixed dates until a weather-driven model replaces them.
  'phenology.budburstDoy': 'number',
  'phenology.growthEndDoy': 'number',
  'phenology.leafFlushDoy': 'range',
  'phenology.autumnColourDoy': 'range',
  'phenology.leafFallDoy': 'range',
  'phenology.floralInitiationDoy': 'range',
  'phenology.flowerOpenDoy': 'range',
  'phenology.petalFallDoy': 'range',
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
   */
  'fruit.ripenDoy': 'range',
  /**
   * Days of the year between which ripe fruit falls, splits or is eaten: each
   * goes on a day in the first such window after it is ripe. A window early in
   * the year therefore means the fruit hangs on through the winter.
   */
  'fruit.fallDoy': 'range',
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
} as const;

export type GrowthParamKey = keyof typeof GROWTH_PARAMS;
type Shape<K extends GrowthParamKey> = (typeof GROWTH_PARAMS)[K] extends 'number' ? number : (typeof GROWTH_PARAMS)[K] extends 'range' ? [number, number] : number[];

/**
 * Parameters a model may leave `unknown`. They describe parts of the plant
 * the engine can leave out, so a run does not depend on them; every other
 * parameter must have a value. Read them with `known`, not `param`.
 */
export const GROWTH_PARAMS_OPTIONAL = [
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
] as const satisfies readonly GrowthParamKey[];
export type OptionalParamKey = (typeof GROWTH_PARAMS_OPTIONAL)[number];
export type RequiredParamKey = Exclude<GrowthParamKey, OptionalParamKey>;
const optional: ReadonlySet<string> = new Set(GROWTH_PARAMS_OPTIONAL);

const shapes = {
  number: z.number(),
  range: z.tuple([z.number(), z.number()]).refine(([a, b]) => a <= b, 'a range is [low, high]'),
  list: z.array(z.number()).min(1),
};

/** What the values of the optional parameters must look like where they are given. */
const share = z.number().min(0, 'a share is between 0 and 1').max(1, 'a share is between 0 and 1');
const doy = z.number().int().min(1).max(366);
const window = z.tuple([doy, doy]).refine(([a, b]) => a <= b, 'a window is [first day of the year, last day of the year]');
const lengths = z.tuple([z.number().nonnegative(), z.number().nonnegative()]).refine(([a, b]) => a <= b, 'a range is [low, high]');
const optionalShapes: { [K in OptionalParamKey]: z.ZodType } = {
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
    return { owner: `${model.taxonId} growth model`, path: k, value: p.value, unit: p.unit, status: p.status, source: p.source, basis: p.basis };
  });
}
