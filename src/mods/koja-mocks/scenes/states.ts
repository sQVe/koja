import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { FileStatus } from '../../../kit/index.ts';
import {
  colors,
  diffSize,
  fileStatusMark,
  listRow,
  radius,
  roleText,
  spacing,
  stateLine,
  toggleButton,
} from '../../../kit/index.ts';

interface FakeFile {
  status: FileStatus;
  path: string;
  add: number;
}

const staleFiles: FakeFile[] = [
  { status: 'M', path: 'src/kit/size.ts', add: 3 },
  { status: 'A', path: 'src/kit/stateLine.ts', add: 52 },
  { status: 'M', path: 'config/themes/catppuccin-latte-muted.json', add: 9 },
];

const panelHeader = (count: string | null): Element => {
  const palette = colors();

  const header = h_flex()
    .h(diffSize.headerHeight)
    .flex_none()
    .px(spacing.large)
    .gap(spacing.small)
    .items_center()
    .border_b(spacing.hairline)
    .border_color(palette.border)
    .child(roleText('title', 'Changes').flex_none());

  return count === null ? header : header.child(roleText('detail', count));
};

const fileRow = (file: FakeFile): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    start: fileStatusMark(file.status),
    label: file.path,
    end: [roleText('detail', `+${file.add}`, 'ansi2').flex_none()],
  });

const retry = (): Element => toggleButton({ label: 'Retry', active: false });

const panel = (count: string | null, content: Element[]): Element =>
  v_flex()
    .flex_none()
    .rounded(radius.dialog)
    .bg(colors().chrome)
    .child(panelHeader(count))
    .child(v_flex().py(spacing.xsmall).children(content));

const example = (name: string, card: Element): Element =>
  v_flex()
    .flex_none()
    .gap(spacing.xsmall)
    .child(div().px(spacing.xxsmall).child(roleText('sectionHeading', name)))
    .child(card);

export const statesScene = (): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .px(spacing.large)
    .pt(spacing.small)
    .pb(spacing.large)
    .gap(spacing.medium)
    .child(
      example(
        'Empty',
        panel('0 files', [stateLine({ kind: 'empty', text: 'No uncommitted changes' })]),
      ),
    )
    .child(
      example('Loading', panel(null, [stateLine({ kind: 'loading', text: 'Loading changes…' })])),
    )
    .child(
      example(
        'Error',
        panel(null, [
          stateLine({ kind: 'error', text: 'Could not read git status.', action: retry() }),
        ]),
      ),
    )
    .child(
      example(
        'Stale',
        panel(`${staleFiles.length} files`, [
          stateLine({ kind: 'error', text: 'Could not read git status.', action: retry() }),
          ...staleFiles.map(fileRow),
        ]),
      ),
    );
