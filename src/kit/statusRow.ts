import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import { listRow } from './listRow.ts';
import type { ThemeToken } from './palette.ts';
import { markSize, sidebarSize, spacing } from './size.ts';
import { statusMark } from './statusMark.ts';
import { detailText } from './text.ts';
import { roleText } from './textRole.ts';
import { colors } from './theme.ts';
import type { WorkNeed } from './workIcon.ts';
import { isWorkNeed, workIcon, workNeedColor } from './workIcon.ts';

export type StatusRowMark = Status | WorkNeed;

export interface StatusRowOptions {
  mark: StatusRowMark | null;
  name: string;
  detail?: string;
  state?: string;
  // Takes the mark's colour, or stays dim for a state that is not a mark's status.
  stateTone?: 'mark' | 'dim';
  // Keeps the mark still and the state word dim, for a row of a part that failed to refresh.
  stale?: boolean;
}

const nameInset = sidebarSize.rowContentInset + markSize.slot + spacing.small;

const markSlot = (mark: StatusRowMark | null, stale: boolean): Element => {
  const slot = h_flex().w(markSize.slot).flex_none().items_center().justify_center();

  if (mark === null) {
    return slot;
  }

  if (isWorkNeed(mark)) {
    return slot.child(workIcon(mark, { bare: true }));
  }

  return slot.child(statusMark(mark, { still: stale }));
};

const stateColor = (options: StatusRowOptions): ThemeToken => {
  if (options.stale === true || options.mark === null) {
    return 'dim';
  }

  if (options.stateTone === 'dim') {
    return 'dim';
  }

  return isWorkNeed(options.mark) ? workNeedColor(options.mark) : options.mark;
};

const stateWord = (options: StatusRowOptions): Element[] => {
  if (options.state === undefined) {
    return [];
  }

  return [detailText(options.state, colors()[stateColor(options)])];
};

const detailLine = (detail: string): Element => {
  const label = roleText('detail', detail).flex_1();

  return h_flex().flex_none().min_w(0).pl(nameInset).pr(spacing.large).child(label);
};

export const statusRow = (options: StatusRowOptions): Element => {
  const row = listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    start: markSlot(options.mark, options.stale === true),
    label: roleText('body', options.name),
    end: stateWord(options),
  });

  const lines = v_flex().flex_none().min_w(0).child(row);

  if (options.detail === undefined) {
    return lines;
  }

  return lines.child(detailLine(options.detail));
};
