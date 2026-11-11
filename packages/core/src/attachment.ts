/**
 * Can a plant hold a given stretch of support, and how?
 * CONSTRAINTS_AND_PHENOLOGY.md section 2; SIMULATION_KEY.md section 4.3.
 *
 * Each attachment mechanism is assessed by its own rule. Nothing is shared
 * between them except the hard constraints that apply to every plant: a
 * prohibited surface is never touched, and a non-climber never climbs.
 *
 * The largest support a mechanism can grasp unaided has not been measured for
 * any taxon here. Where the answer turns on that number the verdict says so
 * (`unverified`) instead of guessing. A scenario may supply a provisional
 * limit; the verdict then records that it rests on an assumption.
 */
import type { SupportEdge } from './bower/types.ts';
import type { Sourced } from './provenance.ts';
import type { AttachmentMechanism } from './vocab.ts';

export type AttachmentOutcome =
  /** The plant can take hold by itself. */
  | 'self'
  /** Self-attachment depends on a grasp limit nobody has measured. */
  | 'unverified'
  /** The plant cannot hold on, but a gardener may legitimately tie it here. */
  | 'needs_tie'
  /** Not possible by any means: forbidden surface, or a plant that does not climb. */
  | 'impossible';

export interface AttachmentVerdict {
  outcome: AttachmentOutcome;
  /** Plain-language reason, written for an architect or gardener. */
  reason: string;
  /** Assumptions the verdict depends on, for the provenance report. */
  restsOn: string[];
}

/** Supports a tie can be made to. A flat panel offers nothing to tie round. */
const TIEABLE: ReadonlySet<SupportEdge['kind']> = new Set(['cable', 'rod', 'rail', 'mesh', 'trellis', 'tie_point', 'timber']);
/** Supports with a slender element a stem, petiole or tendril can pass round. */
const ENCIRCLABLE: ReadonlySet<SupportEdge['kind']> = new Set(['cable', 'rod', 'rail', 'mesh', 'trellis']);

const verdict = (outcome: AttachmentOutcome, reason: string, restsOn: string[] = []): AttachmentVerdict => ({ outcome, reason, restsOn });

function tieOrNothing(edge: SupportEdge, why: string): AttachmentVerdict {
  return TIEABLE.has(edge.kind) ? verdict('needs_tie', `${why}; a gardener can tie it in here`) : verdict('impossible', `${why}, and a ${edge.kind.replace('_', ' ')} offers nothing to tie to`);
}

/** Grasping by passing round the support: twining stems, twining petioles and tendrils. */
function encircle(what: string, edge: SupportEdge, limit: Sourced<number>): AttachmentVerdict {
  if (!ENCIRCLABLE.has(edge.kind)) return tieOrNothing(edge, `${what} cannot pass round a ${edge.kind.replace('_', ' ')}`);
  const d = edge.gripDiameterMm;
  if (limit.value === null) {
    return verdict('unverified', `${what} may grasp this ${d} mm ${edge.kind}, but the largest diameter it can hold has not been measured`, ['maximum graspable diameter is unknown']);
  }
  const restsOn = limit.status === 'measured' || limit.status === 'calibrated' || limit.status === 'peer_reviewed' ? [] : [`maximum graspable diameter taken as ${limit.value} mm (${limit.status})`];
  if (d <= limit.value) return verdict('self', `${what} can grasp a ${d} mm ${edge.kind} (limit ${limit.value} mm)`, restsOn);
  const tied = tieOrNothing(edge, `a ${d} mm ${edge.kind} is too thick for ${what} to grasp (limit ${limit.value} mm)`);
  return { ...tied, restsOn };
}

/**
 * Assess one mechanism against one support edge.
 * `maxGraspDiameterMm` is the taxon's value, or a scenario's provisional
 * stand-in for it; it is ignored by mechanisms that do not encircle.
 */
export function assessAttachment(mechanism: AttachmentMechanism, edge: SupportEdge, maxGraspDiameterMm: Sourced<number>): AttachmentVerdict {
  // hard constraints first: they hold whatever the plant and whoever is asking
  if (mechanism === 'none') return verdict('impossible', 'a shrub is not a climber and is never routed into the climbing graph');
  if (edge.contact === 'prohibited') return verdict('impossible', 'contact with this surface is prohibited');

  if (mechanism === 'scramble_and_tie') return tieOrNothing(edge, 'a scrambling cane cannot hold on by itself');
  if (edge.contact === 'tie_only') return tieOrNothing(edge, 'plants may only be tied to this surface, not left to attach themselves');

  switch (mechanism) {
    case 'stem_twining':
      return encircle('a twining stem', edge, maxGraspDiameterMm);
    case 'petiole_twining':
      return encircle('a twining leaf stalk', edge, maxGraspDiameterMm);
    case 'tendril':
      return encircle('a tendril', edge, maxGraspDiameterMm);
    case 'aerial_root':
      if (edge.surface === 'textured') return verdict('self', `aerial roots can cling to a textured ${edge.kind.replace('_', ' ')}`);
      return tieOrNothing(edge, `aerial roots cannot cling to a smooth ${edge.kind.replace('_', ' ')}`);
  }
}

/** An edge filter for route finding: which edges this plant may use at all, and on what terms. */
export function routeFilter(
  mechanism: AttachmentMechanism,
  maxGraspDiameterMm: Sourced<number>,
  accept: readonly AttachmentOutcome[],
): (edge: SupportEdge) => boolean {
  return (edge) => accept.includes(assessAttachment(mechanism, edge, maxGraspDiameterMm).outcome);
}
