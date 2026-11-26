import type { Element } from 'gpui-kit';

import type { ListRowOptions } from '../listRow.ts';
import { listRow } from '../listRow.ts';
import { radius, spacing } from '../size.ts';

export type OverlayRowOptions = Omit<ListRowOptions, 'inset'>;

// An overlay row fills the card's content width, so its pill runs to the card's padding.
export const overlayRow = (options: OverlayRowOptions): Element =>
  listRow({ ...options, inset: false })
    .px(spacing.medium)
    .rounded(radius.pill);
