// Month keys are 'YYYY-MM' strings. They sort lexicographically in
// chronological order, so plain string comparison works for them.

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface YearMonth {
  year: number;
  /** 1–12 */
  month: number;
}

export function isMonthKey(value: string): boolean {
  return MONTH_KEY_PATTERN.test(value);
}

/** Parses 'YYYY-MM'. Throws on invalid input: callers validate first. */
export function parseMonthKey(monthKey: string): YearMonth {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) {
    throw new RangeError(`Invalid month key: "${monthKey}"`);
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

function formatMonthKey({ year, month }: YearMonth): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * Formats a local date as a month key 'YYYY-MM'.
 * Uses local date parts on purpose: no UTC conversion, so late-evening
 * dates never jump to the next month.
 */
export function toMonthKey(date: Date): string {
  return formatMonthKey({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  });
}

export function daysInMonth(monthKey: string): number {
  const { year, month } = parseMonthKey(monthKey);
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

/** Moves a month key by `delta` months (negative = back). */
export function addMonths(monthKey: string, delta: number): string {
  const { year, month } = parseMonthKey(monthKey);
  const index = year * 12 + (month - 1) + delta;
  return formatMonthKey({
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  });
}
