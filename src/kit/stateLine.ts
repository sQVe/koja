import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon, spinner } from './icon.ts';
import { markSize, rowHeight, spacing } from './size.ts';
import { roleText } from './textRole.ts';
import { colors } from './theme.ts';

type StateKind = 'empty' | 'loading' | 'error';

export interface StateLineOptions {
  kind: StateKind;
  text: string;
  // Gives the line a tooltip with its whole text, for a line that may be cut.
  id?: string;
  // A button or a keyHint for the next step.
  action?: Element;
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

export const stateLine = (options: StateLineOptions): Element => {
  const line = h_flex()
    .flex_none()
    .min_w(0)
    .min_h(rowHeight.small)
    .px(spacing.large)
    .gap(spacing.small)
    .items_center();

  const mark = kindMark(options.kind);

  if (mark !== null) {
    line.child(h_flex().w(markSize.slot).flex_none().justify_center().child(mark));
  }

  const text = roleText('detail', options.text).flex_1();

  if (options.id !== undefined) {
    text.id(options.id).tooltip(options.text);
  }

  line.child(text);

  if (options.action !== undefined) {
    line.child(options.action);
  }

  return line;
};
