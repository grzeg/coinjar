/**
 * Formats a local date as a month key 'YYYY-MM'.
 * Uses local date parts on purpose: no UTC conversion, so late-evening
 * dates never jump to the next month.
 */
export function toMonthKey(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
