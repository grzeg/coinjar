import type { BudgetPlanEntry } from '../schemas/budget-plan.js';
import type { Category } from '../schemas/category.js';
import type { Transaction } from '../schemas/transaction.js';

// Reference fixture from CLAUDE.md section 6 (September 2026, D = 24 Sept).
// Amounts are in grosze.

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const ids = {
  salary: id(1),
  benefit800: id(2),
  food: id(10),
  foodHome: id(11),
  coffee: id(12),
  home: id(20),
  electricity: id(21),
  debt: id(30),
  loan: id(31),
  archivedHobby: id(40),
} as const;

export const categories: Category[] = [
  {
    id: ids.salary,
    name: 'Wynagrodzenie',
    type: 'income',
    parentId: null,
    order: 0,
    archived: false,
  },
  {
    id: ids.benefit800,
    name: '800+',
    type: 'income',
    parentId: null,
    order: 1,
    archived: false,
  },
  {
    id: ids.food,
    name: 'Jedzenie',
    type: 'expense',
    parentId: null,
    order: 2,
    archived: false,
    color: '#ef6c00',
  },
  {
    id: ids.foodHome,
    name: 'Jedzenie dom',
    type: 'expense',
    parentId: ids.food,
    order: 0,
    archived: false,
  },
  {
    id: ids.coffee,
    name: 'Kawa',
    type: 'expense',
    parentId: ids.food,
    order: 1,
    archived: false,
  },
  {
    id: ids.home,
    name: 'Dom',
    type: 'expense',
    parentId: null,
    order: 3,
    archived: false,
  },
  {
    id: ids.electricity,
    name: 'Prąd',
    type: 'expense',
    parentId: ids.home,
    order: 0,
    archived: false,
  },
  {
    id: ids.debt,
    name: 'Spłata długów',
    type: 'expense',
    parentId: null,
    order: 4,
    archived: false,
  },
  {
    id: ids.loan,
    name: 'Kredyt / pożyczka',
    type: 'expense',
    parentId: ids.debt,
    order: 0,
    archived: false,
  },
  // Archived and unused this month: must not show up.
  {
    id: ids.archivedHobby,
    name: 'Akwarium',
    type: 'expense',
    parentId: null,
    order: 5,
    archived: true,
  },
];

export const planEntries: BudgetPlanEntry[] = [
  // Planned income: 20 100,00
  { month: '2026-09', categoryId: ids.salary, planned: 19_300_00 },
  { month: '2026-09', categoryId: ids.benefit800, planned: 800_00 },
  // Planned expenses: 8 450,00
  { month: '2026-09', categoryId: ids.foodHome, planned: 2_000_00 },
  { month: '2026-09', categoryId: ids.coffee, planned: 150_00 },
  { month: '2026-09', categoryId: ids.electricity, planned: 300_00 },
  { month: '2026-09', categoryId: ids.loan, planned: 6_000_00 },
  // Another month: must be ignored.
  { month: '2026-08', categoryId: ids.foodHome, planned: 9_999_00 },
];

let nextTransactionId = 100;
const tx = (date: string, categoryId: string, amount: number): Transaction => ({
  id: id(nextTransactionId++),
  date,
  categoryId,
  amount,
});

export const transactions: Transaction[] = [
  // Actual income: 20 589,26
  tx('2026-09-10', ids.salary, 19_789_26),
  tx('2026-09-15', ids.benefit800, 800_00),
  // Actual expenses: 7 352,44
  tx('2026-09-02', ids.foodHome, 1_234_56),
  tx('2026-09-20', ids.foodHome, 987_65),
  tx('2026-09-05', ids.coffee, 130_23),
  tx('2026-09-01', ids.loan, 5_000_00),
  // Other months: must be ignored.
  tx('2026-08-31', ids.foodHome, 500_00),
  tx('2026-10-01', ids.foodHome, 500_00),
];
