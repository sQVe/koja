import { h_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon, iconSlot } from './icon.ts';
import type { DropMark } from './listRow.ts';
import { listRow } from './listRow.ts';
import { rowHeight, sidebarSize, spacing } from './size.ts';
import { detailText } from './text.ts';
import { roleText } from './textRole.ts';
import { colors } from './theme.ts';

interface HeaderBase {
  name: string;
  machine?: string;
  folded: boolean;
  hidden: number;
  onToggle: (cx: Context) => void;
}

// A click on the header folds the project.
interface FoldHeader extends HeaderBase {
  kind: 'fold';
}

// The header is the row of the project's main space; its chevron folds the project.
interface SpaceHeader extends HeaderBase {
  kind: 'space';
  mark: Element;
  age: string | null;
  selected: boolean;
  cursor: boolean;
  hovered: boolean;
  dragged: boolean;
  drop?: DropMark;
}

type ProjectHeaderOptions = FoldHeader | SpaceHeader;

const machineParts = (options: HeaderBase): Element[] =>
  options.machine === undefined
    ? []
    : [icon('server', 'small').text_color(colors().dim), roleText('detail', options.machine)];

const hiddenCount = (options: HeaderBase): Element => roleText('detail', `${options.hidden} more`);

const foldHeader = (options: FoldHeader): Element => {
  const header = h_flex()
    .h(rowHeight.small)
    .flex_none()
    .min_w(0)
    .px(sidebarSize.rowContentInset)
    .gap(spacing.small)
    .items_center()
    .cursor_pointer()
    .child(roleText('sectionHeading', options.name, 'foreground'))
    .children(machineParts(options))
    .on_click((_event, cx) => {
      options.onToggle(cx);
    });

  if (options.folded) {
    header
      .child(icon('chevron-right', 'small').text_color(colors().dim))
      .child(h_flex().flex_1())
      .child(hiddenCount(options));
  }

  return header;
};

// A press on the header row selects its space, so the chevron keeps its press to itself.
const foldToggle = (options: SpaceHeader): Element =>
  iconSlot(icon(options.folded ? 'chevron-right' : 'chevron-down', 'small'))
    .id('fold')
    .text_color(colors().dim)
    .hover((style) => style.text_color(colors().foreground))
    .on_mouse_down('left', (_event, cx) => {
      cx.stop_propagation();
    })
    .on_mouse_up('left', (_event, cx) => {
      cx.stop_propagation();
      options.onToggle(cx);
    });

const foldControls = (options: SpaceHeader): Element[] => {
  if (options.folded) {
    return [hiddenCount(options), foldToggle(options)];
  }

  // The hidden chevron keeps its slot, so the name does not shift when the header is hovered.
  return [options.hovered ? foldToggle(options) : iconSlot(div())];
};

const ageOf = (options: SpaceHeader): Element[] =>
  options.age === null ? [] : [detailText(options.age)];

const nameLabel = (options: HeaderBase): Element =>
  h_flex()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(roleText('sectionHeading', options.name, 'foreground'))
    .children(machineParts(options));

const spaceHeader = (options: SpaceHeader): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: options.selected ? 'selected' : 'normal',
    start: options.mark,
    label: nameLabel(options),
    ...(options.drop === undefined ? {} : { drop: options.drop }),
    dragged: options.dragged,
    cursor: options.cursor,
    end: [...foldControls(options), ...ageOf(options)],
  });

export const projectHeader = (options: ProjectHeaderOptions): Element =>
  options.kind === 'fold' ? foldHeader(options) : spaceHeader(options);
