import { describe, expect, it } from 'vitest';
import { HEMISPHERE_VIEWPOINTS, VAULT_VIEWPOINTS, parsePlantingPlan } from '@horti/core';
import { ARBOUR_EXAMPLE, openDesign } from '../src/design/open.ts';
import { type Picks, VAULT_PICKER_STATIONS, encodePicks, pickerShell, planFromPicks, plantingFileName, plantingFileText, readPickerAddress, stationsOf, structureFileName, structureFileText, taxaOffered, writePickerAddress } from '../src/design/picker.ts';
import { growDesign, growable } from '../src/plant/scenario.ts';

const taxa = growable();
const vault = pickerShell('vault');
const hemisphere = pickerShell('hemisphere');
const arbour = (() => {
  const r = openDesign(ARBOUR_EXAMPLE);
  if (!r.ok) throw new Error(r.error);
  return r.design;
})();
const picks = (entries: [string, string][]): Picks => new Map(entries);
const plan = (p: Picks, bower = vault) => {
  const r = planFromPicks(p, bower, taxa);
  if (!r.ok) throw new Error(r.error);
  return r.plan;
};

// PROJECT_CONTEXT.md section 3.6 (transferable design capability): a planting is
// chosen for any structure, built-in or designed, and grown by the core from a
// planting plan exactly as one read from a file (DEVELOPMENT_GUIDE.md stage 5).
describe('the plant picker', () => {
  it('offers every growable taxon, by its botanical label, and says which looks are stand-ins', () => {
    const offered = taxaOffered(taxa, (id) => id === 'akebia-quinata');
    expect(offered.map((t) => t.id).sort()).toEqual([...taxa.keys()].sort());
    for (const t of offered) expect(t.label).toBe(taxa.get(t.id)!.profile.names.label);
    expect(offered.filter((t) => t.provisional).map((t) => t.id)).toEqual(['akebia-quinata']);
  });

  it('offers all ten rib feet of the vault and the twelve stations of the hemisphere, each with its note', () => {
    expect(VAULT_PICKER_STATIONS).toHaveLength(10);
    const feet = stationsOf(vault);
    expect(feet.map((s) => s.id)).toEqual(Array.from({ length: 10 }, (_, i) => `station.${i}`));
    expect(feet[0]!.note).toBe('west foot of rib 0');
    expect(feet[3]!.note).toBe('east foot of rib 1');
    expect(stationsOf(hemisphere)).toHaveLength(12);
    expect(stationsOf(arbour.bower).map((s) => s.id)).toEqual(['bed.sw', 'bed.s', 'bed.ne', 'bed.n']);
  });

  it('builds a plan the core accepts, one plant per station chosen, in the stations order', () => {
    const p = plan(picks([['station.6', 'hedera-helix'], ['station.2', 'rosa-the-generous-gardener']]));
    expect(parsePlantingPlan(JSON.parse(plantingFileText(p)))).toEqual(p);
    expect(p.plants.map((x) => x.stationId)).toEqual(['station.2', 'station.6']);
    expect(new Set(p.plants.map((x) => x.plantId)).size).toBe(2);
  });

  it('refuses an empty choice, and passes on what the core refuses in its own words', () => {
    const empty = planFromPicks(new Map(), vault, taxa);
    expect(empty.ok).toBe(false);
    const wrong = planFromPicks(picks([['bed.sw', 'hedera-helix']]), vault, taxa);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toMatch(/has no root station "bed.sw"/);
  });

  it('grows on the vault, the hemisphere and the arbour through the same path as a design file', () => {
    const cases = [
      { bower: vault, viewpoints: VAULT_VIEWPOINTS, p: picks([['station.2', 'rosa-the-generous-gardener'], ['station.7', 'hedera-helix']]) },
      {
        bower: hemisphere,
        viewpoints: HEMISPHERE_VIEWPOINTS,
        p: picks([['station.0', 'wisteria-sinensis'], ['station.3', 'clematis-armandi'], ['station.6', 'trachelospermum-jasminoides'], ['station.9', 'thunbergia-alata']]),
      },
      { bower: arbour.bower, viewpoints: arbour.viewpoints, p: picks([['bed.sw', 'lonicera-periclymenum-graham-thomas'], ['bed.ne', 'hydrangea-anomala-subsp-petiolaris']]) },
    ];
    for (const c of cases) {
      const run = growDesign({ bower: c.bower, plan: plan(c.p, c.bower), viewpoints: c.viewpoints }, 'trained', 1);
      expect(run.data.plants.map((x) => x.taxonId).sort()).toEqual([...c.p.values()].sort());
      expect(run.bower).toBe(c.bower);
    }
  });

  it('saves a plan, and a built-in shell as a description, that open again as a design', () => {
    for (const [bower, viewpoints, p] of [
      [vault, VAULT_VIEWPOINTS, picks([['station.9', 'hedera-helix'], ['station.0', 'rosa-the-generous-gardener']])],
      [hemisphere, HEMISPHERE_VIEWPOINTS, picks([['station.11', 'clematis-armandi']])],
    ] as const) {
      const planText = plantingFileText(plan(p, bower));
      const r = openDesign([
        { name: structureFileName(bower), text: structureFileText(bower, viewpoints) },
        { name: plantingFileName(bower), text: planText },
      ]);
      if (!r.ok) throw new Error(r.error);
      expect(r.design.plan?.plants.map((x) => x.stationId).sort()).toEqual([...p.keys()].sort());
      expect(r.design.bower.rootStations.map((s) => s.id)).toEqual(bower.rootStations.map((s) => s.id));
    }
  });

  it('round-trips a choice through the address', () => {
    const choice = { picks: picks([['station.1', 'hedera-helix'], ['station.4', 'wisteria-sinensis']]), care: 'untended' as const, years: 14 };
    const params = writePickerAddress(new URLSearchParams('bower=vault&hour=12'), choice);
    expect(params.get('bower')).toBe('vault');
    expect(params.get('plants')).toBe('custom');
    const back = readPickerAddress(new URLSearchParams(params.toString()), vault, taxa);
    expect(back.faults).toEqual([]);
    expect([...back.picks]).toEqual([...choice.picks]);
    expect(back.care).toBe('untended');
    expect(back.years).toBe(14);
    // a station id with a comma or colon in it survives
    const odd = { picks: picks([['bed:1,a', 'hedera-helix']]), care: 'trained' as const, years: 10 };
    expect(encodePicks(odd.picks)).not.toContain(',');
  });

  it('reads the example address and defaults to the gardened plant for ten years', () => {
    const r = readPickerAddress(new URLSearchParams('bower=hemisphere&plants=custom&pick=station.0:hedera-helix,station.5:rosa-the-generous-gardener'), hemisphere, taxa);
    expect(r.faults).toEqual([]);
    expect(r.picks.size).toBe(2);
    expect(r.care).toBe('trained');
    expect(r.years).toBe(10);
  });

  it('reports an unknown station or taxon in the address, and does not drop it in silence', () => {
    const r = readPickerAddress(new URLSearchParams('pick=station.0:hedera-helix,station.99:hedera-helix,station.1:no-such-plant,station.0:wisteria-sinensis,junk&years=50&care=sometimes'), vault, taxa);
    expect([...r.picks]).toEqual([['station.0', 'hedera-helix']]);
    expect(r.faults.join('\n')).toMatch(/no root station "station.99"/);
    expect(r.faults.join('\n')).toMatch(/"no-such-plant" cannot be grown/);
    expect(r.faults.join('\n')).toMatch(/"station.0" is named more than once/);
    expect(r.faults.join('\n')).toMatch(/"junk"/);
    expect(r.faults.join('\n')).toMatch(/years=50/);
    expect(r.faults.join('\n')).toMatch(/care=sometimes/);
    expect(r.years).toBe(30);
    expect(r.care).toBe('trained');
  });
});
