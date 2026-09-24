import { z } from 'zod';
import { categorySchema } from '../schemas/category.js';

// Rules that need the whole list, not a single category (CLAUDE.md section 6).
// The same rules will later be enforced by database constraints/triggers.
export const categoryListSchema = z
  .array(categorySchema)
  .superRefine((categories, ctx) => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    const seenNames = new Set<string>();

    categories.forEach((category, index) => {
      const path = [index];

      if (byId.get(category.id) !== category) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'id'],
          message: 'Duplicate category id',
        });
      }

      if (category.parentId !== null) {
        const parent = byId.get(category.parentId);
        if (!parent) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'parentId'],
            message: 'Parent category does not exist',
          });
        } else {
          if (parent.parentId !== null) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, 'parentId'],
              message: 'Categories can have at most two levels',
            });
          }
          if (parent.type !== category.type) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, 'type'],
              message: 'Subcategory type must match its parent',
            });
          }
        }
      }

      // Unique within the parent, ignoring case ("Kawa" and "kawa" clash).
      const nameKey = `${category.parentId ?? 'root'}/${category.name.toLocaleLowerCase('pl')}`;
      if (seenNames.has(nameKey)) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'name'],
          message: 'Category name must be unique within its parent',
        });
      }
      seenNames.add(nameKey);
    });
  });
