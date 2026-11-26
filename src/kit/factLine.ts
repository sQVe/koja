import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { spacing } from './size.ts';
import { roleText } from './textRole.ts';

const gapFact = (): Element => roleText('detail', '·', 'dim').flex_none();

// One line of inline facts, such as why a search found a row: the value that matched, then what the
// value belongs to, joined by ` · `.
export const factLine = (value: string, facts: string[]): Element => {
  const line = h_flex().flex_none().min_w(0).gap(spacing.xsmall).items_center();

  line.child(roleText('detail', value, 'foreground'));

  for (const fact of facts) {
    line.child(gapFact());
    line.child(roleText('detail', fact, 'dim'));
  }

  return line;
};
