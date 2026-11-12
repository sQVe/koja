import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { HoverOptions } from './hover.ts';
import { withHover } from './hover.ts';
import type { Palette } from './palette.ts';
import { clearOf } from './palette.ts';
import { draggedOpacity, indentWidth, radius, rowHeight, spacing, textSize } from './size.ts';
import type { RowSize } from './size.ts';
import { colors } from './theme.ts';

export type RowState = 'normal' | 'selected' | 'disabled';

export interface ListRowOptions extends HoverOptions {
  size: RowSize;
  inset: boolean;
  state: RowState;
  label: Element | string;
  // Identifiers such as branches and paths cut in the middle, so both ends stay visible.
  cut?: 'middle' | 'end';
  muted?: boolean;
  centered?: boolean;
  detail?: string;
  depth?: number;
  start?: Element;
  end?: Element[];
  dragged?: boolean;
  dropLine?: 'top' | 'bottom';
  // The row under the list cursor of a marked section.
  cursor?: boolean;
}

const labelColor = (options: ListRowOptions, palette: Palette): Palette[keyof Palette] => {
  if (options.state === 'disabled') {
    return palette.dim;
  }

  return options.muted === true ? palette.muted : palette.foreground;
};

const withFill = (row: Element, options: ListRowOptions, palette: Palette): Element =>
  options.state === 'selected' ? row.bg(palette.selected) : row;

const withOutline = (row: Element, options: ListRowOptions, palette: Palette): Element => {
  if (options.cursor === true) {
    return row.border_color(palette.accent);
  }

  if (options.state !== 'normal') {
    return row;
  }

  return withHover(row, options.hovered === true, (element) =>
    element.border_color(palette.selected),
  );
};

const dropLineAt = (edge: 'top' | 'bottom', palette: Palette): Element => {
  const line = div().absolute().left(spacing.none).right(spacing.none).h(spacing.xxsmall);

  return (edge === 'top' ? line.top(spacing.none) : line.bottom(spacing.none)).bg(palette.accent);
};

const labelElement = (options: ListRowOptions): Element => {
  if (typeof options.label !== 'string') {
    return options.label;
  }

  const label = div().min_w(0).truncate();

  if (options.cut === 'middle') {
    label.text_ellipsis_middle();
  }

  return label.child(options.label);
};

const detailElement = (detail: string, palette: Palette): Element =>
  div()
    .flex_shrink(spacing.medium)
    .min_w(spacing.xlarge)
    .truncate()
    .text_size(textSize.small)
    .text_color(palette.dim)
    .child(detail);

const labelGroup = (options: ListRowOptions, palette: Palette): Element => {
  const group = h_flex().min_w(0).gap(spacing.small).items_center();

  if (options.centered !== true) {
    group.flex_1();
  }

  group.child(labelElement(options));

  if (options.detail !== undefined) {
    group.child(detailElement(options.detail, palette));
  }

  return group;
};

const rowFrame = (options: ListRowOptions, palette: Palette): Element => {
  const depth = options.depth ?? 0;

  const frame = h_flex()
    .relative()
    .flex_none()
    .min_w(0)
    .h(rowHeight[options.size])
    .pl(spacing.small + depth * indentWidth)
    .pr(spacing.small)
    .gap(spacing.small)
    .items_center()
    // A clear border on every row, so the outline of a hovered or cursor row never shifts its
    // content.
    .border(spacing.hairline)
    .border_color(clearOf(palette.selected))
    .text_size(textSize.default)
    .text_color(labelColor(options, palette));

  return options.inset ? frame.mx(spacing.xsmall).rounded(radius.pill) : frame;
};

const decorate = (row: Element, options: ListRowOptions, palette: Palette): void => {
  if (options.centered === true) {
    row.justify_center();
  }

  if (options.dragged === true) {
    row.opacity(draggedOpacity);
  }

  if (options.dropLine !== undefined) {
    row.child(dropLineAt(options.dropLine, palette));
  }
};

export const listRow = (options: ListRowOptions): Element => {
  const palette = colors();
  const filled = withFill(rowFrame(options, palette), options, palette);
  const row = withOutline(filled, options, palette);

  decorate(row, options, palette);

  if (options.start !== undefined) {
    row.child(options.start);
  }

  return row.child(labelGroup(options, palette)).children(options.end ?? []);
};
