import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { DirectionTokens } from './tokens.ts';
import type { SidebarDrawing } from './window.ts';
import { directionWindow } from './window.ts';

const cardPadding = 6;
const cardGap = 2;

export const cardFrame = (tokens: DirectionTokens): Element =>
  v_flex()
    .p(cardPadding)
    .gap(cardGap)
    .rounded(tokens.pane.radius)
    .bg(tokens.pane.fill)
    .border(1)
    .border_color(tokens.pane.border);

export const floating = (width: number, tokens: DirectionTokens): Element =>
  cardFrame(tokens).absolute().w(width);

export const withFloating = (
  drawSidebar: SidebarDrawing,
  floatingParts: Element[],
  tokens: DirectionTokens,
): Element =>
  v_flex()
    .relative()
    .flex_1()
    .min_h(0)
    .child(directionWindow(tokens, drawSidebar))
    .children(floatingParts);
