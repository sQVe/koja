import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { controlSize, spacing } from './size.ts';
import { roleText } from './textRole.ts';

const gapFact = (): Element => roleText('detail', '·', 'dim').flex_none();

// A value that may be long, such as a branch, cuts in the middle so both of its ends stay readable.
const valueText = (value: string): Element =>
  roleText('detail', value, 'foreground')
    .max_w(controlSize.factValueMaxWidth)
    .text_ellipsis_middle()
    .flex_shrink(1)
    .tooltip(value);

// One line of inline facts, such as why a search found a row: the value that matched, then what the
// value belongs to, joined by ` · `. The facts stay whole so the place of a pull request is readable
// at every width.
export const factLine = (value: string, facts: string[]): Element => {
  const line = h_flex().flex_none().min_w(0).gap(spacing.xsmall).items_center();

  line.child(valueText(value));

  for (const fact of facts) {
    const factText = roleText('detail', fact, 'dim').flex_none();

    line.child(gapFact());
    line.child(factText);
  }

  return line;
};
