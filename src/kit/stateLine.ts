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
  // Breaks the text over lines instead of cutting it to one line.
  wrap?: boolean;
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

const lineText = (text: string, wrap: boolean): Element =>
  wrap ? withTextRole(div().min_w(0), 'detail').child(text) : roleText('detail', text);

export const stateLine = (options: StateLineOptions): Element => {
  const wrap = options.wrap === true;

  const line = h_flex()
    .flex_none()
    .min_w(0)
    .min_h(rowHeight.small)
    .px(spacing.large)
    .gap(spacing.small);

  if (wrap) {
    line.items_start().py(spacing.xsmall);
  } else {
    line.items_center();
  }

  const mark = kindMark(options.kind);

  if (mark !== null) {
    line.child(h_flex().w(markSize.slot).flex_none().justify_center().child(mark));
  }

  line.child(lineText(options.text, wrap).flex_1());

  if (options.action !== undefined) {
    line.child(options.action);
  }

  return line;
};
