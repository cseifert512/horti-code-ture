/**
 * Every value that describes a plant, a site or a model coefficient travels
 * with its provenance. A bare number cannot enter the taxon library.
 *
 * Rules enforced here (README.md working rules, SIMULATION_KEY.md section 3):
 *   - an `unknown` value is empty, and only `unknown` or `site_dependent`
 *     values may be empty: missing data stays missing instead of being filled
 *     with a universal constant
 *   - anything presented as evidence names its source
 *   - anything that is a choice (a provisional assumption or a design target)
 *     states the reason for the choice
 */
import { z } from 'zod';
import { EVIDENCE_MAY_BE_EMPTY, EVIDENCE_NEEDS_BASIS, EVIDENCE_NEEDS_SOURCE, EVIDENCE_STATUS, type EvidenceStatus } from './vocab.ts';

export interface Sourced<T> {
  /** The value, or null when it is not known or is decided per site. */
  value: T | null;
  /** Physical unit, where the value has one. Lengths m, diameters mm, areas m2, mass kg, force N, temperature degC. */
  unit?: string | undefined;
  status: EvidenceStatus;
  /** URL, DOI or observation ID. Required for evidence. */
  source?: string | undefined;
  /** Why this value: required for assumptions and design targets. */
  basis?: string | undefined;
  /** Plausible low and high bounds for sensitivity sweeps. */
  range?: [T, T] | undefined;
}

export function sourced<V extends z.ZodType>(value: V) {
  return z
    .strictObject({
      value: value.nullable(),
      unit: z.string().min(1).optional(),
      status: z.enum(EVIDENCE_STATUS),
      source: z.string().min(1).optional(),
      basis: z.string().min(1).optional(),
      range: z.tuple([value, value]).optional(),
    })
    .superRefine((v, ctx) => {
      // the value's type is generic here, so only its emptiness can be inspected
      const empty = (v as unknown as { value: unknown }).value === null;
      if (v.status === 'unknown' && !empty) {
        ctx.addIssue({ code: 'custom', message: 'status "unknown" must not carry a value: give it a real status or remove the value' });
      }
      if (empty && !EVIDENCE_MAY_BE_EMPTY.includes(v.status)) {
        ctx.addIssue({ code: 'custom', message: `status "${v.status}" needs a value; use "unknown" when there is none` });
      }
      if (EVIDENCE_NEEDS_SOURCE.includes(v.status) && !v.source) {
        ctx.addIssue({ code: 'custom', message: `status "${v.status}" needs a source (URL, DOI or observation ID)` });
      }
      if (EVIDENCE_NEEDS_BASIS.includes(v.status) && !v.basis) {
        ctx.addIssue({ code: 'custom', message: `status "${v.status}" needs a basis: one line saying why this value was chosen` });
      }
    });
}

/** An empty value: the honest default for anything not yet sourced or measured. */
export function unknown<T>(unit?: string): Sourced<T> {
  return unit === undefined ? { value: null, status: 'unknown' } : { value: null, status: 'unknown', unit };
}

/** A number chosen so the model can run. `basis` says where it came from. */
export function provisional<T>(value: T, basis: string, opts: { unit?: string; range?: [T, T] } = {}): Sourced<T> {
  const out: Sourced<T> = { value, status: 'provisional_design_assumption', basis };
  if (opts.unit !== undefined) out.unit = opts.unit;
  if (opts.range !== undefined) out.range = opts.range;
  return out;
}

/** True when a value rests on observation or literature and not on a choice made by this project. */
export function isEvidence(s: Sourced<unknown>): boolean {
  return EVIDENCE_NEEDS_SOURCE.includes(s.status);
}

export interface ProvenanceEntry {
  /** Dotted path to the value inside its owner, for example `model.extension.leaderMPerSeason`. */
  path: string;
  owner: string;
  value: unknown;
  unit?: string | undefined;
  status: EvidenceStatus;
  source?: string | undefined;
  basis?: string | undefined;
}

function looksSourced(x: unknown): x is Sourced<unknown> {
  return typeof x === 'object' && x !== null && 'status' in x && 'value' in x && typeof (x as { status: unknown }).status === 'string' && (EVIDENCE_STATUS as readonly string[]).includes((x as { status: string }).status);
}

/**
 * Walk any object and list every sourced value in it. This is what the
 * assumptions report (SIMULATION_KEY.md section 8, output 8) is built from.
 */
export function collectProvenance(owner: string, root: unknown): ProvenanceEntry[] {
  const out: ProvenanceEntry[] = [];
  const walk = (node: unknown, path: string): void => {
    if (looksSourced(node)) {
      out.push({ path, owner, value: node.value, unit: node.unit, status: node.status, source: node.source, basis: node.basis });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`));
    } else if (typeof node === 'object' && node !== null) {
      for (const [k, child] of Object.entries(node)) walk(child, path ? `${path}.${k}` : k);
    }
  };
  walk(root, '');
  return out;
}

/** Count of values by status: the one-line answer to "how much of this is guessed?". */
export function summariseProvenance(entries: readonly ProvenanceEntry[]): Record<EvidenceStatus, number> {
  const out = Object.fromEntries(EVIDENCE_STATUS.map((s) => [s, 0])) as Record<EvidenceStatus, number>;
  for (const e of entries) out[e.status]++;
  return out;
}
