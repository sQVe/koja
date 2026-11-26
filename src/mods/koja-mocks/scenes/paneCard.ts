import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { PaneHeaderOptions } from '../../../kit/index.ts';
import {
  colors,
  controlSize,
  paneHeader,
  paneHeaderMenu,
  popupFrameRadius,
  radius,
  roleText,
  shellSize,
  spacing,
} from '../../../kit/index.ts';

export const specimen = (header: PaneHeaderOptions): Element => {
  const palette = colors();
  const borderInk = header.focused ? palette.accent : palette.selected;

  const body = v_flex()
    .h(shellSize.specimenBodyHeight)
    .flex_none()
    .p(spacing.medium)
    .child(roleText('detail', 'Terminal text'));

  const card = v_flex()
    .flex_none()
    .rounded(radius.default)
    .border(spacing.hairline)
    .border_color(borderInk)
    .bg(palette.background)
    .overflow_hidden()
    .child(paneHeader(header))
    .child(body);

  return header.width == null ? card : card.w(header.width);
};

// The open menu hangs under the overflow button, at the right end of the compact header. Herdr
// draws a real popup's outline itself, so the scene draws it here.
export const compactWithMenu = (header: PaneHeaderOptions): Element => {
  const menuWidth = header.width ?? shellSize.compactSpecimenWidth;
  const palette = colors();

  const menu = v_flex()
    .absolute()
    .top(controlSize.sectionHeader)
    .right(spacing.none)
    .rounded(popupFrameRadius)
    .border(spacing.hairline)
    .border_color(palette.border)
    .child(
      paneHeaderMenu({
        task: header.task,
        branch: header.branch,
        folder: header.folder,
        zoomed: header.zoomed,
      }),
    );

  return v_flex().relative().w(menuWidth).flex_none().child(specimen(header)).child(menu);
};
