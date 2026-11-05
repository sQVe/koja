import { h_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import type { FileStatus } from './fileStatus.ts';
import { fileStatusColor } from './fileStatus.ts';
import { spinner } from './icon.ts';
import type { ThemeToken } from './palette.ts';
import { badgeFillAlpha, withAlpha } from './palette.ts';
import { controlSize, markSize, radius, spacing, textSize } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

const dot = (size: number, color: Color): Element =>
  div()
    .size(size)
    .rounded(size / 2)
    .flex_none()
    .bg(color);

const ring = (size: number, color: Color): Element =>
  div()
    .size(size)
    .rounded(size / 2)
    .flex_none()
    .border(spacing.hairline)
    .border_color(color);

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

export const spaceMark = (status: Status | null): Element => {
  if (status !== null) {
    return statusMark(status);
  }

  return statusMark(null).child(ring(markSize.dot, colors().border));
};

export const indicator = (token: ThemeToken): Element => dot(markSize.dot, colors()[token]);

export const fileStatusMark = (status: FileStatus): Element =>
  div()
    .w(controlSize.tabSlot)
    .flex_none()
    .text_size(textSize.small)
    .text_color(fileStatusColor(status, colors()))
    .child(status);

export const attentionBadge = (label: string): Element => {
  const palette = colors();

  const badge = h_flex()
    .h(controlSize.badge)
    .px(spacing.small)
    .flex_none()
    .items_center()
    .rounded(radius.default)
    .bg(withAlpha(palette.blocked, badgeFillAlpha));

  return withTextRole(badge, 'badge').child(label);
};
