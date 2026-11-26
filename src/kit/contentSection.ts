import { h_flex, v_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';

import { icon } from './icon.ts';
import { sectionHeader } from './sectionHeader.ts';
import { markSize, sidebarSize } from './size.ts';
import { detailText } from './text.ts';
import { colors } from './theme.ts';

export interface ContentSectionOptions {
  name: string;
  count?: number;
  open: boolean;
  parts?: Element[];
  // Folds and unfolds the section from its header.
  onToggle?: (cx: Context) => void;
}

const chevronSlot = (open: boolean): Element => {
  const name = open ? 'chevron-down' : 'chevron-right';
  const chevron = icon(name, 'small').text_color(colors().dim);

  return h_flex().w(markSize.slot).flex_none().justify_center().child(chevron);
};

const countDetail = (count: number | undefined): Element[] =>
  count === undefined ? [] : [detailText(String(count))];

const foldHeader = (options: ContentSectionOptions): Element => {
  const header = sectionHeader({
    label: options.name,
    size: 'default',
    start: chevronSlot(options.open),
    detail: countDetail(options.count),
    interactive: options.onToggle !== undefined,
    paddingStart: sidebarSize.rowContentInset,
  });

  const onToggle = options.onToggle;

  if (onToggle === undefined) {
    return header;
  }

  return header.on_click((_event, cx) => {
    onToggle(cx);
  });
};

export const contentSection = (options: ContentSectionOptions): Element => {
  const section = v_flex().flex_none().min_w(0).child(foldHeader(options));

  if (!options.open) {
    return section;
  }

  return section.children(options.parts ?? []);
};
