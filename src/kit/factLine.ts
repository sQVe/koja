import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { controlSize, spacing } from './size.ts';
import { roleText } from './textRole.ts';

const dimFixed = (text: string): Element => roleText('detail', text, 'dim').flex_none();

const factSeparator = (): Element => dimFixed('·');

const valueText = (value: string): Element =>
  roleText('detail', value, 'foreground')
    .max_w(controlSize.factValueMaxWidth)
    .text_ellipsis_middle()
    .flex_shrink(1)
    .tooltip(value);

export const factLine = (value: string, facts: string[]): Element => {
  const line = h_flex().flex_none().min_w(0).gap(spacing.xsmall).items_center();

  line.child(valueText(value));

  // A fact is a short label, so it keeps its width and never takes space from the value.
  for (const fact of facts) {
    const factText = dimFixed(fact);

    line.child(factSeparator());
    line.child(factText);
  }

  return line;
};
