import { toMonthKey } from './month.js';

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
