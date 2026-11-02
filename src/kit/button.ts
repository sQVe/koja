import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from './icon.ts';
import type { IconName } from './iconNames.ts';
import type { Color } from './palette.ts';
import { controlSize, radius, spacing, textSize } from './size.ts';
import { colors } from './theme.ts';

// `hovered` draws the hover look without a pointer, for the gallery.
export type ButtonState = 'normal' | 'hovered';

export interface ToggleButtonOptions {
  label: string;
  active: boolean;
  start?: Element;
  end?: string;
  // A quiet button has nothing behind it, such as a filter that matches nothing.
  quiet?: boolean;
  state?: ButtonState;
}

// A square button with one icon. `small` fits the end slot of a tab.
export const iconButton = (
  name: IconName,
  size: 'default' | 'small' = 'default',
  state: ButtonState = 'normal',
): Element => {
  const palette = colors();
  const side = size === 'small' ? controlSize.tabSlot : controlSize.button;

  const button = h_flex()
    .size(side)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(radius.default)
    .text_color(palette.dim)
    .child(icon(name, 'small'));

  if (state === 'hovered') {
    return button.bg(palette.hover).text_color(palette.foreground);
  }

  return button.hover((style) => style.bg(palette.hover).text_color(palette.foreground));
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
  } else if (options.state === 'hovered') {
    button.bg(palette.hover);
  } else {
    button.hover((style) => style.bg(palette.hover));
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
