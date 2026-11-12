import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { progressTrackAlpha, withAlpha } from './palette.ts';
import { progressSize, spacing } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

export interface StackProgressOptions {
  merged: number;
  total: number;
  label: 'count' | 'merged';
}

const barRadius = progressSize.height / 2;

const progressBar = (merged: number, total: number): Element => {
  const palette = colors();

  const track = h_flex()
    .w(progressSize.width)
    .h(progressSize.height)
    .flex_none()
    .rounded(barRadius)
    .bg(withAlpha(palette.dim, progressTrackAlpha));

  if (total === 0) {
    return track;
  }

  const fillWidth = (progressSize.width * merged) / total;

  return track.child(div().w(fillWidth).h_full().rounded(barRadius).bg(palette.dim));
};

const progressText = (options: StackProgressOptions): string => {
  const count = `${options.merged}/${options.total}`;

  return options.label === 'merged' ? `${count} merged` : count;
};

export const stackProgress = (options: StackProgressOptions): Element =>
  h_flex()
    .flex_none()
    .gap(spacing.xsmall)
    .items_center()
    .child(progressBar(options.merged, options.total))
    .child(withTextRole(div().flex_none(), 'detail').child(progressText(options)));
