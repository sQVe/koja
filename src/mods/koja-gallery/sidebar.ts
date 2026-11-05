import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import {
  colors,
  detailText,
  foldChevron,
  listRow,
  overlaySize,
  repoLabel,
  separator,
  spacing,
  statusMark,
} from '../../kit/index.ts';
import { sample } from './sample.ts';

const sidebarFrame = (content: Element[]): Element =>
  v_flex().w(overlaySize.menuWidth).children(content);

const railDot = (status: Status, selected: boolean): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: selected ? 'selected' : 'normal',
    centered: true,
    label: '',
    end: [statusMark(status)],
  });

const insetLine = (): Element => div().px(spacing.small).child(separator());

const sidebarGap = (): Element => div().h(spacing.medium);

export const sidebarSamples = (): Element[] => [
  sample(
    'Gap between repository groups, then a dot-first row',
    sidebarFrame([
      listRow({
        size: 'small',
        inset: true,
        state: 'normal',
        label: repoLabel({
          name: 'herdr-app',
          detail: 'main · 3h',
          folded: false,
          selected: false,
        }),
      }),
      sidebarGap(),
      listRow({
        size: 'small',
        inset: true,
        state: 'normal',
        label: repoLabel({ name: 'koja', detail: 'main · 4m', folded: false, selected: false }),
      }),
      listRow({
        size: 'small',
        inset: true,
        state: 'normal',
        start: statusMark('working'),
        label: 'feature-login',
        end: [detailText('#42', colors().ansi2)],
      }),
    ]),
  ),
  sample(
    'Open label, hovered with chevron, then a dot-first worktree',
    sidebarFrame([
      listRow({
        size: 'small',
        inset: true,
        state: 'normal',
        hovered: true,
        label: repoLabel({ name: 'koja', detail: 'main · 4m', folded: false, selected: false }),
        end: [foldChevron(false)],
      }),
      listRow({
        size: 'small',
        inset: true,
        state: 'normal',
        start: statusMark('working'),
        label: 'feature-login',
        end: [detailText('#42', colors().ansi2)],
      }),
    ]),
  ),
  sample(
    'Folded with count, then the blocked worktree it keeps',
    sidebarFrame([
      listRow({
        size: 'small',
        inset: true,
        state: 'normal',
        label: repoLabel({ name: 'herdr-app', detail: 'main · 3h', folded: true, selected: false }),
        end: [detailText('2')],
      }),
      listRow({
        size: 'small',
        inset: true,
        state: 'normal',
        start: statusMark('blocked'),
        label: 'fix-login',
      }),
    ]),
  ),
  sample(
    'Selected label',
    sidebarFrame([
      listRow({
        size: 'small',
        inset: true,
        state: 'selected',
        label: repoLabel({ name: 'design', detail: 'main · 1d', folded: false, selected: true }),
      }),
    ]),
  ),
  sample(
    'Rail: one dot per repository, the active pill, lines between repositories',
    sidebarFrame([
      railDot('working', false),
      insetLine(),
      railDot('idle', true),
      insetLine(),
      railDot('blocked', false),
    ]),
  ),
];
