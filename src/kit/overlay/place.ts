import { listOf, numberOf, recordOf, stringOf } from '../fields.ts';
import { spacing } from '../size.ts';

export interface MainColumnInsets {
  left: number;
  top: number;
}

interface MainColumnPlacement {
  left: number;
  right: number;
  top: number;
}

// Herdr places a frameless popup's root 8 px inside the window on every side, while the root
// reports the window's own size.
const popupInset = spacing.medium;

const findNode = (id: string, value: unknown): Record<string, unknown> | null => {
  const node = recordOf(value);

  if (stringOf(node['id']) === id) {
    return node;
  }

  for (const child of listOf(node['children'])) {
    const found = findNode(id, child);

    if (found !== null) {
      return found;
    }
  }

  return null;
};

const pxOf = (node: Record<string, unknown> | null): number =>
  numberOf(recordOf(node?.['size'])['px']) ?? 0;

const paddingOf = (value: unknown): number => {
  const direct = numberOf(value);

  if (direct !== null) {
    return direct;
  }

  return numberOf(listOf(value)[0]) ?? 0;
};

// The palette places its card from the window's own edges, so it needs the width the sidebar takes
// and the height the tab bar and the work area's padding take.
export const mainColumnInsets = (layoutTree: unknown): MainColumnInsets => {
  const sidebar = findNode('sidebar', layoutTree);
  const tabs = findNode('tabs', layoutTree);
  const workBody = findNode('work-body', layoutTree);

  const left = sidebar?.['hidden'] === true ? 0 : pxOf(sidebar);
  const top = pxOf(tabs) + paddingOf(workBody?.['padding']);

  return { left, top };
};

export const mainColumnPlacement = (
  insets: MainColumnInsets,
  topOffset: number,
): MainColumnPlacement => ({
  left: Math.max(0, insets.left - popupInset),
  right: popupInset,
  top: Math.max(0, insets.top + topOffset - popupInset),
});
