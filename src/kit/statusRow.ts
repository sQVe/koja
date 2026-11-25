import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import { listRow } from './listRow.ts';
import { markSize, spacing } from './size.ts';
import { statusMark } from './statusMark.ts';
import { detailText } from './text.ts';
import { roleText } from './textRole.ts';
import type { WorkNeed } from './workIcon.ts';
import { isWorkNeed, workNeedIcon } from './workIcon.ts';

// A row's mark is the part's status or the work it needs.
export type StatusRowMark = Status | WorkNeed;

export interface StatusRowOptions {
  mark: StatusRowMark | null;
  name: string;
  // The line under the name, such as a check's failure or a thread's author and age.
  detail?: string;
  // The word at the row's end, such as `failing` or `unresolved`.
  state?: string;
  // Keeps the mark still, for a row of a part that failed to refresh.
  stale?: boolean;
}

// The detail line starts where the name does: the row's inset, its mark slot, and its gap.
const nameInset = spacing.xsmall + spacing.small + markSize.slot + spacing.small;

const markSlot = (mark: StatusRowMark | null, stale: boolean): Element => {
  const slot = h_flex().w(markSize.slot).flex_none().items_center().justify_center();

  if (mark === null) {
    return slot;
  }

  if (isWorkNeed(mark)) {
    return slot.child(workNeedIcon(mark));
  }

  return slot.child(statusMark(mark, { still: stale }));
};

const stateWord = (state: string | undefined): Element[] =>
  state === undefined ? [] : [detailText(state)];

export const statusRow = (options: StatusRowOptions): Element => {
  const row = listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    start: markSlot(options.mark, options.stale === true),
    label: roleText('body', options.name),
    end: stateWord(options.state),
  });

  const lines = v_flex().flex_none().min_w(0).child(row);

  if (options.detail === undefined) {
    return lines;
  }

  const detail = detailText(options.detail).ml(nameInset);

  return lines.child(detail);
};
