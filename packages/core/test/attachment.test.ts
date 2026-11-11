import { describe, expect, it } from 'vitest';
import { assessAttachment, routeFilter } from '../src/attachment.ts';
import { makeHemisphereBower } from '../src/bower/hemisphere.ts';
import { analyseReach } from '../src/bower/reach.ts';
import type { SupportEdge } from '../src/bower/types.ts';
import { makeVaultBower } from '../src/bower/vault.ts';
import { Polyline } from '../src/math/polyline.ts';
import { v3 } from '../src/math/vec3.ts';
import { provisional, unknown } from '../src/provenance.ts';
import { ATTACHMENT_MECHANISM, type AttachmentMechanism } from '../src/vocab.ts';

const edge = (over: Partial<SupportEdge>): SupportEdge => ({
  id: 'e',
  from: 'a',
  to: 'b',
  curve: new Polyline([v3(0, 0, 0), v3(0, 0, 1)]),
  host: { type: 'support', id: 's' },
  kind: 'cable',
  gripDiameterMm: 5,
  surface: 'smooth',
  contact: 'permitted',
  zones: [],
  ...over,
});

const timber = (gripDiameterMm: number, over: Partial<SupportEdge> = {}) => edge({ kind: 'timber', host: { type: 'member', id: 'm' }, gripDiameterMm, surface: 'textured', ...over });

const cable = edge({});
const rib = timber(178);
const lath = timber(25);
const planedRib = timber(178, { surface: 'smooth' });
const excludedJoint = timber(178, { contact: 'prohibited' });
const tieOnlyBeam = timber(102, { contact: 'tie_only' });

const noLimit = unknown<number>('mm');
const limit = (mm: number) => provisional(mm, 'test stand-in', { unit: 'mm' });
const ENCIRCLERS: AttachmentMechanism[] = ['stem_twining', 'petiole_twining', 'tendril'];

// KEY.md section 5: the timber is the growing surface.
describe('timber is a growing surface', () => {
  it('lets a twiner take a glulam rib unaided when it can pass round it', () => {
    expect(assessAttachment('stem_twining', rib, limit(200)).outcome).toBe('self');
  });

  it('has a gardener tie the leader in where the glulam is too stout to twine', () => {
    const v = assessAttachment('stem_twining', rib, limit(60));
    expect(v.outcome).toBe('needs_tie');
    expect(v.reason).toContain('too thick');
  });

  it('lets aerial roots cling to timber, and says that rests on an assumption', () => {
    const v = assessAttachment('aerial_root', rib, noLimit);
    expect(v.outcome).toBe('self');
    expect(v.restsOn.length).toBe(1);
  });

  it('gives fine plants a hold on a slender timber lath as well as on a cable', () => {
    for (const m of ENCIRCLERS) {
      expect(assessAttachment(m, lath, limit(30)).outcome, m).toBe('self');
      expect(assessAttachment(m, cable, limit(30)).outcome, m).toBe('self');
    }
  });
});

// SIMULATION_KEY.md section 9, "Attachment exclusivity" and "No-fly zones".
describe('absolutes', () => {
  it('lets nothing attach where a project has declared an exclusion, not even with a tie', () => {
    for (const m of ATTACHMENT_MECHANISM) expect(assessAttachment(m, excludedJoint, limit(500)).outcome, m).toBe('impossible');
  });

  it('never lets a shrub climb', () => {
    for (const e of [cable, rib, lath, tieOnlyBeam]) expect(assessAttachment('none', e, limit(500)).outcome).toBe('impossible');
  });

  it('never lets a rose attach itself: it needs a gardener', () => {
    for (const e of [cable, rib, lath]) expect(assessAttachment('scramble_and_tie', e, limit(500)).outcome).toBe('needs_tie');
  });

  it('allows only ties where a project says ties only', () => {
    for (const m of [...ENCIRCLERS, 'aerial_root'] as AttachmentMechanism[]) {
      expect(assessAttachment(m, tieOnlyBeam, limit(500)).outcome, m).toBe('needs_tie');
    }
  });
});

describe('each mechanism by its own rule', () => {
  it('twiners, petioles and tendrils grasp what is within their limit and nothing stouter', () => {
    for (const m of ENCIRCLERS) {
      expect(assessAttachment(m, cable, limit(20)).outcome, m).toBe('self');
      expect(assessAttachment(m, rib, limit(20)).outcome, m).toBe('needs_tie');
    }
  });

  it('gives a leaf stalk and a stem different answers on the same lath when their limits differ', () => {
    expect(assessAttachment('stem_twining', lath, limit(40)).outcome).toBe('self');
    expect(assessAttachment('petiole_twining', lath, limit(6)).outcome).toBe('needs_tie');
  });

  it('does not turn an aerial-root climber into a twiner', () => {
    expect(assessAttachment('aerial_root', cable, limit(500)).outcome).toBe('needs_tie');
    expect(assessAttachment('aerial_root', planedRib, limit(500)).outcome).toBe('needs_tie');
  });
});

describe('unmeasured grasp limits', () => {
  it('refuses to guess: the verdict is unverified and says why', () => {
    for (const e of [cable, rib]) {
      const v = assessAttachment('stem_twining', e, noLimit);
      expect(v.outcome).toBe('unverified');
      expect(v.restsOn).toContain('maximum graspable diameter is unknown');
    }
  });

  it('records when a verdict rests on a provisional limit', () => {
    const v = assessAttachment('petiole_twining', cable, limit(6));
    expect(v.outcome).toBe('self');
    expect(v.restsOn.join(' ')).toContain('provisional_design_assumption');
  });

  it('does not need a limit for mechanisms that do not encircle', () => {
    expect(assessAttachment('aerial_root', rib, noLimit).outcome).toBe('self');
    expect(assessAttachment('scramble_and_tie', cable, noLimit).outcome).toBe('needs_tie');
  });
});

describe('routes follow from attachment', () => {
  const dome = makeHemisphereBower({ diameterM: 15 });
  const vault = makeVaultBower();
  const all = (r: { nodesReached: number; nodesTotal: number }) => r.nodesReached === r.nodesTotal;

  it('gives a rose no route at all unless it is tied', () => {
    expect(analyseReach(dome, 'station.0', 100, routeFilter('scramble_and_tie', noLimit, ['self'])).nodesReached).toBe(1);
    expect(all(analyseReach(dome, 'station.0', 100, routeFilter('scramble_and_tie', noLimit, ['self', 'needs_tie'])))).toBe(true);
  });

  it('takes ivy everywhere over the timber, unaided, without using a single cable', () => {
    const r = analyseReach(dome, 'station.0', 100, routeFilter('aerial_root', noLimit, ['self']));
    expect(all(r)).toBe(true);
    const usable = routeFilter('aerial_root', noLimit, ['self']);
    for (const e of dome.graph.edges.values()) expect(usable(e), e.id).toBe(e.kind === 'timber');
  });

  it('lets a twiner with a slender grasp travel only where a gardener leads it up the glulam', () => {
    // the plant stands at the foot of a 178 mm rib leg: with a 20 mm grasp it cannot start unaided
    const unaided = analyseReach(vault, 'station.0', 100, routeFilter('stem_twining', limit(20), ['self']));
    expect(unaided.nodesReached).toBe(1);
    const trained = analyseReach(vault, 'station.0', 100, routeFilter('stem_twining', limit(20), ['self', 'needs_tie']));
    expect(all(trained)).toBe(true);
  });

  it('lets a twiner that can pass round the rib climb the whole vault unaided', () => {
    expect(all(analyseReach(vault, 'station.0', 100, routeFilter('stem_twining', limit(200), ['self'])))).toBe(true);
  });

  it('stops a twiner everywhere while its grasp limit is neither assumed nor measured', () => {
    expect(analyseReach(vault, 'station.0', 100, routeFilter('stem_twining', noLimit, ['self'])).nodesReached).toBe(1);
  });
});
