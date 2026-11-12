import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import {
  colors,
  detailText,
  foldChevron,
  listRow,
  overlaySize,
  repoLabel,
  spacing,
  statusMark,
} from '../../kit/index.ts';
import { sample } from './sample.ts';

const sidebarFrame = (content: Element[]): Element =>
  v_flex().w(overlaySize.menuWidth).children(content);

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
          branch: 'main',
          age: '3h',
          folded: false,
          selected: false,
        }),
      }),
      sidebarGap(),
      listRow({
        size: 'small',
        inset: true,
        state: 'normal',
        label: repoLabel({
          name: 'koja',
          branch: 'main',
          age: '4m',
          folded: false,
          selected: false,
        }),
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
        label: repoLabel({
          name: 'koja',
          branch: 'main',
          age: '4m',
          folded: false,
          selected: false,
        }),
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
        label: repoLabel({
          name: 'herdr-app',
          branch: 'main',
          age: '3h',
          folded: true,
          selected: false,
        }),
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
        label: repoLabel({
          name: 'design',
          branch: 'main',
          age: '1d',
          folded: false,
          selected: true,
        }),
      }),
    ]),
  ),
];
