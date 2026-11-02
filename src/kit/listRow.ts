import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { Palette } from './palette.ts';
import {
  draggedOpacity,
  iconSize,
  indentWidth,
  radius,
  rowHeight,
  spacing,
  textSize,
} from './size.ts';
import type { RowSize } from './size.ts';
import { colors } from './theme.ts';

// `hovered` draws the hover look without a pointer, for the gallery.
export type RowState = 'normal' | 'hovered' | 'selected' | 'disabled';

// Where a child row sits in its parent's guide line: the line stops short at both ends.
interface TreeGuide {
  first: boolean;
  last: boolean;
}

export interface ListRowOptions {
  size: RowSize;
  // Inset rows float inside a menu or picker with rounded corners; flush rows run edge to edge,
  // as in a sidebar.
  inset: boolean;
  state: RowState;
  label: Element | string;
  muted?: boolean;
  centered?: boolean;
  detail?: string;
  depth?: number;
  start?: Element;
  end?: Element[];
  guide?: TreeGuide;
  dragged?: boolean;
  dropLine?: 'top' | 'bottom';
}

const labelColor = (options: ListRowOptions, palette: Palette): Palette[keyof Palette] => {
  if (options.state === 'disabled') {
    return palette.dim;
  }

  return options.muted === true ? palette.muted : palette.foreground;
};

const withBackground = (row: Element, state: RowState, palette: Palette): Element => {
  if (state === 'selected') {
    return row.bg(palette.selected);
  }

  if (state === 'hovered') {
    return row.bg(palette.hover);
  }

  if (state === 'disabled') {
    return row;
  }

  return row.hover((style) => style.bg(palette.hover));
};

// The guide runs under the middle of the parent's icon, one level to the left.
const guideLine = (guide: TreeGuide, palette: Palette): Element =>
  div()
    .absolute()
    .top(guide.first ? spacing.xsmall : spacing.none)
    .bottom(guide.last ? spacing.xsmall : spacing.none)
    .left(spacing.small + iconSize.large / 2)
    .w(spacing.hairline)
    .bg(palette.border);

const dropLineAt = (edge: 'top' | 'bottom', palette: Palette): Element => {
  const line = div().absolute().left(spacing.none).right(spacing.none).h(spacing.xxsmall);

  return (edge === 'top' ? line.top(spacing.none) : line.bottom(spacing.none)).bg(palette.accent);
};

const labelElement = (label: Element | string): Element =>
  typeof label === 'string' ? div().min_w(0).truncate().child(label) : label;

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

  group.child(labelElement(options.label));

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
    .text_size(textSize.default)
    .text_color(labelColor(options, palette));

  return options.inset ? frame.mx(spacing.xsmall).rounded(radius.default) : frame;
};

const decorate = (row: Element, options: ListRowOptions, palette: Palette): void => {
  if (options.centered === true) {
    row.justify_center();
  }

  if (options.dragged === true) {
    row.opacity(draggedOpacity);
  }

  if (options.guide !== undefined) {
    row.child(guideLine(options.guide, palette));
  }

  if (options.dropLine !== undefined) {
    row.child(dropLineAt(options.dropLine, palette));
  }
};

// The one list row every surface draws: menus, pickers, the palette, and the sidebar. Callers
// add the row's id and its handlers.
export const listRow = (options: ListRowOptions): Element => {
  const palette = colors();
  const row = withBackground(rowFrame(options, palette), options.state, palette);

  decorate(row, options, palette);

  if (options.start !== undefined) {
    row.child(options.start);
  }

  return row.child(labelGroup(options, palette)).children(options.end ?? []);
};
