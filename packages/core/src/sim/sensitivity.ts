/**
 * How far a run's headline readings move when the numbers nobody has measured
 * are changed. DEVELOPMENT_GUIDE.md stage 7: "Add credible intervals and
 * scenario uncertainty".
 *
 * How much leaf a plant carries, and how many shoots it throws each year, are
 * placeholders in every growth model. Winter cover and timber legibility
 * follow directly from them. A reading that barely moves when they are
 * multiplied is a finding about the design; one that swings is a finding
 * about what to go and measure.
 *
 * The variations are multiples, not estimates: nothing here says a plant has
 * twice the leaf the model gives it, only what would follow if it did.
 */
import { WINTER_MONTH } from '../targets.ts';
import { Simulation } from './engine.ts';
import { param, withParam } from './model.ts';
import { designReport } from './report.ts';
import type { Growable } from './scenarios.ts';
import type { Scenario } from './types.ts';
import type { Viewpoint } from './view.ts';

export interface Variation {
  id: string;
  label: string;
  apply: (taxa: Growable) => Growable;
}

/** Every leaf `factor` times its area, on the same stems: leaf length is scaled by the square root. */
export function leafArea(taxa: Growable, factor: number): Growable {
  const k = Math.sqrt(factor);
  return new Map(
    [...taxa].map(([id, t]) => {
      const [a, b] = param(t.model, 'organs.leafLengthM');
      return [id, { profile: t.profile, model: withParam(t.model, 'organs.leafLengthM', [a * k, b * k], `sensitivity: ${factor} times the leaf area`) }];
    }),
  );
}

/** `factor` times as many side shoots a year from the old stems, each as long as before. */
export function sideShoots(taxa: Growable, factor: number): Growable {
  return new Map(
    [...taxa].map(([id, t]) => {
      const why = `sensitivity: ${factor} times as many side shoots a year`;
      let model = withParam(t.model, 'organs.whipShareOfNodes', param(t.model, 'organs.whipShareOfNodes') * factor, why);
      model = withParam(model, 'organs.whipsPerYearMax', Math.round(param(t.model, 'organs.whipsPerYearMax') * factor), why);
      return [id, { profile: t.profile, model }];
    }),
  );
}

export const STANDARD_VARIATIONS: readonly Variation[] = [
  { id: 'as_modelled', label: 'as modelled', apply: (t) => t },
  { id: 'leaf_area_x2', label: 'twice the leaf area', apply: (t) => leafArea(t, 2) },
  { id: 'leaf_area_x4', label: 'four times the leaf area', apply: (t) => leafArea(t, 4) },
  { id: 'side_shoots_x3', label: 'three times the side shoots', apply: (t) => sideShoots(t, 3) },
  { id: 'both', label: 'four times the leaf area and three times the side shoots', apply: (t) => sideShoots(leafArea(t, 4), 3) },
];

export interface SensitivityRow {
  id: string;
  label: string;
  /** Evergreen leaf in mid January, as a share of the structure seen from each viewpoint. */
  winterEvergreen: { viewpointId: string; value: number }[];
  /** Leaf of any kind in mid July, and the share of the bare structure's timber still seen. */
  summerFoliage: { viewpointId: string; value: number }[];
  summerTimberVisible: { viewpointId: string; value: number }[];
  /** Flowers that opened in the year reported, all plants together. */
  flowersOpened: number;
  /** Route held by any plant at the end of the run, 0 to 1. */
  routeHeldShare: number;
}

export interface Sensitivity {
  scenario: string;
  year: number;
  viewpoints: Viewpoint[];
  rows: SensitivityRow[];
}

/**
 * Run the same scenario once for each variation. `make` builds the scenario
 * from a taxon library, so that each run differs only in the numbers varied.
 */
export function sensitivity(make: (taxa: Growable) => Scenario, taxa: Growable, until: string, variations: readonly Variation[] = STANDARD_VARIATIONS): Sensitivity {
  let scenario = '';
  let year = 0;
  let viewpoints: Viewpoint[] = [];
  const rows: SensitivityRow[] = variations.map((v) => {
    const sim = new Simulation(make(v.apply(taxa))).runUntil(until);
    const r = designReport(sim);
    scenario = r.scenario;
    year = r.year;
    viewpoints = r.viewpoints;
    const winter = r.months.find((m) => m.month === WINTER_MONTH);
    const july = r.months.find((m) => m.month === 7);
    return {
      id: v.id,
      label: v.label,
      winterEvergreen: (winter?.views ?? []).map((x) => ({ viewpointId: x.viewpointId, value: x.evergreenFoliage })),
      summerFoliage: (july?.views ?? []).map((x) => ({ viewpointId: x.viewpointId, value: x.foliage })),
      summerTimberVisible: (july?.views ?? []).map((x) => ({ viewpointId: x.viewpointId, value: x.timberVisible })),
      flowersOpened: sim.summaries.filter((s) => s.year === r.year).reduce((sum, s) => sum + s.flowersOpened, 0),
      routeHeldShare: r.routes.heldShare,
    };
  });
  return { scenario, year, viewpoints, rows };
}

const pct = (x: number) => `${(100 * x).toFixed(x < 0.1 ? 1 : 0)}%`;

/** The sweep as plain text: one table for each viewpoint. */
export function formatSensitivity(s: Sensitivity): string {
  const out: string[] = [];
  out.push(`SENSITIVITY of ${s.scenario}, ${s.year}`);
  out.push('What the readings would be if the plants carried more leaf, or threw more shoots, than the models give them.');
  out.push('These are multiples, not estimates: neither quantity has been measured.');
  const w = Math.max(...s.rows.map((r) => r.label.length)) + 2;
  for (const vp of s.viewpoints) {
    out.push('');
    out.push(`  ${vp.label}`);
    out.push(`    ${''.padEnd(w)}${'evergreen, Jan'.padStart(16)}${'in leaf, Jul'.padStart(14)}${'timber seen, Jul'.padStart(18)}`);
    for (const r of s.rows) {
      const at = <T extends { viewpointId: string; value: number }>(list: T[]) => list.find((x) => x.viewpointId === vp.id)?.value ?? 0;
      out.push(`    ${r.label.padEnd(w)}${pct(at(r.winterEvergreen)).padStart(16)}${pct(at(r.summerFoliage)).padStart(14)}${pct(at(r.summerTimberVisible)).padStart(18)}`);
    }
  }
  out.push('');
  out.push(`  ${''.padEnd(w + 2)}${'flowers opened'.padStart(16)}${'route held'.padStart(14)}`);
  for (const r of s.rows) out.push(`  ${r.label.padEnd(w + 2)}${String(r.flowersOpened).padStart(16)}${pct(r.routeHeldShare).padStart(14)}`);
  return out.join('\n');
}
