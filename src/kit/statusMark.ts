import { h_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import type { AttentionStatus } from './attentionStatus.ts';
import type { FileStatus } from './fileStatus.ts';
import { fileStatusColor } from './fileStatus.ts';
import { icon, spinner } from './icon.ts';
import type { ThemeToken } from './palette.ts';
import { badgeFillAlpha, withAlpha } from './palette.ts';
import { controlSize, markSize, radius, spacing, textSize } from './size.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

type ShownAttention = Exclude<AttentionStatus, 'idle'>;

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
    const spinnerMark = spinner().text_color(palette.working);

    return slot.child(spinnerMark);
  }

  if (status === 'idle') {
    return slot.child(dot(markSize.quietDot, palette.idle));
  }

  if (status === 'done') {
    const checkMark = icon('check', 'small').text_color(palette.done);

    return slot.child(checkMark);
  }

  return slot.child(dot(markSize.dot, palette[status]));
};

export const questionBubble = (): Element =>
  icon('message-circle-question', 'small').text_color(colors().blocked);

const blockedBubble = (): Element => statusMark(null).child(questionBubble());

export const spaceMark = (status: Status | null): Element => {
  if (status === 'blocked') {
    return blockedBubble();
  }

  if (status !== null) {
    return statusMark(status);
  }

  return statusMark(null).child(ring(markSize.dot, colors().border));
};

const showsAttentionMark = (status: AttentionStatus | null): status is ShownAttention =>
  status !== null && status !== 'idle';

/** The mark a tab or a pane header leads with, or null when it has nothing to say. */
export const attentionMark = (status: AttentionStatus | null): Element | null => {
  if (!showsAttentionMark(status)) {
    return null;
  }

  if (status === 'blocked') {
    return blockedBubble();
  }

  if (status === 'crashed') {
    const crashMark = icon('triangle-alert', 'small').text_color(colors().blocked);

    return statusMark(null).child(crashMark);
  }

  return statusMark(status);
};

/** The width the mark draws in, or 0 when it draws nothing. */
export const attentionMarkWidth = (status: AttentionStatus | null): number =>
  showsAttentionMark(status) ? markSize.slot : 0;

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
