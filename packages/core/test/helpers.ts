import type { Growable } from '../src/sim/scenarios.ts';
import type { FloweringWood } from '../src/vocab.ts';

/**
 * The library with the flowering wood of some taxa fixed for a test, so that
 * the test says what it assumes and does not depend on how far the research
 * behind a taxon file has got. `null` makes it unknown.
 */
export function withFloweringWood(library: Growable, woods: Readonly<Record<string, FloweringWood | null>>): Growable {
  const out = new Map(library);
  for (const [id, wood] of Object.entries(woods)) {
    const t = library.get(id);
    if (!t) throw new Error(`no taxon ${id} in the library`);
    const profile = structuredClone(t.profile);
    profile.flowering.wood = wood ? { value: wood, status: 'provisional_design_assumption', basis: 'fixed for this test' } : { value: null, status: 'unknown' };
    out.set(id, { profile, model: t.model });
  }
  return out;
}

/**
 * Flowering wood for the taxa that had none until the taxon research of
 * November 2026, as that research entered it. Most are inferences and may
 * change; tests that depend on them fix them through this table, and
 * palette.test.ts checks that the table still matches the library.
 */
export const RESOLVED_WOOD = {
  'lonicera-henryi': 'current_season',
  'lonicera-periclymenum-graham-thomas': 'both',
  'trachelospermum-jasminoides': 'current_season',
  'hedera-helix': 'current_season',
  'rosa-the-generous-gardener': 'current_season',
  'vitis-coignetiae': 'current_season',
  'akebia-quinata': 'previous_season',
} as const satisfies Record<string, FloweringWood>;
