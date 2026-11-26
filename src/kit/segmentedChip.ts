import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { clearOf } from './palette.ts';
import { controlSize, radius, spacing } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

export interface SegmentedChipOptions {
  label: string;
  count: number;
  active: boolean;
  // A status mark or another leading element, kept before the label.
  start?: Element;
}

// The active chip takes the hover fill and an outline, so the selected row stays the only gray
// pill. An inactive chip keeps its 1 px border clear, so the line does not shift when one turns on.
export const segmentedChip = (options: SegmentedChipOptions): Element => {
  const palette = colors();
  const outline = options.active ? palette.border : clearOf(palette.border);

  const chip = h_flex()
    .h(controlSize.button)
    .px(spacing.medium)
    .gap(spacing.xsmall)
    .flex_none()
    .items_center()
    .rounded(radius.pill)
    .border(spacing.hairline)
    .border_color(outline);

  if (options.active) {
    chip.bg(palette.hover);
  } else {
    chip.hover((element) => element.border_color(palette.selected));
  }

  if (options.start !== undefined) {
    chip.child(options.start);
  }

  const labelBox = div().flex_none();
  const labelInk = options.active ? 'foreground' : 'muted';
  const label = withTextRole(labelBox, 'detail', labelInk);

  const countBox = div().flex_none();
  const count = withTextRole(countBox, 'detail', 'dim');

  // A hovered toggle brightens its text; an active one is already at full ink.
  const inkOnHover = (element: Element): Element =>
    options.active ? element : element.hover((hovered) => hovered.text_color(palette.foreground));

  const labelText = inkOnHover(label.child(options.label));
  const countText = inkOnHover(count.child(String(options.count)));

  return chip.child(labelText).child(countText);
};
