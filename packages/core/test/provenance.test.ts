import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { collectProvenance, provisional, sourced, summariseProvenance, unknown } from '../src/provenance.ts';
import { BUD_DOC_TERMS, BUD_END, BUD_FATE, BUD_STAGE, EVIDENCE_DOC_TERMS, EVIDENCE_STATUS } from '../src/vocab.ts';

const num = sourced(z.number());

describe('sourced values', () => {
  it('accepts an unknown with no value', () => {
    expect(num.safeParse({ value: null, status: 'unknown' }).success).toBe(true);
  });

  it('rejects a number labelled unknown: a guess cannot hide behind that label', () => {
    expect(num.safeParse({ value: 3, status: 'unknown' }).success).toBe(false);
  });

  it('rejects an empty value under any status that claims to know', () => {
    for (const status of ['measured', 'peer_reviewed', 'published_plant_profile', 'calibrated', 'provisional_design_assumption', 'design_target']) {
      expect(num.safeParse({ value: null, status, source: 'x', basis: 'x' }).success, status).toBe(false);
    }
  });

  it('lets a site-dependent value stay empty', () => {
    expect(num.safeParse({ value: null, status: 'site_dependent' }).success).toBe(true);
  });

  it('requires a source for evidence', () => {
    expect(num.safeParse({ value: 12, unit: 'm', status: 'published_plant_profile' }).success).toBe(false);
    expect(num.safeParse({ value: 12, unit: 'm', status: 'published_plant_profile', source: 'https://www.rhs.org.uk/' }).success).toBe(true);
  });

  it('requires a stated basis for assumptions and design targets', () => {
    expect(num.safeParse({ value: 2.6, status: 'provisional_design_assumption' }).success).toBe(false);
    expect(num.safeParse({ value: 0.3, status: 'design_target' }).success).toBe(false);
    expect(num.safeParse(provisional(2.6, 'carried over from the prototype', { unit: 'm/season', range: [1, 4] })).success).toBe(true);
  });

  it('rejects unrecognised keys, so a misspelt field cannot pass silently', () => {
    expect(num.safeParse({ value: null, status: 'unknown', sorce: 'x' }).success).toBe(false);
  });
});

describe('provenance report', () => {
  it('finds every sourced value in a nested object and counts them by status', () => {
    const taxon = {
      id: 'x',
      rhs: { height: { value: 12, unit: 'm', status: 'published_plant_profile', source: 'https://www.rhs.org.uk/' } },
      model: { extension: provisional(2.6, 'prototype default'), grasp: unknown<number>('mm') },
      list: [unknown<number>()],
    };
    const entries = collectProvenance('x', taxon);
    expect(entries.map((e) => e.path).sort()).toEqual(['list[0]', 'model.extension', 'model.grasp', 'rhs.height']);
    const counts = summariseProvenance(entries);
    expect(counts.unknown).toBe(2);
    expect(counts.provisional_design_assumption).toBe(1);
    expect(counts.published_plant_profile).toBe(1);
  });
});

describe('vocabulary reconciliation', () => {
  it('maps every evidence term used in the documents to canonical statuses', () => {
    for (const [term, targets] of Object.entries(EVIDENCE_DOC_TERMS)) {
      expect(targets.length, term).toBeGreaterThan(0);
      for (const t of targets) expect(EVIDENCE_STATUS, term).toContain(t);
    }
  });

  it('reaches every canonical status from at least one document term', () => {
    const reached = new Set(Object.values(EVIDENCE_DOC_TERMS).flat());
    for (const s of EVIDENCE_STATUS) expect(reached.has(s), s).toBe(true);
  });

  it('maps every bud term used in the documents to fate, stage or end', () => {
    for (const [term, m] of Object.entries(BUD_DOC_TERMS)) {
      const mapped = m.fate !== undefined || m.stage !== undefined || m.end !== undefined;
      expect(mapped || m.note !== undefined, term).toBe(true);
      if (m.fate) expect(BUD_FATE).toContain(m.fate);
      if (m.stage) expect(BUD_STAGE).toContain(m.stage);
      if (m.end) expect(BUD_END).toContain(m.end);
    }
  });
});
