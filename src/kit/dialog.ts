import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from './icon.ts';
import { overlayCard } from './overlay/card.ts';
import { dialogSize } from './size.ts';
import { bodyText } from './text.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

export interface DialogFrameOptions {
  id: string;
  title: string;
  lines?: string[];
  body?: Element;
  destructive?: boolean;
  actions: Element[];
}

const titleMark = (): Element =>
  icon('triangle-alert', 'small').text_color(colors().blocked).mt(dialogSize.markTop);

const titleText = (title: string): Element => {
  const box = div().flex_1().min_w(0).whitespace_normal();

  return withTextRole(box, 'title').child(title);
};

const titleRow = (options: DialogFrameOptions): Element => {
  const row = h_flex().flex_none().min_w(0).gap(dialogSize.markGap).items_start();

  if (options.destructive === true) {
    row.child(titleMark());
  }

  return row.child(titleText(options.title));
};

const bodyLines = (lines: string[]): Element =>
  v_flex().children(lines.map((line) => bodyText(line)));

const bodyOf = (options: DialogFrameOptions): Element | null => {
  const parts: Element[] = [];

  if (options.lines !== undefined) {
    parts.push(bodyLines(options.lines));
  }

  if (options.body !== undefined) {
    parts.push(options.body);
  }

  if (parts.length === 0) {
    return null;
  }

  const body = v_flex().gap(dialogSize.blockGap).children(parts);

  return options.destructive === true ? body.pl(dialogSize.markInset) : body;
};

const actionRow = (actions: Element[]): Element =>
  h_flex()
    .flex_none()
    .gap(dialogSize.blockGap)
    .justify_end()
    .mt(dialogSize.actionGap - dialogSize.blockGap)
    .children(actions);

export const dialogFrame = (options: DialogFrameOptions): Element => {
  const frame = overlayCard(options.id)
    .w_full()
    .p(dialogSize.padding)
    .pt(dialogSize.padding - dialogSize.titleTrim)
    .gap(dialogSize.blockGap)
    .child(titleRow(options));

  const body = bodyOf(options);

  if (body !== null) {
    frame.child(body);
  }

  return frame.child(actionRow(options.actions));
};
