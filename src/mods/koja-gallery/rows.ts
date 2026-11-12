import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { RowState } from '../../kit/index.ts';
import { highlightedText, icon, keyHint, listRow, statusMark } from '../../kit/index.ts';
import { matchOf, sample } from './sample.ts';

const rowStates: { state: RowState; hovered: boolean; cursor: boolean; label: string }[] = [
  { state: 'normal', hovered: false, cursor: false, label: 'normal' },
  { state: 'normal', hovered: true, cursor: false, label: 'hovered' },
  { state: 'selected', hovered: false, cursor: false, label: 'selected' },
  { state: 'disabled', hovered: false, cursor: false, label: 'disabled' },
  { state: 'normal', hovered: false, cursor: true, label: 'cursor' },
  { state: 'selected', hovered: false, cursor: true, label: 'selected cursor' },
];

const rowsInState = (inset: boolean): Element =>
  v_flex().children(
    rowStates.map((variant) =>
      listRow({
        size: inset ? 'large' : 'small',
        inset,
        state: variant.state,
        hovered: variant.hovered,
        cursor: variant.cursor,
        start: icon('terminal', 'large'),
        label: `${variant.label} row`,
        detail: 'detail',
        end: [keyHint('ctrl-shift-t'), statusMark('done')],
      }),
    ),
  );

const treeRows = (): Element =>
  v_flex()
    .child(
      listRow({
        size: 'small',
        inset: false,
        state: 'normal',
        start: icon('folder-open', 'large'),
        label: 'repository',
      }),
    )
    .child(
      listRow({
        size: 'small',
        inset: false,
        state: 'normal',
        depth: 1,
        start: icon('folder', 'large'),
        label: 'first worktree',
      }),
    )
    .child(
      listRow({
        size: 'small',
        inset: false,
        state: 'normal',
        depth: 1,
        start: icon('folder', 'large'),
        label: 'last worktree',
      }),
    );

const dragRows = (): Element =>
  v_flex()
    .child(
      listRow({
        size: 'small',
        inset: false,
        state: 'normal',
        dragged: true,
        label: 'dragged row',
      }),
    )
    .child(
      listRow({
        size: 'small',
        inset: false,
        state: 'normal',
        dropLine: 'top',
        label: 'drop above',
      }),
    )
    .child(
      listRow({
        size: 'small',
        inset: false,
        state: 'normal',
        dropLine: 'bottom',
        label: 'drop below',
      }),
    );

const otherRows = (): Element =>
  v_flex()
    .child(
      listRow({ size: 'large', inset: true, state: 'normal', muted: true, label: 'muted label' }),
    )
    .child(
      listRow({
        size: 'large',
        inset: false,
        state: 'selected',
        centered: true,
        label: '3',
        end: [statusMark('blocked')],
      }),
    )
    .child(
      listRow({
        size: 'large',
        inset: true,
        state: 'normal',
        label: highlightedText('Split right', matchOf('Split right', 'Sp'), true),
      }),
    );

const cutRows = (): Element =>
  v_flex()
    .child(
      listRow({
        size: 'small',
        inset: true,
        state: 'normal',
        start: icon('git-branch', 'large'),
        cut: 'middle',
        label:
          'feature/AI-1169-add-the-ui-foundation-rules-to-the-kit-and-adrs-with-a-very-long-descriptive-tail-for-the-middle-cut',
      }),
    )
    .child(
      listRow({
        size: 'small',
        inset: true,
        state: 'normal',
        label:
          'A long title that keeps its start and is cut at the end of the row with an ellipsis, so its tail never shows at all and the reader only sees the beginning of it',
      }),
    );

export const rows = (): Element[] => [
  sample('Inset, large', rowsInState(true)),
  sample('Branch cut in the middle, title cut at the end', cutRows()),
  sample('Flush, small', rowsInState(false)),
  sample('Tree', treeRows()),
  sample('Reordering', dragRows()),
  sample('Muted, centered, and highlighted', otherRows()),
];
