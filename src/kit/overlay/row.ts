import type { Element } from 'gpui-kit';

import type { ListRowOptions } from '../listRow.ts';
import { listRow } from '../listRow.ts';
import { radius, spacing } from '../size.ts';

export type OverlayRowOptions = Omit<ListRowOptions, 'inset' | 'depth'>;

// An overlay row fills the card's content width, so its pill runs to the card's padding. The row's
// hairline outline sits inside that padding, so the padding drops one pixel to keep the row's
// content on the card's padding edge, as the card's other children are.
export const overlayRow = (options: OverlayRowOptions): Element =>
  listRow({ ...options, inset: false })
    .px(spacing.medium - spacing.hairline)
    .rounded(radius.pill);
