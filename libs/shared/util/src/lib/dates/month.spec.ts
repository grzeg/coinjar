import {
  addMonths,
  daysInMonth,
  isMonthKey,
  parseMonthKey,
  toMonthKey,
} from './month.js';

describe('toMonthKey', () => {
  it('formats a date as YYYY-MM', () => {
    expect(toMonthKey(new Date(2026, 8, 24))).toBe('2026-09');
  });

  it('pads single-digit months', () => {
    expect(toMonthKey(new Date(2026, 0, 1))).toBe('2026-01');
  });

  it('uses the local date, not UTC', () => {
    expect(toMonthKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12');
  });
});

describe('isMonthKey', () => {
  it.each(['2026-01', '2026-09', '2026-12'])('accepts %j', (value) => {
    expect(isMonthKey(value)).toBe(true);
  });

  it.each(['2026-00', '2026-13', '2026-9', '26-09', '2026-09-01', ''])(
    'rejects %j',
    (value) => {
      expect(isMonthKey(value)).toBe(false);
    },
  );
});

describe('parseMonthKey', () => {
  it('returns year and 1-based month', () => {
    expect(parseMonthKey('2026-09')).toEqual({ year: 2026, month: 9 });
  });

  it('throws on invalid input', () => {
    expect(() => parseMonthKey('2026-13')).toThrow(RangeError);
  });
});

describe('daysInMonth', () => {
  it.each([
    ['2026-09', 30],
    ['2026-01', 31],
    ['2026-02', 28],
    ['2028-02', 29],
    ['2100-02', 28],
    ['2000-02', 29],
  ])('%s has %i days', (monthKey, expected) => {
    expect(daysInMonth(monthKey)).toBe(expected);
  });
});

describe('addMonths', () => {
  it.each([
    ['2026-09', 1, '2026-10'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-09', -21, '2024-12'],
    ['2026-09', 0, '2026-09'],
  ])('%s %+i → %s', (monthKey, delta, expected) => {
    expect(addMonths(monthKey, delta)).toBe(expected);
  });
});
