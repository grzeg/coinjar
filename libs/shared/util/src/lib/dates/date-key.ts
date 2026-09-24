// Date keys are local calendar dates 'YYYY-MM-DD' with no time zone
// (CLAUDE.md section 5). Never round-trip them through toISOString(),
// which converts to UTC and can shift the day.

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Checks the format and that the date exists (no 2026-02-30). */
export function isDateKey(value: string): boolean {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // UTC here only as a calendar calculator: no local DST quirks.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Formats a local date as 'YYYY-MM-DD'. */
export function toDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** '2026-09-24' → '2026-09' */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** '2026-09-24' → 24 */
export function dayOfMonth(dateKey: string): number {
  return Number(dateKey.slice(8, 10));
}
