import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from './icon.ts';
import type { IconName } from './iconNames.ts';
import { listRow } from './listRow.ts';
import type {
  PaneHeaderMenuAction,
  PaneHeaderMenuField,
  PaneHeaderMenuOptions,
} from './paneHeaderMenuModel.ts';
import { paneHeaderMenuModel } from './paneHeaderMenuModel.ts';
import { popupSurface } from './popupSurface.ts';
import { iconSize, paneHeaderWidth, rowHeight, spacing } from './size.ts';
import { separator } from './text.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

// A field line is not an action: no pill, no hover, and the task reserves the icon slot so every
// text starts at the same place. The text cuts in the middle only when it is wider than the menu.
const fieldIcon = (name: IconName | null): Element =>
  name === null
    ? h_flex().size(iconSize.small).flex_none()
    : icon(name, 'small').text_color(colors().dim);

const fieldText = (text: string): Element =>
  withTextRole(div().flex_1().min_w(0).truncate(), 'detail').text_ellipsis_middle().child(text);

const fieldRow = (field: PaneHeaderMenuField): Element =>
  h_flex()
    .flex_none()
    .h(rowHeight.small)
    .mx(spacing.xsmall)
    .px(spacing.small)
    .gap(spacing.small)
    .items_center()
    .min_w(0)
    .child(fieldIcon(field.icon))
    .child(fieldText(field.text));

const actionRow = (entry: PaneHeaderMenuAction): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    start: icon(entry.icon).text_color(colors().muted),
    label: entry.label,
  }).on_click((_event, cx) => {
    cx.stop_propagation();
    entry.action?.();
  });

export const paneHeaderMenu = (options: PaneHeaderMenuOptions): Element => {
  const model = paneHeaderMenuModel(options);

  const menu = popupSurface('pane-header-menu')
    .w(paneHeaderWidth.menuWidth)
    .py(spacing.xsmall)
    .children(model.fields.map(fieldRow));

  if (model.separator) {
    menu.child(separator());
  }

  return menu.children(model.actions.map(actionRow));
};
