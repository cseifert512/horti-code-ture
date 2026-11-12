/**
 * What a taxon's profile says about light, aspect and shelter, read into a
 * form the light model can act on.
 *
 * The profiles record this as a sentence (`site.aspect`), in the RHS's words.
 * Nothing is added to it here: a plant accepts the classes of light its
 * sentence names and no others, asks for the compass quarters it names, and
 * its flowering answers to light only where the sentence ties flowers to sun.
 * A sentence that cannot be read is reported as unread and changes nothing.
 *
 * The reading is this project's interpretation of published words, so it
 * carries the status of an assumption, with the sentence as its basis. A
 * structured field in `taxon.json`, sourced clause by clause, would replace it.
 */
import type { Sourced } from '../provenance.ts';
import type { TaxonProfile } from '../taxon.ts';
import { COMPASS_QUARTER, type CompassQuarter, SUN_CLASS, SUN_DOC_TERMS, type SunClass } from '../vocab.ts';
import { LIGHT_MODEL } from './model.ts';

export interface LightReading {
  /** The profile's own sentence. */
  words: string;
  /** Classes of light the sentence accepts, brightest first. Empty where it could not be read. */
  accepts: SunClass[];
  /** Compass quarters the sentence asks for or names as suitable; empty where it leaves aspect open. */
  aspects: CompassQuarter[];
  /** The sentence asks for shelter. The model has no wind: this is reported, not acted on. */
  shelter: boolean;
  /** The sentence asks for warmth. The model has no temperature: reported, not acted on. */
  warmth: boolean;
  /** The sentence ties flowering to sun or light. */
  floweringNeedsSun: boolean;
  /** A clause that accepts full sun only on a condition the model cannot check, in the profile's words. */
  fullSunOnlyIf: string | null;
  status: 'provisional_design_assumption' | 'unknown';
  basis: string;
}

const has = (set: Set<SunClass>, terms: keyof typeof SUN_DOC_TERMS) => {
  for (const c of SUN_DOC_TERMS[terms]!) set.add(c);
};

/** Read the light a profile accepts from its `site.aspect` sentence. */
export function readLight(profile: Pick<TaxonProfile, 'site'>): LightReading {
  const words = profile.site.aspect;
  const accepts = new Set<SunClass>();
  let fullSunOnlyIf: string | null = null;
  let floweringNeedsSun = false;
  for (const raw of words.split(';')) {
    const clause = raw.trim();
    const c = clause.toLowerCase();
    if (/\bflower/.test(c) && /\b(full sun|sun|light)\b/.test(c)) floweringNeedsSun = true;
    // "full sun only where the soil stays moist": not an acceptance the model can grant
    if (/\bfull sun only (where|if|when)\b/.test(c)) {
      fullSunOnlyIf = clause.replace(/\.$/, '');
      continue;
    }
    if (/\bshade to sun\b/.test(c)) has(accepts, 'shade to sun');
    if (/\bpartial to full shade\b/.test(c)) has(accepts, 'partial to full shade');
    else if (/\bfull shade\b/.test(c)) has(accepts, 'full shade');
    if (/\bpart(ial)? shade\b/.test(c)) has(accepts, 'partial shade');
    if (/\bfull sun\b/.test(c)) has(accepts, 'full sun');
    else if (/\bsunny\b/.test(c)) has(accepts, 'sunny');
    else if (/^sun\b/.test(c)) has(accepts, 'sun');
  }
  const aspects = new Set<CompassQuarter>();
  const named = /((?:north|south|east|west)(?:\s*,\s*|\s+or\s+|\s+and\s+)?)+\s+(?:facing|sectors?|exposure)/gi;
  for (const m of words.matchAll(named)) for (const q of COMPASS_QUARTER) if (new RegExp(`\\b${q}\\b`, 'i').test(m[0])) aspects.add(q);
  const read = accepts.size > 0;
  return {
    words,
    accepts: SUN_CLASS.filter((c) => accepts.has(c)),
    aspects: COMPASS_QUARTER.filter((q) => aspects.has(q)),
    shelter: /\bsheltered\b/i.test(words) && !/\bexposed or sheltered\b/i.test(words),
    warmth: /\bwarm\b|\bheat\b/i.test(words),
    floweringNeedsSun,
    fullSunOnlyIf,
    status: read ? 'provisional_design_assumption' : 'unknown',
    basis: read ? `Read from the profile's words: "${words}"` : `The profile's words on light could not be read, so light changes nothing for this plant: "${words}"`,
  };
}

/** The shadiest class a reading accepts, or null where it could not be read. */
export function shadiestAccepted(reading: LightReading): SunClass | null {
  return reading.accepts.length ? reading.accepts[reading.accepts.length - 1]! : null;
}

/** The share of open-site light below which a plant with this reading is held back; null where the reading is empty. */
export function lightNeeded(reading: LightReading): Sourced<number> | null {
  const shadiest = shadiestAccepted(reading);
  return shadiest ? LIGHT_MODEL.lightNeeded[shadiest] : null;
}

/** The class of a place by its hours of direct sun on a clear day at midsummer, as the RHS defines the classes. */
export function sunClassOf(midsummerHours: number): SunClass {
  if (midsummerHours > LIGHT_MODEL.fullSunHours.value!) return 'full_sun';
  if (midsummerHours >= LIGHT_MODEL.partialShadeHours.value!) return 'partial_shade';
  if (midsummerHours >= LIGHT_MODEL.moderateShadeHours.value!) return 'moderate_shade';
  return 'deep_shade';
}

/**
 * How far a share of light holds growth back: 1 where there is as much as the
 * plant needs, falling in proportion below it.
 */
export function lightFactor(share: number, needed: number | null): number {
  if (needed === null || needed <= 0) return 1;
  return Math.max(0, Math.min(1, share / needed));
}

export const SUN_CLASS_WORDS: Readonly<Record<SunClass, string>> = {
  full_sun: 'full sun',
  partial_shade: 'partial shade',
  moderate_shade: 'moderate shade',
  deep_shade: 'deep shade',
};
