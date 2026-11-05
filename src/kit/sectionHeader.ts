import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { controlSize, spacing } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

export interface SectionHeaderOptions {
  label: string;
  size: 'default' | 'bar';
  start?: Element;
  end?: Element[];
  interactive?: boolean;
  paddingStart?: number;
}

export const sectionHeader = (options: SectionHeaderOptions): Element => {
  const palette = colors();
  const height = options.size === 'bar' ? controlSize.sidebarHeader : controlSize.sectionHeader;
  const paddingStart = options.paddingStart ?? spacing.large;

  const header = withTextRole(
    h_flex()
      .flex_none()
      .h(height)
      .pl(paddingStart)
      .pr(spacing.large)
      .gap(spacing.small)
      .items_center(),
    'detail',
  );

  if (options.interactive === true) {
    header.cursor_pointer().hover((style) => style.bg(palette.hover));
  }

  if (options.start !== undefined) {
    header.child(options.start);
  }

  return header
    .child(withTextRole(div().flex_1().min_w(0).truncate(), 'sectionHeading').child(options.label))
    .children(options.end ?? []);
};
