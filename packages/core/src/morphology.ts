/**
 * Morphology: the shape of a taxon's parts, as floras and plant records give
 * it, for a viewer to draw from.
 *
 * A growth model (`species/<id>/model.json`) holds what the engine needs to
 * make the plant grow. This file holds what a drawing of the plant needs and
 * the engine does not: how many leaflets a leaf has, how long a leaflet is for
 * its width, how many petals, what colour a flora calls the flower. They live
 * here, each with its evidence status and source, so that no bare number about
 * a plant sits in drawing code.
 *
 * One file per taxon: `species/<id>/morphology.json`.
 *
 *   { "schemaVersion": 1, "taxonId": "<id>",
 *     "characters": { "<dotted.key>": { "value": ..., "status": ..., "source": ..., "basis": ... } } }
 *
 * A value is a number, a [low, high] range, a word or phrase, or a list of
 * them. The keys are free, written part first: `leaf.leafletCount`,
 * `flower.colour`, `fruit.lengthM`. A length carries its unit in the key and
 * in `unit`, as everywhere else in the project.
 *
 * Portable: nothing here touches the file system. `loadMorphologies` in
 * `./node/load-taxa.ts` reads the folder; a browser build is handed the same
 * JSON by its bundler and calls `parseMorphology`.
 */
import { z } from 'zod';
import { type ProvenanceEntry, type Sourced, sourced } from './provenance.ts';

export type MorphologyValue = number | [number, number] | string | string[];

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lower-case ASCII words joined by hyphens');
/** `leaf.leafletCount`, `flower.standard.colour`: words joined by dots, the part first. */
const characterKey = z.string().regex(/^[a-z][A-Za-z0-9_]*(\.[a-z][A-Za-z0-9_]*)+$/, 'a character key is two or more words joined by dots, the part first: leaf.leafletCount');

const characterValue = z.union([
  z.number(),
  z.tuple([z.number(), z.number()]).refine(([a, b]) => a <= b, 'a range is [low, high]'),
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);

export const morphologySchema = z.strictObject({
  schemaVersion: z.literal(1),
  taxonId: slug,
  characters: z.record(characterKey, sourced(characterValue)),
});

export interface Morphology {
  schemaVersion: 1;
  taxonId: string;
  characters: Record<string, Sourced<MorphologyValue>>;
}

/** Parse and validate one morphology file's contents. Throws with a readable list of every problem. */
export function parseMorphology(json: unknown, origin = 'morphology'): Morphology {
  const result = morphologySchema.safeParse(json);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`${origin} is not a valid morphology file:\n${lines.join('\n')}`);
  }
  return result.data as Morphology;
}

/**
 * One character of a taxon, with its evidence status. Throws, naming the
 * taxon and the key, where the file has no such character: drawing code that
 * asks for a number nobody has entered should stop, not fall back on one of
 * its own.
 */
export function characterOf(morphology: Morphology, key: string): Sourced<MorphologyValue> {
  const found = Object.hasOwn(morphology.characters, key) ? morphology.characters[key] : undefined;
  if (!found) throw new Error(`${morphology.taxonId} has no morphological character "${key}": add it to species/${morphology.taxonId}/morphology.json with its source`);
  return found;
}

/** True where the file has the character and it is not left unknown. */
export function hasCharacter(morphology: Morphology, key: string): boolean {
  return Object.hasOwn(morphology.characters, key) && morphology.characters[key]!.value !== null;
}

function valueOf(morphology: Morphology, key: string, shape: string, fits: (v: MorphologyValue) => boolean): MorphologyValue {
  const { value } = characterOf(morphology, key);
  if (value === null) throw new Error(`${morphology.taxonId}: the morphological character "${key}" is recorded as unknown, so there is nothing to draw from`);
  if (!fits(value)) throw new Error(`${morphology.taxonId}: the morphological character "${key}" is ${JSON.stringify(value)}, not ${shape}`);
  return value;
}

/** A character that is a single number. Throws where it is absent, unknown or of another shape. */
export function characterNumber(morphology: Morphology, key: string): number {
  return valueOf(morphology, key, 'a number', (v) => typeof v === 'number') as number;
}

/** A character that is a [low, high] range. */
export function characterRange(morphology: Morphology, key: string): [number, number] {
  return valueOf(morphology, key, 'a [low, high] range', (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') as [number, number];
}

/** A character that is a word or phrase. */
export function characterText(morphology: Morphology, key: string): string {
  return valueOf(morphology, key, 'a word or phrase', (v) => typeof v === 'string') as string;
}

/** A character that is a list of words or phrases. */
export function characterList(morphology: Morphology, key: string): string[] {
  return valueOf(morphology, key, 'a list of words', (v) => Array.isArray(v) && typeof v[0] === 'string') as string[];
}

/** Every character with its status, for an assumptions report. */
export function morphologyProvenance(morphology: Morphology): ProvenanceEntry[] {
  return Object.entries(morphology.characters).map(([key, c]) => ({ owner: `${morphology.taxonId} morphology`, path: key, value: c.value, unit: c.unit, status: c.status, source: c.source, basis: c.basis }));
}
