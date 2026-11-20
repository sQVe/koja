import { h_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import type { FileStatus } from './fileStatus.ts';
import { fileStatusColor } from './fileStatus.ts';
import { icon, spinner } from './icon.ts';
import type { ThemeToken } from './palette.ts';
import { badgeFillAlpha, withAlpha } from './palette.ts';
import { controlSize, markSize, paneHeaderWidth, radius, spacing, textSize } from './size.ts';
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

export const spaceMark = (status: Status | null): Element => {
  if (status === 'blocked') {
    const questionMark = icon('message-circle-question', 'small').text_color(colors().blocked);

    return statusMark(null).child(questionMark);
  }

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

const attentionStatusWidth = 'Needs you'.length * paneHeaderWidth.glyph + spacing.small * 2;

export const hasStatusMark = (status: Status | null): status is 'working' | 'blocked' | 'done' =>
  status === 'blocked' || status === 'working' || status === 'done';

export const statusMarkWidth = (status: Status | null): number => {
  if (status === 'blocked') {
    return attentionStatusWidth;
  }

  if (status === 'working' || status === 'done') {
    return markSize.slot;
  }

  return 0;
};

export const paneStatusElement = (status: Status | null): Element | null => {
  if (!hasStatusMark(status)) {
    return null;
  }

  if (status === 'blocked') {
    return attentionBadge('Needs you');
  }

  return statusMark(status);
};
