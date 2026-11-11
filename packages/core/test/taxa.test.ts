import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTaxa } from '../src/node/load-taxa.ts';
import { collectProvenance, summariseProvenance } from '../src/provenance.ts';
import { parseTaxon } from '../src/taxon.ts';
import type { AttachmentMechanism } from '../src/vocab.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const taxa = loadTaxa(speciesDir);

// DEVELOPMENT_GUIDE.md stage 3 and CONSTRAINTS_AND_PHENOLOGY.md section 2.
const EXPECTED_MECHANISM: Record<string, AttachmentMechanism> = {
  'wisteria-sinensis': 'stem_twining',
  'wisteria-floribunda-macrobotrys': 'stem_twining',
  'lonicera-henryi': 'stem_twining',
  'lonicera-periclymenum-graham-thomas': 'stem_twining',
  'trachelospermum-jasminoides': 'stem_twining',
  'akebia-quinata': 'stem_twining',
  'thunbergia-alata': 'stem_twining',
  'clematis-cirrhosa-freckles': 'petiole_twining',
  'clematis-viticella-etoile-violette': 'petiole_twining',
  'clematis-princess-diana': 'petiole_twining',
  'clematis-armandi': 'petiole_twining',
  'vitis-coignetiae': 'tendril',
  'hedera-helix': 'aerial_root',
  'hydrangea-anomala-subsp-petiolaris': 'aerial_root',
  'campsis-x-tagliabueana-madame-galen': 'aerial_root',
  'rosa-the-generous-gardener': 'scramble_and_tie',
  'sarcococca-confusa': 'none',
};

describe('taxon library', () => {
  it('holds the 17 candidate taxa, each valid and beside its prose profile', () => {
    expect([...taxa.keys()].sort()).toEqual(Object.keys(EXPECTED_MECHANISM).sort());
    for (const id of taxa.keys()) expect(existsSync(join(speciesDir, id, 'SPECIES_PROFILE.md')), id).toBe(true);
  });

  it('assigns every taxon the attachment class the specification gives it', () => {
    for (const [id, mechanism] of Object.entries(EXPECTED_MECHANISM)) expect(taxa.get(id)!.attachment.mechanism, id).toBe(mechanism);
  });

  it('covers all six attachment classes', () => {
    expect(new Set([...taxa.values()].map((t) => t.attachment.mechanism)).size).toBe(6);
  });

  it('has exactly one non-climber, and it is a shrub', () => {
    const shrubs = [...taxa.values()].filter((t) => t.lifeForm === 'shrub');
    expect(shrubs.map((t) => t.id)).toEqual(['sarcococca-confusa']);
  });

  it('never lets the rose attach itself', () => {
    expect(taxa.get('rosa-the-generous-gardener')!.attachment.selfAttaching).toBe(false);
  });

  it('gives the two wisterias opposite handedness', () => {
    expect(taxa.get('wisteria-sinensis')!.attachment.handedness!.value).toBe('right_handed');
    expect(taxa.get('wisteria-floribunda-macrobotrys')!.attachment.handedness!.value).toBe('left_handed');
  });

  it('states handedness for twiners only, and admits where it is not known', () => {
    for (const t of taxa.values()) {
      expect(t.attachment.handedness !== undefined, t.id).toBe(t.attachment.mechanism === 'stem_twining');
    }
    const trach = taxa.get('trachelospermum-jasminoides')!.attachment.handedness!;
    expect(trach.value).toBeNull();
    expect(trach.status).toBe('unknown');
    // inferred from the genus, so it must not be presented as published
    expect(taxa.get('lonicera-henryi')!.attachment.handedness!.status).toBe('provisional_design_assumption');
  });

  it('separates old-wood from current-season flowering', () => {
    const wood = (id: string) => taxa.get(id)!.flowering.wood.value;
    expect(wood('wisteria-sinensis')).toBe('previous_season');
    expect(wood('clematis-cirrhosa-freckles')).toBe('previous_season');
    expect(wood('clematis-armandi')).toBe('previous_season');
    expect(wood('hydrangea-anomala-subsp-petiolaris')).toBe('previous_season');
    expect(wood('clematis-viticella-etoile-violette')).toBe('current_season');
    expect(wood('clematis-princess-diana')).toBe('current_season');
    expect(wood('campsis-x-tagliabueana-madame-galen')).toBe('current_season');
  });

  it('treats Thunbergia as replanted yearly in the UK and everything else as perennial', () => {
    for (const t of taxa.values()) expect(t.ukCultivation, t.id).toBe(t.id === 'thunbergia-alata' ? 'annual_replant' : 'perennial');
  });

  it('carries the invasive-status flags found for Akebia and Lonicera henryi', () => {
    expect(taxa.get('akebia-quinata')!.regional.some((r) => r.region === 'Great Britain')).toBe(true);
    expect(taxa.get('lonicera-henryi')!.regional.some((r) => r.region === 'Great Britain')).toBe(true);
  });
});

describe('provenance of the library', () => {
  const entries = [...taxa.values()].flatMap((t) => collectProvenance(t.id, t));
  const counts = summariseProvenance(entries);

  it('has no measured or calibrated value yet: nothing has been observed on a Bower', () => {
    expect(counts.measured).toBe(0);
    expect(counts.calibrated).toBe(0);
  });

  it('leaves every grasp diameter unknown instead of inventing one', () => {
    for (const t of taxa.values()) {
      expect(t.attachment.maxGraspDiameterMm.value, t.id).toBeNull();
      expect(t.attachment.maxGraspDiameterMm.status, t.id).toBe('unknown');
    }
  });

  it('gives every published value a source', () => {
    for (const e of entries.filter((x) => x.status === 'published_plant_profile' || x.status === 'peer_reviewed')) {
      expect(e.source, `${e.owner} ${e.path}`).toMatch(/^https?:\/\//);
    }
  });

  it('keeps RHS height bands as bands, not route lengths', () => {
    const h = taxa.get('wisteria-sinensis')!.size.rhsUltimateHeightM;
    expect(h.value).toEqual([12, null]);
    expect(h.unit).toBe('m');
    expect(h.status).toBe('published_plant_profile');
  });
});

describe('taxon schema guards', () => {
  const base = () => JSON.parse(JSON.stringify(taxa.get('clematis-armandi')!));

  it('refuses handedness on a plant that is not a stem twiner', () => {
    const t = base();
    t.attachment.handedness = { value: 'right_handed', status: 'provisional_design_assumption', basis: 'copied from wisteria' };
    expect(() => parseTaxon(t)).toThrow(/stem twiners only/);
  });

  it('refuses a bare number where a sourced value belongs', () => {
    const t = base();
    t.attachment.maxGraspDiameterMm = 6;
    expect(() => parseTaxon(t)).toThrow();
  });

  it('refuses a number labelled unknown', () => {
    const t = base();
    t.attachment.maxGraspDiameterMm = { value: 6, unit: 'mm', status: 'unknown' };
    expect(() => parseTaxon(t)).toThrow(/must not carry a value/);
  });

  it('refuses unrecognised fields', () => {
    const t = base();
    t.growthRateMPerYear = 3;
    expect(() => parseTaxon(t)).toThrow();
  });
});
