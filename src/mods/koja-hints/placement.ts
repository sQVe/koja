import { listOf, numberOf, recordOf } from '../../kit/fields.ts';

export interface CardPlacement {
  left: number;
  right: number;
  bottom: number;
}

const cardGapAbovePanes = 24;

const findNode = (value: unknown, id: string): Record<string, unknown> | null => {
  const node = recordOf(value);

  if (node['id'] === id) {
    return node;
  }

  for (const child of listOf(node['children'])) {
    const found = findNode(child, id);

    if (found !== null) {
      return found;
    }
  }

  return null;
};

const spacingOf = (value: unknown): number => numberOf(value) ?? numberOf(listOf(value)[0]) ?? 0;

const widthOf = (node: Record<string, unknown> | null): number => {
  if (node === null || node['hidden'] === true) {
    return 0;
  }

  return numberOf(recordOf(node['size'])['px']) ?? 0;
};

// The card centers on the main column, which the sidebar, the panel, and the work area's padding
// bound.
export const cardPlacement = (root: unknown): CardPlacement => {
  const workBody = findNode(root, 'work-body');
  const padding = spacingOf(workBody?.['padding']);
  const gap = spacingOf(workBody?.['gap']);
  const panel = widthOf(findNode(root, 'panel'));
  const panelGap = panel === 0 ? 0 : gap;

  return {
    left: widthOf(findNode(root, 'sidebar')) + padding,
    right: padding + panelGap + panel,
    bottom: padding + cardGapAbovePanes,
  };
};
