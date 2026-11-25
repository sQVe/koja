import type { Element } from 'gpui-kit';

import { popupSurface } from '../popupSurface.ts';
import { spacing } from '../size.ts';
import { colors } from '../theme.ts';

// The overlay sits one step lighter than the pane fill, so it reads as a layer above the panes. The
// mid-gray outline stays on the card in both modes, so the edge never reads as the insert-mode
// focus border or the normal-mode indigo.
export const overlayCard = (id: string): Element =>
  popupSurface(id)
    .p(spacing.small)
    .gap(spacing.xxsmall)
    .border(spacing.hairline)
    .border_color(colors().border);
