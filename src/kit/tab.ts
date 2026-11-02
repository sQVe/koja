import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import { controlSize, iconSize, spacing, textSize } from './size.ts';
import { statusMark } from './statusMark.ts';
import { colors } from './theme.ts';

export interface TabOptions {
  label: string;
  active: boolean;
  icon: Element | null;
  // Idle is the usual state, so a tab shows no mark for it.
  status: Status | null;
  // Shown on the active tab only, in the slot where other tabs show their status.
  close: Element | null;
  hovered?: boolean;
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

// A tab the full height of its bar. The active one takes the pane's background and is open at
// the bottom, so it joins the pane; the others sit on the bar's bottom border.
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
    element
      .bg(palette.background)
      .border_l(spacing.hairline)
      .border_r(spacing.hairline)
      .text_color(palette.foreground);
  } else {
    const background = options.hovered === true ? palette.hover : palette.chrome;

    element
      .bg(background)
      .border_b(spacing.hairline)
      .text_color(palette.muted)
      .hover((style) => style.bg(palette.hover));
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

// The part of a tab bar beside the tabs, which carries the bar's bottom border.
export const tabBarEdge = (element: Element): Element =>
  element.h_full().border_b(spacing.hairline).border_color(colors().border);
