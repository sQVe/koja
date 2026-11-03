import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon, iconSlot } from './icon.ts';
import type { ThemeToken } from './palette.ts';
import { spacing, textSize } from './size.ts';
import { colors } from './theme.ts';

interface RepoLabelOptions {
  name: string;
  detail?: string;
  folded: boolean;
  selected: boolean;
}

const nameToken = (options: RepoLabelOptions): ThemeToken => {
  if (options.folded) {
    return 'dim';
  }

  return options.selected ? 'foreground' : 'muted';
};

export const foldChevron = (folded: boolean): Element =>
  iconSlot(icon(folded ? 'chevron-right' : 'chevron-down', 'small')).text_color(colors().dim);

export const repoLabel = (options: RepoLabelOptions): Element => {
  const palette = colors();

  const name = div()
    .flex_none()
    .max_w_full()
    .truncate()
    .text_size(textSize.small)
    .font_bold()
    .text_color(palette[nameToken(options)])
    .child(options.name);

  const label = h_flex().min_w(0).gap(spacing.small).items_center().child(name);

  if (options.detail === undefined) {
    return label;
  }

  const detail = div()
    .min_w(0)
    .truncate()
    .text_size(textSize.small)
    .text_color(palette.dim)
    .child(options.detail);

  return label.child(detail);
};
