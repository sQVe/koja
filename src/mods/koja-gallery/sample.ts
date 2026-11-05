import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { detailText, spacing } from '../../kit/index.ts';

export const sample = (label: string, content: Element): Element =>
  v_flex().gap(spacing.xsmall).child(detailText(label)).child(content);

export const matchOf = (text: string, query: string): number[] => {
  const start = text.indexOf(query);

  return query.split('').map((_letter, offset) => start + offset);
};
