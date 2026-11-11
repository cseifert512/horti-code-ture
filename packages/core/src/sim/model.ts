/**
 * GrowthModel: the numbers the engine needs to make a taxon grow.
 *
 * These are kept apart from `taxon.json` on purpose. A taxon profile says
 * what is known or published about a plant; a growth model says what this
 * simulator currently ASSUMES so that it can run. Almost every value here is
 * a `provisional_design_assumption`, most of them carried over from the
 * Wisteria prototype, and each says so. A model cannot run on an unknown, so
 * every parameter must have a value; what the schema forbids is a value with
 * no stated status and basis.
 *
 * One file per taxon: `species/<id>/model.json`.
 */
import { z } from 'zod';
import { type ProvenanceEntry, type Sourced, sourced } from '../provenance.ts';

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
} as const;

export type GrowthParamKey = keyof typeof GROWTH_PARAMS;
type Shape<K extends GrowthParamKey> = (typeof GROWTH_PARAMS)[K] extends 'number' ? number : (typeof GROWTH_PARAMS)[K] extends 'range' ? [number, number] : number[];

const shapes = {
  number: z.number(),
  range: z.tuple([z.number(), z.number()]).refine(([a, b]) => a <= b, 'a range is [low, high]'),
  list: z.array(z.number()).min(1),
};

const paramShape = Object.fromEntries(
  (Object.keys(GROWTH_PARAMS) as GrowthParamKey[]).map((k) => [
    k,
    sourced(shapes[GROWTH_PARAMS[k]]).refine((v) => (v as { value: unknown }).value !== null, 'a growth model cannot run on an unknown: give a value and say where it came from'),
  ]),
);

export const growthModelSchema = z.strictObject({
  schemaVersion: z.literal(1),
  taxonId: z.string().min(1),
  /** What this model is and is not. Shown with every run. */
  statement: z.string().min(1),
  params: z.strictObject(paramShape),
});

export interface GrowthModel {
  schemaVersion: 1;
  taxonId: string;
  statement: string;
  params: { [K in GrowthParamKey]: Sourced<Shape<K>> };
}

export function parseGrowthModel(json: unknown, origin = 'growth model'): GrowthModel {
  const result = growthModelSchema.safeParse(json);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`${origin} is not a valid growth model:\n${lines.join('\n')}`);
  }
  return result.data as unknown as GrowthModel;
}

/** The value of a parameter. */
export function param<K extends GrowthParamKey>(model: GrowthModel, key: K): Shape<K> {
  return model.params[key].value as Shape<K>;
}

/** Entry `i` of a list parameter, or its last entry when the list is shorter. */
export function listAt(model: GrowthModel, key: GrowthParamKey, i: number): number {
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

/** Every parameter with its status: the model's part of a run's assumptions report. */
export function modelProvenance(model: GrowthModel): ProvenanceEntry[] {
  return (Object.keys(GROWTH_PARAMS) as GrowthParamKey[]).map((k) => {
    const p = model.params[k];
    return { owner: `${model.taxonId} growth model`, path: k, value: p.value, unit: p.unit, status: p.status, source: p.source, basis: p.basis };
  });
}
