/**
 * What is on the plant on a given day, read from render data.
 *
 * Every consumer of render data (a viewer, the coverage report, a test) has to
 * answer the same questions: is this leaf out, how far open, has it turned,
 * has it dropped; is this flower in bud, open or over. The answers belong in
 * one place so that a picture and a number computed from the same run agree.
 * Nothing here knows any dates of its own: they all come from the data.
 */
import type { RenderData, RenderFlower, RenderLeaf, RenderSeason, RenderStem } from './contract.ts';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** A repeatable number in [0, 1) for a position, so that leaves do not all turn or drop on the same day. */
export function jitter(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export interface LeafState {
  present: boolean;
  /** 0 just breaking, 1 fully open. */
  expansion: number;
  /** 0 green, 1 fully in autumn colour. Always 0 for an evergreen leaf. */
  autumn: number;
}
const ABSENT: LeafState = { present: false, expansion: 0, autumn: 0 };

/** `season` is the entry for this leaf's plant in the calendar year that `day` falls in. */
export function leafState(leaf: RenderLeaf, season: RenderSeason | undefined, day: number): LeafState {
  if (!season || day < leaf.bornDay || (leaf.removedDay >= 0 && day >= leaf.removedDay)) return ABSENT;
  if (season.year < leaf.firstYear || (leaf.lastYear !== null && season.year > leaf.lastYear)) return ABSENT;
  const [flush0, flush1] = season.leafFlush;
  const j = jitter(leaf.position[0], leaf.position[1], leaf.position[2]);
  // a leaf on wood that was already there opens with the flush; one on new growth opens as that growth is made
  const opensFrom = Math.max(flush0, leaf.bornDay);
  const opensOver = leaf.bornDay > flush0 ? 21 : Math.max(1, flush1 - flush0);

  if (leaf.evergreen) {
    // kept through winter: only its first spring is an opening
    if (season.year === leaf.firstYear) {
      if (day < opensFrom) return ABSENT;
      return { present: true, expansion: clamp01((day - opensFrom) / opensOver), autumn: 0 };
    }
    return { present: true, expansion: 1, autumn: 0 };
  }

  if (day < opensFrom) return ABSENT;
  const [fall0, fall1] = season.leafFall;
  // leaves drop one by one across the fall, none remaining after it
  if (day > fall0 + j * (fall1 - fall0)) return ABSENT;
  const [turn0, turn1] = season.autumnColour;
  return { present: true, expansion: clamp01((day - opensFrom) / opensOver), autumn: clamp01((day - turn0 - j * 10) / Math.max(1, turn1 - turn0)) };
}

export interface FlowerState {
  /** in_bud: lengthening before it opens. open: in flower. over: petals fallen or not yet begun. */
  phase: 'absent' | 'in_bud' | 'open';
  /** 0 to 1 through the current phase. */
  progress: number;
}

export function flowerState(flower: RenderFlower, day: number): FlowerState {
  if (day < flower.developDay || (flower.spentDay >= 0 && day >= flower.spentDay)) return { phase: 'absent', progress: 0 };
  if (day < flower.openDay) return { phase: 'in_bud', progress: clamp01((day - flower.developDay) / Math.max(1, flower.openDay - flower.developDay)) };
  return { phase: 'open', progress: flower.spentDay >= 0 ? clamp01((day - flower.openDay) / Math.max(1, flower.spentDay - flower.openDay)) : 0 };
}

/** Whether point `i` of a stem is on the plant on `day`. */
export function stemPointAlive(stem: RenderStem, i: number, day: number): boolean {
  return stem.bornDay[i]! <= day && (stem.removedDay[i]! < 0 || day < stem.removedDay[i]!);
}

/** Radius of point `i` of a stem on `day`, in metres, by the interpolation the contract describes. */
export function stemRadiusM(data: RenderData, stem: RenderStem, i: number, day: number): number {
  const born = stem.bornDay[i]!;
  const tip = data.thickening.tipRadiusMm;
  const age = clamp01((day - born) / Math.max(1, data.lastDay - born));
  return (tip + Math.max(0, stem.radiusMm[i]! - tip) * Math.pow(age, data.thickening.exponent)) / 1000;
}

/** The seasons of one calendar year, by plant. */
export function seasonsOf(data: RenderData, year: number): Map<string, RenderSeason> {
  return new Map(data.seasons.filter((s) => s.year === year).map((s) => [s.plantId, s]));
}
