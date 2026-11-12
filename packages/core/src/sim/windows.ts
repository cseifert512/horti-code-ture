/**
 * Day-of-year windows: the `phenology.*Doy` and `fruit.*Doy` ranges of a
 * growth model.
 *
 * A window is [first, last], days of the year with 1 = 1 January, both ends
 * included. Where the first day is later than the last, the window runs
 * through the new year: [320, 45] is 16 November to 14 February.
 *
 * Everything that reads a window goes through here, so that "through the new
 * year" means the same thing wherever a window is read. For a window that
 * does not cross the new year each function gives exactly the days the engine
 * used before windows could.
 */
import type { Calendar } from '../calendar.ts';

export type DoyWindow = readonly [number, number];

/** True where the window's first day is later in the year than its last. */
export const throughNewYear = (w: DoyWindow): boolean => w[0] > w[1];

/** Whether a day of the year falls in the window. */
export function inWindow(w: DoyWindow, dayOfYear: number): boolean {
  return throughNewYear(w) ? dayOfYear >= w[0] || dayOfYear <= w[1] : dayOfYear >= w[0] && dayOfYear <= w[1];
}

/**
 * The window that begins in calendar year `year`, as days of that year: where
 * it runs through the new year its last day is counted on past the year's
 * end, so [320, 45] beginning in a year of 365 days is [320, 410]. The two
 * numbers can be used wherever an ordinary [first, last] could, with
 * `Calendar.dayOfYearDay(year, ...)`.
 */
export function unrolled(cal: Calendar, w: DoyWindow, year: number): [number, number] {
  return [w[0], throughNewYear(w) ? w[1] + (cal.dayOfYearDay(year + 1, 1) - cal.dayOfYearDay(year, 1)) : w[1]];
}

/** The window that begins in calendar year `year`, as days of the run. */
export function windowFrom(cal: Calendar, w: DoyWindow, year: number): [number, number] {
  return [cal.dayOfYearDay(year, w[0]), cal.dayOfYearDay(throughNewYear(w) ? year + 1 : year, w[1])];
}

/** The window that ends in calendar year `year`, as days of the run: one that runs through the new year began the year before. */
export function windowTo(cal: Calendar, w: DoyWindow, year: number): [number, number] {
  return [cal.dayOfYearDay(throughNewYear(w) ? year - 1 : year, w[0]), cal.dayOfYearDay(year, w[1])];
}

/** The first occurrence of the window whose last day comes after `day`, as days of the run. */
export function nextWindow(cal: Calendar, w: DoyWindow, day: number): [number, number] {
  let year = cal.dateOf(day).year;
  if (cal.dayOfYearDay(year, w[1]) <= day) year++;
  return windowTo(cal, w, year);
}

/**
 * The middle of the window as a day of the year it mostly belongs to: for one
 * that runs through the new year, later than 31 December where `side` is
 * `end` (a leaf fall from November to January is centred in December, day
 * 350 or so) and earlier than 1 January where it is `start` (a leaf flush
 * from December to February is centred about day 10 of the year it ends in).
 */
export function middle(w: DoyWindow, side: 'start' | 'end'): number {
  if (!throughNewYear(w)) return (w[0] + w[1]) / 2;
  return side === 'end' ? (w[0] + w[1] + 365) / 2 : (w[0] - 365 + w[1]) / 2;
}
