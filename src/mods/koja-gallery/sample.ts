import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { colors, detailText, spacing } from '../../kit/index.ts';
import type { ThemeToken } from '../../kit/palette.ts';

export const sample = (label: string, content: Element): Element =>
  v_flex().gap(spacing.xsmall).child(detailText(label)).child(content);

// The gallery paints `popover`, so a sample sits on another surface to show its edge.
export const surfaceSample = (surface: ThemeToken, content: Element): Element =>
  div().p(spacing.medium).bg(colors()[surface]).child(content);

export const matchOf = (text: string, query: string): number[] => {
  const start = text.indexOf(query);

  return query.split('').map((_letter, offset) => start + offset);
};
