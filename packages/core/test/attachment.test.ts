import { describe, expect, it } from 'vitest';
import { assessAttachment, routeFilter } from '../src/attachment.ts';
import { makeHemisphereBower } from '../src/bower/hemisphere.ts';
import { analyseReach } from '../src/bower/reach.ts';
import type { SupportEdge } from '../src/bower/types.ts';
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

const cable = edge({});
const thickPost = edge({ kind: 'rod', gripDiameterMm: 178 });
const panel = edge({ kind: 'textured_panel', surface: 'textured', gripDiameterMm: 0 });
const timber = edge({ kind: 'timber', host: { type: 'member', id: 'rib' }, contact: 'prohibited', gripDiameterMm: 178 });
const timberTieOnly = edge({ kind: 'timber', host: { type: 'member', id: 'diagrid' }, contact: 'tie_only', gripDiameterMm: 76 });

const noLimit = unknown<number>('mm');
const limit = (mm: number) => provisional(mm, 'test stand-in', { unit: 'mm' });

// SIMULATION_KEY.md section 9, "Attachment exclusivity" and "No-fly zones".
describe('hard constraints', () => {
  it('lets nothing touch a prohibited surface, not even with a tie', () => {
    for (const m of ATTACHMENT_MECHANISM) expect(assessAttachment(m, timber, limit(500)).outcome, m).toBe('impossible');
  });

  it('never lets a shrub climb', () => {
    for (const e of [cable, thickPost, panel, timberTieOnly]) expect(assessAttachment('none', e, limit(500)).outcome).toBe('impossible');
  });

  it('never lets a rose attach itself: it needs a gardener', () => {
    expect(assessAttachment('scramble_and_tie', cable, limit(500)).outcome).toBe('needs_tie');
    expect(assessAttachment('scramble_and_tie', thickPost, limit(500)).outcome).toBe('needs_tie');
    expect(assessAttachment('scramble_and_tie', panel, limit(500)).outcome).toBe('impossible');
  });

  it('allows only ties on a tie-only surface', () => {
    for (const m of ['stem_twining', 'petiole_twining', 'tendril', 'aerial_root'] as AttachmentMechanism[]) {
      expect(assessAttachment(m, timberTieOnly, limit(500)).outcome, m).toBe('needs_tie');
    }
  });
});

describe('each mechanism by its own rule', () => {
  it('twiners, petioles and tendrils grasp slender supports within their limit', () => {
    for (const m of ['stem_twining', 'petiole_twining', 'tendril'] as AttachmentMechanism[]) {
      expect(assessAttachment(m, cable, limit(20)).outcome, m).toBe('self');
      expect(assessAttachment(m, thickPost, limit(20)).outcome, m).toBe('needs_tie');
    }
  });

  it('gives petioles and stems different answers on the same support when their limits differ', () => {
    const rod = edge({ kind: 'rod', gripDiameterMm: 10 });
    expect(assessAttachment('stem_twining', rod, limit(40)).outcome).toBe('self');
    expect(assessAttachment('petiole_twining', rod, limit(6)).outcome).toBe('needs_tie');
  });

  it('does not turn an aerial-root climber into a twiner', () => {
    expect(assessAttachment('aerial_root', cable, limit(500)).outcome).toBe('needs_tie');
    expect(assessAttachment('aerial_root', panel, limit(500)).outcome).toBe('self');
  });

  it('does not let encircling climbers cling to a flat panel', () => {
    for (const m of ['stem_twining', 'petiole_twining', 'tendril'] as AttachmentMechanism[]) {
      expect(assessAttachment(m, panel, limit(500)).outcome, m).toBe('impossible');
    }
  });
});

describe('unmeasured grasp limits', () => {
  it('refuses to guess: the verdict is unverified and says why', () => {
    const v = assessAttachment('stem_twining', cable, noLimit);
    expect(v.outcome).toBe('unverified');
    expect(v.restsOn).toContain('maximum graspable diameter is unknown');
  });

  it('records when a verdict rests on a provisional limit', () => {
    const v = assessAttachment('petiole_twining', cable, limit(6));
    expect(v.outcome).toBe('self');
    expect(v.restsOn.join(' ')).toContain('provisional_design_assumption');
  });

  it('does not need a limit for mechanisms that do not encircle', () => {
    expect(assessAttachment('aerial_root', panel, noLimit).outcome).toBe('self');
    expect(assessAttachment('scramble_and_tie', cable, noLimit).outcome).toBe('needs_tie');
  });
});

describe('routes follow from attachment', () => {
  const dome = makeHemisphereBower({ diameterM: 15 });

  it('gives a rose no route at all unless ties are allowed', () => {
    const unaided = analyseReach(dome, 'station.0', 100, routeFilter('scramble_and_tie', noLimit, ['self']));
    expect(unaided.nodesReached).toBe(1);
    const tied = analyseReach(dome, 'station.0', 100, routeFilter('scramble_and_tie', noLimit, ['self', 'needs_tie']));
    expect(tied.nodesReached).toBe(tied.nodesTotal);
  });

  it('keeps ivy off smooth cables unless it is tied', () => {
    const unaided = analyseReach(dome, 'station.0', 100, routeFilter('aerial_root', noLimit, ['self', 'unverified']));
    expect(unaided.nodesReached).toBe(1);
  });

  it('lets a twiner travel the cables only once its grasp limit is assumed or measured', () => {
    const strict = analyseReach(dome, 'station.0', 100, routeFilter('stem_twining', noLimit, ['self']));
    expect(strict.nodesReached).toBe(1);
    const assumed = analyseReach(dome, 'station.0', 100, routeFilter('stem_twining', limit(20), ['self']));
    expect(assumed.nodesReached).toBe(assumed.nodesTotal);
  });
});
