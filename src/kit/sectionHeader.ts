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
  detail?: Element[];
  end?: Element[];
  interactive?: boolean;
  paddingStart?: number;
}

export const sectionHeader = (options: SectionHeaderOptions): Element => {
  const palette = colors();
  const height = options.size === 'bar' ? controlSize.sidebarHeader : controlSize.sectionHeader;
  const paddingStart = options.paddingStart ?? spacing.large;

  const row = h_flex()
    .flex_none()
    .h(height)
    .pl(paddingStart)
    .pr(spacing.large)
    .gap(spacing.small)
    .items_center();

  const header = withTextRole(row, 'detail');

  if (options.interactive === true) {
    header.cursor_pointer().hover((style) => style.bg(palette.hover));
  }

  if (options.start !== undefined) {
    header.child(options.start);
  }

  const labelBox = div().min_w(0).truncate().flex_shrink(1);
  const label = withTextRole(labelBox, 'sectionHeading').child(options.label);

  // The group takes the free width, so a detail stays beside the label and the end keeps the edge.
  const labelGroup = h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(label)
    .children(options.detail ?? []);

  return header.child(labelGroup).children(options.end ?? []);
};
