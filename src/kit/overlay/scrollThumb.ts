import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { scrollThumbAlpha, withAlpha } from '../palette.ts';
import { spacing } from '../size.ts';
import { colors } from '../theme.ts';

export interface ThumbPlace {
  top: number;
  height: number;
}

export interface ThumbOptions {
  scroll: number;
  total: number;
  view: number;
}

export const thumbPlace = (options: ThumbOptions): ThumbPlace | null => {
  if (options.total <= options.view) {
    return null;
  }

  const share = (options.view * options.view) / options.total;
  const height = Math.min(options.view, Math.max(spacing.xxlarge, share));
  const travel = options.view - height;
  const maxScroll = options.total - options.view;
  const top = Math.max(0, Math.min((options.scroll / maxScroll) * travel, travel));

  return { top, height };
};

export const scrollThumb = (place: ThumbPlace): Element =>
  div()
    .absolute()
    .top(place.top)
    .right(-spacing.xsmall)
    .w(spacing.xxsmall)
    .h(place.height)
    .rounded(spacing.xxsmall / 2)
    .bg(withAlpha(colors().dim, scrollThumbAlpha));
