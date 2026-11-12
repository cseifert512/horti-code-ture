/**
 * Simulation time.
 *
 * The clock is a whole number of days since a scenario's epoch date
 * (SIMULATION_KEY.md section 6: daily biological time steps). Dates are
 * proleptic Gregorian and handled in UTC so that no daylight-saving shift can
 * add or drop a day.
 *
 * The prototype measured time in "growing seasons since planting" with twelve
 * equal months; `yearFraction` is kept so its phenology constants can be
 * compared with real dates.
 */
const MS_PER_DAY = 86_400_000;

export interface CalendarDate {
  /** Days since the epoch. */
  day: number;
  year: number;
  /** 1 to 12. */
  month: number;
  /** 1 to 31. */
  dayOfMonth: number;
  /** 1 to 366. */
  dayOfYear: number;
  daysInYear: number;
  /** 0 at the start of 1 January, approaching 1 at the end of 31 December. */
  yearFraction: number;
  /** ISO 8601 date, YYYY-MM-DD. */
  iso: string;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function parseISO(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`"${iso}" is not an ISO date (YYYY-MM-DD)`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) throw new Error(`"${iso}" is not a real date`);
  return ms;
}

export class Calendar {
  readonly epochISO: string;
  private readonly epochMs: number;

  constructor(epochISO: string) {
    this.epochISO = epochISO;
    this.epochMs = parseISO(epochISO);
  }

  /** Day index of an ISO date. Negative before the epoch. */
  dayOf(iso: string): number {
    return Math.round((parseISO(iso) - this.epochMs) / MS_PER_DAY);
  }

  /** Day index of the `dayOfYear`-th day (1 = 1 January) of a calendar year. */
  dayOfYearDay(year: number, dayOfYear: number): number {
    return Math.round((Date.UTC(year, 0, 1) - this.epochMs) / MS_PER_DAY) + dayOfYear - 1;
  }

  dateOf(day: number): CalendarDate {
    if (!Number.isInteger(day)) throw new Error('the simulation clock counts whole days');
    const d = new Date(this.epochMs + day * MS_PER_DAY);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const dayOfMonth = d.getUTCDate();
    const jan1 = Date.UTC(year, 0, 1);
    const dayOfYear = Math.round((d.getTime() - jan1) / MS_PER_DAY) + 1;
    const daysInYear = Math.round((Date.UTC(year + 1, 0, 1) - jan1) / MS_PER_DAY);
    return { day, year, month, dayOfMonth, dayOfYear, daysInYear, yearFraction: (dayOfYear - 1) / daysInYear, iso: `${pad(year, 4)}-${pad(month)}-${pad(dayOfMonth)}` };
  }
}

/** True when `month` lies in a list of months (1 to 12). */
export const inMonths = (month: number, months: readonly number[]): boolean => months.includes(month);

/**
 * The sun's declination on a day of the year, in radians: how far north of
 * the equator it stands overhead. Cooper's formula, good to about a degree.
 * Day length and the sun's place in the sky (`light/sun.ts`) are both worked
 * out from this one value, so they cannot disagree.
 */
export function solarDeclinationRad(dayOfYear: number): number {
  return ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
}

/**
 * Hours between sunrise and sunset for a latitude and day of year.
 *
 * Geometry only: solar declination from Cooper's formula and the sunrise hour
 * angle for the centre of the sun's disc on a flat horizon, without
 * atmospheric refraction, so real day length runs a few minutes longer. This
 * is astronomy, not a plant parameter; it is offered to phenology models that
 * need photoperiod.
 */
export function dayLengthHours(latitudeDeg: number, dayOfYear: number): number {
  const rad = Math.PI / 180;
  const declination = solarDeclinationRad(dayOfYear);
  const x = -Math.tan(latitudeDeg * rad) * Math.tan(declination);
  if (x >= 1) return 0; // polar night
  if (x <= -1) return 24; // midnight sun
  return (2 * Math.acos(x)) / (15 * rad);
}
