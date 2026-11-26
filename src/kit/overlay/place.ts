import { findLayoutNode, layoutRoot } from '../layout.ts';
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

// The palette places its card from the window's own edges, so it needs the width the sidebar takes
// and the height the tab bar and the work area's padding take.
export const mainColumnInsets = (): MainColumnInsets => {
  const root = layoutRoot();
  const sidebar = findLayoutNode('sidebar', root);
  const tabs = findLayoutNode('tabs', root);
  const workBody = findLayoutNode('work-body', root);

  const left = sidebar?.hidden === true ? 0 : (sidebar?.sizePx ?? 0);
  const top = (tabs?.sizePx ?? 0) + (workBody?.padding ?? 0);

  return { left, top };
};

export const mainColumnPlacement = (
  insets: MainColumnInsets,
  topOffset: number,
): MainColumnPlacement => ({
  left: Math.max(0, insets.left - popupInset),
  right: 2 * popupInset - Math.min(insets.left, popupInset),
  top: Math.max(0, insets.top + topOffset - popupInset),
});
