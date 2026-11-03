import { h_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import { spinner } from './icon.ts';
import type { ThemeToken } from './palette.ts';
import { controlSize, markSize, radius, spacing, textSize } from './size.ts';
import { colors } from './theme.ts';

const dot = (size: number, color: Color): Element =>
  div()
    .size(size)
    .rounded(size / 2)
    .flex_none()
    .bg(color);

export const statusMark = (status: Status | null): Element => {
  const slot = h_flex().w(markSize.slot).flex_none().items_center().justify_center();
  const palette = colors();

  if (status === null) {
    return slot;
  }

  if (status === 'working') {
    return slot.child(spinner().text_color(palette.working));
  }

  if (status === 'idle') {
    return slot.child(dot(markSize.quietDot, palette.idle));
  }

  return slot.child(dot(markSize.dot, palette[status]));
};

export const indicator = (token: ThemeToken): Element => dot(markSize.dot, colors()[token]);

// Two hex digits of alpha: 0x26 is about 15% opacity.
const badgeFillAlpha = '26';

const withAlpha = (color: Color, alpha: string): Color => `${color}${alpha}`;

export const attentionBadge = (label: string): Element => {
  const palette = colors();

  return h_flex()
    .h(controlSize.badge)
    .px(spacing.small)
    .flex_none()
    .items_center()
    .rounded(radius.default)
    .bg(withAlpha(palette.blocked, badgeFillAlpha))
    .text_size(textSize.xsmall)
    .font_semibold()
    .text_color(palette.blocked)
    .child(label);
};
