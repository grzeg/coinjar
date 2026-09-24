// Amounts are integers in grosze (1/100 PLN). Parsing works on the string
// representation, so no floating-point multiplication (0.1 + 0.2 issues)
// is ever involved.

const AMOUNT_PATTERN = /^(-)?(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Parses a user-entered amount in złoty ('12,50', '12.50', '1 234,5')
 * into grosze. Returns null when the input is not a valid amount.
 */
export function toGrosze(input: string): number | null {
  // Users paste amounts with regular, non-breaking or narrow spaces.
  const normalized = input.trim().replace(/[\s\u00a0\u202f]/g, '');
  const match = AMOUNT_PATTERN.exec(normalized);
  if (!match) {
    return null;
  }

  const [, sign, whole = '', fraction = ''] = match;
  const grosze = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(grosze)) {
    return null;
  }
  // `|| 0` turns -0 into 0.
  return (sign ? -grosze : grosze) || 0;
}

/** Converts grosze to złoty. For display and interop only, never for maths. */
export function fromGrosze(grosze: number): number {
  return grosze / 100;
}

// Polish CLDR data groups thousands only from 5 digits ('1234,56 zł' but
// '12 345,67 zł'). 'always' keeps amounts consistent in tables and columns.
const plnFormatter = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  useGrouping: 'always',
});

/**
 * Formats grosze as PLN, e.g. 123456 → '1 234,56 zł'.
 * Separators are non-breaking spaces (U+00A0), so the amount never wraps.
 */
export function formatPLN(grosze: number): string {
  return plnFormatter.format(fromGrosze(grosze));
}

/**
 * Formats grosze for an amount input field, e.g. 123456 → '1234,56'.
 * No grouping and no currency, so the value can be parsed back by toGrosze.
 */
export function formatAmountInput(grosze: number): string {
  const sign = grosze < 0 ? '-' : '';
  const abs = Math.abs(grosze);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${String(whole)},${fraction}`;
}
