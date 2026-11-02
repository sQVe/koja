import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { HoverOptions } from './hover.ts';
import { withHover } from './hover.ts';
import { icon } from './icon.ts';
import type { IconName } from './iconNames.ts';
import type { Color } from './palette.ts';
import { controlSize, radius, spacing, textSize } from './size.ts';
import { colors } from './theme.ts';

export interface IconButtonOptions extends HoverOptions {
  name: IconName;
  // `small` fits the end slot of a tab.
  size?: 'default' | 'small';
}

export interface ToggleButtonOptions extends HoverOptions {
  label: string;
  active: boolean;
  start?: Element;
  end?: string;
  // A quiet button has nothing behind it, such as a filter that matches nothing.
  quiet?: boolean;
}

// A square button with one icon.
export const iconButton = (options: IconButtonOptions): Element => {
  const palette = colors();
  const side = options.size === 'small' ? controlSize.tabSlot : controlSize.button;

  const button = h_flex()
    .size(side)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(radius.default)
    .text_color(palette.dim)
    .child(icon(options.name, 'small'));

  return withHover(button, options.hovered === true, (element) =>
    element.bg(palette.hover).text_color(palette.foreground),
  );
};

const toggleTextColor = (options: ToggleButtonOptions): Color => {
  const palette = colors();

  if (options.active) {
    return palette.foreground;
  }

  return options.quiet === true ? palette.dim : palette.muted;
};

// A button that stays on or off, such as a side panel's or a filter's.
export const toggleButton = (options: ToggleButtonOptions): Element => {
  const palette = colors();

  const button = h_flex()
    .h(controlSize.button)
    .px(spacing.small)
    .gap(spacing.xsmall)
    .flex_none()
    .items_center()
    .rounded(radius.default)
    .cursor_pointer()
    .text_size(textSize.small)
    .text_color(toggleTextColor(options));

  if (options.active) {
    button.bg(palette.selected);
  } else {
    withHover(button, options.hovered === true, (element) => element.bg(palette.hover));
  }

  if (options.start !== undefined) {
    button.child(options.start);
  }

  button.child(options.label);

  if (options.end !== undefined) {
    button.child(h_flex().text_color(palette.dim).child(options.end));
  }

  return button;
};
