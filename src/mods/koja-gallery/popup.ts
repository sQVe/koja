import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { colors, listRow, popupSurface, spacing } from '../../kit/index.ts';

// The gallery itself paints `popover`, so the sample sits on `chrome` to show the surface's edge.
export const popupSurfaces = (): Element[] => [
  div()
    .p(spacing.medium)
    .bg(colors().chrome)
    .child(
      popupSurface('popup-surface-sample')
        .py(spacing.xsmall)
        .child(listRow({ size: 'large', inset: true, state: 'normal', label: 'Normal row' }))
        .child(listRow({ size: 'large', inset: true, state: 'selected', label: 'Selected row' })),
    ),
];
