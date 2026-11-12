// What a taxon looks like: the interface every module under taxa/ fills in.
//
// Mechanism traits do not transfer, and neither do looks: a honeysuckle must
// not be shown with racemes and pinnate leaves, and a clematis stem must not be
// shown as wisteria wood. So each taxon has one module that says everything
// about its appearance: its leaves, flowers and fruit (each in as many forms
// as the taxon has), the small parts it holds on with, and its wood.
//
// What is here is appearance: shapes, colours, gloss, how stiffly a flower is
// held. It is not growth. How many organs there are, how long each is, where
// it sits and on which days it is there all come from the render data; an
// organ model is authored at a nominal size and scaled to the length the data
// gives. Shape numbers that describe a real plant (leaflets per leaf, flowers
// per raceme) belong in species/<id>/morphology.json, read with the core's
// characterOf. See TAXON_LOOKS.md.
import type * as THREE from 'three';
import type { AppendageKind } from '@horti/core';

/** Linear RGB, each 0 to 1. `lin('#rrggbb')` in the kit turns a screen colour into one. */
export type Triple = readonly [number, number, number];

/**
 * Triangles a model may have at each of its levels of detail, finest first.
 * Every asset states its own, and the test builds every model and holds it to
 * what it states. A budget may not exceed the ceiling for its kind (below).
 */
export type Budget = readonly number[];

/**
 * How an organ is held where the data gives it no direction.
 *   hangs   authored hanging from the origin along -Y, as a wisteria raceme does
 *   held    authored standing from the origin along +Y, on its own stalk
 * Where the data does give a direction, that axis of the model (-Y or +Y) is
 * turned on to it, and the model's +Z is turned as far towards the sky as it
 * will go. An organ whose direction is plumb is turned to a compass bearing of
 * its own instead, as one with no direction is.
 */
export type Poise = 'hangs' | 'held';

/** What every organ model has: geometry at several levels of detail, in one or more variants. */
export interface OrganModel {
  /** Names the instance pool and its materials. Unique across all taxa: begin it with the taxon id. */
  key: string;
  /** How many variants there are (make is called with 0 to variants - 1) and how many levels of detail (0 is the finest). */
  variants: number;
  lods: number;
  /** Builds one variant at one level of detail. Called once for each and kept; it must give the same geometry every time. */
  make(variant: number, lod: number): THREE.BufferGeometry;
  budget: Budget;
}

/** Leaf colours: mature (the two ends of leaf-to-leaf variation), newly unfolded, autumn (two ends). */
export interface LeafPalette {
  greenA: Triple;
  greenB: Triple;
  young: Triple;
  autumnA: Triple;
  autumnB: Triple;
}

/**
 * A leaf texture of a taxon's own, drawn on a canvas when the leaf is first
 * drawn (no image files). Its uv convention is not the shared texture's: uv is
 * the blade laid flat and seen from its upper side, u = 0.5 + x / span and
 * v = origin + z / span, x and z being the flat blade's own coordinates with
 * the point where its main veins meet at x = z = 0 (see `veinUv` in the kit).
 *
 * What the colour canvas carries: its green is the brightness the palette is
 * multiplied by, as in the shared texture; where its blue is lower than its
 * green, that share of the way the colour is drawn to the palette's vein
 * colour (`greenB`, or `autumnB` as the leaf colours), which is how a pale vein
 * can be whitish on a dark blade. A grey texture (the shared one) is not tinted.
 * The relief canvas is a height map: light is high.
 */
export interface LeafTexture {
  /** Pixels on a side; both canvases are square. */
  size: number;
  /** Paints both canvases. Called once for the asset; it must paint the same thing every time. */
  paint(colour: CanvasRenderingContext2D, relief: CanvasRenderingContext2D, size: number): void;
  /** How strongly the relief shows (the material's bump scale; the shared texture's is 1.2). */
  relief: number;
  /** For checking, where the texture is drawn from lines (the kit's palmate veins): the lines, in uv. */
  lines?: () => readonly { kind: string; points: readonly (readonly [number, number])[] }[];
}

/**
 * How a blade is held in the world, whichever way its stalk leaves the stem.
 * The stalk goes where the render data points it; the blade turns where it
 * joins the stalk (the pivot of the parts tagged t >= 0, which a leaf with a
 * hold must give its blade, see Merge in the kit): its upper face to the open
 * side, as far above level as `rise` says, and its tip as low as it can go with
 * its face turned so. The open side is away from what the bearing stem lies
 * on; above level wherever the stem lies on top of its support, and up to
 * `riseOpen` above level where the stem is on nothing. Angles are degrees, a
 * range across which leaves differ.
 *
 * A leaf with a hold is authored with its blade lying as it is, flat out
 * along +Z from where it joins the stalk, upper side +Y: the viewer turns it.
 * Its one unit (see LeafAsset) is measured with the blade turned down by
 * `unitAt` from the line of the stalk, so that the length in the data keeps
 * the meaning the growth model gives it (a reach "as the leaf is held").
 */
export interface BladeHold {
  /** Degrees below the line of the stalk at which the blade is turned (about +X, tip down) to measure the leaf's one unit. */
  unitAt: number;
  /** How far above level the upper face looks, the stem lying against an upright surface (a wall, a post, a trellis): 0 straight out, 90 straight up. */
  rise: readonly [number, number];
  /** The same where the bearing stem touches nothing: a shoot out under the open sky. */
  riseOpen: readonly [number, number];
  /** How far a blade is turned about its face from tip-straight-down, either way: leaves do not all hang alike. */
  turn: number;
}

/**
 * A leaf. Frame: the origin is where the leaf joins the stem, +Z runs along
 * it, +Y is its upper side, and it is ONE UNIT LONG (stalk and blade
 * together), so that the length in the render data is the length drawn. The
 * geometry needs uv (the shared leaf texture: u across the blade, v base to
 * tip, pale midrib at u = 0.5; or the leaf's own `texture`, whose convention is
 * LeafTexture's) and aPart (see Merge in the kit).
 */
export interface LeafAsset extends OrganModel {
  /** Which variant a leaf gets: `r` is a fixed random number in [0, 1) for that leaf. */
  pick(lengthM: number, r: number): number;
  palette: LeafPalette;
  /** Surface gloss of the blade: lower is shinier. */
  roughness: number;
  /** How much light comes through the blade from behind: about 0.45 for a thin leaf, less for a leathery one. */
  translucency: number;
  /** Level-of-detail distances relative to the wisteria leaf's: small leaves can simplify sooner. */
  detailReach: number;
  /** The leaf's own texture. Left out: the shared, feather-veined one. */
  texture?: LeafTexture;
  /** How the blade is held in the world. Left out: the whole leaf is turned with its stalk, as authored. */
  hold?: BladeHold;
}

/**
 * A flower, or a whole inflorescence where the flowers are borne together:
 * one instance is one RenderFlower. Frame: the origin is where it is
 * attached; see Poise for the axis. The geometry needs vertex colours and
 * aPart: every vertex says which flower of the inflorescence it belongs to and
 * when in the opening it opens, or that it is part of the axis, which stays.
 */
export interface FlowerAsset extends OrganModel {
  pick(r: number): number;
  /** The size the model is authored at, in the units of RenderFlower.lengthM: an instance is scaled by lengthM / this. */
  authoredSize: number;
  poise: Poise;
  /** How far the middle of the organ is from its attachment, along its axis, in sizes. For choosing detail by distance. */
  centreAlong: number;
  /** Tint of an unopened flower, multiplied on to its colours. */
  budTint: Triple;
  /** How freely it swings in wind, 0 to 1. */
  swing: number;
  /** How much light comes through the petals from behind, and how strong the soft rim light of a velvety surface is. */
  translucency: number;
  sheen: number;
  /** Camera distances (m) at which it drops to each coarser model, and how many of the finer models may be shown at once at full detail. */
  detailAt: readonly number[];
  detailCaps: readonly number[];
}

/**
 * A fruit, or a cluster of them where they are borne together: one instance
 * is one RenderFruit. Frame as for a flower. The geometry needs vertex
 * colours, which are its unripe colours.
 */
export interface FruitAsset extends OrganModel {
  pick(r: number): number;
  /** The length the model is authored at, in the units of RenderFruit.lengthM. */
  authoredSize: number;
  poise: Poise;
  centreAlong: number;
  /**
   * What it turns to as it ripens. The ripe colour of a point is
   *   ripe * (ripeShade[0] + ripeShade[1] * g)
   * where g is the green of its unripe vertex colour, so the pattern painted
   * on the unripe fruit still shades the ripe one. [1, 0] gives one flat colour.
   */
  ripe: Triple;
  ripeShade: readonly [number, number];
  /**
   * True: the parts tagged as axis (aPart t < 0, see Merge in the kit: the stalks a Merge tube makes) keep their unripe
   * colours as the fruit ripens, as a grape's bunch stalk stays green under black berries. Left out: the whole model
   * ripens, as before. The geometry then needs aPart.
   */
  stalkKeepsColour?: boolean;
  roughness: number;
  /** How freely it swings in wind, 0 to 1. */
  swing: number;
  detailAt: readonly number[];
  detailCaps: readonly number[];
}

/**
 * A small part the plant holds on or defends itself with: a tendril, a coiled
 * leaf stalk, a patch of clinging rootlets, a prickle. One instance is one
 * RenderAppendage. Frame: the origin is where it leaves the stem, +Z is the
 * direction it reaches in, +Y is turned as far towards the sky as it will go,
 * and it is ONE UNIT LONG, scaled to the length in the data. The geometry
 * needs vertex colours.
 */
export interface AppendageAsset extends OrganModel {
  /**
   * Which variant. `holding` is whether the data says this one has hold of the structure, so a tendril that found
   * something can be drawn coiled and one that did not, straight. `heldDiameterMm` is the thickness of what it holds
   * (a 5 mm cable, a 40 mm lath), where the data gives it, so that a coil can be drawn to fit.
   */
  pick(r: number, holding: boolean, heldDiameterMm?: number): number;
  /** What its colours turn to with age (a green tendril going woody), and the age in days over which they turn. Null: it keeps its colours. */
  aged: Triple | null;
  agedDays: readonly [number, number];
  roughness: number;
  /** How freely it moves in wind, 0 to 1: nothing for a prickle or a rootlet. */
  swing: number;
  detailAt: readonly number[];
  detailCaps: readonly number[];
}

/**
 * The stems of a taxon: the colours they pass through as they age, how soon
 * they turn, and the relief of their bark. Ages are days since a point of the
 * stem was laid down. They colour a material; nothing in the simulation reads
 * them, and a stem's thickness comes from the render data.
 */
export interface WoodLook {
  /** Colour of a new shoot. */
  young: Triple;
  /** Colour of the smooth bark of wood a few seasons old. */
  mature: Triple;
  /** Tint of old bark: multiplied on to the bark texture, which is grey. */
  old: Triple;
  /** Ages over which a shoot goes from `young` to `mature`: how soon it turns woody. */
  woodyDays: readonly [number, number];
  /** Ages over which mature bark gives way to old bark. */
  oldDays: readonly [number, number];
  /** Ages over which furrows deepen, and how deep they get: 1 is the wisteria's fluted trunk, 0 a stem that stays round. */
  furrowDays: readonly [number, number];
  furrow: number;
  /** Ages over which a stem stops swaying in the wind. */
  stiffDays: readonly [number, number];
  /** Height of the fine relief of the bark texture, and the roughness of the surface. */
  relief: number;
  roughness: number;
  /** The grain of the bark texture: how many streaks, how wide (pixels of 512), and how far they wander. Left out: the default, a fissured bark. */
  grain?: { streaks: number; width: number; wobble: number };
}

/**
 * The forms of one organ. `default` is the taxon's ordinary form, drawn where
 * the data names none. Any other key is the name the data gives a form
 * (RenderLeaf.form, RenderFlower.form, RenderFruit.form): the names are the
 * taxon's own, listed in its growth model.
 */
export interface Forms<A> {
  default: A;
  [form: string]: A;
}

/** Everything about how one taxon is drawn. Each module under taxa/ exports one, as `look`. */
export interface TaxonLook {
  /** The folder name under species/. */
  taxonId: string;
  /** True for the stand-in given to a taxon with no models of its own. The caption says so wherever such a plant is shown. */
  provisional: boolean;
  leaves: Forms<LeafAsset>;
  /** Null: its flowers are not drawn, and the caption says so if a run has any. */
  flowers: Forms<FlowerAsset> | null;
  /** Null: its fruit is not drawn, and the caption says so if a run has any. */
  fruits: Forms<FruitAsset> | null;
  /** By kind. A kind left out is not drawn, and the caption says so if a run has any. */
  appendages: Partial<Record<AppendageKind, AppendageAsset>>;
  wood: WoodLook;
}

/** The form of an organ the data asks for, or the ordinary one where it names none or names one the look does not have. */
export function formOf<A>(forms: Forms<A>, form: string | undefined): A {
  return (form !== undefined && form !== 'default' ? forms[form] : undefined) ?? forms.default;
}

/** Every asset of a look, with what kind of organ it is. */
export function assetsOf(look: TaxonLook): { kind: OrganKind; form: string; asset: OrganModel }[] {
  const out: { kind: OrganKind; form: string; asset: OrganModel }[] = [];
  for (const [form, asset] of Object.entries(look.leaves)) out.push({ kind: 'leaf', form, asset });
  for (const [form, asset] of Object.entries(look.flowers ?? {})) out.push({ kind: 'flower', form, asset });
  for (const [form, asset] of Object.entries(look.fruits ?? {})) out.push({ kind: 'fruit', form, asset });
  for (const [kind, asset] of Object.entries(look.appendages)) if (asset) out.push({ kind: 'appendage', form: kind, asset });
  return out;
}

export type OrganKind = 'leaf' | 'flower' | 'fruit' | 'appendage';

/**
 * The most triangles a model of each kind may have. `finest` bounds level 0,
 * `coarsest` the last level, `middle` any between. The last level is what a
 * thousand distant organs are drawn with, so a model with a single level is
 * held to `coarsest`.
 *
 * The numbers are set by the wisteria, which is the heaviest plant and runs
 * well: its leaf is 1784 / 240 / 116 triangles and its raceme of sixty
 * flowers 22332 / 5758 / 1402 / 510.
 */
export const BUDGET_CEILING: Readonly<Record<OrganKind, { finest: number; middle: number; coarsest: number }>> = {
  leaf: { finest: 2400, middle: 400, coarsest: 140 },
  flower: { finest: 24000, middle: 6000, coarsest: 520 },
  fruit: { finest: 4000, middle: 1000, coarsest: 420 },
  appendage: { finest: 600, middle: 200, coarsest: 64 },
};

/** The ceiling for level `lod` of a model of `lods` levels. */
export function ceilingFor(kind: OrganKind, lod: number, lods: number): number {
  const c = BUDGET_CEILING[kind];
  return lod === lods - 1 ? c.coarsest : lod === 0 ? c.finest : c.middle;
}

/** The translucency every leaf has had so far: a thin leaf with the sun behind it. */
export const THIN_LEAF = 0.45;
