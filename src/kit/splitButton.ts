import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from './icon.ts';
import { listRow } from './listRow.ts';
import { popupSurface } from './popupSurface.ts';
import {
  controlSize,
  iconSize,
  radius,
  rowHeight,
  separatorHeight,
  spacing,
  textSize,
} from './size.ts';
import { separator } from './text.ts';
import { colors } from './theme.ts';

export interface SplitButtonChoice {
  label: string;
  current?: boolean;
  // Draws a line above this choice, before a different kind of action.
  divided?: boolean;
  action: () => void;
}

export interface SplitButtonOptions {
  label: string;
  open: boolean;
  onMainAction: () => void;
  onToggleMenu: () => void;
  choices: SplitButtonChoice[];
}

const menuMark = (current: boolean): Element => {
  const slot = h_flex().size(iconSize.small).flex_none().items_center().justify_center();

  if (!current) {
    return slot;
  }

  const mark = icon('check', 'small').text_color(colors().muted);

  return slot.child(mark);
};

const menuRow = (choice: SplitButtonChoice): Element => {
  const current = choice.current === true;
  const state = current ? 'selected' : 'normal';

  const row = listRow({
    size: 'small',
    inset: true,
    state,
    start: menuMark(current),
    label: choice.label,
  });

  return row.on_click((_event, cx) => {
    cx.stop_propagation();
    choice.action();
  });
};

const menuChildren = (choices: readonly SplitButtonChoice[]): Element[] => {
  const children: Element[] = [];

  for (const choice of choices) {
    if (choice.divided === true) {
      children.push(separator());
    }

    children.push(menuRow(choice));
  }

  return children;
};

const labelSegment = (options: SplitButtonOptions): Element =>
  h_flex()
    .flex_1()
    .min_w(0)
    .items_center()
    .justify_center()
    .cursor_pointer()
    .child(options.label)
    .on_click((_event, cx) => {
      cx.stop_propagation();
      options.onMainAction();
    });

const chevronSegment = (options: SplitButtonOptions): Element => {
  const palette = colors();

  return h_flex()
    .w(controlSize.dialogButton)
    .flex_none()
    .items_center()
    .justify_center()
    .border_l(spacing.hairline)
    .border_color(palette.border)
    .cursor_pointer()
    .child(icon('chevron-down', 'small'))
    .accessibility_label(`${options.label} menu`)
    .on_click((_event, cx) => {
      cx.stop_propagation();
      options.onToggleMenu();
    });
};

const button = (options: SplitButtonOptions): Element => {
  const palette = colors();

  return h_flex()
    .h(controlSize.dialogButton)
    .w(controlSize.splitButtonWidth)
    .flex_none()
    .items_stretch()
    .rounded(radius.pill)
    .bg(palette.solid)
    .text_color(palette.solid_foreground)
    .text_size(textSize.small)
    .child(labelSegment(options))
    .child(chevronSegment(options));
};

const menu = (options: SplitButtonOptions): Element =>
  popupSurface('split-button-menu')
    .absolute()
    .top(controlSize.dialogButton + spacing.xsmall)
    .right(spacing.none)
    .w_full()
    .py(spacing.xsmall)
    .children(menuChildren(options.choices));

// The room an open split button takes, because its menu draws over the content below it.
export const splitButtonOpenHeight = (choices: readonly SplitButtonChoice[]): number => {
  const rowHeights = choices.reduce(
    (height, choice) => height + rowHeight.small + (choice.divided === true ? separatorHeight : 0),
    0,
  );

  const menuHeight = rowHeights + 2 * spacing.xsmall;

  return controlSize.dialogButton + spacing.xsmall + menuHeight;
};

export const splitButton = (options: SplitButtonOptions): Element => {
  const frame = v_flex()
    .relative()
    .w(controlSize.splitButtonWidth)
    .flex_none()
    .child(button(options));

  return options.open ? frame.child(menu(options)) : frame;
};
