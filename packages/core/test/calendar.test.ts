import { describe, expect, it } from 'vitest';
import { Calendar, dayLengthHours } from '../src/calendar.ts';

describe('calendar', () => {
  const cal = new Calendar('2027-03-12');

  it('counts whole days from the epoch', () => {
    expect(cal.dateOf(0).iso).toBe('2027-03-12');
    expect(cal.dateOf(1).iso).toBe('2027-03-13');
    expect(cal.dayOf('2027-03-12')).toBe(0);
    expect(cal.dayOf('2028-03-12')).toBe(366); // 2028 is a leap year
    expect(cal.dayOf('2027-01-01')).toBe(-70);
  });

  it('round-trips every day of twelve years, across leap years and clock changes', () => {
    for (let d = 0; d < 12 * 366; d++) expect(cal.dayOf(cal.dateOf(d).iso)).toBe(d);
  });

  it('reports day of year and year fraction', () => {
    const jan1 = cal.dateOf(cal.dayOf('2028-01-01'));
    expect(jan1.dayOfYear).toBe(1);
    expect(jan1.yearFraction).toBe(0);
    expect(jan1.daysInYear).toBe(366);
    const dec31 = cal.dateOf(cal.dayOf('2027-12-31'));
    expect(dec31.dayOfYear).toBe(365);
    expect(dec31.month).toBe(12);
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => cal.dayOf('2027-3-12')).toThrow();
    expect(() => cal.dayOf('2027-02-30')).toThrow();
    expect(() => cal.dateOf(1.5)).toThrow();
  });
});

describe('day length', () => {
  it('is twelve hours everywhere at the equinox', () => {
    expect(dayLengthHours(51.5, 80)).toBeCloseTo(12, 0);
    expect(dayLengthHours(0, 172)).toBeCloseTo(12, 6);
  });

  it('gives London about 16.4 h at midsummer and 7.7 h at midwinter (geometric, no refraction)', () => {
    expect(dayLengthHours(51.5, 172)).toBeGreaterThan(16.1);
    expect(dayLengthHours(51.5, 172)).toBeLessThan(16.7);
    expect(dayLengthHours(51.5, 355)).toBeGreaterThan(7.4);
    expect(dayLengthHours(51.5, 355)).toBeLessThan(8.0);
  });

  it('handles polar day and night', () => {
    expect(dayLengthHours(80, 172)).toBe(24);
    expect(dayLengthHours(80, 355)).toBe(0);
  });
});
