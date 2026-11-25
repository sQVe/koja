import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../icon.ts';
import { keycaps } from '../keycap.ts';
import { rowHeight, spacing, textSize } from '../size.ts';
import { withTextRole } from '../textRole.ts';
import { colors } from '../theme.ts';

const caretHeight = textSize.default + spacing.xsmall;
const searchLineHeight = rowHeight.large + spacing.small;
const footerHeight = rowHeight.large + spacing.xxsmall;

const caret = (): Element =>
  div().w(spacing.hairline).h(caretHeight).flex_none().bg(colors().foreground);

const placeholder = (text: string): Element => {
  const box = div().flex_none();

  return withTextRole(box, 'body', 'dim').child(text);
};

export const searchLine = (text: string): Element => {
  const field = h_flex()
    .flex_none()
    .gap(spacing.xxsmall)
    .items_center()
    .child(caret())
    .child(placeholder(text));

  const searchIcon = icon('search', 'small').text_color(colors().dim);

  return h_flex()
    .h(searchLineHeight)
    .flex_none()
    .min_w(0)
    .px(spacing.small)
    .gap(spacing.small)
    .items_center()
    .child(searchIcon)
    .child(field);
};

const footerPart = (part: string | string[]): Element => {
  if (typeof part === 'string') {
    const box = div().flex_none();

    return withTextRole(box, 'detail').child(part);
  }

  return keycaps(part);
};

export const footerLine = (parts: (string | string[])[]): Element =>
  h_flex()
    .h(footerHeight)
    .flex_none()
    .min_w(0)
    .px(spacing.small)
    .gap(spacing.small)
    .items_center()
    .border_t(spacing.hairline)
    .border_color(colors().selected)
    .children(parts.map((part) => footerPart(part)));
