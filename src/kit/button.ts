import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { HoverOptions } from './hover.ts';
import { withHover } from './hover.ts';
import { icon } from './icon.ts';
import type { IconName } from './iconNames.ts';
import type { Color } from './palette.ts';
import { actionHoverOpacity, controlSize, radius, spacing, textSize } from './size.ts';
import { colors } from './theme.ts';

export type DialogButtonKind = 'solid' | 'danger' | 'outline';

export interface DialogButtonOptions extends HoverOptions {
  label: string;
  kind: DialogButtonKind;
}

export interface IconButtonOptions extends HoverOptions {
  name: IconName;
  size?: 'default' | 'small';
}

export interface ToggleButtonOptions extends HoverOptions {
  label: string;
  active: boolean;
  start?: Element;
  end?: string;
  quiet?: boolean;
}

export interface ActionButtonOptions extends HoverOptions {
  label: string;
  enabled: boolean;
}

export const iconButton = (options: IconButtonOptions): Element => {
  const palette = colors();
  const side = options.size === 'small' ? controlSize.smallButton : controlSize.button;

  const button = h_flex()
    .size(side)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(radius.pill)
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

export const actionButton = (options: ActionButtonOptions): Element => {
  const palette = colors();

  const button = h_flex()
    .h(controlSize.button)
    .px(spacing.large)
    .flex_none()
    .items_center()
    .rounded(radius.pill)
    .text_size(textSize.small)
    .child(options.label);

  if (options.enabled) {
    const enabledButton = button
      .bg(palette.solid)
      .text_color(palette.solid_foreground)
      .cursor_pointer();

    return withHover(enabledButton, options.hovered === true, (element) =>
      element.opacity(actionHoverOpacity),
    );
  }

  return button.bg(palette.raised).text_color(palette.dim);
};

const dialogButtonBase = (label: string): Element =>
  h_flex()
    .h(controlSize.dialogButton)
    .px(spacing.large)
    .flex_none()
    .items_center()
    .rounded(radius.pill)
    .text_size(textSize.small)
    .cursor_pointer()
    .child(label);

const solidDialogButton = (label: string, hovered: boolean): Element => {
  const palette = colors();
  const button = dialogButtonBase(label).bg(palette.solid).text_color(palette.solid_foreground);

  return withHover(button, hovered, (element) => element.opacity(actionHoverOpacity));
};

// Dimming the fill would also dim the label below AA, so hover draws a ring instead.
const dangerDialogButton = (label: string, hovered: boolean): Element => {
  const palette = colors();

  const button = dialogButtonBase(label)
    .border(spacing.hairline)
    .border_color(palette.ansi1)
    .bg(palette.ansi1)
    .text_color(palette.popover);

  return withHover(button, hovered, (element) => element.border_color(palette.foreground));
};

const outlineDialogButton = (label: string, hovered: boolean): Element => {
  const palette = colors();

  const button = dialogButtonBase(label)
    .border(spacing.hairline)
    .border_color(palette.border)
    .text_color(palette.foreground);

  return withHover(button, hovered, (element) => element.bg(palette.hover));
};

export const dialogButton = (options: DialogButtonOptions): Element => {
  const hovered = options.hovered === true;

  if (options.kind === 'outline') {
    return outlineDialogButton(options.label, hovered);
  }

  if (options.kind === 'danger') {
    return dangerDialogButton(options.label, hovered);
  }

  return solidDialogButton(options.label, hovered);
};

export const toggleButton = (options: ToggleButtonOptions): Element => {
  const palette = colors();

  const button = h_flex()
    .h(controlSize.button)
    .px(spacing.small)
    .gap(spacing.xsmall)
    .flex_none()
    .items_center()
    .rounded(radius.pill)
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
