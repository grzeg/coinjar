import { formatPercent } from './percent.js';

describe('formatPercent', () => {
  it('rounds to whole percents for display', () => {
    expect(formatPercent(0.3571)).toBe('36%');
    expect(formatPercent(0.8)).toBe('80%');
    expect(formatPercent(1.254)).toBe('125%');
  });

  it('shows an em dash when there is no ratio', () => {
    expect(formatPercent(null)).toBe('—');
  });
});
