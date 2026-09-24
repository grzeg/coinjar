import { formatPercent, formatPLN } from '@coinjar/shared-util';
import type { Category } from '../schemas/category.js';
import {
  computeMonthlySummary,
  type MonthlySummaryInput,
} from './monthly-summary.js';
import {
  categories,
  ids,
  planEntries,
  transactions,
} from './september-2026.fixture.js';

const september: MonthlySummaryInput = {
  month: '2026-09',
  today: '2026-09-24',
  categories,
  transactions,
  planEntries,
};

describe('computeMonthlySummary', () => {
  describe('reference fixture (CLAUDE.md section 6)', () => {
    const summary = computeMonthlySummary(september);

    it('computes planned totals and left to allocate', () => {
      expect(summary.plannedIncome).toBe(20_100_00);
      expect(summary.plannedExpenses).toBe(8_450_00);
      expect(summary.leftToAllocate).toBe(11_650_00);
    });

    it('computes actual totals and money still available', () => {
      expect(summary.actualIncome).toBe(20_589_26);
      expect(summary.actualExpenses).toBe(7_352_44);
      expect(summary.availableToSpend).toBe(13_236_82);
    });

    it('computes days left and the daily average', () => {
      expect(summary.daysInMonth).toBe(30);
      expect(summary.daysLeft).toBe(7);
      // 13 236,82 / 7 = 1 890,974… → rounded to a whole grosz.
      expect(summary.averageAvailablePerDay).toBe(1_890_97);
    });

    it('computes ratios, rounded only for display', () => {
      expect(summary.incomeSpentRatio).toBeCloseTo(0.3571, 4);
      expect(formatPercent(summary.incomeSpentRatio)).toBe('36%');
      expect(summary.monthElapsedRatio).toBe(0.8);
      expect(formatPercent(summary.monthElapsedRatio)).toBe('80%');
    });

    it('formats the headline amounts like the spreadsheet', () => {
      const plain = (grosze: number) =>
        formatPLN(grosze).replace(/\u00a0/g, ' ');

      expect(plain(summary.leftToAllocate)).toBe('11 650,00 zł');
      expect(plain(summary.availableToSpend)).toBe('13 236,82 zł');
      expect(plain(summary.averageAvailablePerDay)).toBe('1 890,97 zł');
    });
  });

  describe('category realisation', () => {
    const summary = computeMonthlySummary(september);
    const row = (categoryId: string) =>
      summary.categories
        .flatMap((group) => [group, ...group.children])
        .find((r) => r.categoryId === categoryId);

    it('lists top-level categories in user order, without unused archived ones', () => {
      expect(summary.categories.map((r) => r.name)).toEqual([
        'Wynagrodzenie',
        '800+',
        'Jedzenie',
        'Dom',
        'Spłata długów',
      ]);
    });

    it('computes leaf realisation and difference', () => {
      expect(row(ids.foodHome)).toMatchObject({
        planned: 2_000_00,
        actual: 2_222_21,
        difference: -222_21, // over the plan
      });
      expect(row(ids.foodHome)?.realisation).toBeCloseTo(1.1111, 4);
    });

    it('aggregates subcategories into their parent', () => {
      expect(row(ids.food)).toMatchObject({
        planned: 2_150_00,
        actual: 2_352_44,
        difference: -202_44,
      });
      expect(row(ids.food)?.children.map((c) => c.name)).toEqual([
        'Jedzenie dom',
        'Kawa',
      ]);
    });

    it('shows 0% realisation for a planned but unused category', () => {
      expect(row(ids.electricity)).toMatchObject({
        planned: 300_00,
        actual: 0,
        realisation: 0,
      });
    });

    it('has no realisation when nothing was planned', () => {
      const result = computeMonthlySummary({
        ...september,
        planEntries: [],
      });

      const salary = result.categories.find((r) => r.categoryId === ids.salary);
      expect(salary?.realisation).toBeNull();
      expect(formatPercent(salary?.realisation ?? null)).toBe('—');
    });

    it('keeps an archived category that has data this month', () => {
      const archived: Category = {
        id: '00000000-0000-4000-8000-000000000099',
        name: 'Stara kategoria',
        type: 'expense',
        parentId: null,
        order: 9,
        archived: true,
      };

      const result = computeMonthlySummary({
        ...september,
        categories: [...categories, archived],
        transactions: [
          ...transactions,
          {
            id: '00000000-0000-4000-8000-000000000999',
            date: '2026-09-03',
            categoryId: archived.id,
            amount: 10_00,
          },
        ],
      });

      expect(result.categories.at(-1)?.name).toBe('Stara kategoria');
      expect(result.actualExpenses).toBe(7_362_44);
    });

    it('ignores transactions on categories outside the tree', () => {
      const result = computeMonthlySummary({
        ...september,
        transactions: [
          ...transactions,
          {
            id: '00000000-0000-4000-8000-000000000998',
            date: '2026-09-03',
            categoryId: '00000000-0000-4000-8000-00000000dead',
            amount: 10_00,
          },
        ],
      });

      expect(result.actualExpenses).toBe(7_352_44);
    });
  });

  describe('reference day', () => {
    it('treats a past month as finished (D = last day)', () => {
      const summary = computeMonthlySummary({
        ...september,
        today: '2026-10-05',
      });

      expect(summary.daysElapsed).toBe(30);
      expect(summary.daysLeft).toBe(1);
      expect(summary.monthElapsedRatio).toBe(1);
      expect(summary.averageAvailablePerDay).toBe(13_236_82);
    });

    it('treats a future month as not started', () => {
      const summary = computeMonthlySummary({
        ...september,
        today: '2026-08-20',
      });

      expect(summary.daysElapsed).toBe(0);
      expect(summary.daysLeft).toBe(30);
      expect(summary.monthElapsedRatio).toBe(0);
    });

    it('counts today as a day left on the last day of the month', () => {
      const summary = computeMonthlySummary({
        ...september,
        today: '2026-09-30',
      });

      expect(summary.daysLeft).toBe(1);
    });
  });

  it('handles an empty month', () => {
    const summary = computeMonthlySummary({
      month: '2026-09',
      today: '2026-09-24',
      categories: [],
      transactions: [],
      planEntries: [],
    });

    expect(summary).toMatchObject({
      plannedIncome: 0,
      actualIncome: 0,
      availableToSpend: 0,
      averageAvailablePerDay: 0,
      incomeSpentRatio: null,
      categories: [],
    });
  });

  it('allows a negative balance when expenses exceed income', () => {
    const summary = computeMonthlySummary({
      ...september,
      transactions: [
        {
          id: '00000000-0000-4000-8000-000000000997',
          date: '2026-09-01',
          categoryId: ids.loan,
          amount: 700_00,
        },
      ],
    });

    expect(summary.availableToSpend).toBe(-700_00);
    expect(summary.averageAvailablePerDay).toBe(-100_00);
    expect(summary.incomeSpentRatio).toBeNull();
  });
});
