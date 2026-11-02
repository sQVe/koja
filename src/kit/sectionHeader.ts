import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { controlSize, spacing, textSize } from './size.ts';
import { colors } from './theme.ts';

export interface SectionHeaderOptions {
  label: string;
  size: 'default' | 'bar';
  start?: Element;
  end?: Element[];
  interactive?: boolean;
}

export const sectionHeader = (options: SectionHeaderOptions): Element => {
  const palette = colors();
  const height = options.size === 'bar' ? controlSize.sidebarHeader : controlSize.sectionHeader;

  const header = h_flex()
    .flex_none()
    .h(height)
    .px(spacing.large)
    .gap(spacing.small)
    .items_center()
    .text_size(textSize.small)
    .text_color(palette.dim);

  if (options.interactive === true) {
    header.cursor_pointer().hover((style) => style.bg(palette.hover));
  }

  if (options.start !== undefined) {
    header.child(options.start);
  }

  return header
    .child(div().flex_1().min_w(0).truncate().child(options.label))
    .children(options.end ?? []);
};
