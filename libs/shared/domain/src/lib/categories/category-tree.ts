import type { Category } from '../schemas/category.js';

export interface CategoryNode {
  category: Category;
  /** Subcategories sorted by `order`. Empty for a top-level leaf. */
  children: Category[];
}

const byOrder = (a: Category, b: Category) => a.order - b.order;

/** Groups categories into a two-level tree, both levels sorted by `order`. */
export function buildCategoryTree(
  categories: readonly Category[],
): CategoryNode[] {
  const childrenByParent = new Map<string, Category[]>();
  for (const category of categories) {
    if (category.parentId !== null) {
      const siblings = childrenByParent.get(category.parentId) ?? [];
      siblings.push(category);
      childrenByParent.set(category.parentId, siblings);
    }
  }

  return categories
    .filter((category) => category.parentId === null)
    .toSorted(byOrder)
    .map((category) => ({
      category,
      children: (childrenByParent.get(category.id) ?? []).toSorted(byOrder),
    }));
}

/**
 * Leaves are categories without children: subcategories and top-level
 * categories that have none (e.g. income "800+"). Transactions and plan
 * entries are assigned to leaves only. Archived children still count as
 * children, because history may point to them.
 */
export function getLeafCategories(categories: readonly Category[]): Category[] {
  const parentIds = new Set(
    categories.flatMap((category) =>
      category.parentId === null ? [] : [category.parentId],
    ),
  );
  return categories.filter((category) => !parentIds.has(category.id));
}

/** Leaves that can be picked in forms: archived categories are hidden. */
export function getSelectableLeafCategories(
  categories: readonly Category[],
): Category[] {
  return getLeafCategories(categories).filter((category) => !category.archived);
}

export function isLeafCategory(
  categories: readonly Category[],
  categoryId: string,
): boolean {
  return getLeafCategories(categories).some(
    (category) => category.id === categoryId,
  );
}
