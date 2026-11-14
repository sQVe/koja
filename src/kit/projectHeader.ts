import { h_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import { icon, iconSlot } from './icon.ts';
import type { DropMark } from './listRow.ts';
import { listRow } from './listRow.ts';
import { spacing } from './size.ts';
import { spaceMark, statusMark } from './statusMark.ts';
import { detailText } from './text.ts';
import { roleText } from './textRole.ts';
import { colors } from './theme.ts';

interface HeaderBase {
  name: string;
  machine?: string;
  folded: boolean;
  hidden: number;
  hovered: boolean;
  onToggle: (cx: Context) => void;
}

// A click on the header folds the project.
interface FoldHeader extends HeaderBase {
  kind: 'fold';
}

// The header is the row of the project's main space; its chevron folds the project.
interface SpaceHeader extends HeaderBase {
  kind: 'space';
  status: Status | null;
  age: string | null;
  selected: boolean;
  cursor: boolean;
  dragged: boolean;
  drop?: DropMark;
}

type ProjectHeaderOptions = FoldHeader | SpaceHeader;

const machineParts = (options: HeaderBase): Element[] =>
  options.machine === undefined
    ? []
    : [icon('server', 'small').text_color(colors().dim), roleText('detail', options.machine)];

const nameLabel = (options: HeaderBase, tone: 'foreground' | 'muted'): Element =>
  h_flex()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(roleText('sectionHeading', options.name, tone))
    .children(machineParts(options));

const needsAttention = (status: Status | null): boolean =>
  status === 'working' || status === 'blocked' || status === 'done';

// The header keeps the mark slot even when empty, so every project name starts at the same x.
const headerMark = (status: Status | null): Element =>
  needsAttention(status) ? spaceMark(status) : statusMark(null);

const hiddenParts = (options: HeaderBase): Element[] =>
  options.folded ? [roleText('detail', `${options.hidden} more`)] : [];

const chevronSlot = (options: HeaderBase): Element =>
  iconSlot(icon(options.folded ? 'chevron-right' : 'chevron-down', 'small')).text_color(
    colors().dim,
  );

// A press on the space header row selects its space, so the chevron keeps its press to itself.
const spaceFoldToggle = (options: SpaceHeader): Element =>
  chevronSlot(options)
    .id('fold')
    .hover((style) => style.text_color(colors().foreground))
    .on_mouse_down('left', (_event, cx) => {
      cx.stop_propagation();
    })
    .on_mouse_up('left', (_event, cx) => {
      cx.stop_propagation();
      options.onToggle(cx);
    });

// An open header hides its chevron until hovered, but keeps the slot so nothing shifts.
const foldSlot = (options: HeaderBase, chevron: (options: HeaderBase) => Element): Element => {
  const shown = options.folded || options.hovered;

  return shown ? chevron(options) : iconSlot(div());
};

const ageParts = (options: SpaceHeader): Element[] =>
  options.age === null ? [] : [detailText(options.age)];

const foldHeader = (options: FoldHeader): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    start: statusMark(null),
    label: nameLabel(options, 'muted'),
    end: [...hiddenParts(options), foldSlot(options, chevronSlot)],
  })
    .cursor_pointer()
    .on_click((_event, cx) => {
      options.onToggle(cx);
    });

const spaceHeader = (options: SpaceHeader): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: options.selected ? 'selected' : 'normal',
    start: headerMark(options.status),
    label: nameLabel(options, 'foreground'),
    ...(options.drop === undefined ? {} : { drop: options.drop }),
    dragged: options.dragged,
    cursor: options.cursor,
    end: [
      ...hiddenParts(options),
      ...ageParts(options),
      foldSlot(options, () => spaceFoldToggle(options)),
    ],
  });

export const projectHeader = (options: ProjectHeaderOptions): Element =>
  options.kind === 'fold' ? foldHeader(options) : spaceHeader(options);
