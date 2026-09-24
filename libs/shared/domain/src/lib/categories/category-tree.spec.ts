import type { Category } from '../schemas/category.js';
import { categories, ids } from '../summary/september-2026.fixture.js';
import { categoryListSchema } from './category-list.schema.js';
import {
  buildCategoryTree,
  getLeafCategories,
  getSelectableLeafCategories,
  isLeafCategory,
} from './category-tree.js';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const category = (
  overrides: Partial<Category> & Pick<Category, 'id' | 'name'>,
): Category => ({
  type: 'expense',
  parentId: null,
  order: 0,
  archived: false,
  ...overrides,
});

describe('buildCategoryTree', () => {
  it('groups subcategories under parents, sorted by order', () => {
    const tree = buildCategoryTree([
      category({ id: id(1), name: 'B', order: 1 }),
      category({ id: id(2), name: 'A', order: 0 }),
      category({ id: id(3), name: 'B2', parentId: id(1), order: 1 }),
      category({ id: id(4), name: 'B1', parentId: id(1), order: 0 }),
    ]);

    expect(tree.map((node) => node.category.name)).toEqual(['A', 'B']);
    expect(tree[1]?.children.map((c) => c.name)).toEqual(['B1', 'B2']);
    expect(tree[0]?.children).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = [
      category({ id: id(1), name: 'B', order: 1 }),
      category({ id: id(2), name: 'A', order: 0 }),
    ];
    buildCategoryTree(input);
    expect(input.map((c) => c.name)).toEqual(['B', 'A']);
  });
});

describe('leaf categories', () => {
  it('returns subcategories and top-level categories without children', () => {
    const names = getLeafCategories(categories).map((c) => c.name);

    expect(names).toContain('800+');
    expect(names).toContain('Kawa');
    expect(names).not.toContain('Jedzenie');
  });

  it('hides archived leaves from forms', () => {
    const names = getSelectableLeafCategories(categories).map((c) => c.name);

    expect(names).not.toContain('Akwarium');
  });

  it('treats a parent with only archived children as a non-leaf', () => {
    const list = [
      category({ id: id(1), name: 'Dom' }),
      category({ id: id(2), name: 'Gaz', parentId: id(1), archived: true }),
    ];

    expect(isLeafCategory(list, id(1))).toBe(false);
    expect(isLeafCategory(list, id(2))).toBe(true);
  });

  it('checks a single category', () => {
    expect(isLeafCategory(categories, ids.coffee)).toBe(true);
    expect(isLeafCategory(categories, ids.food)).toBe(false);
    expect(isLeafCategory(categories, id(12345))).toBe(false);
  });
});

describe('categoryListSchema', () => {
  const messages = (list: Category[]) => {
    const result = categoryListSchema.safeParse(list);
    return result.success
      ? []
      : result.error.issues.map((issue) => issue.message);
  };

  it('accepts the fixture tree', () => {
    expect(messages(categories)).toEqual([]);
  });

  it('rejects a third level', () => {
    expect(
      messages([
        category({ id: id(1), name: 'A' }),
        category({ id: id(2), name: 'B', parentId: id(1) }),
        category({ id: id(3), name: 'C', parentId: id(2) }),
      ]),
    ).toEqual(['Categories can have at most two levels']);
  });

  it('rejects a subcategory with a different type than its parent', () => {
    expect(
      messages([
        category({ id: id(1), name: 'A', type: 'income' }),
        category({ id: id(2), name: 'B', parentId: id(1), type: 'expense' }),
      ]),
    ).toEqual(['Subcategory type must match its parent']);
  });

  it('rejects a missing parent', () => {
    expect(
      messages([category({ id: id(2), name: 'B', parentId: id(1) })]),
    ).toEqual(['Parent category does not exist']);
  });

  it('rejects duplicate names within a parent, ignoring case', () => {
    expect(
      messages([
        category({ id: id(1), name: 'Jedzenie' }),
        category({ id: id(2), name: 'Kawa', parentId: id(1) }),
        category({ id: id(3), name: 'kawa', parentId: id(1) }),
      ]),
    ).toEqual(['Category name must be unique within its parent']);
  });

  it('allows the same name under different parents', () => {
    expect(
      messages([
        category({ id: id(1), name: 'Dzieci' }),
        category({ id: id(2), name: 'Inne wydatki' }),
        category({ id: id(3), name: 'Prezenty', parentId: id(1) }),
        category({ id: id(4), name: 'Prezenty', parentId: id(2) }),
      ]),
    ).toEqual([]);
  });

  it('rejects duplicate ids', () => {
    expect(
      messages([
        category({ id: id(1), name: 'A' }),
        category({ id: id(1), name: 'B' }),
      ]),
    ).toEqual(['Duplicate category id']);
  });
});
