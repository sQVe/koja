import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { popupSurface } from './popupSurface.ts';
import { spacing, textSize } from './size.ts';
import { detailText, keyHint } from './text.ts';
import { colors } from './theme.ts';

export interface DialogFrameOptions {
  id: string;
  title: string;
  detail?: string;
  body?: Element;
  actions: Element[];
}

const titleRow = (title: string): Element =>
  h_flex()
    .flex_none()
    .items_center()
    .justify_between()
    .child(div().flex_1().min_w(0).text_size(textSize.large).font_semibold().child(title))
    .child(keyHint('Esc'));

const actionRow = (actions: Element[]): Element =>
  h_flex().flex_none().gap(spacing.small).justify_end().children(actions);

export const dialogFrame = (options: DialogFrameOptions): Element => {
  const frame = popupSurface(options.id)
    .p(spacing.xlarge)
    .gap(spacing.medium)
    .child(titleRow(options.title));

  if (options.detail !== undefined) {
    frame.child(detailText(options.detail, colors().muted));
  }

  if (options.body !== undefined) {
    frame.child(options.body);
  }

  return frame.child(actionRow(options.actions));
};
