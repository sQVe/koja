// Every kit component in every state, to compare the UI language with `herdr-app shot`.

import type { InputState } from 'gpui-base';
import { h_flex, InputState as InputStates, v_flex } from 'gpui-base';
import type { AsyncContext, Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { Status } from 'herdr';

import type { IconName, RowState } from '../../kit/index.ts';
import {
  colors,
  detailText,
  emptyState,
  highlightedText,
  icon,
  iconButton,
  iconNames,
  indicator,
  keyHint,
  listRow,
  programIcon,
  searchField,
  sectionHeader,
  separator,
  spacing,
  spinner,
  statusMark,
  tab,
  tabBarEdge,
  textSize,
  toggleButton,
} from '../../kit/index.ts';

const statuses: (Status | null)[] = ['working', 'blocked', 'done', 'idle', null];

const rowStates: { state: RowState; hovered: boolean; label: string }[] = [
  { state: 'normal', hovered: false, label: 'normal' },
  { state: 'normal', hovered: true, label: 'hovered' },
  { state: 'selected', hovered: false, label: 'selected' },
  { state: 'disabled', hovered: false, label: 'disabled' },
];

const iconSizes = ['xsmall', 'small', 'default', 'large'] as const;

// The letters a search for `query` would match, for the highlighted samples.
const matchOf = (text: string, query: string): number[] => {
  const start = text.indexOf(query);

  return query.split('').map((_letter, offset) => start + offset);
};

const sample = (label: string, content: Element): Element =>
  v_flex().gap(spacing.xsmall).child(detailText(label)).child(content);

const section = (title: string, content: Element[]): Element =>
  v_flex()
    .gap(spacing.small)
    .child(sectionHeader({ label: title, size: 'default' }))
    .child(v_flex().px(spacing.large).gap(spacing.medium).children(content));

const textSizes = (): Element[] =>
  (['xsmall', 'small', 'default', 'large'] as const).map((size) =>
    div().text_size(textSize[size]).child(`${size}: The quick brown fox`),
  );

const iconTile = (name: IconName): Element =>
  v_flex().gap(spacing.xsmall).items_center().child(icon(name, 'large')).child(detailText(name));

const icons = (): Element[] => [
  h_flex().flex_wrap().gap(spacing.medium).children(iconNames.map(iconTile)),
  sample(
    'Sizes',
    h_flex()
      .gap(spacing.medium)
      .items_center()
      .children(iconSizes.map((size) => icon('folder', size))),
  ),
  sample(
    'Spinner and program icon without a program',
    h_flex().gap(spacing.medium).items_center().child(spinner()).child(programIcon(null)),
  ),
];

const statusLabel = (status: Status | null): string => status ?? 'none';

const marks = (): Element[] => [
  h_flex()
    .gap(spacing.large)
    .children(
      statuses.map((status) =>
        h_flex()
          .gap(spacing.xsmall)
          .items_center()
          .child(statusMark(status))
          .child(statusLabel(status)),
      ),
    ),
  sample(
    'Indicators',
    h_flex()
      .gap(spacing.medium)
      .items_center()
      .child(indicator('ansi2'))
      .child(indicator('blocked'))
      .child(indicator('dim')),
  ),
];

const rowsInState = (inset: boolean): Element =>
  v_flex().children(
    rowStates.map((variant) =>
      listRow({
        size: inset ? 'large' : 'small',
        inset,
        state: variant.state,
        hovered: variant.hovered,
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
        guide: { first: true, last: false },
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
        guide: { first: false, last: true },
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
      listRow({ size: 'medium', inset: true, state: 'normal', muted: true, label: 'muted label' }),
    )
    .child(
      listRow({
        size: 'medium',
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

const rows = (): Element[] => [
  sample('Inset, large', rowsInState(true)),
  sample('Flush, small', rowsInState(false)),
  sample('Tree', treeRows()),
  sample('Reordering', dragRows()),
  sample('Muted, centered, and highlighted', otherRows()),
];

const headers = (): Element[] => [
  sectionHeader({ label: 'Default header', size: 'default' }),
  sectionHeader({ label: 'Bar header', size: 'bar', end: [iconButton({ name: 'plus' })] }),
  sectionHeader({
    label: 'Interactive header',
    size: 'default',
    interactive: true,
    start: icon('monitor', 'small'),
    end: [indicator('ansi2'), icon('chevron-down', 'small')],
  }),
];

const buttons = (): Element[] => [
  sample(
    'Icon buttons: normal, hovered, small, small hovered',
    h_flex()
      .gap(spacing.medium)
      .items_center()
      .child(iconButton({ name: 'plus' }))
      .child(iconButton({ name: 'plus', hovered: true }))
      .child(iconButton({ name: 'x', size: 'small' }))
      .child(iconButton({ name: 'x', size: 'small', hovered: true })),
  ),
  sample(
    'Toggle buttons: active, normal, hovered, quiet',
    h_flex()
      .gap(spacing.xxsmall)
      .child(toggleButton({ label: 'Active', active: true, start: icon('file', 'small') }))
      .child(
        toggleButton({ label: 'Normal', active: false, start: statusMark('blocked'), end: '2' }),
      )
      .child(toggleButton({ label: 'Hovered', active: false, hovered: true }))
      .child(toggleButton({ label: 'Quiet', active: false, quiet: true })),
  ),
];

const tabs = (): Element[] => [
  h_flex()
    .h(spacing.xxlarge + spacing.large)
    .bg(colors().chrome)
    .child(
      tab({
        label: 'Active',
        active: true,
        icon: icon('terminal', 'small'),
        status: 'working',
        close: iconButton({ name: 'x', size: 'small' }),
      }),
    )
    .child(
      tab({
        label: 'Blocked',
        active: false,
        icon: icon('terminal', 'small'),
        status: 'blocked',
        close: null,
      }),
    )
    .child(
      tab({
        label: 'Hovered',
        active: false,
        icon: null,
        status: 'done',
        close: null,
        hovered: true,
      }),
    )
    .child(tab({ label: 'Idle', active: false, icon: null, status: 'idle', close: null }))
    .child(tabBarEdge(div().flex_1())),
];

const text = (search: InputState): Element[] => [
  searchField(search, 'search'),
  separator(),
  emptyState('Nothing matches.'),
  h_flex()
    .gap(spacing.medium)
    .child(highlightedText('Go to space', matchOf('Go to space', 'Go'), true))
    .child(highlightedText('Go to space', matchOf('Go to space', 'sp'), false))
    .child(keyHint('ctrl-shift-p'))
    .child(detailText('#42', colors().ansi2)),
];

export default class Gallery extends View {
  private readonly search: InputState = InputStates.new({ placeholder: 'Search field' });

  override init(_props: unknown, _cx: AsyncContext): void {
    this.search.set_value('');
  }

  override render(): Element {
    const palette = colors();

    return v_flex()
      .id('gallery')
      .size_full()
      .overflow_y_scrollbar()
      .py(spacing.medium)
      .gap(spacing.xlarge)
      .bg(palette.popover)
      .text_size(textSize.default)
      .text_color(palette.foreground)
      .child(section('Text sizes', textSizes()))
      .child(section('Icons', icons()))
      .child(section('Status marks', marks()))
      .child(section('List rows', rows()))
      .child(section('Section headers', headers()))
      .child(section('Buttons', buttons()))
      .child(section('Tabs', tabs()))
      .child(section('Search and text', text(this.search)));
  }
}
