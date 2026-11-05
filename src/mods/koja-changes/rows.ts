import type { InputState } from 'gpui-base';
import { h_flex, Scrollbar, v_flex, v_virtual_list } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import { settings } from 'herdr';

import type { Palette } from '../../kit/index.ts';
import {
  actionButton,
  colors,
  controlSize,
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
  withTextRole,
} from '../../kit/index.ts';
import type { DiffRow } from './diffRows.ts';
import { emptyLine } from './emptyLine.ts';
import { showsSelectionHint } from './selection.ts';
import type { ChangeFile } from './status.ts';

const defaultFont = 'JetBrains Mono';

const terminalFont = (): string => stringOf(settings()['font_family']) ?? defaultFont;

const fileLabel = (file: ChangeFile, palette: Palette): Element => {
  const parts = file.path.split('/');
  const name = parts.pop() ?? file.path;
  const directory = parts.length > 0 ? `${parts.join('/')}/` : '';
  const label = h_flex().min_w(0);

  if (directory !== '') {
    label.child(div().text_color(palette.dim).truncate().child(directory));
  }

  return label.child(div().max_w(controlSize.paneLabelMaxWidth).min_w(0).truncate().child(name));
};

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
    .child(div().text_color(palette.dim).child(`${files.length} files`))
    .child(div().flex_1())
    .child(roleText('detail', `+${add}`, 'ansi2').flex_none())
    .child(roleText('detail', `−${del}`, 'ansi1').flex_none());

const fileRow = (
  file: ChangeFile,
  selected: boolean,
  palette: Palette,
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
    start: fileStatusMark(file.status),
    label: fileLabel(file, palette),
    end,
  })
    .id(`change-${file.path}`)
    .on_click((_event, clickCx) => {
      onPick(file.path, clickCx);
    });
};

export const fileList = (
  files: ChangeFile[],
  open: string | null,
  error: string | null,
  loading: boolean,
  root: string | null,
  palette: Palette,
  onPick: (path: string, cx: Context) => void,
): Element => {
  const list = v_flex()
    .id('changes-list')
    .flex_none()
    .h(fileListHeight(files.length))
    .overflow_y_scrollbar()
    .p(spacing.xsmall)
    .border_b(spacing.hairline)
    .border_color(palette.border)
    .children(files.map((file) => fileRow(file, open === file.path, palette, onPick)));

  if (files.length === 0) {
    list.child(stateLine(emptyLine(error, loading, root)));
  }

  return list;
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

  return h_flex()
    .w_full()
    .h(diffSize.rowHeight)
    .flex_none()
    .gap(spacing.large)
    .when(row.kind === '+', (element) => element.bg(tints.added))
    .when(row.kind === '-', (element) => element.bg(tints.removed))
    .child(
      div()
        .w(diffSize.lineNumberWidth)
        .flex_none()
        .text_right()
        .text_color(palette.muted)
        .child(row.number === undefined ? '' : String(row.number)),
    )
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
      div()
        .absolute()
        .top(spacing.small)
        .px(spacing.large)
        .text_color(palette.dim)
        .child('Select a file to view its changes'),
    );
  }

  return area;
};
