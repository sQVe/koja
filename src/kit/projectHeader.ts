import { h_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';

import { icon } from './icon.ts';
import { rowHeight, sidebarSize, spacing } from './size.ts';
import { roleText } from './textRole.ts';
import { colors } from './theme.ts';

interface ProjectHeaderOptions {
  name: string;
  machine?: string;
  folded: boolean;
  hidden: number;
  onToggle: (cx: Context) => void;
}

export const projectHeader = (options: ProjectHeaderOptions): Element => {
  const header = h_flex()
    .h(rowHeight.small)
    .flex_none()
    .min_w(0)
    .px(sidebarSize.rowContentInset)
    .gap(spacing.small)
    .items_center()
    .cursor_pointer()
    .child(roleText('sectionHeading', options.name, 'foreground'))
    .on_click((_event, cx) => {
      options.onToggle(cx);
    });

  if (options.machine !== undefined) {
    header
      .child(icon('server', 'small').text_color(colors().dim))
      .child(roleText('detail', options.machine));
  }

  if (options.folded) {
    header
      .child(icon('chevron-right', 'small').text_color(colors().dim))
      .child(h_flex().flex_1())
      .child(roleText('detail', `${options.hidden} more`));
  }

  return header;
};
