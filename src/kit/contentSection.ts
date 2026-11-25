import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from './icon.ts';
import { sectionHeader } from './sectionHeader.ts';
import { markSize } from './size.ts';
import { detailText } from './text.ts';
import { colors } from './theme.ts';

interface ContentSectionLook {
  name: string;
  // A dim count after the name, such as the section's number of rows.
  count?: number;
}

export type ContentSectionOptions = ContentSectionLook &
  ({ open: true; parts: Element[] } | { open: false });

const chevronSlot = (open: boolean): Element => {
  const name = open ? 'chevron-down' : 'chevron-right';
  const chevron = icon(name, 'small').text_color(colors().dim);

  return h_flex().w(markSize.slot).flex_none().justify_center().child(chevron);
};

const countDetail = (count: number | undefined): Element[] =>
  count === undefined ? [] : [detailText(String(count))];

// The header's padding and chevron slot put every part at the section label's edge.
export const contentSection = (options: ContentSectionOptions): Element => {
  const header = sectionHeader({
    label: options.name,
    size: 'default',
    start: chevronSlot(options.open),
    detail: countDetail(options.count),
  });

  const section = v_flex().flex_none().min_w(0).child(header);

  if (!options.open) {
    return section;
  }

  return section.children(options.parts);
};
