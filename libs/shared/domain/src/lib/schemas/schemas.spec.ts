import {
  categories,
  planEntries,
  transactions,
} from '../summary/september-2026.fixture.js';
import { budgetPlanEntrySchema } from './budget-plan.js';
import { categorySchema } from './category.js';
import { memberSchema } from './member.js';
import { newTransactionSchema, transactionSchema } from './transaction.js';

const ID = '00000000-0000-4000-8000-000000000001';

describe('categorySchema', () => {
  const valid = {
    id: ID,
    name: 'Jedzenie',
    type: 'expense',
    parentId: null,
    order: 0,
    archived: false,
  };

  it('accepts the fixture categories', () => {
    for (const category of categories) {
      expect(categorySchema.safeParse(category).success).toBe(true);
    }
  });

  it('trims the name', () => {
    expect(categorySchema.parse({ ...valid, name: '  Kawa  ' }).name).toBe(
      'Kawa',
    );
  });

  it.each([
    ['empty name', { name: '   ' }],
    ['name over 60 characters', { name: 'x'.repeat(61) }],
    ['unknown type', { type: 'transfer' }],
    ['non-uuid id', { id: 'abc' }],
    ['negative order', { order: -1 }],
    ['fractional order', { order: 1.5 }],
    ['invalid color', { color: 'red' }],
  ])('rejects %s', (_, override) => {
    expect(categorySchema.safeParse({ ...valid, ...override }).success).toBe(
      false,
    );
  });
});

describe('transactionSchema', () => {
  const valid = { id: ID, date: '2026-09-24', amount: 1250, categoryId: ID };

  it('accepts the fixture transactions', () => {
    for (const transaction of transactions) {
      expect(transactionSchema.safeParse(transaction).success).toBe(true);
    }
  });

  it('accepts optional note and member', () => {
    expect(
      transactionSchema.safeParse({ ...valid, note: 'Biedronka', memberId: ID })
        .success,
    ).toBe(true);
  });

  it.each([
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -100 }],
    ['złoty with decimals instead of grosze', { amount: 12.5 }],
    ['non-existent date', { date: '2026-02-30' }],
    ['date with time', { date: '2026-09-24T10:00:00Z' }],
    ['note over 200 characters', { note: 'x'.repeat(201) }],
  ])('rejects %s', (_, override) => {
    expect(transactionSchema.safeParse({ ...valid, ...override }).success).toBe(
      false,
    );
  });

  it('does not require an id for a new transaction', () => {
    const payload = {
      date: valid.date,
      amount: valid.amount,
      categoryId: valid.categoryId,
    };
    expect(newTransactionSchema.safeParse(payload).success).toBe(true);
    expect(
      newTransactionSchema.parse({ ...payload, id: ID }),
    ).not.toHaveProperty('id');
  });
});

describe('budgetPlanEntrySchema', () => {
  it('accepts the fixture plan', () => {
    for (const entry of planEntries) {
      expect(budgetPlanEntrySchema.safeParse(entry).success).toBe(true);
    }
  });

  it('accepts a zero plan', () => {
    expect(
      budgetPlanEntrySchema.safeParse({
        month: '2026-09',
        categoryId: ID,
        planned: 0,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['negative amount', { planned: -1 }],
    ['invalid month', { month: '2026-13' }],
    ['date instead of month', { month: '2026-09-01' }],
  ])('rejects %s', (_, override) => {
    expect(
      budgetPlanEntrySchema.safeParse({
        month: '2026-09',
        categoryId: ID,
        planned: 100,
        ...override,
      }).success,
    ).toBe(false);
  });
});

describe('memberSchema', () => {
  it('accepts a member and rejects an empty name', () => {
    expect(memberSchema.safeParse({ id: ID, name: 'Domownik 1' }).success).toBe(
      true,
    );
    expect(memberSchema.safeParse({ id: ID, name: '' }).success).toBe(false);
  });
});
