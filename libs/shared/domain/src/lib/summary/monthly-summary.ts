import { dayOfMonth, daysInMonth, monthKeyOf } from '@coinjar/shared-util';
import { buildCategoryTree } from '../categories/category-tree.js';
import type { BudgetPlanEntry } from '../schemas/budget-plan.js';
import type { Category, CategoryType } from '../schemas/category.js';
import type { Transaction } from '../schemas/transaction.js';

export interface MonthlySummaryInput {
  /** 'YYYY-MM' */
  month: string;
  /** Today as 'YYYY-MM-DD'. Passed in (not read from the clock) to keep the function pure. */
  today: string;
  categories: readonly Category[];
  transactions: readonly Transaction[];
  planEntries: readonly BudgetPlanEntry[];
}

export interface CategoryRealisation {
  categoryId: string;
  name: string;
  type: CategoryType;
  archived: boolean;
  /** Grosze. */
  planned: number;
  /** Grosze. */
  actual: number;
  /** planned − actual in grosze; negative = over the plan. */
  difference: number;
  /** actual / planned as a raw ratio; null when nothing was planned. */
  realisation: number | null;
  /** Subcategories; empty for leaves. */
  children: CategoryRealisation[];
}

export interface MonthlySummary {
  plannedIncome: number;
  plannedExpenses: number;
  /** Planned income − planned expenses. Goal: 0 (zero-based budgeting). */
  leftToAllocate: number;
  actualIncome: number;
  actualExpenses: number;
  /** Actual income − actual expenses. */
  availableToSpend: number;
  daysInMonth: number;
  /** day(D); 0 for a future month. */
  daysElapsed: number;
  /** Days left including today. */
  daysLeft: number;
  /** availableToSpend / daysLeft, rounded to a whole grosz. */
  averageAvailablePerDay: number;
  /** actualExpenses / actualIncome; null without income. */
  incomeSpentRatio: number | null;
  /** daysElapsed / daysInMonth. */
  monthElapsedRatio: number;
  /** Top-level categories (with subcategories), sorted by `order`. */
  categories: CategoryRealisation[];
}

/**
 * Which day of month M counts as "today" (D):
 * - current month: today's day,
 * - past month: its last day (the month is over),
 * - future month: 0 (nothing has elapsed yet), a choice not covered by
 *   CLAUDE.md: the formula days − day(D) + 1 would otherwise give days + 1.
 */
function referenceDay(month: string, today: string, days: number): number {
  const currentMonth = monthKeyOf(today);
  if (month === currentMonth) {
    return dayOfMonth(today);
  }
  // 'YYYY-MM' keys compare chronologically as strings.
  return month < currentMonth ? days : 0;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function sumByCategory<T extends { categoryId: string }>(
  items: readonly T[],
  amountOf: (item: T) => number,
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const item of items) {
    sums.set(
      item.categoryId,
      (sums.get(item.categoryId) ?? 0) + amountOf(item),
    );
  }
  return sums;
}

function toRealisation(
  category: Category,
  planned: number,
  actual: number,
  children: CategoryRealisation[] = [],
): CategoryRealisation {
  return {
    categoryId: category.id,
    name: category.name,
    type: category.type,
    archived: category.archived,
    planned,
    actual,
    difference: planned - actual,
    realisation: ratio(actual, planned),
    children,
  };
}

// Archived categories stay visible only when they carry data for this month.
function isVisible(row: CategoryRealisation): boolean {
  return (
    !row.archived ||
    row.planned !== 0 ||
    row.actual !== 0 ||
    row.children.length > 0
  );
}

export function computeMonthlySummary(
  input: MonthlySummaryInput,
): MonthlySummary {
  const { month, today, categories } = input;

  const transactions = input.transactions.filter(
    (t) => monthKeyOf(t.date) === month,
  );
  const planEntries = input.planEntries.filter(
    (entry) => entry.month === month,
  );

  const actualByCategory = sumByCategory(transactions, (t) => t.amount);
  const plannedByCategory = sumByCategory(
    planEntries,
    (entry) => entry.planned,
  );

  // Totals are built from category rows, so amounts on unknown categories
  // (data outside the tree) are ignored consistently everywhere.
  const rows = buildCategoryTree(categories)
    .map(({ category, children }) => {
      if (children.length === 0) {
        return toRealisation(
          category,
          plannedByCategory.get(category.id) ?? 0,
          actualByCategory.get(category.id) ?? 0,
        );
      }
      const childRows = children
        .map((child) =>
          toRealisation(
            child,
            plannedByCategory.get(child.id) ?? 0,
            actualByCategory.get(child.id) ?? 0,
          ),
        )
        .filter(isVisible);
      const planned = childRows.reduce((sum, row) => sum + row.planned, 0);
      const actual = childRows.reduce((sum, row) => sum + row.actual, 0);
      return toRealisation(category, planned, actual, childRows);
    })
    .filter(isVisible);

  const total = (type: CategoryType, field: 'planned' | 'actual') =>
    rows
      .filter((row) => row.type === type)
      .reduce((sum, row) => sum + row[field], 0);

  const plannedIncome = total('income', 'planned');
  const plannedExpenses = total('expense', 'planned');
  const actualIncome = total('income', 'actual');
  const actualExpenses = total('expense', 'actual');
  const availableToSpend = actualIncome - actualExpenses;

  const days = daysInMonth(month);
  const daysElapsed = referenceDay(month, today, days);
  // At least 1 day is always left: for a past month it is its last day.
  const daysLeft = daysElapsed === 0 ? days : days - daysElapsed + 1;

  return {
    plannedIncome,
    plannedExpenses,
    leftToAllocate: plannedIncome - plannedExpenses,
    actualIncome,
    actualExpenses,
    availableToSpend,
    daysInMonth: days,
    daysElapsed,
    daysLeft,
    averageAvailablePerDay: Math.round(availableToSpend / daysLeft),
    incomeSpentRatio: ratio(actualExpenses, actualIncome),
    monthElapsedRatio: daysElapsed / days,
    categories: rows,
  };
}
