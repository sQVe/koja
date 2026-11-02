import { layout } from 'herdr';

import { listOf, recordOf, stringOf } from './fields.ts';

// The node with this id in the shown layout's tree, or null.
export const findLayoutNode = (
  id: string,
  node: unknown = layout(),
): Record<string, unknown> | null => {
  const fields = recordOf(node);

  if (stringOf(fields['id']) === id) {
    return fields;
  }

  for (const child of listOf(fields['children'])) {
    const found = findLayoutNode(id, child);

    if (found !== null) {
      return found;
    }
  }

  return null;
};
