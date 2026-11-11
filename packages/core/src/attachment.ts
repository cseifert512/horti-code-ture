/**
 * Can a plant hold a given stretch of route, and how?
 * CONSTRAINTS_AND_PHENOLOGY.md section 2; SIMULATION_KEY.md section 4.3.
 *
 * Routes are timber members and slender cables, and a plant may use any of
 * them that its attachment mechanism can hold. Each mechanism is assessed by
 * its own rule. Only two things are absolute: a non-climber never climbs, and
 * nothing attaches where a project has declared an exclusion.
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
  /** The plant cannot hold on here, but a gardener can tie it in. */
  | 'needs_tie'
  /** Not possible by any means: a declared exclusion, or a plant that does not climb. */
  | 'impossible';

export interface AttachmentVerdict {
  outcome: AttachmentOutcome;
  /** Plain-language reason, written for an architect or gardener. */
  reason: string;
  /** Assumptions the verdict depends on, for the provenance report. */
  restsOn: string[];
}

const verdict = (outcome: AttachmentOutcome, reason: string, restsOn: string[] = []): AttachmentVerdict => ({ outcome, reason, restsOn });

const describe = (edge: SupportEdge): string => {
  const d = Math.round(edge.gripDiameterMm);
  if (edge.kind === 'timber') return `a timber member ${d} mm round`;
  if (edge.kind === 'cable') return `a ${d} mm cable`;
  return 'a tie point';
};

const tie = (why: string, restsOn: string[] = []): AttachmentVerdict => verdict('needs_tie', `${why}; a gardener can tie it in here`, restsOn);

/** Grasping by passing round the support: twining stems, twining leaf stalks and tendrils. */
function encircle(what: string, edge: SupportEdge, limit: Sourced<number>): AttachmentVerdict {
  if (edge.kind === 'tie_point') return tie(`${what} cannot pass round a tie point`);
  const d = edge.gripDiameterMm;
  if (limit.value === null) {
    return verdict('unverified', `${what} may grasp ${describe(edge)}, but the largest diameter it can hold has not been measured`, ['maximum graspable diameter is unknown']);
  }
  const restsOn = limit.status === 'measured' || limit.status === 'calibrated' || limit.status === 'peer_reviewed' ? [] : [`maximum graspable diameter taken as ${limit.value} mm (${limit.status})`];
  if (d <= limit.value) return verdict('self', `${what} can grasp ${describe(edge)} (limit ${limit.value} mm)`, restsOn);
  return tie(`${describe(edge)} is too thick for ${what} to grasp (limit ${limit.value} mm)`, restsOn);
}

/**
 * Assess one mechanism against one stretch of route.
 * `maxGraspDiameterMm` is the taxon's value, or a scenario's provisional
 * stand-in for it; mechanisms that do not encircle ignore it.
 */
export function assessAttachment(mechanism: AttachmentMechanism, edge: SupportEdge, maxGraspDiameterMm: Sourced<number>): AttachmentVerdict {
  // absolutes first: they hold whatever the plant and whoever is asking
  if (mechanism === 'none') return verdict('impossible', 'a shrub is not a climber and is never routed into the climbing graph');
  if (edge.contact === 'prohibited') return verdict('impossible', 'this stretch is a declared exclusion: nothing attaches here');

  if (mechanism === 'scramble_and_tie') return tie('a scrambling cane cannot hold on by itself');
  if (edge.contact === 'tie_only') return tie('plants may only be tied here, not left to attach themselves');

  switch (mechanism) {
    case 'stem_twining':
      return encircle('a twining stem', edge, maxGraspDiameterMm);
    case 'petiole_twining':
      return encircle('a twining leaf stalk', edge, maxGraspDiameterMm);
    case 'tendril':
      return encircle('a tendril', edge, maxGraspDiameterMm);
    case 'aerial_root':
      if (edge.kind === 'timber' && edge.surface === 'textured') {
        return verdict('self', 'aerial roots cling to timber', ['clinging to this timber finish is assumed, not measured']);
      }
      return tie(`aerial roots cannot cling to ${edge.kind === 'timber' ? 'a smooth timber finish' : describe(edge)}`);
  }
}

/** An edge filter for route finding: which stretches this plant may use, and on what terms. */
export function routeFilter(
  mechanism: AttachmentMechanism,
  maxGraspDiameterMm: Sourced<number>,
  accept: readonly AttachmentOutcome[],
): (edge: SupportEdge) => boolean {
  return (edge) => accept.includes(assessAttachment(mechanism, edge, maxGraspDiameterMm).outcome);
}
