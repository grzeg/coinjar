import { dayOfMonth, isDateKey, monthKeyOf, toDateKey } from './date-key.js';

describe('isDateKey', () => {
  it.each(['2026-09-24', '2028-02-29', '2026-12-31'])('accepts %j', (value) => {
    expect(isDateKey(value)).toBe(true);
  });

  it.each([
    '2026-02-29',
    '2026-09-31',
    '2026-13-01',
    '2026-00-10',
    '2026-9-24',
    '2026-09-24T10:00',
    '',
  ])('rejects %j', (value) => {
    expect(isDateKey(value)).toBe(false);
  });
});

describe('toDateKey', () => {
  it('formats a local date', () => {
    expect(toDateKey(new Date(2026, 8, 4))).toBe('2026-09-04');
  });

  it('keeps the local day late in the evening', () => {
    expect(toDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});

describe('monthKeyOf / dayOfMonth', () => {
  it('extracts parts of a date key', () => {
    expect(monthKeyOf('2026-09-24')).toBe('2026-09');
    expect(dayOfMonth('2026-09-24')).toBe(24);
    expect(dayOfMonth('2026-09-01')).toBe(1);
  });
});
