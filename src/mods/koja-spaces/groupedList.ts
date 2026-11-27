import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { sidebarSize, spacing, stateLine } from '../../kit/index.ts';

// The list puts the row gap on both sides of this spacer, so the groups in a list sit a group gap
// apart.
const groupGap = (): Element =>
  div()
    .flex_none()
    .h(sidebarSize.groupGap - 2 * spacing.xxsmall);

const loadingRow = (): Element => stateLine({ kind: 'loading', text: 'Loading…' });

export const groupedList = (blocks: Element[][], loading: boolean): Element[] => {
  if (blocks.length === 0) {
    return loading ? [loadingRow()] : [];
  }

  return blocks.flatMap((block, index) => (index === 0 ? block : [groupGap(), ...block]));
};
