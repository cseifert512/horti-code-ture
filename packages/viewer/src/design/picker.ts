// The plant picker: one taxon per root station, chosen in the interface. This
// module turns those choices into a planting plan, and an address into choices
// and back. It holds no DOM and no growth logic: the plan it builds is checked
// by the core (`parsePlantingPlan`, `plantingOn`) and grown by the same path as
// a planting plan read from a file (`growDesign`).
import { type Bower, type Growable, type PlantingPlan, type VaultStation, type Viewpoint, describeBower, makeHemisphereBower, makeVaultBower, parsePlantingPlan, plantingOn } from '@horti/core';
import type { Care } from '../plant/grow.ts';

/** A root station as the picker lists it. */
export interface PickerStation {
  id: string;
  /** What the structure says of where it is, for example "west foot of rib 1". */
  note: string | null;
}

/** A taxon the picker offers. */
export interface PickerTaxon {
  id: string;
  /** The botanical label from its profile. */
  label: string;
  /** Its look in the viewer is still the plain stand-in. */
  provisional: boolean;
}

/** Which taxon goes in at which station: station id to taxon id. A station not in the map has nothing planted. */
export type Picks = ReadonlyMap<string, string>;

/** Everything the picker's address says. */
export interface PickerChoice {
  picks: Picks;
  care: Care;
  years: number;
}

export const DEFAULT_PICKER_YEARS = 10;
export const MIN_YEARS = 1;
export const MAX_YEARS = 30;

/**
 * Every rib foot of the vault, in the order the core numbers them: `station.0`
 * is the west foot of rib 0, `station.1` its east foot, and so on to `station.9`,
 * the east foot of rib 4. The order is what makes a station id in an address
 * mean the same foot every time.
 */
export const VAULT_PICKER_STATIONS: readonly VaultStation[] = [0, 1, 2, 3, 4].flatMap((rib) => [
  { side: 0 as const, rib },
  { side: 1 as const, rib },
]);

/** Stations of the hemisphere the picker plants: one at the foot of each of its twelve meridians, as the reference palette has them. */
export const HEMISPHERE_PICKER_STATIONS = 12;

/**
 * The built-in structure the picker plants: the vault with all ten rib feet as
 * stations, or the 15 m hemisphere with a station at the foot of each meridian
 * (`station.<i>` at meridian i). These have more stations than the shells the
 * reference scenarios open on, so a station id means a foot of this shell only.
 */
export function pickerShell(kind: 'vault' | 'hemisphere'): Bower {
  return kind === 'vault' ? makeVaultBower({ stations: VAULT_PICKER_STATIONS }) : makeHemisphereBower({ diameterM: 15, stations: HEMISPHERE_PICKER_STATIONS });
}

/** The root stations of a structure, as listed in the picker. */
export function stationsOf(bower: Bower): PickerStation[] {
  return bower.rootStations.map((s) => ({ id: s.id, note: s.note ?? null }));
}

/** Every taxon that can be grown, by its botanical label. `provisional` says whether the viewer's look of a taxon is still the stand-in. */
export function taxaOffered(taxa: Growable, provisional: (taxonId: string) => boolean): PickerTaxon[] {
  return [...taxa.entries()]
    .map(([id, t]) => ({ id, label: t.profile.names.label, provisional: provisional(id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en'));
}

/** The name a plant goes by in the log and the report: its genus and its station, for example "rosa@station.0". One plant per station keeps it unique. */
export const plantIdOf = (taxonId: string, stationId: string): string => `${taxonId.split('-')[0]}@${stationId}`;

/** The plan's name. The taxa are not listed in it: the viewer and the report name them beside it. */
const planName = (picks: Picks): string => `${picks.size} ${picks.size === 1 ? 'plant' : 'plants'} chosen in the viewer`;

export type PlanResult = { ok: true; plan: PlantingPlan } | { ok: false; error: string };

/**
 * The planting plan for the choices made, in the stations' order, checked by
 * the core as a plan read from a file is checked: its form (`parsePlantingPlan`),
 * and that it fits this structure and names taxa that can be grown (`plantingOn`).
 * Whatever the core refuses comes back in its own words.
 */
export function planFromPicks(picks: Picks, bower: Bower, taxa: Growable): PlanResult {
  if (picks.size === 0) return { ok: false, error: 'Nothing is chosen. Choose a plant for at least one root station.' };
  const order = new Map(bower.rootStations.map((s, i) => [s.id, i]));
  const plants = [...picks.entries()]
    .sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b))
    .map(([stationId, taxonId]) => ({ plantId: plantIdOf(taxonId, stationId), taxonId, stationId }));
  try {
    const plan = parsePlantingPlan({ schemaVersion: 1, name: planName(picks), plants }, 'the planting chosen');
    plantingOn(bower, plan, { taxa, years: 1 });
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The plan as the text of a `.planting.json` file, laid out as the examples are: one plant to a line. */
export function plantingFileText(plan: PlantingPlan): string {
  const plants = plan.plants.map((p) => `    { "plantId": ${JSON.stringify(p.plantId)}, "taxonId": ${JSON.stringify(p.taxonId)}, "stationId": ${JSON.stringify(p.stationId)} }`);
  return `{\n  "schemaVersion": 1,\n  "name": ${JSON.stringify(plan.name)},\n  "plants": [\n${plants.join(',\n')}\n  ]\n}\n`;
}

const fileStem = (bower: Bower): string => bower.id.replace(/[^A-Za-z0-9._-]+/g, '-');

/** A file name for the plan: the structure's id, for example "vault-segment-chosen.planting.json". */
export const plantingFileName = (bower: Bower): string => `${fileStem(bower)}-chosen.planting.json`;

/**
 * A built-in shell written out as a Bower description (the core's `describeBower`),
 * so that a plan chosen on it can be opened again with "A design..." or handed
 * to `npm run simulate -- design`: a planting plan names stations, and only a
 * description says where they are.
 */
export const structureFileText = (bower: Bower, viewpoints: readonly Viewpoint[]): string => `${JSON.stringify(describeBower(bower, viewpoints), null, 2)}\n`;
export const structureFileName = (bower: Bower): string => `${fileStem(bower)}-picker.bower.json`;

// ---- the address ------------------------------------------------------------------

/** `pick=<stationId>:<taxonId>,...`, each part escaped so that a station id may hold any character. */
export function encodePicks(picks: Picks): string {
  return [...picks.entries()].map(([s, t]) => `${encodeURIComponent(s)}:${encodeURIComponent(t)}`).join(',');
}

/** What an address said that does not fit: each fault in words. */
export interface ReadChoice extends PickerChoice {
  faults: string[];
}

/**
 * Read the picker's choice from an address: `pick`, `care` and `years`. Each
 * station must be one of this structure's, each taxon one that can be grown,
 * and each station named once. Anything that does not fit is kept out of the
 * picks and reported in `faults`, never dropped in silence.
 */
export function readPickerAddress(params: URLSearchParams, bower: Bower, taxa: Growable): ReadChoice {
  const faults: string[] = [];
  const picks = new Map<string, string>();
  const stations = new Set(bower.rootStations.map((s) => s.id));
  const text = params.get('pick') ?? '';
  for (const part of text.split(',').filter((p) => p.trim() !== '')) {
    const at = part.lastIndexOf(':');
    let stationId: string;
    let taxonId: string;
    try {
      stationId = decodeURIComponent(at < 0 ? part : part.slice(0, at)).trim();
      taxonId = at < 0 ? '' : decodeURIComponent(part.slice(at + 1)).trim();
    } catch {
      faults.push(`"${part}" in pick= cannot be read.`);
      continue;
    }
    if (at < 0 || !stationId || !taxonId) {
      faults.push(`"${part}" in pick= is not <stationId>:<taxonId>.`);
      continue;
    }
    const badStation = !stations.has(stationId);
    const badTaxon = !taxa.has(taxonId);
    if (badStation) faults.push(`${bower.name} has no root station "${stationId}". It has: ${[...stations].join(', ')}.`);
    if (badTaxon) faults.push(`"${taxonId}" cannot be grown. Taxa with a growth model: ${[...taxa.keys()].sort().join(', ')}.`);
    if (badStation || badTaxon) continue;
    if (picks.has(stationId)) {
      faults.push(`Station "${stationId}" is named more than once in pick=; one taxon per station. The first, ${picks.get(stationId)}, is kept.`);
      continue;
    }
    picks.set(stationId, taxonId);
  }

  const careText = params.get('care');
  let care: Care = 'trained';
  if (careText === 'untended') care = 'untended';
  else if (careText !== null && careText !== 'trained') faults.push(`care=${careText} is not "trained" or "untended". Kept by the gardener (trained) is used.`);

  let years = DEFAULT_PICKER_YEARS;
  const yearsText = params.get('years');
  if (yearsText !== null) {
    const n = Number(yearsText);
    if (!Number.isInteger(n) || n < MIN_YEARS || n > MAX_YEARS) faults.push(`years=${yearsText} is not a whole number from ${MIN_YEARS} to ${MAX_YEARS}. ${n >= MIN_YEARS ? Math.min(MAX_YEARS, Math.round(n)) : DEFAULT_PICKER_YEARS} is used.`);
    if (Number.isFinite(n) && n >= MIN_YEARS) years = Math.min(MAX_YEARS, Math.round(n));
  }
  return { picks, care, years, faults };
}

/** The address of a choice: the picker's parameters set on whatever else the address holds. */
export function writePickerAddress(params: URLSearchParams, choice: PickerChoice): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set('plants', 'custom');
  next.set('pick', encodePicks(choice.picks));
  next.set('care', choice.care);
  next.set('years', String(choice.years));
  return next;
}
