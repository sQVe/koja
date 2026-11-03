import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import type { HoverOptions } from './hover.ts';
import { withHover } from './hover.ts';
import { controlSize, iconSize, spacing, textSize } from './size.ts';
import { statusMark } from './statusMark.ts';
import { colors } from './theme.ts';

export interface TabOptions extends HoverOptions {
  label: string;
  active: boolean;
  icon: Element | null;
  status: Status | null;
  close: Element | null;
  // The tab touches the edge of the bar, where the neighbor already draws a line.
  atBarStart?: boolean;
}

const shownStatus = (status: Status | null): Status | null => (status === 'idle' ? null : status);

const startSlot = (iconElement: Element | null): Element => {
  const slot = h_flex().size(iconSize.small).flex_none().items_center().justify_center();

  return iconElement === null ? slot : slot.child(iconElement);
};

const endSlot = (options: TabOptions): Element => {
  const slot = h_flex().size(controlSize.tabSlot).flex_none().items_center().justify_center();

  if (options.active) {
    return options.close === null ? slot : slot.child(options.close);
  }

  return slot.child(statusMark(shownStatus(options.status)));
};

export const tab = (options: TabOptions): Element => {
  const palette = colors();

  const element = h_flex()
    .h_full()
    .px(spacing.medium)
    .gap(spacing.small)
    .flex_none()
    .items_center()
    .text_size(textSize.default)
    .border_color(palette.border);

  if (options.active) {
    element.bg(palette.background).border_r(spacing.hairline).text_color(palette.foreground);

    if (options.atBarStart !== true) {
      element.border_l(spacing.hairline);
    }
  } else {
    element.bg(palette.chrome).border_b(spacing.hairline).text_color(palette.muted);

    withHover(element, options.hovered === true, (styled) => styled.bg(palette.hover));
  }

  element
    .child(startSlot(options.icon))
    .child(div().max_w(controlSize.tabLabelMaxWidth).truncate().child(options.label));

  const status = shownStatus(options.status);

  if (options.active && status !== null) {
    element.child(statusMark(status));
  }

  return element.child(endSlot(options));
};

export const tabBarEdge = (element: Element): Element =>
  element.h_full().border_b(spacing.hairline).border_color(colors().border);
