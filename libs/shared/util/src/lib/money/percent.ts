const percentFormatter = new Intl.NumberFormat('pl-PL', {
  style: 'percent',
  maximumFractionDigits: 0,
});

/**
 * Formats a ratio (0.3571) as a whole percentage ('36%').
 * Rounding happens only here, for display; calculations keep the raw ratio.
 * A null ratio (e.g. nothing planned) is shown as an em dash.
 */
export function formatPercent(ratio: number | null): string {
  return ratio === null ? '—' : percentFormatter.format(ratio);
}
