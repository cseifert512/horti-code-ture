/**
 * Design targets: what the specification asks a planted Bower to achieve.
 *
 * They are choices made by the project, not facts about plants, and they carry
 * the `design_target` status so that a report can never present one as a
 * finding. A run is tested against them; they do not steer it.
 */
import type { Sourced } from './provenance.ts';

/**
 * KEY.md section 6: "test 25-40% of selected visually prominent areas with
 * retained winter evergreen coverage, with exposed timber intentionally visible
 * elsewhere."
 */
export const WINTER_EVERGREEN_COVER: Sourced<[number, number]> = {
  value: [0.25, 0.4],
  unit: 'share of the structure seen from a viewpoint',
  status: 'design_target',
  basis: 'KEY.md section 6. A design target, not a biological fact: the range is to be tested, and timber is meant to stay visible elsewhere.',
};

/** The month in which winter cover is read: mid January, when deciduous plants are bare. */
export const WINTER_MONTH = 1;
