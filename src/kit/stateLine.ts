import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon, spinner } from './icon.ts';
import { markSize, rowHeight, spacing } from './size.ts';
import { roleText, withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

type StateKind = 'empty' | 'loading' | 'error';

export interface StateLineOptions {
  kind: StateKind;
  text: string;
  // A button or a keyHint for the next step.
  action?: Element;
  wrap?: boolean;
  paddingStart?: number;
}

const kindMark = (kind: StateKind): Element | null => {
  if (kind === 'loading') {
    return spinner('small').text_color(colors().dim);
  }

  if (kind === 'error') {
    return icon('circle-alert', 'small').text_color(colors().blocked);
  }

  return null;
};

const lineText = (text: string, wrap: boolean): Element => {
  if (!wrap) {
    return roleText('detail', text);
  }

  const box = div().min_w(0);

  return withTextRole(box, 'detail').child(text);
};

export const stateLine = (options: StateLineOptions): Element => {
  const wrap = options.wrap === true;

  const line = h_flex()
    .flex_none()
    .min_w(0)
    .min_h(rowHeight.small)
    .pl(options.paddingStart ?? spacing.large)
    .pr(spacing.large)
    .gap(spacing.small)
    .items_center();

  const mark = kindMark(options.kind);

  if (mark !== null) {
    const markSlot = h_flex().w(markSize.slot).flex_none().justify_center().child(mark);

    line.child(markSlot);
  }

  const text = lineText(options.text, wrap).flex_1();

  line.child(text);

  if (options.action !== undefined) {
    line.child(options.action);
  }

  return line;
};
