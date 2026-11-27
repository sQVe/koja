import type { InputState } from 'gpui-base';
import { h_flex, Scrollbar, v_flex, v_virtual_list } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { Palette, StateLineOptions } from '../../kit/index.ts';
import {
  actionButton,
  colors,
  diffSize,
  diffTints,
  fileStatusMark,
  listRow,
  roleText,
  rowHeight,
  spacing,
  stateLine,
  terminalFontStyle,
  textField,
  toggleButton,
  withTextRole,
} from '../../kit/index.ts';
import type { DiffDocument, DiffLayout } from './diffLayout.ts';
import { diffLayout } from './diffLayout.ts';
import type { DiffRow } from './diffRows.ts';
import { showsSelectionHint } from './selection.ts';
import type { ChangeFile } from './status.ts';

export interface DiffAreaOptions {
  document: DiffDocument;
  open: string | null;
  fileCount: number;
  fontSize: number;
}

export interface FileListOptions {
  files: ChangeFile[];
  open: string | null;
  line: StateLineOptions | null;
  watchLine: StateLineOptions | null;
  palette: Palette;
  onRetry: (cx: Context) => void;
  onRetryWatch: (cx: Context) => void;
  onPick: (path: string, cx: Context) => void;
}

const fileListHeight = (count: number): number =>
  Math.min(
    diffSize.fileListHeightLimit,
    Math.max(diffSize.fileListHeightMinimum, count * rowHeight.small + spacing.xlarge),
  );

export const headerRow = (
  files: ChangeFile[],
  add: number,
  del: number,
  palette: Palette,
): Element => {
  const title = roleText('title', 'Changes').flex_none();
  const fileCount = roleText('detail', `${files.length} files`).flex_none();
  const spacer = div().flex_1();
  const added = roleText('detail', `+${add}`, 'ansi2').flex_none();
  const removed = roleText('detail', `−${del}`, 'ansi1').flex_none();

  return h_flex()
    .h(diffSize.headerHeight)
    .flex_none()
    .px(spacing.large)
    .gap(spacing.small)
    .items_center()
    .border_b(spacing.hairline)
    .border_color(palette.border)
    .child(title)
    .child(fileCount)
    .child(spacer)
    .child(added)
    .child(removed);
};

const fileRow = (
  file: ChangeFile,
  selected: boolean,
  onPick: (path: string, cx: Context) => void,
): Element => {
  const end: Element[] = [];

  if (file.add > 0) {
    const added = roleText('detail', `+${file.add}`, 'ansi2').flex_none();

    end.push(added);
  }

  if (file.del > 0) {
    const removed = roleText('detail', `−${file.del}`, 'ansi1').flex_none();

    end.push(removed);
  }

  const state = selected ? 'selected' : 'normal';

  return listRow({
    size: 'small',
    inset: true,
    state,
    cut: 'middle',
    start: fileStatusMark(file.status),
    label: file.path,
    end,
  })
    .id(`change-${file.path}`)
    .on_click((_event, clickCx) => {
      onPick(file.path, clickCx);
    });
};

const retryButton = (id: string, onRetry: (cx: Context) => void): Element =>
  toggleButton({ label: 'Retry', active: false })
    .id(id)
    .on_click((_event, clickCx) => {
      onRetry(clickCx);
    });

const stateRow = (line: StateLineOptions, id: string, onRetry: (cx: Context) => void): Element => {
  if (line.kind !== 'error') {
    return stateLine(line);
  }

  return stateLine({ ...line, action: retryButton(id, onRetry) });
};

export const fileList = (options: FileListOptions): Element => {
  const lines: Element[] = [];

  if (options.line !== null) {
    lines.push(stateRow(options.line, 'changes-retry', options.onRetry));
  }

  if (options.watchLine !== null) {
    lines.push(stateRow(options.watchLine, 'changes-watch-retry', options.onRetryWatch));
  }

  const count = options.files.length + lines.length;

  // The list scrolls inside a box of its own height, so the panel's layout sees that height.
  const rows = v_flex()
    .id('changes-list')
    .absolute()
    .inset_0()
    .overflow_y_scroll()
    .p(spacing.xsmall)
    .children(lines)
    .children(
      options.files.map((file) => fileRow(file, options.open === file.path, options.onPick)),
    );

  const scrollbar = Scrollbar.vertical('changes-list').absolute().inset_0();

  return div()
    .flex_none()
    .h(fileListHeight(count))
    .relative()
    .border_b(spacing.hairline)
    .border_color(options.palette.border)
    .child(rows)
    .child(scrollbar);
};

export const commitBar = (
  input: InputState,
  typing: boolean,
  busy: boolean,
  enabled: boolean,
  palette: Palette,
  onCommit: (cx: Context) => void,
): Element => {
  const field = textField(input, typing).flex_1().min_w(0);
  const label = busy ? 'Committing…' : 'Commit';

  const commitButton = actionButton({ label, enabled })
    .id('commit')
    .on_click((_event, clickCx) => {
      onCommit(clickCx);
    });

  return h_flex()
    .flex_none()
    .p(spacing.large)
    .gap(spacing.medium)
    .border_t(spacing.hairline)
    .border_color(palette.border)
    .child(field)
    .child(commitButton);
};

export const limitedNotice = (): Element => {
  const box = div().px(spacing.large).py(spacing.xsmall);

  return withTextRole(box, 'detail').child('Showing the first 1,000 changed files');
};

export const noteRow = (note: string): Element => {
  const box = div().px(spacing.large).pb(spacing.medium);

  return withTextRole(box, 'detail', 'ansi1').child(note);
};

const diffRow = (row: DiffRow, palette: Palette, layout: DiffLayout): Element => {
  if (row.kind === '@') {
    return div()
      .w_full()
      .px(spacing.large)
      .h(layout.rowHeight)
      .flex_none()
      .truncate()
      .bg(palette.raised)
      .text_color(palette.muted)
      .child(row.text);
  }

  const tints = diffTints(palette);

  const numberBox = div().w(layout.gutterWidth).flex_none().text_right();
  const numberText = row.number === undefined ? '' : String(row.number);
  const lineNumber = withTextRole(numberBox, 'detail', 'muted').child(numberText);
  const textBox = div().flex_1().min_w(0).truncate().child(row.text);

  return h_flex()
    .w_full()
    .h(layout.rowHeight)
    .flex_none()
    .gap(spacing.large)
    .when(row.kind === '+', (element) => element.bg(tints.added))
    .when(row.kind === '-', (element) => element.bg(tints.removed))
    .child(lineNumber)
    .child(textBox);
};

export const diffArea = (options: DiffAreaOptions): Element => {
  const palette = colors();
  const layout = diffLayout(options.document, options.fontSize);
  const rows = options.document.rows;

  const virtualList = v_virtual_list(
    'changes-diff',
    rows.length,
    layout.rowHeight,
    (index) => String(index),
    (range) => rows.slice(range.start, range.end).map((row) => diffRow(row, palette, layout)),
  ).size_full();

  const listColumn = div().w_full().min_w(layout.width).h_full().child(virtualList);
  const scroller = div().id('changes-diff-x').size_full().overflow_x_scrollbar().child(listColumn);
  const scrollbar = Scrollbar.vertical('changes-diff').viewport_from_layout().absolute().inset_0();
  const areaBox = div().flex_1().min_h(0).relative();

  const area = terminalFontStyle(withTextRole(areaBox, 'detail', 'foreground'), options.fontSize);

  const areaWithDiff = area.child(scroller).child(scrollbar);

  if (showsSelectionHint(options.open, options.fileCount)) {
    const hintBox = div().absolute().top(spacing.small).px(spacing.large);
    const hint = withTextRole(hintBox, 'detail').child('Select a file to view its changes');

    areaWithDiff.child(hint);
  }

  return areaWithDiff;
};
