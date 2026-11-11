import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { characterList, characterNumber, characterOf, characterRange, characterText, hasCharacter, morphologyProvenance, parseMorphology } from '../src/morphology.ts';
import { loadGrowthModels, loadMorphologies, loadTaxa } from '../src/node/load-taxa.ts';
import { summariseProvenance } from '../src/provenance.ts';
import { known } from '../src/sim/model.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const srcDir = fileURLToPath(new URL('../src', import.meta.url));
const folders = readdirSync(speciesDir).filter((name) => statSync(join(speciesDir, name)).isDirectory());
const present = folders.filter((name) => existsSync(join(speciesDir, name, 'morphology.json')));

// SIMULATION_KEY.md section 5, the per-species parameter dictionary: "Morphology: organ lengths, diameters,
// branch-angle distributions, internode distribution, bud placement, leaf area, floral raceme/flower
// architecture. Mostly unknown." Section 3: every number is classified, and sources are recorded.
describe('morphology files', () => {
  it('validate, every one that is present, and name the taxon whose folder they are in', () => {
    expect(present).toContain('wisteria-sinensis');
    const taxa = loadTaxa(speciesDir);
    for (const name of present) {
      const file = join(speciesDir, name, 'morphology.json');
      const morphology = parseMorphology(JSON.parse(readFileSync(file, 'utf8')), file);
      expect(morphology.taxonId, file).toBe(name);
      expect(taxa.has(name), file).toBe(true);
    }
    // the loader reads the same files and applies the same two checks
    expect([...loadMorphologies(speciesDir).keys()]).toEqual([...present].sort());
  });

  it('give every character that claims evidence an https source, and every choice a stated basis', () => {
    for (const morphology of loadMorphologies(speciesDir).values()) {
      for (const e of morphologyProvenance(morphology)) {
        const where = `${morphology.taxonId} ${e.path}`;
        if (e.status === 'unknown' || e.status === 'site_dependent') continue;
        expect(e.value, where).not.toBeNull();
        if (['measured', 'peer_reviewed', 'published_plant_profile', 'calibrated'].includes(e.status)) expect(e.source, where).toMatch(/^https:\/\//);
        else expect((e.basis ?? '').length, where).toBeGreaterThan(10);
        // a length says so in its key and carries the unit
        if (e.path.endsWith('M') && /[a-z]M$/.test(e.path)) expect(e.unit, where).toBe('m');
      }
    }
  });
});

describe('the worked example: Wisteria sinensis', () => {
  const wisteria = loadMorphologies(speciesDir).get('wisteria-sinensis')!;
  const profile = readFileSync(join(speciesDir, 'wisteria-sinensis', 'SPECIES_PROFILE.md'), 'utf8');
  const taxon = loadTaxa(speciesDir).get('wisteria-sinensis')!;

  it('has a dozen characters or more, each published and cited to a source the taxon already cites', () => {
    const entries = morphologyProvenance(wisteria);
    const published = entries.filter((e) => e.status === 'published_plant_profile');
    expect(published.length).toBeGreaterThanOrEqual(12);
    const cited = new Set(taxon.sources.map((s) => s.url));
    for (const e of published) {
      expect(cited.has(e.source!), `${e.path}: ${e.source}`).toBe(true);
      expect((e.basis ?? '').length, e.path).toBeGreaterThan(15);
    }
    const counts = summariseProvenance(entries);
    expect(counts.measured + counts.calibrated).toBe(0);
    // nothing in it is a guess dressed as a finding: what no source read gives is left unknown
    expect(counts.provisional_design_assumption).toBe(0);
    expect(characterOf(wisteria, 'fruit.colourRipe')).toEqual({ value: null, status: 'unknown' });
  });

  it('agrees with what the species profile and the taxon file say', () => {
    expect(profile).toContain('racemes to ~30 cm');
    expect(characterRange(wisteria, 'inflorescence.lengthM')[1]).toBeCloseTo(0.3, 1);
    expect(profile).toContain('lilac/mauve');
    expect(characterList(wisteria, 'flower.colour').sort()).toEqual(['lilac', 'mauve']);
    expect(characterText(wisteria, 'stem.twiningHandedness')).toBe(taxon.attachment.handedness!.value);
    expect(characterOf(wisteria, 'stem.twiningHandedness').source).toBe(taxon.attachment.handedness!.source);
    expect(characterText(wisteria, 'habit.lifeForm')).toContain(taxon.leafHabit.value!);
    expect(characterText(wisteria, 'flower.opensRelativeToLeaves')).toBe('before the leaves');
    expect(profile).toContain('opening before foliage');
  });

  it('gives a viewer the shape numbers it draws from: leaflets, their size, the flower, the pod', () => {
    expect(characterNumber(wisteria, 'leaf.leafletCount')).toBe(11);
    const [long0, long1] = characterRange(wisteria, 'leaf.leafletLengthM');
    const [wide0, wide1] = characterRange(wisteria, 'leaf.leafletWidthM');
    expect(long0).toBeLessThan(long1);
    // a leaflet is longer than it is wide
    expect(long0 / wide0).toBeGreaterThan(2);
    expect(long1 / wide1).toBeGreaterThan(2);
    expect(characterNumber(wisteria, 'flower.lengthM')).toBeCloseTo(0.0254, 3);
    expect(characterList(wisteria, 'leaf.leafletShape')).toEqual(['elliptical', 'ovate']);
    expect(characterRange(wisteria, 'fruit.seedCount')).toEqual([2, 3]);
  });

  it('gives the pod the same length as the growth model that sets it', () => {
    const model = loadGrowthModels(speciesDir).get('wisteria-sinensis')!;
    expect(characterRange(wisteria, 'fruit.lengthM')).toEqual(known(model, 'fruit.lengthM'));
    expect(characterOf(wisteria, 'fruit.lengthM').source).toBe(model.params['fruit.lengthM'].source);
    // the raceme hangs in both files
    expect(characterText(wisteria, 'inflorescence.held')).toBe('drooping');
    expect(model.names.flowerHeld).toBe('hanging');
  });
});

describe('reading a character', () => {
  const m = parseMorphology({
    schemaVersion: 1,
    taxonId: 'test-plant',
    characters: {
      'leaf.leafletCount': { value: 5, status: 'provisional_design_assumption', basis: 'test: counted on nothing' },
      'leaf.lengthM': { value: [0.04, 0.09], unit: 'm', status: 'provisional_design_assumption', basis: 'test: measured on nothing' },
      'flower.colour': { value: 'cream', status: 'provisional_design_assumption', basis: 'test: seen on nothing' },
      'flower.petal.colours': { value: ['cream', 'maroon'], status: 'provisional_design_assumption', basis: 'test: seen on nothing' },
      'fruit.lengthM': { value: null, unit: 'm', status: 'unknown' },
    },
  });

  it('returns it with its evidence status, in the shape it was entered', () => {
    expect(characterOf(m, 'leaf.leafletCount')).toMatchObject({ value: 5, status: 'provisional_design_assumption' });
    expect(characterNumber(m, 'leaf.leafletCount')).toBe(5);
    expect(characterRange(m, 'leaf.lengthM')).toEqual([0.04, 0.09]);
    expect(characterText(m, 'flower.colour')).toBe('cream');
    expect(characterList(m, 'flower.petal.colours')).toEqual(['cream', 'maroon']);
    expect(hasCharacter(m, 'leaf.leafletCount')).toBe(true);
    expect(hasCharacter(m, 'fruit.lengthM')).toBe(false);
    expect(hasCharacter(m, 'leaf.hairs')).toBe(false);
  });

  it('stops, naming the taxon and the key, where the character is absent, unknown or of another shape', () => {
    expect(() => characterOf(m, 'leaf.hairs')).toThrow(/test-plant has no morphological character "leaf\.hairs"/);
    // a key that only looks present, because every object has it
    expect(() => characterOf(m, 'toString')).toThrow(/test-plant has no morphological character "toString"/);
    expect(() => characterNumber(m, 'fruit.lengthM')).toThrow(/test-plant.*"fruit\.lengthM" is recorded as unknown/);
    expect(() => characterNumber(m, 'leaf.lengthM')).toThrow(/test-plant.*"leaf\.lengthM" is \[0\.04,0\.09\], not a number/);
    expect(() => characterRange(m, 'leaf.leafletCount')).toThrow(/not a \[low, high\] range/);
    expect(() => characterText(m, 'flower.petal.colours')).toThrow(/not a word or phrase/);
    expect(() => characterList(m, 'flower.colour')).toThrow(/not a list of words/);
    // an unknown is still there to be asked about: it is the number that is missing, not the entry
    expect(characterOf(m, 'fruit.lengthM')).toEqual({ value: null, unit: 'm', status: 'unknown' });
  });
});

// README working rules; SIMULATION_KEY.md section 3. The same rules as every other sourced value.
describe('morphology schema guards', () => {
  const file = (characters: unknown, rest: Record<string, unknown> = {}) => ({ schemaVersion: 1, taxonId: 'test-plant', characters, ...rest });
  const ok = { value: 5, status: 'provisional_design_assumption', basis: 'test' };

  it('refuses a bare value, a value with no status, and a number labelled unknown', () => {
    expect(() => parseMorphology(file({ 'leaf.leafletCount': 5 }))).toThrow();
    expect(() => parseMorphology(file({ 'leaf.leafletCount': { value: 5 } }))).toThrow();
    expect(() => parseMorphology(file({ 'leaf.leafletCount': { value: 5, status: 'unknown' } }))).toThrow(/must not carry a value/);
    expect(() => parseMorphology(file({ 'leaf.leafletCount': { value: null, status: 'published_plant_profile', source: 'https://example.org' } }))).toThrow(/needs a value/);
  });

  it('refuses evidence with no source and a choice with no basis', () => {
    expect(() => parseMorphology(file({ 'leaf.leafletCount': { value: 5, status: 'published_plant_profile' } }))).toThrow(/needs a source/);
    expect(() => parseMorphology(file({ 'leaf.leafletCount': { value: 5, status: 'provisional_design_assumption' } }))).toThrow(/needs a basis/);
  });

  it('refuses a value that is not a number, a range, a word or a list of words', () => {
    for (const value of [true, { low: 1, high: 2 }, [1, 2, 3], [3, 1], '', [], ['lilac', 3]]) {
      expect(() => parseMorphology(file({ 'leaf.thing': { ...ok, value } })), JSON.stringify(value)).toThrow();
    }
    for (const value of [0, -2.5, [1, 2], [2, 2], 'lilac', ['lilac'], ['lilac', 'mauve', 'white']]) {
      expect(() => parseMorphology(file({ 'leaf.thing': { ...ok, value } })), JSON.stringify(value)).not.toThrow();
    }
  });

  it('refuses a key that is not dotted, an unrecognised field, and a file of another version or with no taxon', () => {
    for (const key of ['leafletCount', 'Leaf.count', 'leaf count', 'leaf..count', '.leaf', 'leaf.', 'leaf.1st']) {
      expect(() => parseMorphology(file({ [key]: ok })), key).toThrow();
    }
    for (const key of ['leaf.leafletCount', 'flower.standard.colour', 'leaf.leaflet_count', 'fruit.lengthM']) {
      expect(() => parseMorphology(file({ [key]: ok })), key).not.toThrow();
    }
    expect(() => parseMorphology(file({}, { notes: 'free text' }))).toThrow();
    expect(() => parseMorphology(file({ 'leaf.leafletCount': { ...ok, colour: 'green' } }))).toThrow();
    expect(() => parseMorphology({ schemaVersion: 2, taxonId: 'test-plant', characters: {} })).toThrow();
    expect(() => parseMorphology({ schemaVersion: 1, taxonId: 'Test Plant', characters: {} })).toThrow();
    expect(() => parseMorphology({ schemaVersion: 1, characters: {} })).toThrow();
    expect(() => parseMorphology(file({}), 'species/x/morphology.json')).not.toThrow();
    expect(() => parseMorphology({}, 'species/x/morphology.json')).toThrow(/species\/x\/morphology\.json is not a valid morphology file/);
  });
});

// index.ts: "Portable core: nothing here touches the file system or a renderer." The viewer imports
// @horti/core in the browser, so nothing outside src/node/ may import from Node.
describe('the portable core', () => {
  const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? (name === 'node' ? [] : sources(join(dir, name))) : name.endsWith('.ts') ? [join(dir, name)] : []));

  it('imports nothing from Node outside src/node', () => {
    const files = sources(srcDir);
    expect(files.some((f) => f.endsWith('morphology.ts'))).toBe(true);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/from\s+['"](node:|fs|path|url)['"\/]/);
  });

  it('offers morphology from its index, and keeps the loader that reads folders out of it', () => {
    const index = readFileSync(join(srcDir, 'index.ts'), 'utf8');
    expect(index).toContain("export * from './morphology.ts';");
    expect(index).not.toMatch(/^(export|import)\b.*\.\/node\//m);
  });
});
