import { formatAmountInput, formatPLN, fromGrosze, toGrosze } from './money.js';

// Intl uses non-breaking spaces; compare with regular ones for readability.
const normalizeSpaces = (value: string) =>
  value.replace(/[\u00a0\u202f]/g, ' ');

describe('toGrosze', () => {
  it.each([
    ['12,50', 1250],
    ['12.50', 1250],
    ['12,5', 1250],
    ['12', 1200],
    ['0,01', 1],
    ['0', 0],
    ['1 234,56', 123456],
    ['1\u00a0234,56', 123456],
    ['  7,00 ', 700],
    ['-3,20', -320],
  ])('parses %j as %i grosze', (input, expected) => {
    expect(toGrosze(input)).toBe(expected);
  });

  it('avoids floating-point errors', () => {
    // 0.29 * 100 === 28.999999999999996 in floating point.
    expect(toGrosze('0,29')).toBe(29);
    expect(toGrosze('1,005')).toBeNull();
  });

  it('turns -0 into 0', () => {
    expect(Object.is(toGrosze('-0'), 0)).toBe(true);
  });

  it.each([
    '',
    ' ',
    'abc',
    '12,345',
    '1,2,3',
    '12,',
    ',5',
    '=10+5,20',
    '1e3',
    '--1',
  ])('rejects %j', (input) => {
    expect(toGrosze(input)).toBeNull();
  });

  it('rejects amounts beyond the safe integer range', () => {
    expect(toGrosze('999999999999999999')).toBeNull();
  });
});

describe('fromGrosze', () => {
  it('converts grosze to złoty', () => {
    expect(fromGrosze(123456)).toBe(1234.56);
    expect(fromGrosze(1)).toBe(0.01);
  });
});

describe('formatPLN', () => {
  it.each([
    [123456, '1 234,56 zł'],
    [2010000, '20 100,00 zł'],
    [5, '0,05 zł'],
    [0, '0,00 zł'],
    [-735244, '-7 352,44 zł'],
  ])('formats %i as %j', (grosze, expected) => {
    expect(normalizeSpaces(formatPLN(grosze))).toBe(expected);
  });

  it('uses non-breaking spaces so the amount never wraps', () => {
    expect(formatPLN(123456)).toBe('1\u00a0234,56\u00a0zł');
  });
});

describe('formatAmountInput', () => {
  it.each([
    [123456, '1234,56'],
    [5, '0,05'],
    [1200, '12,00'],
    [-320, '-3,20'],
  ])('formats %i as %j', (grosze, expected) => {
    expect(formatAmountInput(grosze)).toBe(expected);
  });

  it('round-trips with toGrosze', () => {
    for (const grosze of [0, 1, 99, 100, 123456, -320]) {
      expect(toGrosze(formatAmountInput(grosze))).toBe(grosze);
    }
  });
});
