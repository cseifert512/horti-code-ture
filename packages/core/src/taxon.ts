/**
 * TaxonProfile: the stable, reviewable description of one candidate plant.
 * SIMULATION_KEY.md section 2 ("TaxonProfile") and section 5.
 *
 * One `species/<id>/taxon.json` per taxon sits beside its SPECIES_PROFILE.md.
 * It holds what is known or published about the plant. Numbers the simulator
 * needs but nobody has measured do NOT go here as facts: each engine
 * parameter is declared separately with a provisional status.
 */
import { z } from 'zod';
import { sourced } from './provenance.ts';
import {
  ATTACHMENT_MECHANISM,
  FLOWERING_WOOD,
  GARDENER_EVENT,
  HANDEDNESS,
  LEAF_HABIT,
  LIFE_FORM,
  PALETTE_STANDING,
  RHS_HARDINESS,
  UK_CULTIVATION,
} from './vocab.ts';

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lower-case ASCII words joined by hyphens');
const url = z.string().regex(/^https:\/\//, 'sources are https URLs');

const months = z
  .array(z.number().int().min(1).max(12))
  .min(1)
  .refine((m) => new Set(m).size === m.length, 'months must not repeat');

export const RHS_NAME_STATUS = ['accepted', 'correct', 'trade', 'synonym'] as const;

export const taxonSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: slug,
    names: z.strictObject({
      /** Short label used throughout the project's documents. */
      label: z.string().min(1),
      /** The name the RHS currently treats as accepted for this plant, and its plant-finder record. */
      rhs: z.strictObject({
        name: z.string().min(1),
        plantId: z.number().int().positive(),
        status: z.enum(RHS_NAME_STATUS),
        url,
      }),
      /** Accepted species-level name in Kew's World Checklist of Vascular Plants (the checklist behind POWO). */
      kew: z.string().min(1),
      /** Every other name the plant is sold or cited under. */
      synonyms: z.array(z.string().min(1)),
      common: z.array(z.string().min(1)),
    }),
    palette: z.strictObject({
      standing: z.enum(PALETTE_STANDING),
      /** What the plant is for in a Bower composition. */
      role: z.string().min(1),
    }),
    lifeForm: z.enum(LIFE_FORM),
    ukCultivation: z.enum(UK_CULTIVATION),
    leafHabit: sourced(z.enum(LEAF_HABIT)),
    attachment: z.strictObject({
      mechanism: z.enum(ATTACHMENT_MECHANISM),
      /** True when the plant can hold a suitable support unaided once it meets one. */
      selfAttaching: z.boolean(),
      /** Helix chirality; present only for stem twiners. See vocab.ts HANDEDNESS for the convention. */
      handedness: sourced(z.enum(HANDEDNESS)).optional(),
      /** Largest support the mechanism can grasp unaided. Unknown for every taxon until measured. */
      maxGraspDiameterMm: sourced(z.number().positive()),
      /** What the Bower has to provide for this plant to climb. */
      supportNeeds: z.string().min(1),
      caveat: z.string().min(1).optional(),
    }),
    flowering: z.strictObject({
      wood: sourced(z.enum(FLOWERING_WOOD)),
      /** RHS pruning group, where the RHS assigns one. */
      rhsPruningGroup: z.string().min(1).nullable(),
      /**
       * Months in which flowering is described for the UK. An observational
       * envelope: it never proves a given plant flowers in a given year.
       */
      monthsUK: sourced(months),
      display: z.string().min(1),
      scented: z.boolean(),
    }),
    size: z.strictObject({
      /** RHS ultimate-height band [min, max]; max null means "higher than min". Not a route length. */
      rhsUltimateHeightM: sourced(z.tuple([z.number().nonnegative(), z.number().positive().nullable()])),
      /** RHS years to reach the ultimate-height band. Not an extension rate. */
      rhsYearsToUltimate: sourced(z.tuple([z.number().positive(), z.number().positive()])),
    }),
    hardiness: sourced(z.enum(RHS_HARDINESS)),
    site: z.strictObject({
      aspect: z.string().min(1),
      soil: z.string().min(1),
    }),
    management: z.strictObject({
      /** Routine interventions with their usual UK months. */
      calendar: z.array(
        z.strictObject({
          event: z.enum(GARDENER_EVENT),
          months,
          note: z.string().min(1),
        }),
      ),
      notes: z.string().min(1),
    }),
    hazards: z.array(z.string().min(1)),
    /** Legal or ecological flags by region. An empty list means "none found", not "cleared". */
    regional: z.array(z.strictObject({ region: z.string().min(1), status: z.string().min(1), source: url })),
    sources: z.array(z.strictObject({ label: z.string().min(1), url })).min(1),
  })
  .superRefine((t, ctx) => {
    const twiner = t.attachment.mechanism === 'stem_twining';
    if (twiner && !t.attachment.handedness) {
      ctx.addIssue({ code: 'custom', path: ['attachment', 'handedness'], message: 'a stem twiner must state its handedness, even if only as unknown' });
    }
    if (!twiner && t.attachment.handedness) {
      ctx.addIssue({ code: 'custom', path: ['attachment', 'handedness'], message: 'handedness applies to stem twiners only: wisteria traits must not leak on to other climbers' });
    }
    if ((t.attachment.mechanism === 'none' || t.attachment.mechanism === 'scramble_and_tie') && t.attachment.selfAttaching) {
      ctx.addIssue({ code: 'custom', path: ['attachment', 'selfAttaching'], message: `mechanism "${t.attachment.mechanism}" cannot attach itself` });
    }
    if ((t.attachment.mechanism === 'none') !== (t.lifeForm === 'shrub')) {
      ctx.addIssue({ code: 'custom', path: ['lifeForm'], message: 'a shrub has no climbing mechanism, and a climber must have one' });
    }
  });

export type TaxonProfile = z.infer<typeof taxonSchema>;

/** Parse and validate one taxon file's contents. Throws with a readable list of every problem. */
export function parseTaxon(json: unknown, origin = 'taxon'): TaxonProfile {
  const result = taxonSchema.safeParse(json);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`${origin} is not a valid taxon profile:\n${lines.join('\n')}`);
  }
  return result.data;
}
