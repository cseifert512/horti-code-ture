/**
 * The place a Bower stands: where on the earth it is, which way it is turned,
 * and what stands near enough to shade it. DEVELOPMENT_GUIDE.md stage 5,
 * "Input Bower shell, cardinal orientation, light/shade map".
 *
 * A site is not structure and not a plant. It is declared by a project, in the
 * `site` section of a Bower description, or assumed, and a report says which.
 */
import { z } from 'zod';
import type { Sourced } from '../provenance.ts';

const pair = z.tuple([z.number(), z.number()]);

/**
 * Something on the site that casts shade on the Bower and is not part of it.
 * Positions are in the Bower's own frame and metres, on the ground plan.
 *   wall      a straight wall or fence, solid from the ground to its top
 *   building  a block standing on a footprint, solid to its height
 *   tree      a crown on a clear stem; a deciduous one lets more light
 *             through when it is bare
 */
export const obstructionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ id: z.string().min(1), kind: z.literal('wall'), from: pair, to: pair, heightM: z.number().positive().max(100), note: z.string().min(1).optional() }),
  z.strictObject({ id: z.string().min(1), kind: z.literal('building'), footprint: z.array(pair).min(3), heightM: z.number().positive().max(400), note: z.string().min(1).optional() }),
  z.strictObject({
    id: z.string().min(1),
    kind: z.literal('tree'),
    at: pair,
    heightM: z.number().positive().max(60),
    crownRadiusM: z.number().positive().max(30),
    /** Height of the clear stem below the crown. Default: a third of the tree's height. */
    clearStemM: z.number().nonnegative().optional(),
    leafHabit: z.enum(['deciduous', 'evergreen']),
    note: z.string().min(1).optional(),
  }),
]);
export type Obstruction = z.infer<typeof obstructionSchema>;

/** The `site` section of a Bower description. Everything in it is optional; what is left out is assumed, and said to be. */
export const siteSchema = z.strictObject({
  name: z.string().min(1).optional(),
  /** Degrees north of the equator (south negative). */
  latitudeDeg: z.number().min(-66).max(66).optional(),
  /** Degrees east of Greenwich (west negative). */
  longitudeDeg: z.number().min(-180).max(180).optional(),
  /**
   * Which way the drawing's +y axis points on the ground, as a compass bearing
   * in degrees clockwise from true north. 0, the default, is what the frame
   * says: y is north. Any other value turns the whole Bower on its site.
   */
  bearingDeg: z.number().min(-360).max(360).optional(),
  obstructions: z.array(obstructionSchema).optional(),
});
export type SiteDescription = z.infer<typeof siteSchema>;

export interface Site {
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
  /** Compass bearing of the model's +y axis, degrees clockwise from true north. */
  bearingDeg: number;
  obstructions: readonly Obstruction[];
  /** True where the place was not given and the baseline was taken instead. */
  assumed: boolean;
  /** Where the place came from, in a sentence for the report. */
  basis: string;
}

/**
 * The place assumed when a scenario names none. The specification's baseline
 * climate is the temperate United Kingdom (PROJECT_CONTEXT.md section 4); the
 * latitude of London and the Greenwich meridian stand for southern England.
 * An assumption about where, not a finding: every real site has to give its own.
 */
export const DEFAULT_SITE: Site = {
  name: 'southern England (assumed)',
  latitudeDeg: 51.5,
  longitudeDeg: 0,
  bearingDeg: 0,
  obstructions: [],
  assumed: true,
  basis: 'No site was given. Southern England is assumed, at latitude 51.5 degrees north on the Greenwich meridian, with the drawing\'s y axis to true north and nothing near enough to cast shade.',
};

/** A site from the `site` section of a description; what the section leaves out is taken from the baseline. */
export function siteFrom(d: SiteDescription | undefined, source = 'the Bower description'): Site {
  if (!d) return DEFAULT_SITE;
  const ids = new Set<string>();
  for (const o of d.obstructions ?? []) {
    if (ids.has(o.id)) throw new Error(`${source}: the obstruction id "${o.id}" is used twice`);
    ids.add(o.id);
    if (o.kind === 'tree' && (o.clearStemM ?? 0) >= o.heightM) throw new Error(`${source}: tree "${o.id}" has a clear stem as tall as the tree`);
  }
  const placed = d.latitudeDeg !== undefined && d.longitudeDeg !== undefined;
  return {
    name: d.name ?? (placed ? `${Math.abs(d.latitudeDeg!).toFixed(2)} ${d.latitudeDeg! >= 0 ? 'N' : 'S'}, ${Math.abs(d.longitudeDeg!).toFixed(2)} ${d.longitudeDeg! >= 0 ? 'E' : 'W'}` : DEFAULT_SITE.name),
    latitudeDeg: d.latitudeDeg ?? DEFAULT_SITE.latitudeDeg,
    longitudeDeg: d.longitudeDeg ?? DEFAULT_SITE.longitudeDeg,
    bearingDeg: d.bearingDeg ?? 0,
    obstructions: d.obstructions ?? [],
    assumed: !placed,
    basis: placed
      ? `Declared in ${source}.`
      : `${source} declares a site without both a latitude and a longitude: southern England is assumed for what is missing (latitude ${DEFAULT_SITE.latitudeDeg} degrees north, the Greenwich meridian).`,
  };
}

/** The `site` section that describes a site, for writing a Bower out. */
export function describeSite(site: Site): SiteDescription | undefined {
  if (site === DEFAULT_SITE) return undefined;
  return {
    name: site.name,
    ...(site.assumed ? {} : { latitudeDeg: site.latitudeDeg, longitudeDeg: site.longitudeDeg }),
    ...(site.bearingDeg ? { bearingDeg: site.bearingDeg } : {}),
    ...(site.obstructions.length ? { obstructions: [...site.obstructions] } : {}),
  };
}

/**
 * How much direct sun gets through the crown of a single tree.
 * Measured on street trees in Gothenburg on clear days: 1.3 to 5.3% through
 * crowns in leaf and 40.2 to 51.9% through bare ones. The middle of each
 * range is used. They were deciduous trees: using the in-leaf figure all year
 * for an evergreen tree is this project's reading, not the paper's.
 */
export const TREE_CROWN_TRANSMISSION: { inLeaf: Sourced<number>; bare: Sourced<number> } = {
  inLeaf: {
    value: 0.033,
    unit: 'share of direct sun passing through the crown',
    status: 'peer_reviewed',
    source: 'https://doi.org/10.1007/s00704-013-1000-3',
    basis: 'Measured on single street trees in Gothenburg on clear days. Taken here for any tree a site declares, which is a reading across species and places and not what the paper claims.',
    range: [0.013, 0.053],
  },
  bare: {
    value: 0.46,
    unit: 'share of direct sun passing through the crown',
    status: 'peer_reviewed',
    source: 'https://doi.org/10.1007/s00704-013-1000-3',
    basis: 'Measured on single street trees in Gothenburg on clear days. Taken here for any tree a site declares, which is a reading across species and places and not what the paper claims.',
    range: [0.402, 0.519],
  },
};

/** Months in which a declared deciduous tree is taken to be in leaf. */
export const TREE_IN_LEAF_MONTHS: Sourced<number[]> = {
  value: [5, 6, 7, 8, 9, 10],
  status: 'provisional_design_assumption',
  basis: 'May to October, as a round figure for broadleaved trees in southern England. The species and the year move both ends by weeks, and a description cannot yet say what kind of tree it is.',
};
