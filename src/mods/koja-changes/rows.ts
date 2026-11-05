import type { InputState } from 'gpui-base';
import { h_flex, Scrollbar, v_flex, v_virtual_list } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import { settings } from 'herdr';

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
  stringOf,
  textField,
  toggleButton,
  withTextRole,
} from '../../kit/index.ts';
import type { DiffRow } from './diffRows.ts';
import { showsSelectionHint } from './selection.ts';
import type { ChangeFile } from './status.ts';

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

const defaultFont = 'JetBrains Mono';

const terminalFont = (): string => stringOf(settings()['font_family']) ?? defaultFont;

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
): Element =>
  h_flex()
    .h(diffSize.headerHeight)
    .flex_none()
    .px(spacing.large)
    .gap(spacing.small)
    .items_center()
    .border_b(spacing.hairline)
    .border_color(palette.border)
    .child(roleText('title', 'Changes').flex_none())
    .child(roleText('detail', `${files.length} files`).flex_none())
    .child(div().flex_1())
    .child(roleText('detail', `+${add}`, 'ansi2').flex_none())
    .child(roleText('detail', `−${del}`, 'ansi1').flex_none());

const fileRow = (
  file: ChangeFile,
  selected: boolean,
  onPick: (path: string, cx: Context) => void,
): Element => {
  const end: Element[] = [];

  if (file.add > 0) {
    end.push(roleText('detail', `+${file.add}`, 'ansi2').flex_none());
  }

  if (file.del > 0) {
    end.push(roleText('detail', `−${file.del}`, 'ansi1').flex_none());
  }

  return listRow({
    size: 'small',
    inset: true,
    state: selected ? 'selected' : 'normal',
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

  return v_flex()
    .id('changes-list')
    .flex_none()
    .h(fileListHeight(count))
    .overflow_y_scrollbar()
    .p(spacing.xsmall)
    .border_b(spacing.hairline)
    .border_color(options.palette.border)
    .children(lines)
    .children(
      options.files.map((file) => fileRow(file, options.open === file.path, options.onPick)),
    );
};

export const commitBar = (
  input: InputState,
  typing: boolean,
  busy: boolean,
  enabled: boolean,
  palette: Palette,
  onCommit: (cx: Context) => void,
): Element => {
  return h_flex()
    .flex_none()
    .p(spacing.large)
    .gap(spacing.medium)
    .border_t(spacing.hairline)
    .border_color(palette.border)
    .child(textField(input, typing).flex_1().min_w(0))
    .child(
      actionButton({ label: busy ? 'Committing…' : 'Commit', enabled })
        .id('commit')
        .on_click((_event, clickCx) => {
          onCommit(clickCx);
        }),
    );
};

export const limitedNotice = (): Element =>
  withTextRole(div().px(spacing.large).py(spacing.xsmall), 'detail').child(
    'Showing the first 1,000 changed files',
  );

export const noteRow = (note: string): Element =>
  withTextRole(div().px(spacing.large).pb(spacing.medium), 'detail', 'ansi1').child(note);

const diffRow = (row: DiffRow, palette: Palette): Element => {
  if (row.kind === '@') {
    return div()
      .w_full()
      .px(spacing.large)
      .h(diffSize.rowHeight)
      .flex_none()
      .truncate()
      .bg(palette.raised)
      .text_color(palette.muted)
      .child(row.text);
  }

  const tints = diffTints(palette);

  const lineNumber = withTextRole(
    div().w(diffSize.lineNumberWidth).flex_none().text_right(),
    'detail',
    'muted',
  ).child(row.number === undefined ? '' : String(row.number));

  return h_flex()
    .w_full()
    .h(diffSize.rowHeight)
    .flex_none()
    .gap(spacing.large)
    .when(row.kind === '+', (element) => element.bg(tints.added))
    .when(row.kind === '-', (element) => element.bg(tints.removed))
    .child(lineNumber)
    .child(div().flex_1().min_w(0).truncate().child(row.text));
};

export const diffArea = (
  rows: DiffRow[],
  diffWidth: number,
  open: string | null,
  fileCount: number,
): Element => {
  const palette = colors();

  const area = withTextRole(
    div().flex_1().min_h(0).relative().font_family(terminalFont()),
    'detail',
    'foreground',
  )
    .child(
      div()
        .id('changes-diff-x')
        .size_full()
        .overflow_x_scrollbar()
        .child(
          div()
            .w_full()
            .min_w(diffWidth)
            .h_full()
            .child(
              v_virtual_list(
                'changes-diff',
                rows.length,
                diffSize.rowHeight,
                (index) => String(index),
                (range) => rows.slice(range.start, range.end).map((row) => diffRow(row, palette)),
              ).size_full(),
            ),
        ),
    )
    .child(Scrollbar.vertical('changes-diff').viewport_from_layout().absolute().inset_0());

  if (showsSelectionHint(open, fileCount)) {
    area.child(
      withTextRole(div().absolute().top(spacing.small).px(spacing.large), 'detail').child(
        'Select a file to view its changes',
      ),
    );
  }

  return area;
};
