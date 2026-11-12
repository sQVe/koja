import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { Color } from './palette.ts';
import { hoverCardSize, radius, rowHeight, spacing } from './size.ts';
import { separator } from './text.ts';
import { colors } from './theme.ts';

export interface HoverCardOptions {
  arrowTop: number;
  header: Element;
  body: Element[];
  footer: Element;
}

const arrowColumns = hoverCardSize.arrowDepth - 1;

// One layer of the arrow: 1 px columns that grow 2 px each, so both edges run at 45 degrees and
// stay crisp. GPUI cannot rotate a box.
const arrowLayer = (left: number, arrowTop: number, color: Color): Element =>
  h_flex()
    .absolute()
    .left(left)
    .top(arrowTop - arrowColumns)
    .h(arrowColumns * 2 + 1)
    .items_center()
    .children(
      Array.from({ length: arrowColumns + 1 }, (_unused, column) =>
        div()
          .w(spacing.hairline)
          .h(column * 2 + 1)
          .flex_none()
          .bg(color),
      ),
    );

const cardLine = (content: Element): Element =>
  h_flex().flex_none().min_w(0).h(rowHeight.small).px(spacing.small).items_center().child(content);

const card = (options: HoverCardOptions): Element => {
  const palette = colors();

  return v_flex()
    .w(hoverCardSize.width)
    .flex_none()
    .py(spacing.xsmall)
    .rounded(radius.pill)
    .border(spacing.hairline)
    .border_color(palette.border)
    .bg(palette.popover)
    .child(cardLine(options.header))
    .child(separator())
    .children(options.body)
    .child(separator())
    .child(cardLine(options.footer));
};

// The fill layer sits 1 px inside the border layer and reaches over the card's left border, so
// arrow and card read as one shape.
export const hoverCard = (options: HoverCardOptions): Element => {
  const palette = colors();

  return div()
    .relative()
    .flex_none()
    .pl(hoverCardSize.arrowDepth)
    .child(card(options))
    .child(arrowLayer(spacing.none, options.arrowTop, palette.border))
    .child(arrowLayer(spacing.hairline, options.arrowTop, palette.popover));
};
